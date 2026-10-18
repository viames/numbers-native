# Chart investigation — 18 October 2026

All probes used a newly created local document, not the user's existing documents.

- `sheet.charts.push(app.Chart({}))` creates a real native 2D column chart. Its source is Numbers' built-in example dataset (Region 1/2, April–July), not the nearby table.
- Setting `table.selectionRange` before instantiation did not connect the selected range. A native PDF export confirmed the example labels/series remained in the chart.
- Passing a `chartType` key to the constructor did not change the chart type. The exported result was still a 2D column chart. A non-throwing constructor is not evidence that an unknown property was honored.
- `chartType`, `data`, `columnNames`, `rowNames`, `title` and `name` were not accessible through the Numbers chart scripting proxy.
- Chart creation with `withData` and direct `make` variants returned native container/type errors.
- Native chart geometry, deletion and template-provided charts remain available. Editing source cells of a template-linked chart is distinct from replacing its series references.
- Native table and sheet duplication still failed with `Tables can not be copied` / `Sheets can not be copied`, including without an explicit destination.

Apple documents UI workflows for selecting chart source cells, changing type and editing references: [create charts](https://support.apple.com/en-ca/guide/numbers/tan727160fa/mac) and [chart data and series](https://education.apple.com/learning-center/T024616A-en_US).

## Native-only template implementation (0.2.0)

The user explicitly chose to keep only the native API. No Accessibility helper was implemented.

Built-in Charting Basics and Table and Chart templates provide usable, linked charts. The 0.2.0 factory retains one sheet/chart/table, inserts inside existing references when growth is needed, trims unused rows/columns, and writes user data. The grouped-column template has two unlinked blank columns which are removed before expansion. PDF exports confirmed expanded categories and series; later source-cell edits and save/reopen retained real chart bindings.

Eleven profiles cover column, bar, pie, donut, radar, interactive column, stacked column, area, dual axis, scatter and bubble. Profiles are version-checked for Numbers 14.5 and structure-checked before use. Labels are localized, so selection uses verified template IDs and structural indexes rather than Italian display names. Structural checks cannot read private chart-series formulas.

Native chart duplication returned “Charts can not be copied”; chart/table move returned an AppleEvent handler error. Arbitrary insertion into existing sheets is therefore excluded. Profiles retain inherited chart styles/internal titles. Dual-axis, scatter and bubble also retain fixed localized axis captions; these three profiles are explicitly specialized for weather, fuel consumption and sales. The dual-axis first series is the line on the left axis, the second is columns on the right. Optional headings are separate native text items. See the [chart workflow](../plugins/numbers-native/docs/CHARTS.md) in the source repository, or `CHARTS.md` when this file is packaged in the standalone plugin.
