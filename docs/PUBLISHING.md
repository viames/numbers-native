# Publishing

Author: **Viames Marino**. License: **MIT**. Product: **Numbers Native**, version **0.5.0 public preview**.

## Public distribution

- Source and Codex marketplace: https://github.com/viames/numbers-native
- Website: https://viames.github.io/numbers-native/
- Releases: https://github.com/viames/numbers-native/releases
- Support: https://github.com/viames/numbers-native/issues
- Privacy: https://viames.github.io/numbers-native/privacy.html
- MCP Registry: [io.github.viames/numbers-native, catalog revision 0.5.1-catalog.1](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.viames%2Fnumbers-native/versions/0.5.1-catalog.1), referencing the unchanged 0.5.0 native MCPB.

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

The standalone plugin ZIP is prepared for submission. On 13 November 2026 the authenticated portal required developer identity verification before allowing an upload. No upload, review or approval is claimed. No payment method has been added for submission.

As verified in official documentation on **18 October 2026**, local MCP submissions are limited to approved partners and require the submitting organization to be allowlisted. The portal also requires a verified individual or business developer identity before upload. See https://developers.openai.com/plugins/deploy/desktop-only and https://developers.openai.com/plugins/deploy/submission.

The submitting owner must complete identity verification directly in the OpenAI portal and obtain local-MCP eligibility from OpenAI. After those prerequisites, follow the documented local-plugin flow and upload the standalone plugin ZIP with its native MCP configuration. Resolve automated findings, provide reviewer test cases and walkthrough material, submit, and publish only after approval. Do not remove the local-execution requirement or disguise the package as a remote server to bypass eligibility.

Portal access, review and approval are external state. A GitHub release, registry record or locally valid ZIP does not establish OpenAI-directory approval. No developer identity, private organization identifiers or reviewer credentials belong in the public repository.

## Claude Desktop extensions

Version 0.5.0 MCPB was submitted through Anthropic's official Desktop Extensions form on 13 November 2026. The form confirmed receipt. Review and inclusion are pending; submission does not establish directory approval.

## Additional directory submissions

Only free submission paths were used. No credit card, paid listing, subscription or hosted deployment was activated.

| Directory | Verified outcome |
| --- | --- |
| [MCP Servers](https://mcpservers.org/servers/viames/numbers-native) | Public Numbers Native listing verified on 13 November 2026; the earlier submission queue has resolved to a live project page. |
| [MCP Market](https://mcpmarket.com/submit) | GitHub repository submitted to the **Free Queue ($0)**. The success message states an approximate four-to-six-week wait; this is not yet a live listing. |
| [Glama](https://glama.ai/mcp/servers/viames/numbers-native) | Public listing verified on 13 November 2026. The local macOS server is indexed from source; this does not make it a cloud-hosted service. |
| [Smithery](https://smithery.ai/docs/build/publish) | The official CLI 4.11.1 attempted to publish the existing macOS MCPB as `viames/numbers-native`. The service rejected it with HTTP 403: `Updating servers has been removed. Contact support@smithery.ai.` No successful release or listing was confirmed. |
| [MCP.so](https://mcp.so/submit) | Excluded: the live submission form offered only a $39 paid submission. |

These submissions do not change the native-only implementation or its macOS requirements. Do not present review queues, a created publisher account or an attempted upload as public availability. Only suitable free distribution channels are pursued.

## Catalog presentation revisions

Registry revision `0.5.1-catalog.1` refreshes the description and adds the project icon. It references the unchanged, checksummed `0.5.0` macOS MCPB; it is not a new native runtime release or new compatibility evidence. The semantic prerelease suffix keeps the future regular `0.5.1` namespace available.

Dispatch `registry.yml` with `tag=v0.5.0` and `catalog_revision=true`. The existing release verification runs first. The additional preparation step preserves server identity, website, repository and all package URLs/checksums, validates the owned public PNG against source, and changes only version, description and icon. Authentication still uses the existing short-lived GitHub identity. Other invocations retain the regular release publication path. Inspect the live record after publication.
