/**
 * pi-caido — first-party Caido integration for the pi-glider agent.
 *
 * Wraps the in-container Caido instance's GraphQL API directly (no MCP bridge) and exposes a
 * curated, token-efficient set of tools so the model can *read, replay, annotate, and scope* the
 * web traffic it has proxied through Caido. Fields are pinned to the installed Caido's schema
 * (verified via introspection against 0.56.0).
 *
 * Auth: the container boots Caido with `--allow-guests`, so we authenticate as a guest
 * (`loginAsGuest`) — no seeded credentials. A saved/account project (persistence) remains an
 * operator action in the UI.
 *
 * Phases:
 *   P0 read   — list/get request+response, list/view sitemap
 *   P1 replay — send_request (repeat captured), send_raw_request (arbitrary)
 *   P2 findings — list_findings, create_finding
 *   P3 scope    — list_scopes, add_scope
 *   P4 export   — export captured traffic to a file
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";

const API = (process.env.CAIDO_API_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
const GQL_URL = `${API}/graphql`;

// Output size guards (kept token-efficient; full data is reachable via the Caido UI).
const MAX_BODY_CHARS = 8192;
const MAX_LIST_ITEMS = 200;

// Tool annotations (MCP-style hints) — future-proofing for a permission layer.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

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

function encodeBlob(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
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

interface SendResult {
  statusCode: number | null;
  length: number | null;
  roundtripTime: number | null;
  raw: string;
  error: string | null;
}

// Dispatch a raw HTTP request through Caido's replay engine and wait for the response.
async function sendRaw(host: string, port: number, isTls: boolean, raw: string, sni = ""): Promise<SendResult> {
  const rawB64 = encodeBlob(raw);
  // ConnectionInfoInput uses isTLS/SNI (uppercase acronyms); Request uses isTls/sni.
  const conn = { host, port, isTLS: isTls, SNI: sni };
  const s = await gql<any>(
    `mutation C($in: CreateReplaySessionInput!) { createReplaySession(input: $in) { session { id } } }`,
    { in: { requestSource: { raw: { connectionInfo: conn, raw: rawB64 } } } },
  );
  const sid = s?.createReplaySession?.session?.id;
  if (!sid) throw new Error(`createReplaySession failed: ${JSON.stringify(s).slice(0, 300)}`);

  const st = await gql<any>(
    `mutation S($sid: ID!, $in: StartReplayTaskInput!) { startReplayTask(sessionId: $sid, input: $in) { task { replayEntry { id } } } }`,
    { sid, in: { connection: conn, raw: rawB64, settings: { placeholders: [], updateContentLength: true, connectionClose: false } } },
  );
  const eid = st?.startReplayTask?.task?.replayEntry?.id;
  if (!eid) throw new Error(`startReplayTask failed: ${JSON.stringify(st).slice(0, 300)}`);

  for (let i = 0; i < 20; i++) {
    const e = await gql<any>(
      `query E($id: ID!) { replayEntry(id: $id) { error request { id method host path response { statusCode length roundtripTime raw } } } }`,
      { id: eid },
    );
    const entry = e?.replayEntry;
    if (entry?.error) return { statusCode: null, length: null, roundtripTime: null, raw: "", error: entry.error };
    const resp = entry?.request?.response;
    if (resp) {
      return {
        statusCode: resp.statusCode ?? null,
        length: resp.length ?? null,
        roundtripTime: resp.roundtripTime ?? null,
        raw: decodeBlob(resp.raw),
        error: null,
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("replay did not produce a response within 20s");
}

function formatResp(label: string, r: SendResult): { text: string; details: Record<string, unknown> } {
  const { text, truncated } = trim(r.raw);
  const head = `${label} status=${r.statusCode ?? "?"} length=${r.length ?? "?"} roundtrip=${r.roundtripTime ?? "?"}ms`;
  const body = (truncated ? `[body truncated to ${MAX_BODY_CHARS} chars]\n` : "") + (text || "(empty body)");
  return {
    text: head + "\n\n" + body,
    details: { statusCode: r.statusCode, length: r.length, roundtripTime: r.roundtripTime, raw: r.raw },
  };
}

export default function (pi: ExtensionAPI): void {
  // ── P0: read ─────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "caido_list_requests",
    label: "Caido List Requests",
    description:
      "List captured HTTP requests from the in-container Caido proxy. Use when you need to see what web traffic has been recorded (e.g. after a curl/Playwright/httpx run), filtered by an optional Caido HTTPQL expression such as `req.method.eq:\"POST\"` or `req.path.cont:\"/api/\"`. Returns id/method/scheme/host/path plus status and size for each request.",
    annotations: READ_ONLY,
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

  pi.registerTool({
    name: "caido_get_request",
    label: "Caido Get Request",
    description:
      "Get the full decoded HTTP request (method, URL, headers, body) of a captured request by ID. Use the id from caido_list_requests. Body is truncated at 8KB with a flag if longer.",
    annotations: READ_ONLY,
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

  pi.registerTool({
    name: "caido_get_response",
    label: "Caido Get Response",
    description:
      "Get the decoded HTTP response (status, headers, body) for a captured request by request ID. Use when you need the response body/headers of a request you saw in caido_list_requests. Body is truncated at 8KB.",
    annotations: READ_ONLY,
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

  pi.registerTool({
    name: "caido_list_sitemap",
    label: "Caido List Sitemap",
    description:
      "List the Caido sitemap (the tree of discovered hosts/directories/requests). Use to map the discovered web surface as Caido sees it; pair with caido_view_sitemap_entry for detail.",
    annotations: READ_ONLY,
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

  pi.registerTool({
    name: "caido_view_sitemap_entry",
    label: "Caido View Sitemap Entry",
    description:
      "Inspect one sitemap entry (label, kind) and the requests recorded under it. Use after caido_list_sitemap to drill into a specific host/directory.",
    annotations: READ_ONLY,
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

  // ── P1: replay/send ──────────────────────────────────────────────────────
  pi.registerTool({
    name: "caido_send_request",
    label: "Caido Send Request",
    description:
      "Replay a captured request through Caido and return the live response. Use for repeat/augment testing of a request you saw in caido_list_requests — optionally pass `raw_override` with a modified raw HTTP request (same host/port) to test a mutation. Returns status, length, roundtrip, and the decoded response.",
    annotations: DESTRUCTIVE,
    parameters: Type.Object({
      id: Type.String({ description: "Request ID from caido_list_requests to repeat." }),
      raw_override: Type.Optional(
        Type.String({ description: "Optional modified raw HTTP request (headers+body) to send in place of the captured one." }),
      ),
    }),
    async execute(_toolCallId, params) {
      const data = await gql<any>(
        `query GetRequest($id: ID!) { request(id: $id) { id host port isTls sni raw } }`,
        { id: params.id },
      );
      const req = data?.request;
      if (!req) throw new Error(`No request found for id ${params.id}`);
      const raw = params.raw_override ?? decodeBlob(req.raw);
      const r = await sendRaw(req.host, req.port, req.isTls, raw, req.sni ?? "");
      const f = formatResp(`Replayed ${req.host} →`, r);
      return { content: [{ type: "text", text: f.text }], details: { requestId: req.id, ...f.details } };
    },
  });

  pi.registerTool({
    name: "caido_send_raw_request",
    label: "Caido Send Raw Request",
    description:
      "Send an arbitrary raw HTTP request through Caido and return the response. Use for a one-off request you build by hand (e.g. from a modified caido_get_request body). `host`/`port`/`tls` tell Caido where to connect; the raw string is the full request (request line + headers + body).",
    annotations: DESTRUCTIVE,
    parameters: Type.Object({
      raw: Type.String({ description: "Full raw HTTP request text, e.g. \"GET / HTTP/1.1\\r\\nHost: example.com\\r\\n\\r\\n\"." }),
      host: Type.String({ description: "Destination hostname." }),
      port: Type.Number({ description: "Destination port (80 or 443)." }),
      tls: Type.Boolean({ description: "Whether the connection is TLS (https)." }),
      sni: Type.Optional(Type.String({ description: "Optional TLS SNI (defaults to host)." })),
    }),
    async execute(_toolCallId, params) {
      const r = await sendRaw(params.host, Number(params.port), Boolean(params.tls), params.raw, params.sni ?? params.host);
      const f = formatResp(`${scheme(params.tls)}://${params.host} →`, r);
      return { content: [{ type: "text", text: f.text }], details: f.details };
    },
  });

  // ── P2: findings ─────────────────────────────────────────────────────────
  pi.registerTool({
    name: "caido_list_findings",
    label: "Caido List Findings",
    description:
      "List findings recorded in Caido. Use to review what has already been flagged for the engagement (title, host, path, reporter, description).",
    annotations: READ_ONLY,
    parameters: Type.Object({
      first: Type.Optional(Type.Number({ description: "Max findings to return (default 50, capped 200)." })),
    }),
    async execute(_toolCallId, params) {
      const first = Math.min(Math.max(Number(params.first) || 50, 1), MAX_LIST_ITEMS);
      const data = await gql<any>(
        `query ListFindings($first: Int) { findings(first: $first, order: { by: CREATED_AT, ordering: DESC }) { nodes { id title host path reporter description } } }`,
        { first },
      );
      const nodes = data?.findings?.nodes ?? [];
      if (nodes.length === 0) {
        return { content: [{ type: "text", text: "No findings recorded." }], details: { count: 0 } };
      }
      const lines = nodes.map((n: any) => `${n.id}  [${n.host ?? "?"}${n.path ?? ""}] ${n.title}  (${n.reporter ?? "unknown"})`);
      return {
        content: [{ type: "text", text: `${nodes.length} finding(s):\n${lines.join("\n")}` }],
        details: { count: nodes.length, findings: nodes },
      };
    },
  });

  pi.registerTool({
    name: "caido_create_finding",
    label: "Caido Create Finding",
    description:
      "Record a finding in Caido against a captured request. Use after confirming an issue (see the pi-glider finding format) to log it where the operator reviews traffic. Requires a request id from caido_list_requests.",
    annotations: DESTRUCTIVE,
    parameters: Type.Object({
      request_id: Type.String({ description: "Request ID (from caido_list_requests) the finding is tied to." }),
      title: Type.String({ description: "Short finding title." }),
      description: Type.Optional(Type.String({ description: "Finding description." })),
      reporter: Type.Optional(Type.String({ description: "Reporter name (default 'pi-glider')." })),
    }),
    async execute(_toolCallId, params) {
      const input: Record<string, unknown> = {
        title: params.title,
        description: params.description ?? "",
        reporter: params.reporter ?? "pi-glider",
      };
      const data = await gql<any>(
        `mutation CreateFinding($requestId: ID, $input: CreateFindingInput!) { createFinding(requestId: $requestId, input: $input) { finding { id title } } }`,
        { requestId: params.request_id, input },
      );
      const finding = data?.createFinding?.finding;
      if (!finding) throw new Error(`createFinding failed: ${JSON.stringify(data).slice(0, 300)}`);
      return {
        content: [{ type: "text", text: `Finding created: [${finding.id}] ${finding.title}` }],
        details: { id: finding.id, title: finding.title },
      };
    },
  });

  // ── P3: scope ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "caido_list_scopes",
    label: "Caido List Scopes",
    description:
      "List Caido proxy scopes (named allow/deny lists). Use to see what the proxy is currently scoped to before changing it.",
    annotations: READ_ONLY,
    parameters: Type.Object({}),
    async execute() {
      const data = await gql<any>(`query { scopes { id name allowlist denylist indexed } }`);
      const scopes = data?.scopes ?? [];
      if (scopes.length === 0) {
        return { content: [{ type: "text", text: "No scopes configured." }], details: { count: 0 } };
      }
      const lines = scopes.map(
        (s: any) =>
          `${s.id}  ${s.name}  allow=[${(s.allowlist ?? []).join(", ")}]  deny=[${(s.denylist ?? []).join(", ")}]${s.indexed ? "  (indexed)" : ""}`,
      );
      return {
        content: [{ type: "text", text: `${scopes.length} scope(s):\n${lines.join("\n")}` }],
        details: { count: scopes.length, scopes },
      };
    },
  });

  pi.registerTool({
    name: "caido_add_scope",
    label: "Caido Add Scope",
    description:
      "Create a new Caido proxy scope with optional allowlist/denylist hosts (comma/space-separated strings). Use to constrain proxying to in-scope targets.",
    annotations: DESTRUCTIVE,
    parameters: Type.Object({
      name: Type.String({ description: "Scope name." }),
      allowlist: Type.Optional(Type.String({ description: "Comma- or space-separated hosts to allow (e.g. \"example.com, 10.0.0.0/8\")." })),
      denylist: Type.Optional(Type.String({ description: "Comma- or space-separated hosts to deny." })),
    }),
    async execute(_toolCallId, params) {
      const split = (v?: string) => (v ? v.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) : []);
      const input: Record<string, unknown> = {
        name: params.name,
        allowlist: split(params.allowlist),
        denylist: split(params.denylist),
      };
      const data = await gql<any>(
        `mutation CreateScope($input: CreateScopeInput!) { createScope(input: $input) { scope { id name } } }`,
        { input },
      );
      const scope = data?.createScope?.scope;
      if (!scope) throw new Error(`createScope failed: ${JSON.stringify(data).slice(0, 300)}`);
      return {
        content: [{ type: "text", text: `Scope created: [${scope.id}] ${scope.name}` }],
        details: { id: scope.id, name: scope.name },
      };
    },
  });

  // ── P4: export ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "caido_export_requests",
    label: "Caido Export Requests",
    description:
      "Export captured requests (raw request + response) to a JSONL file under /engagement for offline analysis or handoff. Optionally filter with an HTTPQL expression. Useful when you need the full traffic trail outside Caido rather than a summary.",
    annotations: READ_ONLY,
    parameters: Type.Object({
      filter: Type.Optional(Type.String({ description: "Caido HTTPQL filter to select requests to export." })),
      first: Type.Optional(Type.Number({ description: "Max requests to export (default 50, capped 100)." })),
      path: Type.Optional(Type.String({ description: "Output file path (default /engagement/recon/caido-export.jsonl)." })),
    }),
    async execute(_toolCallId, params) {
      const first = Math.min(Math.max(Number(params.first) || 50, 1), 100);
      const variables: Record<string, unknown> = { first };
      if (params.filter) variables.filter = { code: params.filter };
      const data = await gql<any>(
        `query ListRequests($filter: HTTPQLInput, $first: Int) {
           requests(filter: $filter, first: $first, order: { by: CREATED_AT, ordering: DESC }) { nodes { id } }
         }`,
        variables,
      );
      const nodes: { id: string }[] = data?.requests?.nodes ?? [];
      if (nodes.length === 0) {
        return { content: [{ type: "text", text: "No requests matched; nothing exported." }], details: { count: 0 } };
      }

      const outPath = params.path || "/engagement/recon/caido-export.jsonl";
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const stream = fs.createWriteStream(outPath);
      let written = 0;
      for (const n of nodes) {
        const req = await gql<any>(
          `query GetRequest($id: ID!) { request(id: $id) { id method host path query isTls raw response { statusCode raw } } }`,
          { id: n.id },
        );
        const r = req?.request;
        if (!r) continue;
        stream.write(
          JSON.stringify({
            id: r.id,
            method: r.method,
            host: r.host,
            path: r.path,
            query: r.query,
            is_tls: r.isTls,
            status_code: r.response?.statusCode ?? null,
            request_raw: decodeBlob(r.raw),
            response_raw: decodeBlob(r.response?.raw),
          }) + "\n",
        );
        written++;
      }
      await new Promise<void>((resolve, reject) => stream.end((e: any) => (e ? reject(e) : resolve())));

      return {
        content: [{ type: "text", text: `Exported ${written} request(s) to ${outPath}` }],
        details: { count: written, path: outPath },
      };
    },
  });
}
