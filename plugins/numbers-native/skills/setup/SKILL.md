---
name: setup
description: Set up Numbers Native on a Mac and diagnose installation, Node.js, Numbers and Automation permission issues.
---

The plugin needs macOS, Apple Numbers, Node.js 22 or later, and a local Codex execution environment. Its bundled MCP server needs no npm install and no separate OpenAI API key. It cannot control Numbers from a Linux/cloud executor.

Call `numbers_status` with `launch: false`, then `launch: true` to test native Automation permission. If macOS asks, explain that the host needs permission to control Numbers. For `AUTOMATION_DENIED`, direct the user to System Settings > Privacy & Security > Automation for the actual host shown by macOS; do not change permissions yourself. Accessibility permission is not required by this version.

Use `numbers_diagnostics` with `launch: true` for local Node/macOS/Numbers/locale, Automation, native PDFKit and installed-template checks. This creates no test documents. Do not interpret template availability as a verified new Numbers release or another-Mac test.

If tools are missing, verify Node.js is on the host's PATH and that the installed package includes `dist/server.mjs` and `native/worker.js`. Restart the host/session after installing. Do not install an XLSX converter as a fallback.

On `NUMBERS_BUSY`, let the other operation finish. Timeouts deliberately retain the lock. Inspect Numbers manually, stop the quarantined bridge, then confirm no Numbers Native process is running before removing its stale lock. The lock is under the current user's temporary directory as `numbers-native-<uid>.lock` and records its owner's PID. Do not remove a live process lock. Restart only after the document state has been resolved.

For 0.3.0, guided chart creation also writes an adjacent `.numbers-native.json` companion. Keep it beside the native document; it records known source mappings, not cell history. Losing it does not prevent ordinary native cell editing.

Offer a test in a new .numbers file in the user's chosen folder. Never modify an existing document as a setup test. Read back one numeric value and one formula result, save, and report the test path. Do not claim installation or compatibility on another Mac based on this test alone.

The bridge has no network listener or telemetry. Tool inputs/results pass through the Codex host and can be sent to its model under that host's data policies. Do not claim all spreadsheet content stays on the device.
