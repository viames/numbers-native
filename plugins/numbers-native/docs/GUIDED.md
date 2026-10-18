# Prototypes and guided charts (0.3.0)

All operations use native Numbers automation and opaque copies of `.numbers` files/packages. No Excel conversion, private-format editing, Accessibility, clipboard or UI driver is used.

## Preserve cell formats

`numbers_write` defaults to `preserve_format: true`. Numbers can reset a cell to Automatic on value assignment; the bridge now restores a compatible exposed base format and checks native readback. Numeric replacements preserve currency, percent, number and other compatible numeric formats; formulas preserve non-text formats; null preserves the existing format. Literal strings, explicit dates and booleans deliberately select text, date/time and checkbox formats. Converting an existing text cell to a number/formula permits a numeric/automatic format.

Fonts, size and cell fill are not rewritten during a value edit. Native tests verify their persistence. Custom decimal precision, currency codes/symbols, date patterns, borders and other unexposed formatting details cannot be individually captured/restored by this API. This is preservation of compatible **exposed base formats**, not a promise of every hidden style attribute. An unrecognized format blocks a preserving numeric write before mutation. `preserve_format: false` explicitly uses normal native assignment behavior for numeric/formula writes.

## Custom .numbers prototypes

Use `numbers_from_template` with an existing `template_path` and a new absolute `path`. The source is never saved implicitly. Save or close an open modified prototype first. The bridge copies its complete native bytes/package, checks that source file statistics stayed stable during copying, then asks Numbers to open the copy. Existing objects, styles, formulas and native chart bindings are retained by the native format itself. Files/packages with symlinks or special entries are rejected. An error after copying leaves the new path for inspection; there is no automatic retry or cleanup of a possibly useful copy.

Installed Numbers template IDs remain available through `numbers_templates` / `numbers_create`; a custom prototype is an ordinary `.numbers` document rather than an exported Excel file.

By default, valid chart companions are copied and retargeted to the new path after structural validation. Use `copy_bindings: false` for a plain native copy with no guided mappings. A prototype without a companion opens normally; its chart references are not guessed. From 0.4.0, `numbers_backup` also preserves valid companions. `numbers_restore` recovers a pair at a new path; `numbers_move` relocates both files. See [file/preview workflows](FILES-PREVIEW.md).

## Register and discover a known chart source

`numbers_chart_create` defaults to `managed: true` and registers its verified template source automatically. `managed: false` skips companion creation.

For an existing/custom chart, first inspect it and verify which table is linked (for example with a native PDF check), then call:

```json
{
  "document_id": "native ID",
  "sheet": 1,
  "table": "Dati",
  "range": "A1:C4",
  "chart_sheet": 1,
  "chart": 1,
  "label": "Spese",
  "orientation": "columns"
}
```

This is `numbers_chart_bind`: it records a **declared existing relationship**. It does not create/change a link and cannot inspect private series-reference formulas. `numbers_chart_bindings` lists saved mappings. To explicitly refresh a stale mapping after checking the source again, pass `replace_binding` with its ID/label to `numbers_chart_bind`. IDs are scoped to the document.

A guided source currently covers the **entire table**, with one header row, one header column for category charts (zero for X/Y/bubble), no footer/filter, finite numeric series and literal text/numeric categories. Up to 100 points, 10 numeric columns and 500 cells including headers are supported, subject to the original profile's stricter limits. Blank category-corner headers are allowed. Dates as categories, partial-table references, automatic source discovery and arbitrary series-reference changes are outside this workflow; use normal native cell tools where appropriate.

## Preview and apply

Example request to `numbers_chart_update`:

```json
{
  "document_id": "native ID",
  "binding": "Spese",
  "mode": "series",
  "series": "Spesa",
  "values": [150, 80, 35]
}
```

The default is a read-only preview. It returns changed cells, target range, removed-cell count, overwritten-formula count and a `revision`. Apply the **same request** with `preview: false` and `expected_revision` set to that revision. This checks consistency; it is not an extra user approval requirement. A source edit, format change, request change, document reopen, companion change or structural difference invalidates an old preview. Generate another preview rather than retrying a stale mutation.

Modes:

- `series`: select a unique numeric-series header and supply one finite numeric value per point. Other series/formulas are left in place.
- `append`: supply `data` rows in the existing header order; these are new categories. Formula-bearing source tables are rejected to avoid relocating formulas incorrectly.
- `replace`: supply complete `headers` and `data`. This can remove source formulas/cells; the preview reports them. Numeric-column constraints remain those of the known profile.

Input remains category-per-row for all modes. Row-series profiles (stacked column, area) are transposed internally. Existing formulas can be deliberately replaced; they are never reconstructed from their calculated values in series mode. Only numeric series values are accepted by guided update; use explicit formula objects with normal `numbers_write` for formulas.

Growth inserts **inside** an existing native reference before filling the source. It therefore needs at least two existing points/series on any expanding axis. A source reduced to one point/series cannot safely grow along that axis through this workflow; create a new chart document instead. Fixed-axis specialist profiles keep their fixed meanings.

Successful apply saves the native document, checks source readback, and updates companion dimensions/guards. Source readback does not prove the visible chart's private references: export a PDF for visual verification, particularly for declared custom bindings.

Optional native before/after images and compatibility diagnostics are described in [file/preview workflows](FILES-PREVIEW.md).

## Companion storage and limits

The adjacent `<document>.numbers-native.json` stores versioned binding IDs, names, structural fingerprints and source ranges. It contains no cell matrix or formula history. It survives server restarts and document reopen. Keep it with the document for guided updates. Use `numbers_move` to rename/relocate a pair and retarget its metadata. Moving a pair manually requires registering the known source at the new path, or creating the copy through `numbers_from_template`.

The native document stays usable without this file. Corrupt, foreign-path, oversized, symlinked or concurrently changed companions fail explicitly. No global per-user registry, hidden Numbers sheet or cloud storage is used. Companion paths follow the same allowed-root policy as documents.

Calls are serialized across cooperating plugin processes, including multi-step workflows and companion writes. Numbers/users/other applications remain independent actors. Preview, resize, writes, save and companion updates are not a transaction. Errors may leave changes applied; `CHART_UPDATE_INCOMPLETE` identifies phase/path. Do not automatically retry. A native timeout quarantines the bridge and retains the lock for inspection.

Chart/table names, indexes, dimensions and chart geometry are rechecked. Numbers exposes no stable chart ID or series-reference readback: replacing a chart with an indistinguishable object or manually changing its references may be undetectable. A companion records a known relationship and cannot certify arbitrary later manual reference edits.
