import { NativeError } from './bridge.mjs';
import { parseRange, columnName } from './paths.mjs';
import { digest } from './bindings.mjs';

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const empty = v => v === null || v === '';
const error = (code, message, details) => { throw new NativeError(code, message, details); };
export function resolveTable(doc, target) {
  function pick(items, ref, name) {
    const matches = items.filter(x => typeof ref === 'number' ? x.index === ref : x.name === ref);
    if (matches.length !== 1) error('WORKFLOW_TARGET', `Expected one ${name}; inspect and choose a current 1-based index.`);
    return matches[0];
  }
  const sheet = pick(doc.sheets, target.sheet, 'sheet');
  const table = pick(sheet.tables, target.table, 'table');
  return { sheet: sheet.index, table: table.index, info: table, sheet_name: sheet.name };
}
function topology(doc) {
  return { path: doc.path, document_id: doc.document_id, sheets: doc.sheets.map(s => ({ index: s.index, name: s.name, tables: s.tables.map(t => ({ index: t.index, name: t.name, rows: t.rows, columns: t.columns, header_rows: t.header_rows, header_columns: t.header_columns, footer_rows: t.footer_rows, filtered: t.filtered, locked: t.locked })) })) };
}
export function ruleTargets(rules) { return rules.flatMap(r => r.kind === 'balance' ? r.terms.map(t => t.source) : [r.source]); }
export async function capture(session, id, targets, inspected) {
  const doc = inspected ?? await session.call('inspect', { document_id: id });
  const ranges = []; let count = 0;
  for (const target of targets) {
    const resolved = resolveTable(doc, target), b = parseRange(target.range);
    if (b.count > 2000 || b.endRow > resolved.info.rows || b.endColumn > resolved.info.columns) error('WORKFLOW_RANGE', 'Each range must fit its existing table and contain at most 2,000 cells.');
    const args = { document_id: id, sheet: resolved.sheet, table: resolved.table, range: target.range };
    if (ranges.some(r => r.sheet === args.sheet && r.table === args.table && r.range === args.range)) continue;
    count += b.count;
    if (count > 5000) error('WORKFLOW_CELL_LIMIT', 'A workflow may inspect at most 5,000 cells including check ranges. Split the request.');
    const read = await session.call('read', args);
    ranges.push({ sheet: args.sheet, table: args.table, range: args.range, cells: read.cells });
  }
  if (!same(topology(doc), topology(await session.call('inspect', { document_id: id })))) error('WORKFLOW_REVISION_CHANGED', 'Document structure changed during inspection. Preview again.');
  return { structure: topology(doc), ranges };
}
export function capturedCells(snapshot, target) {
  const resolved = resolveTable(snapshot.structure, target), b = parseRange(target.range);
  const cells = new Map();
  for (const r of snapshot.ranges.filter(r => r.sheet === resolved.sheet && r.table === resolved.table)) for (const c of r.cells.flat()) cells.set(c.address, c);
  const result = [];
  for (let y = b.row; y <= b.endRow; y++) {
    const row = [];
    for (let x = b.column; x <= b.endColumn; x++) {
      const c = cells.get(`${columnName(x)}${y}`);
      if (!c) error('WORKFLOW_SNAPSHOT', 'Required cells were not captured.');
      row.push(c);
    }
    result.push(row);
  }
  return result;
}
export function evaluate(snapshot, rules = []) {
  const violations = [], suspected = [], seen = new Set(); let formulaCount = 0;
  for (const r of snapshot.ranges) for (const c of r.cells.flat()) {
    const key = `${r.sheet}/${r.table}/${c.address}`; if (seen.has(key)) continue; seen.add(key);
    if (c.formula) {
      formulaCount++;
      if (c.value === null || typeof c.formatted === 'string' && /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|SPILL!|ERROR!)/i.test(c.formatted)) suspected.push({ sheet: r.sheet, table: r.table, address: c.address, formula: c.formula, formatted: c.formatted, reason: c.value === null ? 'formula_result_missing' : 'formula_error_text' });
    }
  }
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i], fail = details => violations.push({ rule: i + 1, kind: r.kind, ...details });
    if (r.kind === 'balance') {
      const terms = r.terms.map(t => ({ ...t, value: capturedCells(snapshot, t.source)[0][0].value }));
      if (terms.some(t => typeof t.value !== 'number' || !Number.isFinite(t.value))) fail({ reason: 'non_numeric_term' });
      else {
        const actual = terms.reduce((sum, t) => sum + t.value * (t.coefficient ?? 1), 0);
        if (!Number.isFinite(actual) || Math.abs(actual - r.expected) > (r.tolerance ?? 1e-8)) fail({ actual, expected: r.expected });
      }
      continue;
    }
    const cells = capturedCells(snapshot, r.source).flat();
    if (r.kind === 'unique') {
      const values = new Map();
      for (const c of cells) {
        if (empty(c.value)) { fail({ source: r.source, address: c.address, reason: 'empty_key' }); continue; }
        const key = JSON.stringify(c.value);
        if (values.has(key)) fail({ source: r.source, address: c.address, duplicate_of: values.get(key) });
        else values.set(key, c.address);
      }
    } else for (const c of cells) {
      if (r.kind === 'required' && empty(c.value)) fail({ source: r.source, address: c.address, reason: 'empty' });
      if (r.kind === 'formula' && !c.formula) fail({ source: r.source, address: c.address, reason: 'formula_missing' });
      if (r.kind === 'numeric_bounds' && (typeof c.value !== 'number' || !Number.isFinite(c.value) || r.min !== undefined && c.value < r.min || r.max !== undefined && c.value > r.max)) fail({ source: r.source, address: c.address, value: c.value, reason: 'outside_numeric_bounds' });
      if (r.kind === 'equals' && !(typeof c.value === 'number' && typeof r.value === 'number' ? Math.abs(c.value - r.value) <= (r.tolerance ?? 1e-8) : same(c.value, r.value))) fail({ source: r.source, address: c.address, actual: c.value, expected: r.value });
    }
  }
  return { passed: violations.length === 0 && suspected.length === 0, rules_checked: rules.length, cells_checked: seen.size, formulas_checked: formulaCount, violation_count: violations.length, violations: violations.slice(0, 100), suspected_formula_errors: suspected.slice(0, 100), suspected_formula_error_count: suspected.length, truncated: violations.length > 100 || suspected.length > 100, note: 'Checks use native Numbers values. Missing formula results are suspected errors, not a dependency audit or proof of invalid syntax.' };
}
export function editTargets(edits) {
  let total = 0;
  return edits.map(e => {
    const b = parseRange(e.start), width = e.values[0].length;
    if (e.values.some(r => r.length !== width)) error('RAGGED_MATRIX', 'Every edit matrix must be rectangular.');
    const range = `${e.start}:${columnName(b.column + width - 1)}${b.row + e.values.length - 1}`;
    const size = parseRange(range).count; total += size;
    if (size > 2000 || total > 2000) error('WORKFLOW_WRITE_LIMIT', 'Use at most 2,000 written cells across all edits.');
    // Aliased names/indexes are resolved and checked again before mutation.
    return { ...e, range };
  });
}
export function plannedChanges(snapshot, writes) {
  const changes = [], occupied = new Set();
  for (const write of writes) {
    const t = resolveTable(snapshot.structure, write), old = capturedCells(snapshot, write);
    if (t.info.locked) error('TABLE_LOCKED', 'Unlock the target table deliberately before guided editing.');
    for (let y = 0; y < write.values.length; y++) for (let x = 0; x < write.values[0].length; x++) {
      const c = old[y][x], v = write.values[y][x], key = `${t.sheet}/${t.table}/${c.address}`;
      if (occupied.has(key)) error('OVERLAPPING_EDITS', 'Edits may not overlap, including targets aliased by names and indexes.');
      occupied.add(key);
      if (c.formula || !same(c.value, v)) changes.push({ sheet: t.sheet, table: t.table, address: c.address, before: c.value, before_formula: c.formula, after: v, replaces_formula: !!c.formula });
    }
  }
  return changes;
}
export function targetGuard(t) { return { sheet_name: t.sheet_name, name: t.info.name, rows: t.info.rows, columns: t.info.columns, header_rows: t.info.header_rows, header_columns: t.info.header_columns, footer_rows: t.info.footer_rows, filtered: t.info.filtered, locked: t.info.locked }; }
function writeMatches(c, v) {
  if (v && typeof v === 'object' && v.formula) return !!c.formula;
  if (v && typeof v === 'object' && v.date) return c.value?.date === new Date(v.date).toISOString();
  return same(c.value, v);
}
export function verifyFinalWrites(snapshot, writes) {
  for (const w of writes) {
    const cells = capturedCells(snapshot, w);
    for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) if (!writeMatches(cells[y][x], w.values[y][x])) error('WORKFLOW_READBACK', 'Final native values changed after an earlier write. Inspect the completed workflow.', { sheet: w.sheet, table: w.table, address: cells[y][x].address });
  }
}
export async function applyWrites(session, id, writes, snapshot) {
  let completed = 0, cells = 0;
  try {
    for (const w of writes) {
      const t = resolveTable(snapshot.structure, w), expected = capturedCells(snapshot, w);
      const result = await session.call('write', { document_id: id, sheet: t.sheet, table: t.table, start: w.start, range: w.range, values: w.values, preserve_format: true, _expected_target: targetGuard(t), _expected_cells: expected.map(row => row.map(c => ({ value: c.value, formula: c.formula }))), _expected_formats: expected.flat().map(c => c.format) });
      completed++; cells += result.written ?? w.values.flat().length;
      if (result.cells.some((row, y) => row.some((c, x) => !writeMatches(c, w.values[y][x])))) error('WORKFLOW_READBACK', 'Native readback did not match the requested values.');
    }
    return { completed_writes: completed, written_cells: cells };
  } catch (e) {
    e.details = { ...e.details, completed_writes: completed, cells_in_completed_writes: cells, document_id: id, partial_application_possible: true, instruction: 'Inspect affected ranges. Do not automatically retry or assume rollback.' };
    throw e;
  }
}
export async function runEdit(session, args) {
  const writes = editTargets(args.edits), targets = [...writes, ...ruleTargets(args.checks)];
  const snapshot = await capture(session, args.document_id, targets);
  const changes = plannedChanges(snapshot, writes);
  const request = { edits: args.edits, checks: args.checks, save: args.save };
  const revision = digest({ snapshot, request });
  const summary = { revision, change_count: changes.length, changes: changes.slice(0, 100), changes_truncated: changes.length > 100, formula_overwrites: changes.filter(c => c.replaces_formula).length, checks_before: evaluate(snapshot, args.checks), scope: 'Only inspected ranges and table topology are guarded; not a document transaction.' };
  if (args.preview) return { ...summary, preview: true, applied: false, note: 'Apply this identical request with expected_revision. New formulas are evaluated only after native assignment.' };
  if (args.expected_revision !== revision) error('WORKFLOW_REVISION_CHANGED', 'A matching preview of the identical request and unchanged inspected data is required.');
  // Recheck all ranges immediately before the first mutation, then each write at the native boundary.
  if (!same(snapshot, await capture(session, args.document_id, targets))) error('WORKFLOW_REVISION_CHANGED', 'Inspected data changed before application. Preview again.');
  const progress = await applyWrites(session, args.document_id, writes, snapshot);
  try {
    const after = await capture(session, args.document_id, targets);
    verifyFinalWrites(after, writes);
    const validation = evaluate(after, args.checks);
    if (args.save) await session.call('save', { document_id: args.document_id });
    return { ...summary, ...progress, preview: false, applied: true, saved: args.save, checks_after: validation, validation_passed: validation.passed, autosave_possible: true, note: 'Failed post-checks do not roll back edits. Inspect the result before further changes.' };
  } catch (e) { e.details = { ...e.details, ...progress, applied: true, document_id: args.document_id, phase: 'post-check or save', partial_application_possible: true }; throw e; }
}
export async function runCheck(session, args) {
  const targets = [...args.ranges, ...ruleTargets(args.checks)];
  if (!targets.length) error('CHECK_TARGET_REQUIRED', 'Provide at least one range or check.');
  return { document_id: args.document_id, ...evaluate(await capture(session, args.document_id, targets), args.checks), read_only: true };
}
