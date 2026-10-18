# Verification — 18 October 2026

## Public release packaging

The first public preview retains the verified 0.5.0 native runtime. Publication preparation adds real repository/support/privacy URLs, English and Italian installation guides, synthetic demo media, a static GitHub Pages documentation site and an MCPB manifest restricted to macOS/Node.js 22+. The official MCPB CLI validates the manifest. `npm run package` also produces the MCPB, SHA-256-bound registry metadata and checksums. Registry publication uses a manually dispatched GitHub OIDC workflow against an existing release. Consult the live CI, release and registry records for remote results; the historical local reports below are not claims of directory approval.

## Local 0.5.0 extension

The native-only 0.5.0 build exposes **38 typed tools**, adding guarded multi-table cell edits, read-only checks and explicit typed UTF-8 CSV/TSV append/upsert. **51 portable unit/MCP tests** pass. New coverage includes strict quoted CSV/TSV parsing and encoding/delimiter failures, Italian numeric separators, invalid dates, literal formula-like text, exact typed keys, preview consistency for values/base formats/structure/source bytes/request, aliased overlapping edits, source-root and cell-budget guards, interrupted multi-write reporting, failed post-check semantics, final detection of an intervening edit, and protected formulas inherited during growth.

**12 new native workflow scenarios** passed on the same Numbers 14.5 Mac: read-only multi-table preview; native cross-table recalculation and compatible currency preservation; required/unique/formula/bounds/equality/balance checks; stale-preview rejection; native content/format/table-identity guards including pre-resize rejection; suspected invalid-formula results and explicit repair; Italian CSV typed preview; changed-source-byte rejection; upsert with row growth, dates, booleans, zero-prefixed keys and literal leading equals; formula protection and duplicate keys; TSV append; and save/reopen persistence. New formulas are evaluated by Numbers after assignment; preview does not predict them. Invalid formulas can force Numbers back to Automatic and cause the existing format-preservation guard to report a partial assignment.

The **21 core native regression scenarios** and **14 guided/prototype regression scenarios** also passed with 0.5.0. Existing user documents were not used as test fixtures. Check reports cover declared ranges/rules and suspected formula errors, not a full dependency graph. Writes/imports remain recoverable multi-step workflows, not transactions: post-check failure does not roll back or suppress the requested save. Import is intentionally bounded to a complete target table of 2,000 cells after growth and does not certify chart-source expansion or fill formulas. Details: `plugins/numbers-native/docs/DATA-WORKFLOWS.md` in the source or `DATA-WORKFLOWS.md` in the standalone plugin.

The actual installed 0.5.0 MCP server exposed 38 tools and passed a multi-table preview/apply, Italian CSV upsert and native checks workflow. The new dedicated demo retained currency, companion chart binding and formula results 265/35 after reopening. Native PDFKit before/after images were inspected: Materiali rose from 120 to 150 and the final Spesa/Budget bars matched at 150. The bundled server also passed native formula/save/reopen checks in an isolated path with spaces/Unicode and without runtime node_modules. The updated Numbers skill passed its validator.

No Accessibility, network service, publication, commit, push or remote repository was added. The compatibility matrix remains one physical Mac, macOS 27.0.1, Numbers 14.5, Italian locale and Node.js 24.19.0; no second-Mac/version claim is made.

## Local 0.4.0 extension

The native-only 0.4.0 build exposes **35 typed tools**. **34 portable unit/MCP checks** pass, including full-pair copy/restore/move, interrupted/open-failure/source-reopened/source-changed preservation, collision guards, native-package content fingerprints, preview path/root checks, diagnostics unknown/unverified states, and MCP inline image/attachment-failure semantics. Missing native prerequisites retain local runtime diagnostics.

**12 new native scenarios** passed on the same physical Mac: live capability diagnostics without new documents; native PDFKit PDF/PNG generation; no overwrite/orphan-PNG guards; dry-run image absence; real guided before/after output; complete backup preserving source open; new-path recovery retaining backup hashes; recovered guided bindings; pair relocation with Unicode/spaces and new document IDs; move collision preservation; stale binding reporting; second-PDF-page selection/out-of-range errors; and official MCP inline native PNG content. No external PDF renderer is required at runtime. Generated images require inspection; no private chart-reference introspection or automatic visual correctness claim is made.

