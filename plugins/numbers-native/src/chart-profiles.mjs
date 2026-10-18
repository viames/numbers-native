// Verified built-in Numbers templates, never a file-format writer or UI driver.
const basics = 'Application/21_Simple_Charts/Traditional';
const profile = (id, label, template_id, sheet, chart, rows, columns, orientation, min_series, max_series, chart_count = 1, header_columns = 1) => ({
  id, label, template_id, sheet, chart, rows, columns, orientation, min_series, max_series,
  chart_count, header_columns, max_points: 100, verified_numbers: '14.5'
});
export const chartProfiles = [
  profile('column', 'Column', 'Application/21_Table_and_Chart/Traditional', 1, 1, 6, 5, 'columns', 1, 10),
  profile('bar', 'Horizontal bar', basics, 1, 2, 6, 2, 'columns', 1, 1, 2),
  profile('pie', 'Pie', basics, 2, 1, 6, 2, 'columns', 1, 1, 2),
  profile('donut', 'Donut', basics, 2, 2, 6, 2, 'columns', 1, 1, 2),
  profile('radar', 'Radar', basics, 3, 1, 6, 4, 'columns', 1, 10),
  profile('interactive_column', 'Interactive column (one numeric column per frame)', basics, 4, 1, 5, 5, 'columns', 1, 10),
  profile('stacked_column', 'Stacked column', basics, 5, 2, 4, 4, 'rows', 1, 10, 3),
  profile('area', 'Area', basics, 5, 3, 4, 4, 'rows', 1, 10, 3),
  profile('dual_axis', 'Weather dual axis: precipitation line / temperature columns (fixed axes)', basics, 6, 1, 13, 3, 'columns', 2, 2),
  profile('scatter', 'Fuel consumption scatter: speed / liters per 100 km (fixed axes)', basics, 7, 1, 11, 2, 'xy', 1, 1, 1, 0),
  profile('bubble', 'Sales bubble: sellers / units / total sales (fixed axes)', basics, 8, 1, 10, 3, 'xyz', 2, 2, 1, 0)
];

const fixedAxes = {
  dual_axis: { left: 'Precipitation (mm), first numeric series, line', right: 'Temperature (degrees C), second numeric series, columns' },
  scatter: { x: 'Average speed', y: 'Liters per 100 km' },
  bubble: { x: 'Sellers', y: 'Units sold', size: 'Total sales' }
};
for (const p of chartProfiles) if (fixedAxes[p.id]) {
  p.fixed_axes = fixedAxes[p.id];
  p.scope = 'Specialized template with fixed localized axis captions; use data with these meanings.';
}
