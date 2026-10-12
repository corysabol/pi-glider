#!/usr/bin/env node
/*
 * caido-init.js — bootstrap the in-container Caido instance:
 *   1. authenticate (admin+OTP on first run, like Strix's docker-entrypoint;
 *      guest afterwards — sessions persist in $CAIDO_DATA)
 *   2. ensure a named project exists AND is selected before proxy traffic
 *      flows — Caido binds captures to the selected project; with none
 *      selected the proxy fails to record (HTTP 500 / database error).
 *      Guest mode only allows temporary projects, so we create with
 *      `temporary: true` (like Strix's sandbox project).
 *   3. (retries until Caido is up — doubles as the readiness gate)
 * Idempotent: no-op project-wise once the named project exists.
 */
const fs = require("fs");
const http = require("http");

const API = process.env.CAIDO_API_URL || "http://127.0.0.1:5000";
const PORT = Number(new URL(API).port || 5000);
const NAME = process.env.CAIDO_PROJECT_NAME || "engagement";
const CAIDO_LOG = process.env.CAIDO_LOG || "/var/log/caido.log";

function gql(query, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = http.request(
      {
        host: "127.0.0.1", port: PORT, path: "/graphql", method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try { resolve(JSON.parse(d)); } catch { resolve({ raw: d.slice(0, 300) }); }
        });
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

function rest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1", port: PORT, path, method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, body: d }));
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function adminToken() {
  // Caido prints "Login OTP: <code>" on each boot; local login = admin + OTP.
  let log = "";
  try { log = fs.readFileSync(CAIDO_LOG, "utf8"); } catch { /* not written yet */ }
  const matches = log.match(/Login OTP:\s*([0-9]+)/g);
  const otp = matches && matches.length ? matches[matches.length - 1].match(/([0-9]+)/)[1] : null;
  if (!otp) return null;
  const r = await rest("POST", "/api/authentication/login/local", { username: "admin", otp });
  if (r.status !== 200) return null;
  try { return JSON.parse(r.body).token ?? null; } catch { return null; }
}

(async () => {
  // Authenticate, retrying until Caido answers.
  let token = null;
  for (let i = 0; i < 30 && !token; i++) {
    token = await adminToken();
    if (!token) {
      try {
        const login = await gql("mutation { loginAsGuest { token { accessToken } } }");
        token = login?.data?.loginAsGuest?.token?.accessToken ?? null;
      } catch { /* not up yet */ }
    }
    if (!token) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!token) { console.error("caido-init: could not obtain auth token"); process.exit(1); }

  const projects = await gql("{ projects { id name temporary } }", token);
  const list = projects?.data?.projects || [];
  const target = list.find((p) => p.name === NAME) || list[0];

  let selected = target;
  if (!target) {
    const created = await gql(
      `mutation { createProject(input: { name: ${JSON.stringify(NAME)}, temporary: true }) { project { id name } } }`,
      token
    );
    selected = created?.data?.createProject?.project;
    if (!selected) { console.error("caido-init: createProject failed:", JSON.stringify(created).slice(0, 400)); process.exit(1); }
  }

  const sel = await gql(`mutation { selectProject(id: ${JSON.stringify(selected.id)}) { currentProject { project { id } } } }`, token);
  if (sel?.errors) { console.error("caido-init: selectProject failed:", JSON.stringify(sel).slice(0, 400)); process.exit(1); }
  console.log(`caido-init: project "${selected.name}" (${selected.id}) selected`);
})().catch((e) => { console.error("caido-init:", e.message); process.exit(1); });
