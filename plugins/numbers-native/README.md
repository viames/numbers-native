# Numbers Native

By **Viames Marino** · **MIT License** · **0.5.0 preview**

Work directly with Apple Numbers from Codex. The plugin uses Apple Events to create, read and edit native `.numbers` documents. Numbers evaluates formulas and saves the native file; no XLSX conversion is used.

This folder is the **standalone plugin**, containing the manifest, bundled stdio MCP server, fixed native workers, source, two skills and license notices. It can be loaded by a compatible plugin host or submitted through the eligible desktop-only review flow. For repository marketplace installation, use the separate **marketplace release ZIP**, which includes `.agents/plugins/marketplace.json` and installation/development instructions.

## Requirements

macOS, Apple Numbers, Node.js 22+ on the host's PATH, and a local execution environment that supports stdio MCP. Grant the real host permission to control Numbers when macOS asks. This version does not use Accessibility. Runtime npm installation and an additional OpenAI API key are not required.

The plugin manifest starts `node ${PLUGIN_ROOT}/dist/server.mjs`. Both native files in `native/` are required. Do not move the server independently of the plugin directory.

Invoke the setup skill, then the Numbers skill. The server exposes 38 typed tools. Use native document IDs and table-relative ranges; one sheet can contain several independent tables. Reads/writes are bounded to 2,000 cells. Strings are literal text; formulas require explicit `{ "formula": "=SUM(A1:A3)" }` objects.

Create chart documents with `numbers_chart_profiles` and `numbers_chart_create`; source cells stay linked and editable. Eleven profiles are verified on Numbers 14.5. Chart type/styles/internal titles and arbitrary insertion into existing files remain outside the API. See the [chart workflow](docs/CHARTS.md).

Version 0.5.0 adds guarded multi-table cell edits, native-result checks and typed CSV/TSV append/upsert. See [data workflows](docs/DATA-WORKFLOWS.md). Version 0.4.0 added complete pair backup/restore/move, native PDF/PNG previews and compatibility diagnostics. See [new workflows](docs/FILES-PREVIEW.md). It preserves compatible exposed cell formats, copies custom native prototypes and offers guided chart updates with a read-only preview and revision checks. Guided mappings live in an adjacent local JSON companion. See [guided workflows](docs/GUIDED.md).

See [capabilities and limits](docs/CAPABILITIES.md), [verification](docs/VERIFICATION.md), [privacy](docs/PRIVACY.md) and [publication](docs/PUBLISHING.md).

Numbers autosaves. Edits can partially apply before an error; no transactional rollback is provided. After a timeout, inspect Numbers and resolve the retained process lock before restarting. The bridge makes no network requests itself; tool data passes through Codex and may be sent to its model under the host's policies.

This independent project is not affiliated with or endorsed by Apple or OpenAI. Apple Numbers is required and is not bundled.


Public repository: https://github.com/viames/numbers-native

Codex: `codex plugin marketplace add viames/numbers-native`, then `codex plugin add numbers-native@viames-numbers`. MCPB hosts can use the macOS bundle from the versioned GitHub release; tools are the same, but Codex skills require the plugin installation.

Website and privacy: https://viames.github.io/numbers-native/ · https://viames.github.io/numbers-native/privacy.html
Support: https://github.com/viames/numbers-native/issues
