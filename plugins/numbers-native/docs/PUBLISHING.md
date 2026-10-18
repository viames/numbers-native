# Publishing

Author: **Viames Marino**. License: **MIT**. Product: **Numbers Native**, version **0.5.0 public preview**.

## Public distribution

- Source and Codex marketplace: https://github.com/viames/numbers-native
- Website: https://viames.github.io/numbers-native/
- Releases: https://github.com/viames/numbers-native/releases
- Support: https://github.com/viames/numbers-native/issues
- Privacy: https://viames.github.io/numbers-native/privacy.html
- MCP Registry identity: `io.github.viames/numbers-native`

Install in Codex with `codex plugin marketplace add viames/numbers-native`, then `codex plugin add numbers-native@viames-numbers`. Start a new local task. Repository discovery and installation are distinct from approval in the OpenAI directory. Native requirements and one-Mac verification limits remain explicit.

## Release procedure

1. Run `npm ci`, `npm test`, `npm run build` and `npm run package` in a clean checkout. Validate `plugins/numbers-native/manifest.json` with the official MCPB validator and `artifacts/server.json` with the official MCP Registry schema.
2. Native verification requires a logged-in Mac with Numbers and Automation permission. Run the core, chart, boundary, guided, file/preview and data-workflow suites as appropriate to the change. Never use user documents as fixtures or certify another Numbers release without real tests.
3. Inspect public files for private data. Keep MIT, runtime dependency notices, platform requirements, failure semantics and verified limits in every package.
4. Commit and push, check portable CI on Linux/macOS/Windows, then tag the tested commit. Publish a versioned public-preview release with the marketplace ZIP, standalone plugin ZIP, MCPB, `server.json` and `SHA256SUMS`. Do not move published tags or overwrite immutable release files.
5. Verify hashes from a fresh public download and test a Git-backed marketplace installation in an isolated Codex home. The MCPB must start and calculate native formulas from an extracted clean path without runtime node_modules. This proves packaging on the test host, not another-Mac compatibility.
6. Dispatch **Publish MCP Registry** with the existing release tag. It verifies downloaded release hashes and publishes using short-lived GitHub OIDC, without a stored PAT or npm credentials. Inspect the workflow and verify the live registry record before claiming indexing succeeded.

The MCP Registry supports MCPB artifacts hosted on GitHub Releases: https://modelcontextprotocol.io/registry/package-types. The generated metadata includes the actual artifact SHA-256. MCPB exposes the same native tools; Codex skills require the Codex plugin.

No installation automatically changes macOS permissions or shell startup files.

## Official OpenAI directory

As verified in official documentation on **18 October 2026**, local MCP submissions are limited to approved partners and require the submitting organization to be allowlisted. The portal also requires a verified individual or business developer identity before upload. See https://developers.openai.com/plugins/deploy/desktop-only and https://developers.openai.com/plugins/deploy/submission.

The submitting owner must complete identity verification directly in the OpenAI portal and obtain local-MCP eligibility from OpenAI. After those prerequisites, follow the documented local-plugin flow and upload the standalone plugin ZIP with its native MCP configuration. Resolve automated findings, provide reviewer test cases and walkthrough material, submit, and publish only after approval. Do not remove the local-execution requirement or disguise the package as a remote server to bypass eligibility.

Portal access, review and approval are external state. A GitHub release, registry record or locally valid ZIP does not establish OpenAI-directory approval. No developer identity, private organization identifiers or reviewer credentials belong in the public repository.
