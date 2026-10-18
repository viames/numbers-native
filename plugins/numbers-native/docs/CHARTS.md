# Native charts

Version 0.2.0 creates charts by asking Numbers to instantiate its own built-in templates, retaining a chosen chart and its linked source table, then filling that table. It does not modify the private Numbers file format or operate the interface. Profiles currently require **Numbers 14.5** and the verified template structure. Unverified releases fail with `CHART_PROFILE_UNVERIFIED`; changed templates fail with `CHART_TEMPLATE_CHANGED` rather than silently claiming a valid result.

## Supported profiles

| Profile | Numeric columns after category/X | Notes |
| --- | --- | --- |
| `column` | 1–10 | Grouped columns |
| `bar` | 1 | Horizontal bars |
| `pie`, `donut` | 1 | Nonnegative values, at least one positive |
| `radar` | 1–10 | Categories are radar spokes |
| `interactive_column` | 1–10 | Each numeric column is a frame; Numbers' native slider changes frames manually |
| `stacked_column`, `area` | 1–10 | Internally transposed into row-series source tables |
| `dual_axis` | Exactly 2 | Weather only: first series precipitation (mm), line; second series temperature (°C), columns; fixed axis captions |
| `scatter` | Exactly 1 | Input columns are numeric speed, liters/100 km; fixed axis captions |
| `bubble` | Exactly 2 | Input columns are numeric sellers, units sold, total sales; fixed axis captions; size must be positive |

**Three specialized profiles retain fixed, localized axis captions:** `dual_axis`, `scatter`, and `bubble`. They are suitable for the physical/business meanings shown above. Changing source headers updates the table/legend but does not rename those axis captions. Do not use them to present unrelated quantities.

All profiles accept 1–100 points, subject to **500 total cells including headers**. These limits bound the single native creation operation. Regular reads/writes still allow 2,000 cells per call. Charts inherit template styles, axis settings, number presentation and their internal title. API support does not guarantee that every dataset will have a readable layout; inspect complex exports.

## Create

Call `numbers_chart_profiles`, then `numbers_chart_create`:

```json
{
  "path": "/absolute/new/path/Sales.numbers",
  "profile": "column",
  "title": "Sales comparison",
  "headers": ["Month", "Actual", "Target"],
  "data": [["Jan", 120, 150], ["Feb", 180, 160], ["Mar", 220, 200]]
}
```

The path must be new. Creation returns the explicit native document ID, sheet/table inspection, the retained profile, the actual source range/orientation and native cell-value readback. The result has exactly one sheet, one source table and one chart. `title` creates a **separate native text item** above the chart; the chart's internal template title cannot be changed through this API.

The initial matrix accepts literal categories and finite numeric data. Text, including a leading `=`, remains literal; source formulas can be assigned deliberately afterward with `numbers_write` formula objects. No sample series are intentionally left in the generated source table.

## Edit

Version 0.3.0 registers the known source in a local companion by default. Use `numbers_chart_bindings` and `numbers_chart_update` for previewed series/category/replacement changes; custom prototypes and full constraints are described in [guided workflows](GUIDED.md).

Use the returned source mapping, then `numbers_read` / `numbers_write` to change labels, series names and values. Numbers recalculates the already linked chart. For row-series profiles, input category rows were transposed: category labels are across row 1, series names down column A. Read before editing instead of assuming the same cell layout for every profile.

Use `numbers_objects` and `numbers_object` for chart position, width, height, locking and deletion. A separate heading is an ordinary text object with font, size and color controls. Save and verify relevant source cells; for a visible chart check, use Numbers' native PDF export and inspect its chart output.

Native row/column insertion **inside** a linked range can extend that range; creation uses this behavior before filling the table. Appending outside an existing reference is not equivalent. This is not an API for assigning arbitrary series references, and the bridge cannot introspect chart reference formulas. Existing template/prototype documents can be copied with `numbers_backup` and opened to preserve their native chart bindings before editing source cells.

## Boundaries

The API does not expose changing an existing chart's type, assigning/replacing its source range, editing series style/colors, axes, internal title or interactive frame selection. It cannot copy/move a chart to another document or sheet. Creation therefore targets a **new document**, not an arbitrary existing sheet. Other chart types, including a standalone line profile, are not claimed; the dual-axis template includes a line series. An existing user-provided line-chart document can still be edited through its known source table.

A bare native Chart constructor creates Numbers demonstration data. It is not used as a substitute for a chart of user data. No Accessibility helper, clipboard or UI scripting is included.

Mutations are not transactions. A creation failure after the initial save leaves the own document/path available for inspection and returns its ID and phase in `CHART_CREATION_INCOMPLETE`. A timeout requires manual state inspection before another mutation; no automatic retry or rollback occurs.
