/**
 * pi-caido — first-party Caido integration for the pi-glider agent.
 *
 * Wraps the in-container Caido instance's GraphQL API directly (no MCP bridge) and exposes a
 * curated, token-efficient set of tools so the model can *read* the web traffic it has already
 * proxied through Caido — instead of only ever routing traffic *through* it.
 *
 * Auth: the container boots Caido with `--allow-guests`, so we authenticate as a guest
 * (`loginAsGuest`) — no seeded credentials. A saved/account project (persistence) remains an
 * operator action in the UI; these tools read whatever the proxy has captured this session.
 *
 * GraphQL endpoint: `$CAIDO_API_URL/graphql` (default http://127.0.0.1:5000, the UI port).
 * Field names follow the installed Caido's proxy schema; raw HTTP bodies are base64 `Blob`s
 * that we decode before returning to the model.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";

const API = (process.env.CAIDO_API_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
const GQL_URL = `${API}/graphql`;

// Output size guards (kept token-efficient; full data is reachable via the Caido UI).
const MAX_BODY_CHARS = 8192;
const MAX_LIST_ITEMS = 200;

let token: string | null = null;

async function auth(): Promise<string> {
  if (token) return token;
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "mutation { loginAsGuest { token { accessToken } } }" }),
  });
  const json = (await res.json()) as any;
  token = json?.data?.loginAsGuest?.token?.accessToken ?? null;
  if (!token) {
    throw new Error(`Caido guest login failed: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return token;
}

async function gql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const t = await auth();
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as any;
  if (Array.isArray(json.errors) && json.errors.length) {
    // Re-auth once on an expired/revoked guest token, then retry.
    if (json.errors.some((e: any) => /auth/i.test(e.message || "")) && token) {
      token = null;
      return gql(query, variables);
    }
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }
  if (!json.data) throw new Error(`Caido GraphQL returned no data: ${JSON.stringify(json).slice(0, 300)}`);
  return json.data as T;
}

function decodeBlob(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    return Buffer.from(raw, "base64").toString("utf8");
  } catch {
    return String(raw);
  }
}

function trim(text: string, max = MAX_BODY_CHARS): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

function scheme(isTls?: boolean): string {
  return isTls ? "https" : "http";
}

function url(host: string, path: string, query?: string | null): string {
  const q = query ? `?${query}` : "";
  return `${host}${path}${q}`;
}

interface ReqNode {
  id: string;
  method: string;
  host: string;
  path: string;
  query?: string | null;
  isTls?: boolean;
  port?: number;
  length?: number;
  response?: { statusCode?: number; length?: number; roundtripTime?: number } | null;
}

export default function (pi: ExtensionAPI): void {
  // --- caido_list_requests -------------------------------------------------
  pi.registerTool({
    name: "caido_list_requests",
    label: "Caido List Requests",
    description:
      "List captured HTTP requests from the in-container Caido proxy. Use when you need to see what web traffic has been recorded (e.g. after a curl/Playwright/httpx run), filtered by an optional Caido HTTPQL expression such as `req.method.eq:\"POST\"` or `req.path.cont:\"/api/\"`. Returns id/method/scheme/host/path plus status and size for each request.",
    parameters: Type.Object({
      filter: Type.Optional(
        Type.String({ description: "Caido HTTPQL filter, e.g. `req.method.eq:\"POST\"` or `req.path.cont:\"/users/\"`." }),
      ),
      first: Type.Optional(Type.Number({ description: "Max requests to return (default 50, capped 200)." })),
    }),
    async execute(_toolCallId, params) {
      const first = Math.min(Math.max(Number(params.first) || 50, 1), MAX_LIST_ITEMS);
      const variables: Record<string, unknown> = { first };
      if (params.filter) variables.filter = { code: params.filter };
      const data = await gql<any>(
        `query ListRequests($filter: HTTPQLInput, $first: Int) {
           requests(filter: $filter, first: $first, order: { by: CREATED_AT, ordering: DESC }) {
             nodes { id method host path query isTls port length response { statusCode length roundtripTime } }
           }
         }`,
        variables,
      );
      const nodes: ReqNode[] = data?.requests?.nodes ?? [];
      if (nodes.length === 0) {
        return { content: [{ type: "text", text: "No requests captured yet." }], details: { count: 0 } };
      }
      const lines = nodes.map((n) => {
        const st = n.response?.statusCode ? `  ${n.response.statusCode}` : "";
        const len = n.response?.length != null ? `  ${n.response.length}b` : "";
        return `${n.id}  ${n.method} ${scheme(n.isTls)}://${url(n.host, n.path, n.query)}${st}${len}`;
      });
      return {
        content: [{ type: "text", text: `${nodes.length} request(s):\n${lines.join("\n")}` }],
        details: { count: nodes.length, requests: nodes },
      };
    },
  });

  // --- caido_get_request ---------------------------------------------------
  pi.registerTool({
    name: "caido_get_request",
    label: "Caido Get Request",
    description:
      "Get the full decoded HTTP request (method, URL, headers, body) of a captured request by ID. Use the id from caido_list_requests. Body is truncated at 8KB with a flag if longer.",
    parameters: Type.Object({ id: Type.String({ description: "Request ID from caido_list_requests." }) }),
    async execute(_toolCallId, params) {
      const data = await gql<any>(
        `query GetRequest($id: ID!) { request(id: $id) { id method host path query isTls port raw } }`,
        { id: params.id },
      );
      const req = data?.request;
      if (!req) throw new Error(`No request found for id ${params.id}`);
      const raw = decodeBlob(req.raw);
      const { text, truncated } = trim(raw);
      const head = `Method: ${req.method}\nURL: ${scheme(req.isTls)}://${url(req.host, req.path, req.query)}\nHost: ${req.host}${req.port ? `:${req.port}` : ""}\nTLS: ${req.isTls}\n`;
      return {
        content: [
          {
            type: "text",
            text: head + (truncated ? `[body truncated to ${MAX_BODY_CHARS} chars]\n` : "") + (text || "(empty body)"),
          },
        ],
        details: { id: req.id, method: req.method, host: req.host, path: req.path, isTls: req.isTls, raw },
      };
    },
  });

  // --- caido_get_response --------------------------------------------------
  pi.registerTool({
    name: "caido_get_response",
    label: "Caido Get Response",
    description:
      "Get the decoded HTTP response (status, headers, body) for a captured request by request ID. Use when you need the response body/headers of a request you saw in caido_list_requests. Body is truncated at 8KB.",
    parameters: Type.Object({ id: Type.String({ description: "Request ID from caido_list_requests." }) }),
    async execute(_toolCallId, params) {
      const data = await gql<any>(
        `query GetResponse($id: ID!) { request(id: $id) { id host path isTls response { statusCode length roundtripTime raw } } }`,
        { id: params.id },
      );
      const req = data?.request;
      if (!req || !req.response) throw new Error(`No response found for request ${params.id}`);
      const resp = req.response;
      const raw = decodeBlob(resp.raw);
      const { text, truncated } = trim(raw);
      const head =
        `Status: ${resp.statusCode}  Length: ${resp.length}  Roundtrip: ${resp.roundtripTime}ms\n` +
        `URL: ${scheme(req.isTls)}://${url(req.host, req.path)}\n`;
      return {
        content: [
          {
            type: "text",
            text: head + (truncated ? `[body truncated to ${MAX_BODY_CHARS} chars]\n` : "") + (text || "(empty body)"),
          },
        ],
        details: { id: req.id, statusCode: resp.statusCode, length: resp.length, roundtripTime: resp.roundtripTime, raw },
      };
    },
  });

  // --- caido_list_sitemap --------------------------------------------------
  pi.registerTool({
    name: "caido_list_sitemap",
    label: "Caido List Sitemap",
    description:
      "List the Caido sitemap (the tree of discovered hosts/directories/requests). Use to map the discovered web surface as Caido sees it; pair with caido_view_sitemap_entry for detail.",
    parameters: Type.Object({}),
    async execute() {
      const data = await gql<any>(`query { sitemapRootEntries { nodes { id label kind hasDescendants } } }`);
      const nodes = data?.sitemapRootEntries?.nodes ?? [];
      if (nodes.length === 0) {
        return { content: [{ type: "text", text: "Sitemap is empty." }], details: { count: 0 } };
      }
      const lines = nodes.map((n: any) => `${n.id}  [${n.kind}] ${n.label}${n.hasDescendants ? "  +" : ""}`);
      return {
        content: [{ type: "text", text: `${nodes.length} sitemap root entry(ies):\n${lines.join("\n")}` }],
        details: { count: nodes.length, entries: nodes },
      };
    },
  });

  // --- caido_view_sitemap_entry -------------------------------------------
  pi.registerTool({
    name: "caido_view_sitemap_entry",
    label: "Caido View Sitemap Entry",
    description:
      "Inspect one sitemap entry (label, kind) and the requests recorded under it. Use after caido_list_sitemap to drill into a specific host/directory.",
    parameters: Type.Object({ id: Type.String({ description: "Sitemap entry ID from caido_list_sitemap." }) }),
    async execute(_toolCallId, params) {
      const data = await gql<any>(
        `query ViewSitemapEntry($id: ID!) {
           sitemapEntry(id: $id) {
             id label kind hasDescendants
             requests(first: 50) { nodes { id method host path query isTls response { statusCode } } }
           }
         }`,
        { id: params.id },
      );
      const entry = data?.sitemapEntry;
      if (!entry) throw new Error(`No sitemap entry found for id ${params.id}`);
      const reqs = entry.requests?.nodes ?? [];
      const lines = reqs.map((r: any) => {
        const st = r.response?.statusCode ? `  ${r.response.statusCode}` : "";
        return `${r.id}  ${r.method} ${scheme(r.isTls)}://${url(r.host || entry.label, r.path, r.query)}${st}`;
      });
      const head = `[${entry.kind}] ${entry.label}${entry.hasDescendants ? " (has descendants)" : ""}`;
      return {
        content: [
          {
            type: "text",
            text: `${head}\n${reqs.length ? `Requests:\n${lines.join("\n")}` : "(no requests recorded)"}`,
          },
        ],
        details: {
          id: entry.id,
          kind: entry.kind,
          label: entry.label,
          hasDescendants: entry.hasDescendants,
          count: reqs.length,
        },
      };
    },
  });
}
