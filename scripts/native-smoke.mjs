import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NumbersBridge } from '../plugins/numbers-native/src/bridge.mjs';
import { NumbersTools } from '../plugins/numbers-native/src/tools.mjs';

if (process.platform !== 'darwin') throw new Error('Native smoke requires a Mac with Numbers and Automation permission.');
const folder = mkdtempSync(join(tmpdir(), 'numbers-native-smoke-'));
const tools = new NumbersTools(new NumbersBridge(), { roots: [folder] });
const evidence = { date: new Date().toISOString(), folder, checks: [], failures: [] };
const run = async (name, args = {}) => tools.execute(`numbers_${name}`, args);
let id, reopenedId;
async function check(label, fn) {
  const started = Date.now();
  try { await fn(); evidence.checks.push({ label, passed: true, milliseconds: Date.now() - started }); console.log(`PASS ${label}`); }
  catch (e) { evidence.failures.push({ label, code: e.code, message: e.message, details: e.details }); console.log(`FAIL ${label}: ${e.message}`); }
}
try {
  await check('Automation and capability discovery', async () => { const s = await run('status', { launch: true }); evidence.numbers = s.numbers_version; assert.equal(s.automation_tested, true); });
  await check('List native templates', async () => assert.ok((await run('templates')).templates.length));
  const path = join(folder, 'Native Smoke.numbers');
  await check('Create and save a native document', async () => { const d = await run('create', { path }); id = d.document_id; assert.ok(id); assert.ok(existsSync(path)); });
  if (!id) throw new Error('Document creation failed; skipping dependent mutations.');
  const d = { document_id: id }, t = { ...d, sheet: 1, table: 1 };
  await check('Configure native table and freeze headers', async () => {
    await run('table', { ...d, sheet: 1, table: 1, action: 'configure', rows: 12, columns: 6, header_rows: 1, header_columns: 0, footer_rows: 0, freeze_header_rows: true });
    const x = (await run('inspect', d)).sheets[0].tables[0]; assert.equal(x.rows, 12); assert.equal(x.freeze_header_rows, true);
  });
  await check('Write typed cells, formulas, dates, Unicode and script-like literal strings', async () => {
    const x = await run('write', { ...t, start: 'A1', values: [
      ['Voce', 'Importo', 'Doppio', 'Testo', 'Data', 'Attivo'],
      ['Caffè ☕', 12.5, { formula: '=B2*2' }, '00123', { date: '2026-10-18T10:30:00Z' }, true],
      ['Straße "quote" \\ newline\nFine', 5, { formula: '=SUM(B2:B3)' }, '=1+1', null, false],
      ['$(touch /tmp/NOT-EXECUTED) `literal`', 2, { formula: '=B4*2' }, '日本語', null, true]
    ] });
    assert.equal(x.written, 24); assert.equal(x.cells[1][2].value, 25); assert.equal(x.cells[2][2].value, 17.5);
    assert.equal(x.cells[1][3].value, '00123'); assert.equal(x.cells[2][3].value, '=1+1'); assert.equal(x.cells[2][3].formula, null);
    assert.equal(x.cells[1][5].value, true); assert.equal(x.cells[1][4].value.date, '2026-10-18T10:30:00.000Z');
  });
  await check('Native formatting readback', async () => {
    const f = await run('format', { ...t, range: 'A1:F1', font_name: 'Helvetica-Bold', font_size: 14, background_color: [0, 12000, 24000], text_color: [65535, 65535, 65535], alignment: 'center', vertical_alignment: 'center', text_wrap: true });
    assert.equal(f.font_size, 14); assert.equal(f.text_wrap, true);
  });
  await check('Number and checkbox cell formats', async () => { await run('format', { ...t, range: 'B2:B4', format: 'currency' }); await run('format', { ...t, range: 'F2:F4', format: 'checkbox' }); const r = await run('read', { ...t, range: 'B2' }); assert.equal(r.cells[0][0].format, 'currency'); });
  await check('Search formulas and formatted text', async () => { assert.equal((await run('find', { ...t, range: 'A1:F4', query: 'caffè' })).total, 1); assert.equal((await run('find', { ...t, range: 'A1:F4', query: 'B2:B3', in_formulas: true })).total, 1); });
  await check('Select and read native selection', async () => { assert.equal((await run('selection', { ...t, range: 'A2:B3' })).range, 'A2:B3'); assert.ok((await run('selection', d)).selections.length); });
  await check('Resize row and column dimensions', async () => { await run('dimensions', { ...t, axis: 'row', first: 1, last: 2, size: 30 }); await run('dimensions', { ...t, axis: 'column', first: 1, last: 1, size: 180 }); });
  await check('Merge and unmerge cells', async () => { await run('merge', { ...t, range: 'A8:B8', action: 'merge' }); await run('merge', { ...t, range: 'A8:B8', action: 'unmerge' }); });
  await check('Insert and delete rows and columns', async () => {
    await run('axis', { ...t, axis: 'row', action: 'insert', at: 6, count: 2 });
    assert.equal((await run('inspect', d)).sheets[0].tables[0].rows, 14);
    await run('axis', { ...t, axis: 'row', action: 'delete', at: 6, count: 2 });
    await run('axis', { ...t, axis: 'column', action: 'insert', at: 5, count: 1 });
    await run('axis', { ...t, axis: 'column', action: 'delete', at: 5, count: 1 });
    assert.equal((await run('inspect', d)).sheets[0].tables[0].columns, 6);
  });
  await check('Create, rename, activate and delete sheets', async () => {
    await run('sheet', { ...d, action: 'create', name: 'Temporary' });
    await run('sheet', { ...d, action: 'rename', sheet: 'Temporary', name: 'Renamed' });
    await run('sheet', { ...d, action: 'activate', sheet: 'Renamed' });
    await run('sheet', { ...d, action: 'delete', sheet: 'Renamed' });
  });
  await check('Create, rename, sort, transpose and delete tables', async () => {
    await run('table', { ...d, sheet: 1, action: 'create', name: 'Scratch', rows: 5, columns: 3, header_rows: 0, header_columns: 0 });
    const scratch = { ...d, sheet: 1, table: 'Scratch' };
    await run('write', { ...scratch, start: 'A1', values: [[3, 'c'], [1, 'a'], [2, 'b']] });
    await run('sort', { ...scratch, column: 1, direction: 'ascending' }); assert.equal((await run('read', { ...scratch, range: 'A1' })).cells[0][0].value, 1);
    await run('transpose', scratch); assert.equal((await run('read', { ...scratch, range: 'A1:C1' })).cells[0][2].value, 3);
    await run('table', { ...scratch, action: 'rename', name: 'Renamed Table' });
    await run('table', { ...d, sheet: 1, table: 'Renamed Table', action: 'delete' });
  });
  await check('Create, edit and delete native text and shapes', async () => {
    const s = { ...d, sheet: 1 };
    await run('object', { ...s, action: 'create', kind: 'text', text: 'Native Numbers – Viames Marino', x: 500, y: 50, width: 280, height: 60 });
    await run('object', { ...s, action: 'update', kind: 'text', object: 1, text: 'Updated native text', x: 520 });
    assert.equal((await run('objects', s)).objects.find(x => x.kind === 'text').text, 'Updated native text');
    await run('object', { ...s, action: 'create', kind: 'shape', text: 'Native shape', x: 500, y: 150, width: 150, height: 80 });
    await run('object', { ...s, action: 'delete', kind: 'shape', object: 1 });
  });
  await check('Import and delete a native image', async () => {
    const img = join(folder, 'pixel.png');
    writeFileSync(img, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=', 'base64'));
    await run('object', { ...d, sheet: 1, action: 'create', kind: 'image', image_path: img, x: 500, y: 250, width: 50, height: 50 });
    assert.ok((await run('objects', { ...d, sheet: 1 })).objects.some(x => x.kind === 'image'));
    await run('object', { ...d, sheet: 1, action: 'delete', kind: 'image', object: 1 });
  });
  await check('Clear values preserving format and clear with styling', async () => {
    await run('write', { ...t, start: 'E8', values: [[123]] }); await run('format', { ...t, range: 'E8', format: 'currency' });
    const clear = await run('clear', { ...t, range: 'E8' }); assert.equal(clear.cells[0][0].value, null); assert.equal(clear.cells[0][0].format, 'currency');
    await run('clear', { ...t, range: 'E8', styling: true });
  });
  await check('Save and native backup with overwrite protection', async () => {
    await run('save', d); const backup = join(folder, 'Backup.numbers'); assert.equal((await run('backup', { ...d, path: backup })).exists, true);
    await assert.rejects(run('backup', { ...d, path: backup }), e => e.code === 'DESTINATION_EXISTS');
  });
  await check('Export native PDF', async () => { const p = join(folder, 'Native Smoke.pdf'); const r = await run('export', { ...d, format: 'pdf', path: p }); assert.equal(r.exists, true); assert.equal(readFileSync(p).subarray(0, 4).toString(), '%PDF'); });
  await check('Export native CSV', async () => { const r = await run('export', { ...d, format: 'csv', path: join(folder, 'Native Smoke.csv') }); assert.equal(r.exists, true); });
  await check('Close and reopen: persisted formula and literal string', async () => {
    await run('close', d); id = null; const reopened = await run('open', { path }); reopenedId = reopened.document_id;
    const r = await run('read', { document_id: reopenedId, sheet: 1, table: 1, range: 'C2:D3' });
    assert.equal(r.cells[0][0].value, 25); assert.equal(r.cells[1][1].value, '=1+1'); assert.equal(r.cells[1][1].formula, null);
  });
} finally {
  if (reopenedId || id) { try { await run('close', { document_id: reopenedId || id }); } catch (e) { evidence.failures.push({ label: 'Close test document', message: e.message }); } }
  const report = process.env.NUMBERS_NATIVE_EVIDENCE ?? join(folder, 'verification.json');
  writeFileSync(report, JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${report}`);
  console.log(`Passed: ${evidence.checks.length}; failed: ${evidence.failures.length}. Test files: ${folder}`);
  if (evidence.failures.length) process.exitCode = 1;
}
