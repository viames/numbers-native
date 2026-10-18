# Native file pairs, previews and diagnostics (0.4.0)

This release uses Numbers' native automation, opaque filesystem copies and Apple's PDFKit/AppKit frameworks. It does not use Accessibility, a clipboard driver, conversion to Excel, a remote renderer or an additional runtime package.

## Complete native backup

`numbers_backup` saves the explicitly identified source document, then copies both its `.numbers` file/package and any valid adjacent `.numbers-native.json` chart companion to a **new** path. The source remains open. Copied companions point to the backup path; binding IDs and their recorded guards remain intact. Even a valid empty companion is preserved. A composite native-content fingerprint verifies copied file/package bytes; source statistics/content and companion hash are checked for intervening changes.

Invalid source metadata or an existing destination/companion fails before source saving. There is no silent omission of a corrupt companion. Errors after copying can leave partial destination files for inspection; the source is not removed by a backup.

## Restore to a new document

```json
{ "backup_path": "/absolute/Backup.numbers", "path": "/absolute/Recovered.numbers" }
```

`numbers_restore` copies the saved backup pair and opens the recovered document. It never overwrites an existing file and does not save or change the backup. Save/close a modified backup before using it as a source. Returns the new document ID, pair paths, copy fingerprint and per-binding structural status. `matched` is a structural check, not introspection of chart-series formulas. Existing stale mappings remain stale and are reported; recovery does not guess or repair chart references. Normal native cell editing remains possible.

Recovery into an existing path or automatic replacement of the live original is intentionally unsupported. Inspect the recovered copy and use an explicit new path.

## Move or rename a document and its companion

```json
{ "document_id": "current native ID", "path": "/absolute/New folder/Renamed.numbers" }
```

`numbers_move` saves and closes only the identified source, copies/verifies both files to a new destination, opens that destination in Numbers and verifies its path. The original is removed only after those checks, while still closed and unchanged. This works across filesystem locations by copying before removal. Returns the destination's current native document ID; use that ID in subsequent calls.

Cooperating plugin workflows hold the same process lock across the operation. Source files changed or reopened by another actor block removal. On `PAIR_MOVE_INCOMPLETE`, inspect both reported paths; the original may be closed and a usable destination copy may exist. Failure during final removal may leave an old orphan companion. This is a recoverable multi-step operation, **not an atomic two-file rename or transaction**. No automatic retry/rollback is performed, and unrelated documents are never closed.

Paths for documents, backups, companions and preview outputs follow the configured allowed-root policy. Existing destinations and orphan companion names are never intentionally overwritten. Symlink/special-entry packages are rejected. No private Numbers file-format data is parsed or rewritten. Content fingerprints are copy-integrity checks, not a persisted independent backup-authentication ledger.

## Native visual previews

```json
{ "document_id": "native ID", "path": "/absolute/new/Preview.pdf", "page": 1, "max_dimension": 1200 }
```

`numbers_preview` exports the current document using Numbers, then renders the selected PDF page to a sibling `Preview.png` through macOS PDFKit/AppKit. Returns paths, page count, image dimensions and inline PNG content through MCP (up to 10 MiB per image). It requires no Poppler, Python or browser/GUI control. `page` refers to a 1-based exported PDF page, not a sheet index. Use separate calls/new filenames for other pages. Existing PDF **or** PNG paths block the operation before export. An out-of-range page can leave the already exported PDF; the error returns its page count/path.

The source is not explicitly saved by preview, but Numbers' normal autosave still applies. Preview reflects the current open document, including unsaved changes. It does not change cells or chart geometry. Numbers can acknowledge restored values before refreshing its chart cache: preview therefore waits briefly and compares up to four independent native exports of the selected page. `render_stable` means two consecutive rendered outputs match, not that chart references were introspected. If output remains changing, the result explicitly says so. Intermediate files are staged in a unique sibling directory and removed afterward. Native print layout controls pagination; some content may be on later pages. Requested image size is bounded (400..2400); output dimensions are reported rather than assumed.

For before/after images, add this field to a normal `numbers_chart_update` request:

```json
"visual_check": {
  "before_path": "/absolute/new/Before.pdf",
  "after_path": "/absolute/new/After.pdf"
}
```

The default dry-run checks paths and returns the planned cell changes but creates no images. Apply the same request with its `expected_revision`; the plugin generates Before PDF/PNG, applies/saves the source update and companion, then generates After PDF/PNG. The result includes both images for inspection. Changing visual paths also invalidates the preview revision.

Images are **not automatically certified as correct** (`inspected_automatically: false`). Codex/user must inspect the chart. Private chart-reference introspection remains unavailable. If the After render fails after saving, the result explicitly says `applied: true`, `saved: true`, `after_render_failed`: retry only the preview at a fresh path. Timeouts/uncertain native failures retain bridge quarantine; details identify any already saved update. Inline image attachment failure reports a notice rather than turning a saved update into an apparent failed mutation.

Native rendering uses [PDFPage.thumbnail](https://developer.apple.com/documentation/pdfkit/pdfpage/thumbnail(of:for:)) and [NSBitmapImageRep PNG representation](https://developer.apple.com/documentation/appkit/nsbitmapimagerep/representation(using:properties:)).

## Compatibility diagnostics

`numbers_diagnostics` reports local Node version, architecture, macOS version, locale, Numbers version, Automation-test status and native PDF renderer availability. With `launch: true`, it tests Automation and reads installed template IDs without creating test documents. Without that check, template availability is `null` (unknown), not false.

Each chart profile separately reports its verified-version match and installed-template availability. Template structure is still checked during actual chart creation. Diagnostics do not enable unverified profiles. The test matrix remains **one physical Mac**, Numbers 14.5/macOS 27.0.1/Italian/Node 24.19.0. Other Macs, languages, Numbers releases and Node 22 need independent native verification before broad distribution claims.