The **21 existing native regression scenarios** and **14 guided/prototype regression scenarios** also passed. The actual installed 0.4.0 server exposed 35 tools and passed a complete before/after (two inline PNGs), paired backup, new-path restore and move/rename workflow. Backup document/companion hashes stayed unchanged. Recovered data, currency format, formulas 265/35 and companion bindings survived reopening; a regression check caught an asynchronously stale chart export immediately after recovery. Native previews now compare bounded consecutive exports before publishing the selected page. The recovered 150/150 bars matched pixel heights (339/339) with the original still open at 175; source/geometry were not changed to force a redraw. `render_stable` indicates matching output, not reference introspection. The isolated bundled runtime also passed official MCP/native checks in a clean path with spaces/Unicode and no node_modules. Prior user test documents are separate from synthetic fixtures. Copy/move are recoverable multi-step operations, not transactions; restore never overwrites an existing file. The diagnostic matrix remains one physical Mac—no second-machine/version compatibility is claimed. Details: `plugins/numbers-native/docs/FILES-PREVIEW.md` in the source or `FILES-PREVIEW.md` in the standalone plugin.

No Accessibility, publication, remote repository, commit or push was added.

## Local 0.3.0 extension

The 0.3.0 native-only build exposes **31 typed tools**. Its **23 portable unit/MCP checks** pass. **14 additional native workflow scenarios** passed for compatible-format preservation, native prototype copies and guided chart updates, including currency/font/fill persistence, percent/number/formula/null formats, explicit literal/boolean/date semantics, read-only previews tied to the same request, stale preview rejection, series/category/complete replacement updates, chart reference expansion, source byte hashes, Unicode prototype-copy paths, companion persistence across close/reopen and server recreation, declared-source registration, stale structural guards and row-series transposition.

The Numbers-native PDF exports show new category labels and expanded series in both source tables and graphs. The source-prototype file and companion hashes stayed unchanged after cloning and editing the copy. All **21 existing native regression scenarios**, **5 object-style checks**, **11 chart profiles**, and **6 chart-boundary checks** also passed with this build. The 500-cell chart creation took 29.9 seconds on the test Mac. The actual installed 0.3.0 server exposed all 31 tools and passed a full prototype-to-guided-copy workflow: only B2 was proposed as changed, 150 EUR persisted with currency format, totals 265/35 and companion mappings survived reopening, and the prototype/native companion hashes stayed unchanged. Native PDF renders confirmed the chart update. A clean runtime path with spaces/Unicode passed MCP/native checks without node_modules. The 0.2.0 user documents remain separate from these synthetic fixtures. Companion metadata and workflow limits are documented in `plugins/numbers-native/docs/GUIDED.md` in the source repository and `GUIDED.md` in the standalone plugin.

No Accessibility/System Events helper, cloud publication, commit, push or remote repository was added. Format preservation covers compatible exposed base formats; hidden decimal/currency/date patterns are not individually introspected. Chart companions record known relationships, not private series-reference formulas.

## Local 0.2.0 extension

The native-only 0.2.0 build adds **27 typed tools** and **11 verified chart profiles**. Its **16 portable unit/MCP tests** and **21 native regression scenarios** pass. Six additional boundary checks verify release/template guards, the 500-cell native creation limit (33.2 seconds on this Mac), literal leading equals, explicit source formulas and generated-chart geometry editing. Native checks cover every profile: exact source matrix, correct retained sheet/table/chart counts, growth/shrinkage inside linked references, source-cell updates, save/reopen persistence and Numbers-native PDF export. PDF label checks and rendered inspection confirm real chart bindings. Area has no legend in Apple's template; that is not a missing data series. Long source labels can wrap in PDFs, so automated label checks use short labels.

Eight profiles are general-purpose. Three preserve fixed localized axis captions: weather dual-axis (first series line/mm, second series columns/degrees C), fuel-consumption scatter and sales bubble. Their profile metadata, results and documentation state the fixed meanings. They are not universal axis-label editors.

Chart profiles require Numbers 14.5 and matching native template structure. No Accessibility, System Events, clipboard or UI helper was added. The source fixture from the earlier user task was not used for chart tests. The actual installed 0.2.0 server exposed all 27 tools, created a separate native chart example, and persisted its formula totals 235/65 after reopening. The installed bubble profile reported its fixed axes and its revised heading layout was checked in a rendered native PDF. The bundled runtime also passed official MCP tests in a clean path with spaces/Unicode and no runtime node_modules. No remote repository, commit, push or public release was created.

