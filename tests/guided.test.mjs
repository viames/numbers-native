import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BindingStore } from '../plugins/numbers-native/src/bindings.mjs';
import { copyNativePrototype } from '../plugins/numbers-native/src/native-files.mjs';
import { planChartUpdate } from '../plugins/numbers-native/src/guided.mjs';
const binding = { orientation: 'columns', profile: 'column' };
function context(matrix) { return { source: { cells: matrix.map((row, y) => row.map((v, x) => ({ address: String.fromCharCode(65 + x) + (y + 1), value: v, formula: null }))) } }; }
test('guided series targets numeric header even if category header has the same name', () => {
  const c = context([['Value', 'Value', 'Budget'], ['One', 1, 2], ['Two', 3, 4]]);
  const plan = planChartUpdate(binding, c, { mode: 'series', series: 'Value', values: [10, 20] });
  assert.deepEqual(plan.writes, [{ start: 'B2', values: [[10], [20]] }]);
  assert.equal(plan.change_count, 2);
});
test('row-series append transposes and expands inside the known source shape', () => {
  const c = context([['Category', 'One', 'Two'], ['Actual', 1, 2], ['Target', 3, 4]]);
  const plan = planChartUpdate({ orientation: 'rows', profile: 'area' }, c, { mode: 'append', data: [['Three', 5, 6]] });
  assert.deepEqual(plan.matrix, [['Category', 'One', 'Two', 'Three'], ['Actual', 1, 2, 5], ['Target', 3, 4, 6]]);
  assert.equal(plan.next_range, 'A1:D3');
});
test('guided growth rejects ambiguous leading-edge expansion and formula relocation', () => {
  assert.throws(() => planChartUpdate(binding, context([['C', 'A'], ['One', 1]]), { mode: 'append', data: [['Two', 2]] }), e => e.code === 'CHART_REFERENCE_EXPANSION');
  const c = context([['C', 'A'], ['One', 1], ['Two', 2]]); c.source.cells[1][1].formula = '=1';
  assert.throws(() => planChartUpdate(binding, c, { mode: 'append', data: [['Three', 3]] }), e => e.code === 'CHART_FORMULA_RESIZE');
});
test('companion metadata rejects foreign paths, symlinks and concurrent changes', () => {
  const base = mkdtempSync(join(tmpdir(), 'numbers-meta-test-'));
  const path = join(base, 'doc.numbers'); writeFileSync(path, 'opaque');
  const store = new BindingStore([base]); const state = store.load(path); store.save(state);
  const second = store.load(path); const raw = readFileSync(state.path, 'utf8');
  writeFileSync(state.path, raw + ' ');
  assert.throws(() => store.save(second), e => e.code === 'METADATA_CONFLICT');
  const other = join(base, 'other.numbers'); writeFileSync(other, 'opaque');
  writeFileSync(other + '.numbers-native.json', raw);
  assert.throws(() => store.load(other), e => e.code === 'METADATA_DOCUMENT_MISMATCH');
  const linked = join(base, 'linked.numbers'); writeFileSync(linked, 'opaque');
  symlinkSync(base, linked + '.numbers-native.json', 'junction');
  assert.throws(() => store.load(linked), e => e.code === 'METADATA_SYMLINK');
});
test('opaque prototype copy preserves files/packages without overwriting or symlinks', () => {
  const base = mkdtempSync(join(tmpdir(), 'numbers-prototype-test-'));
  const from = join(base, 'original.numbers'); mkdirSync(from); writeFileSync(join(from, 'data'), 'unchanged bytes');
  const to = join(base, 'copy.numbers'); copyNativePrototype(from, to);
  assert.equal(readFileSync(join(to, 'data'), 'utf8'), 'unchanged bytes');
  assert.throws(() => copyNativePrototype(from, to));
  symlinkSync(from, join(from, 'external'), 'junction');
  assert.throws(() => copyNativePrototype(from, join(base, 'unsafe.numbers')), e => e.code === 'UNSUPPORTED_TEMPLATE_ENTRY');
});
test('oversized companion is rejected before creating an unreadable file', () => {
  const base = mkdtempSync(join(tmpdir(), 'numbers-meta-size-'));
  const path = join(base, 'doc.numbers'); writeFileSync(path, 'opaque');
  const store = new BindingStore([base]), state = store.load(path);
  const named = { index: 1, name: 'Test' };
  state.manifest.bindings.push({ id: randomUUID(), label: 'Chart', orientation: 'columns', provenance: 'declared-source', source: { sheet: named, table: named, range: 'A1:B2' }, chart: { sheet: named, index: 1 }, guard: { size: 'x'.repeat(128 * 1024) } });
  assert.throws(() => store.save(state), e => e.code === 'CHART_METADATA_LIMIT');
  assert.equal(existsSync(state.path), false);
});
