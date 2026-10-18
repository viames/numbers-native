import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { NumbersBridge } from '../plugins/numbers-native/src/bridge.mjs';
import { NumbersTools } from '../plugins/numbers-native/src/tools.mjs';

// Own fixtures only. Optional PDF verification needs Poppler on the test Mac.
const directory = mkdtempSync(join(tmpdir(), 'numbers-native-charts-'));
const service = new NumbersTools(new NumbersBridge(), { roots: [directory] });
const call = (action, args = {}) => service.execute('numbers_' + action, args);
const profiles = (await call('chart_profiles')).profiles.filter(p => !process.env.NUMBERS_TEST_PROFILES || process.env.NUMBERS_TEST_PROFILES.split(',').includes(p.id));
const cases = { column: [8, 4], bar: [7, 1], pie: [3, 1], donut: [7, 1], radar: [7, 4], interactive_column: [6, 5], stacked_column: [5, 4], area: [4, 2], dual_axis: [14, 2], scatter: [12, 1], bubble: [11, 2] };
const results = [];
for (const p of profiles) {
  let id;
  const [points, series] = cases[p.id];
  const headers = ['Category', ...Array.from({ length: series }, (_, i) => `Series${i + 1}`)];
  if (p.orientation === 'xy') headers.splice(0, 2, 'XValue', 'YValue');
  if (p.orientation === 'xyz') headers.splice(0, 3, 'XValue', 'YValue', 'SizeValue');
  const numeric = ['xy', 'xyz'].includes(p.orientation);
  const data = Array.from({ length: points }, (_, y) => [numeric ? y + 1 : `Point${y + 1}`, ...Array.from({ length: series }, (_, x) => (y + 1) * (x + 2) + 1)]);
  try {
    const path = join(directory, p.id + '.numbers');
    const created = await call('chart_create', { path, profile: p.id, headers, data, title: `Native ${p.label}` });
    id = created.document_id;
    assert.equal(created.sheets.length, 1); assert.equal(created.sheets[0].objects.charts, 1);
    const input = [headers, ...data];
    const matrix = p.orientation === 'rows' ? input[0].map((_, x) => input.map(row => row[x])) : input;
    assert.deepEqual(created.source_values, matrix.flat());
    const target = { document_id: id, sheet: 1, table: 1 };
    const before = await call('read', { ...target, range: created.chart.source.range });
    assert.deepEqual(before.cells.map(row => row.map(c => c.value)), matrix);
    const categoryCell = p.orientation === 'rows' ? 'B1' : 'A2';
    if (!numeric) await call('write', { ...target, start: categoryCell, values: [['Updated']] });
    await call('write', { ...target, start: 'B2', values: [[987]] });
    await call('save', { document_id: id }); await call('close', { document_id: id }); id = null;
    id = (await call('open', { path })).document_id;
    const objects = await call('objects', { document_id: id, sheet: 1 });
    assert.equal(objects.objects.filter(o => o.kind === 'chart').length, 1);
    assert.equal((await call('read', { document_id: id, sheet: 1, table: 1, range: 'B2' })).cells[0][0].value, 987);
    let pdf_verified = false;
    if (process.env.NUMBERS_TEST_PDF === '1') {
      const pdf = join(directory, p.id + '.pdf');
      await call('export', { document_id: id, path: pdf, format: 'pdf' });
      const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
      writeFileSync(join(directory, p.id + '.txt'), text);
      // Labels must occur in BOTH the source table and chart, proving real binding.
      if (!numeric) assert.ok(text.split('Updated').length - 1 >= 2, `${p.id}: category did not reach chart`);
      // The area profile intentionally has no legend in Apple's template.
      if (['column', 'radar', 'stacked_column'].includes(p.id)) assert.ok(text.split(headers[series]).length - 1 >= 2, `${p.id}: series did not reach chart`);
      pdf_verified = true;
    }
    results.push({ profile: p.id, points, numeric_columns: series, native_readback: true, update_and_reopen: true, pdf_verified });
    writeFileSync(join(directory, 'verification.json'), JSON.stringify({ passed: results.length === profiles.length, directory, results }, null, 2));
    console.log(JSON.stringify(results.at(-1)));
  } finally { if (id) await call('close', { document_id: id }); }
}
const evidence = { passed: true, directory, results };
writeFileSync(join(directory, 'verification.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