## Local 0.1.1 extension

The native-only 0.1.1 build passed **13 unit/MCP tests**, the **21 native regression scenarios**, and **5 additional object-style checks** (font/size/color, opacity/rotation/reflection, text editing, normalized 16-bit cell colors, save/reopen persistence). The Numbers and macOS environment is the same as below. The status tool now reports the plugin version from the manifest.

Chart research confirmed native instantiation of a default chart but also proved that it retains sample data, ignores an unsupported constructor chart type and does not bind a selected table range. Such a chart is not exposed as a completed chart of user data. See [chart research](CHART-RESEARCH.md). This finding is superseded for new template-linked chart documents by the native-only 0.2.0 workflow above; no UI extension was added.

## Initial 0.1.0 verification

Version **0.1.0 preview**, tested on one physical Mac with **macOS 27.0.1**, **Apple Numbers 14.5**, **Node.js 24.19.0**. The tested Numbers installation uses an Italian locale.

## Results

- **12 portable unit/MCP contract tests passed** locally: input validation, matrix/range limits, inert text payloads, symlink/path restrictions, document-ID policy checks, read-only annotations, official MCP initialize/list/call, cross-instance locking, call serialization and timeout quarantine. Portable CI is configured for Linux/macOS/Windows but has not been run remotely.
- **21 native scenarios passed** in `scripts/native-smoke.mjs`: permission/capability discovery, templates, create/save, headers/freeze, typed cells, real formula results, dates, Unicode and literal leading `=`, formatting, checkbox/currency, text/formula search, selection, dimensions, merge/unmerge, row/column insertion/deletion, sheet/table operations, sort/transpose, text/shapes/images, clears, backup/overwrite protection, PDF/CSV export, and close/reopen persistence.
- **8 advanced native scenarios passed**: chart-containing template creation; inspecting/moving/resizing an existing chart; cross-table formula evaluation; dimension readback; null clearing while preserving text format; replacing text with numeric values, preserving currency when editing formulas and exact numeric-format readback; bounds/final-sheet guards; and allowed-root filtering of open-document metadata.
- **Bundled stdio MCP runtime passed** with the official MCP client from a clean directory containing spaces and Unicode, without `node_modules` in the runtime directory: initialize, list 25 tools, create, write, native calculation, save, close, reopen and read.
- **Codex CLI recognized the repository marketplace** and plugin `numbers-native@viames-numbers`, version `0.1.0`, using invocation-only marketplace configuration. This did not modify global configuration or install/enable the plugin in the current user profile.
- **Subsequent local installation passed** at the user's request: Codex reports `installed: true` and `enabled: true`. The server from the installed plugin cache exposed all 25 tools and created a native two-table example. After saving and reopening, the verified total/residual were 210/90; changing one quantity recalculated them to 235/65. The initial values were restored and the example was left open for manual testing. The current chat's tool inventory is not reloaded by installation; a new Codex session is needed to load the new tools/skills.
- Both skill entrypoints passed the skill-creator validator. Generated release ZIP entries and SHA-256 checksums are verified separately during packaging.

Native tests create only their own temporary documents and close them. Existing user documents are not test fixtures. Numbers uses its native file format throughout; PDF/CSV exports are explicit optional output operations.

## Important findings incorporated into the implementation

JXA fails to decode Numbers' `text` and `number` format descriptors. A fixed AppleScript helper reads their exact identities before typed writes and when needed for readback. Formats are not inferred from cell content. Native position properties use `{x, y}` records. Formulas may be returned with localized function names even when an English expression was accepted as input.

Numbers rejects native sheet/table duplication with “can not be copied”; that action was removed from the public schema. Arbitrary chart creation/series changes, pivot construction and other undocumented functions are not advertised as available.

## Not established

- Compatibility on a second Mac, other macOS/Numbers versions, Node.js 22 itself or all document locales.
- Interactive installation/onboarding inside every supported Codex desktop version or the official directory.
- Live manipulation of existing lines/groups, every format subtype's detailed options, external links, huge-document performance or all complex Numbers features.
- Public Git hosting, GitHub CI completion, OpenAI partner eligibility, directory submission or approval.

The bundled runtime works independently of this development checkout, but that is not a second-machine compatibility test. Broad public compatibility claims should wait for additional real-Mac testing.
