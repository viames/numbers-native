import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { NumbersTools } from '../plugins/numbers-native/src/tools.mjs';
import { NumbersBridge } from '../plugins/numbers-native/src/bridge.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../plugins/numbers-native/src/server-factory.mjs';

const directory = mkdtempSync(join(tmpdir(), 'numbers-native-040-'));
const service = new NumbersTools(new NumbersBridge(), { roots: [directory] });
const call = async (name, args = {}) => {
  for(let i=0;;i++) {
    try { return await service.execute('numbers_' + name, args); }
    catch(e) {
      // NUMBERS_BUSY is rejected before any native action starts. Wait for the
      // other cooperating host; never retry partial/native/timeout failures.
      if(e.code!=='NUMBERS_BUSY'||i>=120)throw e;
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  }
};
const checks = [], ids = new Set();
const own = result => { ids.add(result.document_id); return result; };
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const png = p => assert.equal(readFileSync(p).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
async function check(label, fn) { await fn(); checks.push(label); console.log('PASS ' + label); }
let main, restored, moved, backup, images;
try {
  await check('diagnostics distinguish live capabilities from untested machines', async () => {
    const before = (await call('documents')).documents.length;
    const unknown = await call('diagnostics', { launch: false }); assert.ok(unknown.chart_profiles.every(p => p.template_installed === null));
    const live = await call('diagnostics', { launch: true }); assert.equal(live.native.pdf_renderer.available, true); assert.equal(live.native.numbers_version, '14.5'); assert.ok(live.chart_profiles.every(p => p.template_installed && p.version_verified));
    assert.equal((await call('documents')).documents.length, before);
  });
  main = own(await call('chart_create', { path: join(directory, 'Source.numbers'), profile: 'column', headers: ['Voce', 'Spesa', 'Budget'], data: [['Materiali', 120, 150], ['Servizi', 80, 100], ['Trasporto', 35, 50]], title: 'Anteprima nativa' }));
  const d = { document_id: main.document_id }, t = { ...d, sheet: 1, table: 1 };
  await call('format', { ...t, range: 'B2:C4', format: 'currency' });
  await check('native PDFKit preview generates valid PDF and PNG without external binaries', async () => {
    images = await call('preview', { ...d, path: join(directory, 'native.pdf') });
    png(images.image_path); assert.equal(images.render_stable, true); assert.ok(images.render_attempts >= 2); assert.equal(images.page, 1); assert.ok(images.page_count >= 1); assert.ok(images.width > 0 && images.height > 0); assert.equal(readFileSync(images.pdf_path).subarray(0, 4).toString(), '%PDF');
  });
  await check('preview refuses overwrites and orphan PNG before exporting a PDF', async () => {
    await assert.rejects(call('preview', { ...d, path: images.pdf_path }), e => e.code === 'DESTINATION_EXISTS');
    const path = join(directory, 'orphan.pdf'); writeFileSync(path.replace('.pdf', '.png'), 'existing');
    await assert.rejects(call('preview', { ...d, path }), e => e.code === 'DESTINATION_EXISTS'); assert.equal(existsSync(path), false);
  });
  await check('guided dry-run creates no images; apply returns real before/after images', async () => {
    const args = { ...d, binding: main.binding.id, mode: 'series', series: 'Spesa', values: [150, 80, 35], visual_check: { before_path: join(directory, 'before.pdf'), after_path: join(directory, 'after.pdf') } };
    const p = await call('chart_update', args); assert.equal(existsSync(args.visual_check.before_path), false);
    const result = await call('chart_update', { ...args, preview: false, expected_revision: p.revision });
    assert.equal(result.applied, true); assert.equal(result.visual_check.status, 'images_generated'); assert.equal(result.visual_check.inspected_automatically, false);
    png(result.visual_check.before.image_path); png(result.visual_check.after.image_path);
    assert.notEqual(hash(result.visual_check.before.image_path), hash(result.visual_check.after.image_path));
    assert.equal((await call('read', { ...t, range: 'B2' })).cells[0][0].format, 'currency');
  });
  await check('backup preserves companion and leaves identified source open', async () => {
    backup = await call('backup', { ...d, path: join(directory, 'Backup.numbers') });
    assert.ok(backup.native_copy_verified); assert.ok(existsSync(backup.companion_path)); assert.equal(backup.bindings_copied, 1);
    assert.equal((await call('inspect', d)).document_id, main.document_id);
  });
  const backupHash = hash(backup.path), metadataHash = hash(backup.companion_path);
  await check('restore recovers a new pair without changing the backup', async () => {
    await call('write', { ...t, start: 'B2', values: [[175]] }); await call('save', d);
    restored = own(await call('restore', { backup_path: backup.path, path: join(directory, 'Restored.numbers') }));
    assert.equal((await call('read', { document_id: restored.document_id, sheet: 1, table: 1, range: 'B2' })).cells[0][0].value, 150);
    assert.equal(restored.binding_status[0].status, 'matched'); assert.equal(hash(backup.path), backupHash); assert.equal(hash(backup.companion_path), metadataHash);
    const r = await call('preview', { document_id: restored.document_id, path: join(directory, 'recovered-original-still-open.pdf') }); assert.equal(r.render_stable, true); png(r.image_path);
  });
  await check('restored guided binding still applies native source changes', async () => {
    const args = { document_id: restored.document_id, binding: main.binding.id, mode: 'series', series: 'Spesa', values: [160, 80, 35] };
    const p = await call('chart_update', args); await call('chart_update', { ...args, preview: false, expected_revision: p.revision });
  });
  await check('move/rename relocates both files, opens new document and removes only originals', async () => {
    const folder = join(directory, 'Moved'); mkdirSync(folder);
    moved = await call('move', { document_id: restored.document_id, path: join(folder, 'Rinominato – 日本語.numbers') });
    ids.delete(restored.document_id); own(moved);
    assert.equal(existsSync(restored.path), false); assert.equal(existsSync(restored.companion_path), false);
    assert.ok(existsSync(moved.path)); assert.ok(existsSync(moved.companion_path)); assert.equal(moved.binding_status[0].status, 'matched');
    assert.equal((await call('read', { document_id: moved.document_id, sheet: 1, table: 1, range: 'B2' })).cells[0][0].value, 160);
    assert.equal((await call('chart_bindings', { document_id: moved.document_id })).bindings[0].id, main.binding.id);
    assert.equal((await call('inspect', d)).document_id, main.document_id); assert.equal(hash(backup.path), backupHash);
  });
  await check('move collision keeps the source document open and usable', async () => {
    await assert.rejects(call('move', { document_id: moved.document_id, path: main.path }), e => e.code === 'DESTINATION_EXISTS');
    assert.equal((await call('inspect', { document_id: moved.document_id })).document_id, moved.document_id);
  });
  await check('backup/restore retain stale mappings as stale, without guessing chart references', async () => {
    await call('object', { ...d, sheet: 1, action: 'update', kind: 'chart', object: 1, x: 75 });
    const stale = await call('backup', { ...d, path: join(directory, 'Stale backup.numbers') });
    const recovered = own(await call('restore', { backup_path: stale.path, path: join(directory, 'Stale recovery.numbers') }));
    assert.equal(recovered.binding_status[0].status, 'stale');
    await assert.rejects(call('chart_update', { document_id: recovered.document_id, binding: main.binding.id, mode: 'series', series: 'Spesa', values: [150, 80, 35] }), e => e.code === 'BINDING_STALE');
  });
  await check('PDF page selection handles a second native sheet', async () => {
    await call('sheet', { ...d, action: 'create', name: 'Second page' });
    await call('table', { ...d, sheet: 2, action: 'create', name: 'Second table', rows: 3, columns: 2 });
    await call('write', { ...d, sheet: 2, table: 1, start: 'A1', values: [['Pagina', 'Due'], [2, 35]] });
    const r = await call('preview', { ...d, path: join(directory, 'page-two.pdf'), page: 2, max_dimension: 600 }); png(r.image_path); assert.ok(r.page_count >= 2); assert.equal(r.page, 2);
    await assert.rejects(call('preview', { ...d, path: join(directory, 'out-of-range.pdf'), page: 9999 }), e => e.code === 'PREVIEW_PAGE_RANGE');
  });
  await check('official MCP result includes native PNG image content', async () => {
    const server = createServer({ roots: [directory] }), client = new Client({ name: 'native-preview-client', version: '1.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
    try {
      const r = await client.callTool({ name: 'numbers_preview', arguments: { ...d, path: join(directory, 'inline.pdf'), max_dimension: 600 } }); assert.equal(r.isError, undefined);
      const image = r.content.find(c => c.type === 'image'); assert.ok(image); assert.equal(image.mimeType, 'image/png'); assert.equal(Buffer.from(image.data, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    } finally { await client.close(); await server.close(); }
  });
  const evidence = { passed: true, directory, checks };
  writeFileSync(join(directory, 'verification.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
} finally { for (const id of ids) await call('close', { document_id: id }); }
