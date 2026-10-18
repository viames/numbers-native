import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NumbersTools, tools } from '../plugins/numbers-native/src/tools.mjs';
import { canonicalPath, parseRange } from '../plugins/numbers-native/src/paths.mjs';

const table = { document_id: 'test-id', sheet: 1, table: 1 };
function fixture() {
  const calls = [];
  const bridge = { async call(action, args) { calls.push({ action, args }); return { ok: true }; } };
  return { calls, service: new NumbersTools(bridge, { roots: [] }) };
}
test('rejects invalid matrices and overlarge writes before calling Numbers', async () => {
  const { calls, service } = fixture();
  await assert.rejects(service.execute('numbers_write', { ...table, start: 'A1', values: [[1], [1, 2]] }), e => e.code === 'RAGGED_MATRIX');
  await assert.rejects(service.execute('numbers_write', { ...table, start: 'A1', values: Array.from({ length: 3 }, () => Array(1000).fill(1)) }), e => e.code === 'CELL_LIMIT');
  await assert.rejects(service.execute('numbers_write', { ...table, start: 'ALL1', values: [[1, 2, 3]] }), e => e.code === 'INVALID_RANGE');
  assert.equal(calls.length, 0);
});
test('requires explicit formula objects and preserves hostile text as inert data', async () => {
  const { calls, service } = fixture();
  const literal = '"; do shell script "touch /tmp/no"; $(echo nope) `literal`\n日本語';
  await service.execute('numbers_write', { ...table, start: 'B2', values: [[literal, '=1+1', { formula: '=SUM(B3:B4)' }, null]] });
  assert.equal(calls[0].args.values[0][0], literal);
  assert.equal(calls[0].args.values[0][1], '=1+1');
  assert.equal(calls[0].args.range, 'B2:E2');
  await assert.rejects(service.execute('numbers_write', { ...table, start: 'A1', values: [[{ formula: '1+1' }]] }));
});
test('rejects unknown arguments, NaN and invalid ranges without native side effects', async () => {
  const { calls, service } = fixture();
  await assert.rejects(service.execute('numbers_save', { document_id: 'x', script: 'evil' }));
  await assert.rejects(service.execute('numbers_write', { ...table, start: 'A1', values: [[NaN]] }));
  await assert.rejects(service.execute('numbers_read', { ...table, range: 'B2:A1' }), e => e.code === 'INVALID_RANGE');
  await assert.rejects(service.execute('numbers_read', { ...table, range: 'A1:A2001' }), e => e.code === 'CELL_LIMIT');
  assert.equal(calls.length, 0);
});
test('canonical path policy rejects symlink escapes, overwrite and relative paths', () => {
  const base = mkdtempSync(join(tmpdir(), 'numbers-path-test-'));
  const allowed = join(base, 'allowed'), outside = join(base, 'outside');
  mkdirSync(allowed); mkdirSync(outside); writeFileSync(join(outside, 'private.numbers'), 'test');
  symlinkSync(outside, join(allowed, 'escape'), 'junction');
  assert.throws(() => canonicalPath(join(allowed, 'escape', 'private.numbers'), { roots: [allowed] }), e => e.code === 'PATH_NOT_ALLOWED');
  assert.throws(() => canonicalPath(join(outside, 'private.numbers'), { mustBeNew: true }), e => e.code === 'DESTINATION_EXISTS');
  assert.throws(() => canonicalPath('./private.numbers'), e => e.code === 'INVALID_PATH');
  assert.equal(canonicalPath(join(allowed, 'new.numbers'), { roots: [allowed], mustBeNew: true }), join(realpathSync(allowed), 'new.numbers'));
});
test('restricted roots apply to document IDs before edits', async () => {
  const base = mkdtempSync(join(tmpdir(), 'numbers-doc-policy-'));
  const privateFile = join(tmpdir(), `numbers-outside-${Date.now()}.numbers`);
  writeFileSync(privateFile, 'test');
  const calls = [];
  const service = new NumbersTools({ async call(action) { calls.push(action); return { path: privateFile }; } }, { roots: [base] });
  await assert.rejects(service.execute('numbers_write', { ...table, start: 'A1', values: [[1]] }), e => e.code === 'PATH_NOT_ALLOWED');
  assert.deepEqual(calls, ['document_info']);
});
test('A1 boundary parser handles multi-letter columns and reversed limits', () => {
  assert.equal(parseRange('AA10:AB11').count, 4);
  assert.equal(parseRange('ALL1').column, 1000);
  assert.throws(() => parseRange('ALM1'), e => e.code === 'INVALID_RANGE');
});
test('read-only annotations are truthful and all tools have schemas', () => {
  assert.ok(tools.length >= 20);
  const names = tools.filter(x => x.annotations.readOnlyHint).map(x => x.name);
  assert.ok(!names.includes('numbers_selection'));
  assert.ok(!names.includes('numbers_write'));
  assert.ok(names.includes('numbers_read'));
  assert.ok(tools.every(x => x.schema));
});
test('object style rejects unsupported targets and invalid colors before calling Numbers', async () => {
  const { calls, service } = fixture();
  const target = { document_id: 'test-id', sheet: 1, action: 'update', object: 1 };
  await assert.rejects(service.execute('numbers_object', { ...target, kind: 'chart', font_size: 20 }), e => e.code === 'UNSUPPORTED');
  await assert.rejects(service.execute('numbers_object', { ...target, kind: 'group', opacity: 50 }), e => e.code === 'UNSUPPORTED');
  await assert.rejects(service.execute('numbers_object', { ...target, kind: 'text', text_color: [-1, 0, 0] }));
  assert.equal(calls.length, 0);
});
test('chart profiles are discoverable without launching Numbers', async () => {
  const { calls, service } = fixture();
  const result = await service.execute('numbers_chart_profiles', {});
  assert.equal(result.profiles.length, 11);
  assert.equal(result.limits.accessibility, false);
  assert.equal(calls.length, 0);
});
test('diagnostics preserve local runtime details when native prerequisites are missing', async () => {
  const service = new NumbersTools({ async call() { const e = new Error('Numbers missing'); e.code = 'NUMBERS_NOT_INSTALLED'; throw e; } }, { roots: [] });
  const r = await service.execute('numbers_diagnostics', {});
  assert.equal(r.node_version, process.versions.node); assert.equal(r.native.available, false); assert.equal(r.native.error.code, 'NUMBERS_NOT_INSTALLED');
  assert.ok(r.chart_profiles.every(p => p.template_installed === null && !p.version_verified));
});
test('chart validation rejects malformed or misleading data before creating documents', async () => {
  const { calls, service } = fixture();
  const base = { path: '/tmp/native-chart-test.numbers', profile: 'column', headers: ['Category', 'Value'], data: [['One', 1]] };
  await assert.rejects(service.execute('numbers_chart_create', { ...base, data: [['One', 1, 2]] }), e => e.code === 'RAGGED_MATRIX');
  await assert.rejects(service.execute('numbers_chart_create', { ...base, headers: Array(11).fill('Label'), data: Array.from({ length: 50 }, () => ['One', ...Array(10).fill(1)]) }), e => e.code === 'CHART_CELL_LIMIT');
  await assert.rejects(service.execute('numbers_chart_create', { ...base, data: [['One', '=1+1']] }), e => e.code === 'CHART_NUMERIC_DATA');
  await assert.rejects(service.execute('numbers_chart_create', { ...base, profile: 'scatter' }), e => e.code === 'CHART_NUMERIC_DATA');
  await assert.rejects(service.execute('numbers_chart_create', { ...base, profile: 'dual_axis' }), e => e.code === 'CHART_SERIES_LIMIT');
  await assert.rejects(service.execute('numbers_chart_create', { ...base, profile: 'pie', data: [['One', -1]] }), e => e.code === 'CHART_VALUES');
  await assert.rejects(service.execute('numbers_chart_create', { ...base, profile: 'donut', data: [['One', 0]] }), e => e.code === 'CHART_VALUES');
  await assert.rejects(service.execute('numbers_chart_create', { ...base, profile: 'bubble', headers: ['X', 'Y', 'Size'], data: [[1, 2, 0]] }), e => e.code === 'CHART_VALUES');
  await assert.rejects(service.execute('numbers_chart_create', { ...base, _chart_profile: {} }));
  assert.equal(calls.length, 0);
});
test('chart destination cannot overwrite and row-oriented profile is explicit', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'numbers-chart-policy-'));
  const path = join(directory, 'chart.numbers'); writeFileSync(path, 'existing');
  const { calls, service } = fixture();
  const args = { path, profile: 'area', headers: ['Category', 'Value'], data: [['001', 2]] };
  await assert.rejects(service.execute('numbers_chart_create', args), e => e.code === 'DESTINATION_EXISTS');
  await service.execute('numbers_chart_create', { ...args, path: join(directory, 'new.numbers'), managed: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args._chart_profile.orientation, 'rows');
  assert.equal(calls[0].args.data[0][0], '001');
});
