import { BindingStore, digest } from './bindings.mjs';
import { NativeError } from './bridge.mjs';
import { columnName, parseRange } from './paths.mjs';
import { chartProfiles } from './chart-profiles.mjs';

const transpose = matrix => matrix[0].map((_, x) => matrix.map(row => row[x]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function pick(items, reference, label) {
  const found = typeof reference === 'number' ? items.filter(x => x.index === reference) : items.filter(x => x.name === reference);
  if (found.length !== 1) throw new NativeError('AMBIGUOUS_TARGET', `Expected one ${label}. Inspect and use its 1-based index.`);
  return found[0];
}
function sourceArgs(id, b) { return { document_id: id, sheet: b.source.sheet.index, table: b.source.table.index, range: b.source.range }; }

export async function registerChart(session, store, args, { profile, provenance = 'declared-source' } = {}) {
  const doc = await session.call('inspect', { document_id: args.document_id });
  if (!doc.path) throw new NativeError('UNSAVED_DOCUMENT', 'Save the native document before registering a chart source.');
  const state = store.load(doc.path);
  const s = pick(doc.sheets, args.sheet, 'source sheet'), t = pick(s.tables, args.table, 'source table');
  const cs = pick(doc.sheets, args.chart_sheet ?? args.sheet, 'chart sheet');
  const range = args.range ?? `A1:${columnName(t.columns)}${t.rows}`;
  parseRange(range);
  const binding = { label: args.label, orientation: profile?.orientation ?? args.orientation, provenance,
    ...(profile ? { profile: profile.id } : {}),
    source: { sheet: { index: s.index, name: s.name }, table: { index: t.index, name: t.name }, range },
    chart: { sheet: { index: cs.index, name: cs.name }, index: args.chart }, guard: {} };
  const context = await session.call('chart_context', { document_id: doc.document_id, binding });
  const cells = binding.orientation === 'rows' ? transpose(context.source.cells) : context.source.cells;
  const matrix = cells.map(row => row.map(c => c.value));
  if (matrix[0][0] === null) matrix[0][0] = '';
  validateMatrix(binding, matrix);
  binding.guard = context.guard;
  const saved = store.add(state, binding, args.replace_binding);
  return { binding: saved, companion_path: state.path, references_introspected: false, notice: 'Registration records a known source; it does not create or inspect chart-series references. Verify declared bindings with a native PDF or in Numbers.' };
}

function validateMatrix(binding, matrix) {
  const p = chartProfiles.find(p => p.id === binding.profile);
  const width = matrix[0].length, points = matrix.length - 1, series = width - 1;
  if (width < 2 || width > 11 || points < 1 || points > 100 || matrix.some(row => row.length !== width)) throw new NativeError('CHART_DATA_SHAPE', 'Use 1..100 points with 2..11 columns and matching headers.');
  if (width * matrix.length > 500) throw new NativeError('CHART_CELL_LIMIT', 'Guided chart sources support 500 cells including headers.');
  if (p && (series < p.min_series || series > p.max_series)) throw new NativeError('CHART_SERIES_LIMIT', 'Numeric column count exceeds the registered profile.');
  if (binding.orientation === 'xy' && series !== 1 || binding.orientation === 'xyz' && series !== 2) throw new NativeError('CHART_SERIES_LIMIT', 'Scatter needs X,Y; bubble needs X,Y,size.');
  if (matrix[0].some(h => typeof h !== 'string')) throw new NativeError('CHART_HEADERS', 'Headers must be text.');
  const numericFirst = ['xy', 'xyz'].includes(binding.orientation);
  if (matrix.slice(1).some(row => row.some((v, i) => (i > 0 || numericFirst) ? typeof v !== 'number' || !Number.isFinite(v) : typeof v !== 'string' && (typeof v !== 'number' || !Number.isFinite(v))))) throw new NativeError('CHART_NUMERIC_DATA', 'Numeric series/X/Y/size need finite numbers; categories may be literal text or finite numbers.');
  if (p && ['pie', 'donut'].includes(p.id) && (matrix.slice(1).some(row => row[1] < 0) || !matrix.slice(1).some(row => row[1] > 0))) throw new NativeError('CHART_VALUES', 'Pie/donut values must be nonnegative with a positive total.');
  if (binding.orientation === 'xyz' && matrix.slice(1).some(row => row[2] <= 0)) throw new NativeError('CHART_VALUES', 'Bubble size must be positive.');
}

export function planChartUpdate(binding, context, args) {
  const source = context.source.cells;
  const standard = binding.orientation === 'rows' ? transpose(source) : source;
  const current = standard.map(row => row.map(c => c.value));
  // An empty category-corner header is valid in custom prototypes.
  if (current[0][0] === null) current[0][0] = '';
  let desired;
  const formulas = source.flat().filter(c => c.formula);
  let seriesIndex;
  if (args.mode === 'replace') {
    if (!args.headers || !args.data || args.series !== undefined || args.values !== undefined) throw new NativeError('CHART_UPDATE_ARGUMENTS', 'replace needs headers and data only.');
    desired = [args.headers, ...args.data];
  } else if (args.mode === 'append') {
    if (!args.data || args.headers !== undefined || args.series !== undefined || args.values !== undefined) throw new NativeError('CHART_UPDATE_ARGUMENTS', 'append needs data only, in the existing header order.');
    if (formulas.length) throw new NativeError('CHART_FORMULA_RESIZE', 'Append does not relocate formula-bearing sources. Use an explicit replacement or native cell/axis tools with verification.');
    desired = [...current, ...args.data];
  } else {
    if (!args.series || !args.values || args.headers !== undefined || args.data !== undefined) throw new NativeError('CHART_UPDATE_ARGUMENTS', 'series needs a unique series header and values only.');
    const matches = current[0].map((h, i) => i > 0 && h === args.series ? i : -1).filter(i => i > 0);
    if (matches.length !== 1 || args.values.length !== current.length - 1) throw new NativeError('CHART_SERIES_TARGET', 'Choose one unique numeric-series header and provide one value per point.');
    seriesIndex = matches[0];
    desired = current.map(row => [...row]);
    args.values.forEach((v, i) => { desired[i + 1][matches[0]] = v; });
  }
  validateMatrix(binding, desired);
  if (desired.length > current.length && current.length < 3 || desired[0].length > current[0].length && current[0].length < 3) throw new NativeError('CHART_REFERENCE_EXPANSION', 'Growth needs at least two existing points/series so insertion can occur inside a known reference. Create a new chart document for this larger shape.');
  const matrix = binding.orientation === 'rows' ? transpose(desired) : desired;
  const writes = [];
  if (args.mode === 'series') {
    const n = seriesIndex;
    writes.push(binding.orientation === 'rows' ? { start: `B${n + 1}`, values: [args.values] } : { start: `${columnName(n + 1)}2`, values: args.values.map(v => [v]) });
  } else writes.push({ start: 'A1', values: matrix });
  const changes = [];
  for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix[0].length; x++) {
    const c = source[y]?.[x];
    const targeted = args.mode !== 'series' || (binding.orientation === 'rows' ? y === seriesIndex && x > 0 : x === seriesIndex && y > 0);
    if (targeted && (!c || !same(c.value, matrix[y][x]) || c.formula)) changes.push({ address: `${columnName(x + 1)}${y + 1}`, before: c?.value ?? null, after: matrix[y][x], replaces_formula: !!c?.formula });
  }
  const removed = source.flat().filter(c => { const r = parseRange(c.address); return r.row > matrix.length || r.column > matrix[0].length; });
  return { matrix, writes, rows: matrix.length, columns: matrix[0].length, next_range: `A1:${columnName(matrix[0].length)}${matrix.length}`, change_count: changes.length, changes: changes.slice(0, 100), removed_cells: removed.length, formula_overwrites: changes.filter(c => c.replaces_formula).length + removed.filter(c => c.formula).length };
}

export async function guidedUpdate(session, store, args) {
  const doc = await session.call('document_info', { document_id: args.document_id });
  if (!doc.path) throw new NativeError('UNSAVED_DOCUMENT', 'Save before using guided charts.');
  const state = store.load(doc.path);
  const matches = state.manifest.bindings.filter(b => b.id === args.binding || b.label === args.binding);
  if (matches.length !== 1) throw new NativeError('BINDING_NOT_FOUND', 'Choose a binding ID/label from numbers_chart_bindings, or register a known chart source.');
  const binding = matches[0];
  const context = await session.call('chart_context', { document_id: args.document_id, binding });
  if (!same(context.guard, binding.guard)) throw new NativeError('BINDING_STALE', 'Registered chart/table structure changed. Inspect and register the known source again.');
  const formats = await session.readFormats(sourceArgs(args.document_id, binding));
  const revision = digest({ context, formats, metadata_revision: state.manifest.revision, binding: binding.id, request: { mode: args.mode, headers: args.headers, data: args.data, series: args.series, values: args.values, visual_check: args.visual_check } });
  const plan = planChartUpdate(binding, context, args);
  const summary = { binding_id: binding.id, label: binding.label, mode: args.mode, revision, source_range: binding.source.range, target_range: plan.next_range, change_count: plan.change_count, changes: plan.changes, removed_cells: plan.removed_cells, formula_overwrites: plan.formula_overwrites, profile: binding.profile ?? null, references_introspected: false, ...(chartProfiles.find(p => p.id === binding.profile)?.fixed_axes ? { fixed_axes: chartProfiles.find(p => p.id === binding.profile).fixed_axes } : {}) };
  if (args.preview) return { ...summary, preview: true, applied: false, companion_path: state.path, note: 'Apply the SAME request with preview=false and this expected_revision. Preview is a consistency check, not a transaction.' };
  if (!args.expected_revision || args.expected_revision !== revision) throw new NativeError('CHART_REVISION_CHANGED', 'A matching preview revision is required. Preview this request again.');
  let phase = 'resize';
  let beforeImage;
  try {
    if (args._visual_paths) {
      phase = 'visual before'; beforeImage = await session.call('preview', { document_id: args.document_id, ...args._visual_paths.before, page: 1, max_dimension: 1200 });
    }
    phase = 'resize';
    await session.call('chart_prepare', { document_id: args.document_id, binding, expected: context, rows: plan.rows, columns: plan.columns });
    phase = 'write';
    for (const write of plan.writes) {
      const start = parseRange(write.start);
      const range = `${write.start}:${columnName(start.column + write.values[0].length - 1)}${start.row + write.values.length - 1}`;
      const read = await session.call('write', { ...sourceArgs(args.document_id, binding), ...write, range, preserve_format: true });
      if (!same(read.cells.map(row => row.map(c => c.value)), write.values)) throw new NativeError('CHART_READBACK_MISMATCH', 'Native source values differ from the requested matrix. Inspect before retrying.');
    }
    phase = 'save'; await session.call('save', { document_id: args.document_id });
    phase = 'metadata'; binding.source.range = plan.next_range;
    const after = await session.call('chart_context', { document_id: args.document_id, binding });
    binding.guard = after.guard; store.save(state);
    const result = { ...summary, preview: false, applied: true, saved: true, companion_path: state.path, source_range: plan.next_range, native_source: after.source, chart_visual_verification: 'Inspect native PDF/PNG output; source readback alone does not inspect private chart-series references.' };
    if (args._visual_paths) {
      phase = 'visual after';
      try {
        const afterImage = await session.call('preview', { document_id: args.document_id, ...args._visual_paths.after, page: 1, max_dimension: 1200 });
        result.visual_check = { before: beforeImage, after: afterImage, status: 'images_generated', inspected_automatically: false };
      } catch (e) {
        if (['NATIVE_TIMEOUT', 'APPLE_EVENT_TIMEOUT', 'STATE_UNCERTAIN', 'NATIVE_PROCESS_FAILED', 'NATIVE_OUTPUT_LIMIT', 'INVALID_NATIVE_RESPONSE'].includes(e.code)) { e.details = { ...e.details, applied: true, saved: true, phase, path: doc.path }; throw e; }
        // Data and companion are already saved. Do not encourage repeating the mutation.
        result.visual_check = { before: beforeImage, after: null, status: 'after_render_failed', error: { code: e.code, message: e.message }, instruction: 'Data update is saved; retry only the preview at a fresh path.' };
      }
    }
    return result;
  } catch (e) {
    if (['NATIVE_TIMEOUT', 'APPLE_EVENT_TIMEOUT', 'STATE_UNCERTAIN', 'NATIVE_PROCESS_FAILED', 'NATIVE_OUTPUT_LIMIT', 'INVALID_NATIVE_RESPONSE'].includes(e.code)) throw e;
    throw new NativeError('CHART_UPDATE_INCOMPLETE', `Guided update failed during ${phase}. Inspect the document before retrying.`, { document_id: args.document_id, path: doc.path, binding_id: binding.id, phase, cause: e.code, message: e.message });
  }
}
