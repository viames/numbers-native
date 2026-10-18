import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { NumbersTools } from '../plugins/numbers-native/src/tools.mjs';
import { NumbersBridge } from '../plugins/numbers-native/src/bridge.mjs';

const directory = mkdtempSync(join(tmpdir(), 'numbers-native-030-'));
const service = new NumbersTools(new NumbersBridge(), { roots: [directory] });
const call = (name, args = {}) => service.execute('numbers_' + name, args);
const checks = [];
const ids = new Set();
const own = async result => { ids.add(result.document_id); return result; };
async function check(label, fn) { await fn(); checks.push(label); console.log('PASS ' + label); }
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
async function apply(args) { const preview = await call('chart_update', args); assert.equal(preview.applied, false); return call('chart_update', { ...args, preview: false, expected_revision: preview.revision }); }
let main, copy, area;
try {
  main = await own(await call('chart_create', { path: join(directory, 'Prototype.numbers'), profile: 'column', headers: ['Voce', 'Spesa', 'Budget'], data: [['Materiali', 120, 150], ['Servizi', 80, 100], ['Trasporto', 35, 50]], title: 'Modello personalizzato' }));
  const d = { document_id: main.document_id }, t = { ...d, sheet: 1, table: 1 };
  await check('factory registers a persistent known chart binding', async () => { assert.equal(main.binding.provenance, 'verified-template'); assert.equal((await call('chart_bindings', d)).bindings.length, 1); assert.ok(existsSync(main.companion_path)); });
  await check('numeric writes preserve currency and visual cell styling', async () => {
    await call('format', { ...t, range: 'B2:C4', format: 'currency', font_name: 'Helvetica-Bold', font_size: 14, background_color: [10000, 20000, 30000] });
    const written = await call('write', { ...t, start: 'B2', values: [[130]] });
    assert.equal(written.cells[0][0].format, 'currency'); assert.equal(written.formats_verified, true);
    const style = await call('format', { ...t, range: 'B2' }); assert.equal(style.font_size, 14); assert.equal(style.font_name, 'Helvetica-Bold');
    style.background_color.forEach((v, i) => assert.ok(Math.abs(v - [10000, 20000, 30000][i]) <= 2));
  });
  await check('percent, number, formulas and null preserve compatible formats', async () => {
    await call('format', { ...t, range: 'B3', format: 'percent' });
    assert.equal((await call('write', { ...t, start: 'B3', values: [[0.2]] })).cells[0][0].format, 'percent');
    await call('format', { ...t, range: 'B4', format: 'number' });
    assert.equal((await call('write', { ...t, start: 'B4', values: [[35]] })).cells[0][0].format, 'number');
    const formula = await call('write', { ...t, start: 'B2', values: [[{ formula: '=60*2' }]] }); assert.equal(formula.cells[0][0].value, 120); assert.equal(formula.cells[0][0].format, 'currency');
    assert.equal((await call('write', { ...t, start: 'B2', values: [[null]] })).cells[0][0].format, 'currency');
    await call('write', { ...t, start: 'B2', values: [[120]] });
    await call('write', { ...t, start: 'B3', values: [[80]] }); await call('format', { ...t, range: 'B2:C4', format: 'currency' });
  });
  await check('explicit literal text and boolean/date type formats still work', async () => {
    const scratch = await own(await call('create', { path: join(directory, 'Types.numbers') })); const st = { document_id: scratch.document_id, sheet: 1, table: 1 };
    const r = await call('write', { ...st, start: 'A1', values: [['=1+1', '001', true, { date: '2026-10-18T10:00:00Z' }]] });
    assert.equal(r.cells[0][0].formula, null); assert.equal(r.cells[0][0].value, '=1+1'); assert.equal(r.cells[0][1].value, '001'); assert.equal(r.cells[0][2].value, true); assert.equal(r.cells[0][3].format, 'date and time');
    await call('format', { ...st, range: 'A2', format: 'currency' });
    assert.equal((await call('write', { ...st, start: 'A2', values: [[12]], preserve_format: false })).cells[0][0].format, 'automatic');
    await call('close', { document_id: scratch.document_id }); ids.delete(scratch.document_id);
  });
  const update = { ...d, binding: main.binding.id, mode: 'series', series: 'Spesa', values: [150, 80, 35] };
  await check('guided preview is read-only and tied to the exact request', async () => {
    const before = await call('read', { ...t, range: 'A1:C4' });
    const p = await call('chart_update', update); assert.equal(p.preview, true);
    assert.deepEqual((await call('read', { ...t, range: 'A1:C4' })).cells, before.cells);
    await assert.rejects(call('chart_update', { ...update, values: [170, 80, 35], preview: false, expected_revision: p.revision }), e => e.code === 'CHART_REVISION_CHANGED');
    await assert.rejects(call('chart_update', { ...update, preview: false }), e => e.code === 'CHART_REVISION_CHANGED');
  });
  await check('intervening cell edits invalidate a guided preview', async () => {
    const p = await call('chart_update', update);
    await call('write', { ...t, start: 'B2', values: [[131]] });
    await assert.rejects(call('chart_update', { ...update, preview: false, expected_revision: p.revision }), e => e.code === 'CHART_REVISION_CHANGED');
    assert.equal((await call('read', { ...t, range: 'B2' })).cells[0][0].value, 131);
  });
  await check('guided series applies only requested data and keeps currency', async () => {
    await apply(update);
    const r = await call('read', { ...t, range: 'B2:C4' }); assert.equal(r.cells[0][0].value, 150); assert.equal(r.cells[0][1].value, 150); assert.ok(r.cells.flat().every(c => c.format === 'currency'));
  });
  await check('append categories extends the source and keeps chart links', async () => {
    const result = await apply({ ...d, binding: main.binding.id, mode: 'append', data: [['Aprile', 40, 50]] }); assert.equal(result.source_range, 'A1:C5');
    assert.equal((await call('read', { ...t, range: 'A5' })).cells[0][0].value, 'Aprile');
    const pdf = join(directory, 'append.pdf'); await call('export', { ...d, path: pdf, format: 'pdf' });
    if (process.env.NUMBERS_TEST_PDF === '1') { const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }); assert.ok(text.split('Aprile').length >= 3); }
  });
  await check('replace expands numeric series and reports formula overwrites', async () => {
    await call('write', { ...t, start: 'B2', values: [[{ formula: '=100+50' }]] });
    const args = { ...d, binding: main.binding.id, mode: 'replace', headers: ['Voce', 'Spesa', 'Budget', 'Stima'], data: [['Materiali', 150, 150, 160], ['Servizi', 80, 100, 95], ['Trasporto', 35, 50, 45], ['Aprile', 40, 50, 60]] };
    const p = await call('chart_update', args); assert.equal(p.formula_overwrites, 1);
    const result = await call('chart_update', { ...args, preview: false, expected_revision: p.revision }); assert.equal(result.source_range, 'A1:D5');
    const pdf = join(directory, 'series-growth.pdf'); await call('export', { ...d, path: pdf, format: 'pdf' });
    if (process.env.NUMBERS_TEST_PDF === '1') { const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }); assert.ok(text.split('Stima').length >= 3); }
  });
  await check('native prototype clone preserves source bytes and known bindings', async () => {
    await call('save', d); await call('close', d); ids.delete(main.document_id);
    const before = hash(main.path), companion = hash(main.companion_path);
    copy = await own(await call('from_template', { template_path: main.path, path: join(directory, 'Copia – 日本語.numbers') }));
    assert.equal(copy.bindings_copied, 1); assert.notEqual(copy.path, main.path);
    assert.equal(hash(main.path), before); assert.equal(hash(main.companion_path), companion);
    const b = (await call('chart_bindings', { document_id: copy.document_id })).bindings[0];
    await apply({ document_id: copy.document_id, binding: b.id, mode: 'series', series: 'Spesa', values: [160, 80, 35, 40] });
    assert.equal(hash(main.path), before);
  });
  await check('binding survives native close/reopen and process recreation', async () => {
    await call('close', { document_id: copy.document_id }); ids.delete(copy.document_id);
    copy = await own(await call('open', { path: copy.path }));
    const fresh = new NumbersTools(new NumbersBridge(), { roots: [directory] });
    const bindings = await fresh.execute('numbers_chart_bindings', { document_id: copy.document_id }); assert.equal(bindings.bindings.length, 1);
    const p = await fresh.execute('numbers_chart_update', { document_id: copy.document_id, binding: bindings.bindings[0].label, mode: 'series', series: 'Budget', values: [200, 100, 50, 50] }); assert.equal(p.preview, true);
  });
  await check('declared custom chart registration is explicit and does not invent references', async () => {
    const result = await call('chart_bind', { document_id: copy.document_id, sheet: 1, table: 1, range: 'A1:D5', chart: 1, label: 'Known custom chart', orientation: 'columns' });
    assert.equal(result.binding.provenance, 'declared-source'); assert.equal(result.references_introspected, false);
  });
  await check('changed native chart geometry blocks stale guided bindings', async () => {
    await call('object', { document_id: copy.document_id, sheet: 1, action: 'update', kind: 'chart', object: 1, x: 99 });
    await assert.rejects(call('chart_update', { document_id: copy.document_id, binding: 'Main chart', mode: 'series', series: 'Spesa', values: [160, 80, 35, 40] }), e => e.code === 'BINDING_STALE');
  });
  await check('row-series native source updates and category append', async () => {
    area = await own(await call('chart_create', { path: join(directory, 'Area.numbers'), profile: 'area', headers: ['Mese', 'Reale', 'Previsto'], data: [['Gen', 10, 20], ['Feb', 30, 40], ['Mar', 50, 60]] }));
    await apply({ document_id: area.document_id, binding: area.binding.id, mode: 'series', series: 'Reale', values: [11, 33, 55] });
    await apply({ document_id: area.document_id, binding: area.binding.id, mode: 'append', data: [['Apr', 77, 88]] });
    const r = await call('read', { document_id: area.document_id, sheet: 1, table: 1, range: 'A1:E3' }); assert.deepEqual(r.cells[1].map(c => c.value), ['Reale', 11, 33, 55, 77]);
    const pdf = join(directory, 'row-series.pdf'); await call('export', { document_id: area.document_id, path: pdf, format: 'pdf' });
    if (process.env.NUMBERS_TEST_PDF === '1') { const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }); assert.ok(text.split('Apr').length >= 3); }
  });
  const evidence = { passed: true, directory, checks };
  writeFileSync(join(directory, 'verification.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
} finally { for (const id of ids) await call('close', { document_id: id }); }
