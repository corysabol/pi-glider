# Kickoff Message Template — MASTG Android Client-Side Assessment

Copy the block below into the agent as the **first user message** to start a run. Fill in the
placeholders, and delete or keep the optional lines as appropriate.

---

Assess the Android application below against the OWASP MASTG for Android, client-side only.

**Target**
- APK: `<APK_PATH>` (or: already installed on the AVD)
- Package name: `<PACKAGE_NAME>`
- Decompiled source: `<DECOMPILED_SOURCE_PATH>`
- Device: AVD emulator (AOSP, rootable via `adb root`)

**Setup notes**
- Burp Suite is already proxying the device; use Burp MCP to observe traffic (read-only).
- Frida is already set up. *(delete this line if Frida is NOT set up — the agent will install it)*

**Scope reminder**
- Client-side only. Do not attack or interact with backend services.
- Shallow, confirmatory testing: for each test, capture result + evidence + reproduction steps, then
  move on. Do not dig deep.

**Deliverable**
- A structured report: executive summary, findings (with MASTG-TEST IDs, evidence, reproduction
  steps, severity, remediation), a MASVS compliance matrix, and an appendix of commands/screenshots.

Begin.
