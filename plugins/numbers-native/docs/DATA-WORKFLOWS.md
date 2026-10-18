# Guarded edits, checks and CSV/TSV import

Version 0.5.0 adds `numbers_edit`, `numbers_check` and `numbers_import`. Numbers remains the only native document writer and formula evaluator. CSV/TSV parsing prepares literal typed values; it never converts the document to Excel.

## Preview and apply

`numbers_edit` accepts up to 20 nonoverlapping rectangular cell edits across existing tables/sheets in **one explicitly identified document**. Each edit specifies `sheet`, `table`, `start` and `values` with the same typed values as `numbers_write`. It does not resize tables or translate relative formulas. Explicit formula objects are assigned as supplied; ordinary strings beginning with `=` remain literal text.

Both edit and import default to `preview: true`. Preview reads cells and returns `revision`, changed-cell count, up to 100 detailed changes, formula overwrite count and current checks. It does not assign values, save, resize, create files or predict the results of new formulas. Apply the **identical request**, adding `preview: false` and `expected_revision`. Keep checks, mapping options, source path and `save` the same.

The revision includes values, formulas, exposed base formats, table topology and the exact request. Import also includes the SHA-256 of input bytes. Only inspected ranges and topology are guarded, not all cells in the document or hidden format settings. All requested ranges are recaptured before the first mutation; each write also checks its target structure, literal values/formula expressions and base formats immediately before assignment. Formula results may change as earlier writes recalculate; subsequent write guards compare their expressions rather than requiring an obsolete calculated value.

There is no Numbers transaction or atomic compare-and-set API. A person or another application can still edit concurrently. Edits may partially apply; errors include completed write-block counts and any native completed-cell information. Never retry a mutation automatically, assume rollback or discard unrelated documents. Existing timeout/quarantine rules apply.

Apply verifies assigned values using native readback, then runs checks on native results. It saves by default (`save: false` omits explicit saving; Numbers autosave can still occur). **Failed post-checks do not undo edits and do not suppress an explicitly requested save.** A successful assignment can therefore return `applied: true`, `saved: true`, `validation_passed: false`. Inspect `checks_after` before declaring the task complete. An invalid formula can force Numbers to Automatic format; a preservation error means assignment may already have happened.

Limits: 2,000 written cells total, 2,000 cells per inspected range and 5,000 inspected cells total, including check ranges. Overlapping edits are rejected even when the same table is referenced by both name and index. Locked targets require deliberate unlocking outside this workflow. Complex merged ranges are subject to native behavior and readback checks; no hidden merge topology is inferred.

Example request (use a real document ID):

```json
{
  "document_id": "native-id",
  "edits": [
    {"sheet": 1, "table": "Dati", "start": "B2", "values": [[150]]},
    {"sheet": 1, "table": "Riepilogo", "start": "A3", "values": [["Budget disponibile"]]}
  ],
  "checks": [
    {"kind": "equals", "source": {"sheet": 1, "table": "Riepilogo", "range": "B2"}, "value": 265}
  ]
}
```

## Read-only checks

`numbers_check` accepts explicit `ranges` for formula-result inspection and/or up to 50 `checks`. It never assigns formulas or saves a document. Available checks:

| Kind | Definition |
| --- | --- |
| `required` | `source` range has no null or empty-string values; false and zero are valid |
| `unique` | Every source cell has a nonempty distinct typed value; text `001` differs from number `1` |
| `formula` | Every source cell still contains a native formula |
| `numeric_bounds` | Every source value is a finite number inside declared `min` and/or `max` |
| `equals` | A single-cell `source` equals `value`; numeric absolute `tolerance` defaults to 1e-8 |
| `balance` | Sum of native numeric results from single-cell `terms` times their `coefficient` equals `expected`, within absolute tolerance |

Formula inspection flags missing native results or recognizable error text as **suspected** errors. A legitimate formula returning an empty/missing result or error-like text can also be flagged. No parser reconstructs the complete formula dependency graph, translates localized formulas or proves that a formula was replaced historically. Use `formula` rules to enforce known formula locations. Reports cap detailed violations and suspected errors at 100 each, with full counts.

## CSV/TSV import

`numbers_import` updates an existing table using `source_path`, `mode` and explicit `mapping`. Input must be a regular UTF-8 `.csv`/`.tsv` file, optionally with BOM, at most 2 MiB. Quoted fields, doubled quotes, CRLF and embedded line endings are supported. Delimiters are comma, semicolon or tab; `auto` rejects ambiguous multi-column interpretations. Headers must be exact, nonempty and unique. Malformed quotes, ragged rows, invalid UTF-8 and unexpected blank records fail explicitly.

Each mapping declares `source` header, `target` header and `type`:

- `text`: preserve text exactly, including whitespace, zeroes and leading `=`.
- `number`: explicit `decimal_separator` (`.` default or `,`) and optional `group_separator` (`none`, `.`, `,`, `space`). Thousands groups require three digits; currency symbols and locale guesses are rejected.
- `boolean`: accept true/false (case-insensitive) or 1/0.
- `date`: explicit `date_format`: ISO timestamp with timezone (`iso` default), `dd/mm/yyyy` or `yyyy-mm-dd`. Date-only values use midnight UTC; verify native local display near timezone boundaries. Invalid calendar dates are rejected.

Empty fields use `empty: clear` by default; choose `skip` to leave the corresponding target cell untouched, or `error` to reject. Non-text fields trim surrounding whitespace before conversion. Source content is always data, never a command or implicit formula.

`append` places records after the last used row, reusing trailing empty rows before growing the table. It does not accept `key_column`. `upsert` requires `key_column`, mapped as text or number. Existing keys must be literal, nonempty and unique; source keys must also be nonempty and unique. Matching uses exact typed values, without trimming, case folding or numeric coercion. Text `001` and number `1` are different keys. New keys append; absent source keys never delete rows. Entirely blank data rows inside the used target area are not guessed away in upsert.

Mapped existing formulas are protected by default. `overwrite_formulas: true` explicitly permits replacement, and preview reports it. Unmapped cells/formulas remain untouched. New rows are not filled by a plugin formula-copy routine; if Numbers itself populates new target formulas during growth, import stops before replacing them unless formula overwrite was explicitly enabled. Growth can therefore leave a resized table after such a stop. Inspect it before continuing.

The target needs one header row, zero footer rows, no active filter and no lock. The complete table must fit 2,000 cells **after** growth. Up to 500 input records/100 source columns/5,000 input fields are accepted, with at most 20 column mappings, 2,000 mapped assignments and 100 coalesced write blocks. Highly fragmented upserts must be split or sorted in target order. Existing target headers are not renamed.

Optional checks on import refer to ranges that already exist at preview time; run `numbers_check` afterward to inspect newly appended ranges. Enlarging a table does not certify that an existing chart's private source range expanded. Use the guided chart workflow when chart-reference expansion is required.

Example mapping for Italian amounts and codes:

```json
{
  "document_id": "native-id", "sheet": 1, "table": "Dati",
  "source_path": "/absolute/path/import.csv", "mode": "upsert", "key_column": "Codice",
  "mapping": [
    {"source": "Codice", "target": "Codice", "type": "text"},
    {"source": "Importo", "target": "Importo", "type": "number", "decimal_separator": ",", "group_separator": "."}
  ]
}
```

Imports remain local to the MCP host. Source fields, requested values and returned changes pass through Codex according to host policy; do not describe local automation as guaranteeing that all data stays off the model service.
