# Native capability coverage

The installed Numbers scripting dictionary, not Excel's workbook model, defines this bridge. Actual runtime checks are recorded separately in the repository's `docs/VERIFICATION.md`.

| Area | Implemented scope | Boundary |
| --- | --- | --- |
| Documents | Create from native template, open, inspect, save, close, complete native/companion backup, restore to new path and verified pair move/rename | Existing encrypted-file/password dialogs unsupported; backup first saves the source |
| Templates / prototypes | Native template IDs plus complete `.numbers` file/package copying; optional known chart companions | Source never saved implicitly; save/close modified prototypes; no symlinks; private format not parsed |
| Sheets | Create, rename, activate, delete | Native duplication unsupported; cannot delete final sheet |
| Tables | Create, rename, delete, resize, header/footer counts, freeze headers, geometry | Shrinking can remove cells; native duplication unsupported |
| Cells | Bounded matrix reads/writes with values, formulas, formatted text and formats | 2,000 cells per call; rectangular write; no automatic growth |
| Guarded edits | Preview/apply related cell updates across existing tables in one document; source/request revision, native write guards and post-checks | 20 nonoverlapping edits / 2,000 written cells / 5,000 inspected cells; no transaction or formula relocation; failed checks do not roll back |
| Validation | Required/unique/formula-presence/bounds/equality/balance rules on native results; suspected formula errors | Explicit bounded ranges only; no complete dependency graph or universal error diagnosis |
| CSV/TSV input | UTF-8 quoted CSV/TSV, explicit column/type mapping, append and typed-key upsert with preview and source hash | Target <=2,000 cells after growth, protected formulas, no deletion/automatic formula fill/certified chart growth; see [data workflows](DATA-WORKFLOWS.md) |
| Types | Finite numbers, literal Unicode text, checkbox booleans, ISO dates, empty cells | Strings explicitly use text format; booleans use checkbox format |
| Formulas | Set native expressions, read expression and result calculated by Numbers | Native language/locale applies; no independent formula engine or universal translator |
| Formatting | Base format subtype, font name/size, RGB text/fill, wrap, alignment; writes restore and verify compatible base formats | No borders, decimal precision, custom currency/date patterns, pop-up options or conditional rules |
| Structural edits | Insert/delete rows/columns, dimensions, sort by one column, transpose | Max 100 inserted/deleted items; deleting or merging can remove data |
| Ranges | Clear values or values/style, merge/unmerge, selection and bounded text/formula search | Search scans only the specified range, up to 100 returned matches |
| Text / shapes / images | Create, move, resize, lock/unlock, text update; font/size/color on text/shapes, opacity on text/shapes/images, rotation/reflection where exposed, delete | Shape fill/styles and individual rich text runs not exposed; supported image file types are limited |
| Charts | Create a new document from 11 verified template profiles; edit its linked source cells; inspect/change geometry, delete | Numbers 14.5 profiles; 100 points / 500 cells; profile-specific 1–10 numeric columns; no arbitrary insertion or series/type/style/internal-title API |
| Guided charts | Persist known source mappings; preview/apply series, append or replacement updates with revision/structure guards | Whole source table, 500 cells; no private reference introspection; adjacent JSON companion; see [workflow](GUIDED.md) |
| Lines / groups | Inspect and change basic geometry, delete | No construction/grouping API |
| Export / preview | Numbers-native PDF/CSV export; PDFKit PDF-page PNG previews and guided before/after images | CSV may produce a directory when multiple tables are present; no Excel conversion |
| Compatibility | Local runtime, Automation, locale, PDFKit and chart-template diagnostics | Not second-Mac/version certification; see [workflow](FILES-PREVIEW.md) |
| Advanced Numbers features | Preserved by letting Numbers manage its own documents | No pivot creation, categories, filter rule management, comments, collaboration or password workflow |

No arbitrary AppleScript/JXA execution, shell-command tool, clipboard automation, Accessibility GUI driver, cloud service or undocumented file-format manipulation is exposed.

Color inputs and readback use RGB components in 0..65535. Numbers internally returns normalized floating-point colors; the bridge converts these back to the documented 16-bit scale without inventing values. Small native rounding differences may occur.

Further chart research found that a native `Chart` can be instantiated, but it contains Numbers' built-in demonstration data. Native selection alone does not link the chart to that selection. Chart type, series and title are not exposed by its scripting proxy. The bridge therefore does not advertise sample-chart creation as charting of a user's table. The native-only template workflow now preserves existing data links and populates user data; see [charts](CHARTS.md). No interface helper is included.

## Error semantics

- `DOCUMENT_NOT_FOUND`: refresh/open to obtain a current document ID.
- `AMBIGUOUS_NAME`: choose the 1-based index from a fresh inspection.
- `RANGE_OUT_OF_BOUNDS`: resize deliberately or use a valid table-relative range.
- `DESTINATION_EXISTS`: choose another path; create, backup and export never intentionally overwrite.
- `CHART_PROFILE_UNVERIFIED` / `CHART_TEMPLATE_CHANGED`: this Numbers release/template needs verification before chart creation.
- `CHART_CREATION_INCOMPLETE`: inspect the returned document ID/path/phase; earlier changes may have applied.
- `PARTIAL_WRITE`: `completed_cells` records assignments completed before the error. Read the affected range before recovery.
- `AUTOMATION_DENIED`: grant the real host permission to control Numbers.
- `NUMBERS_BUSY`: another cooperating bridge process owns the lock.
- `STALE_LOCK`: inspect the owning PID/state before removing an abandoned lock.
- `NATIVE_TIMEOUT` / `APPLE_EVENT_TIMEOUT` / `STATE_UNCERTAIN`: inspect Numbers, stop the quarantined server and remove its stale lock only after confirming no operation is running; then restart. No automatic mutation retry.

Prevalidation reduces avoidable errors but does not provide rollback. Formatting, structural operations, export and source saving can also partially complete before an error. All cooperating plugin calls are serialized; Numbers and other applications remain independent actors.
