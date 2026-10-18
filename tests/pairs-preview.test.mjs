import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BindingStore } from '../plugins/numbers-native/src/bindings.mjs';
import { backupPair, restorePair, movePair } from '../plugins/numbers-native/src/pairs.mjs';
import { previewPaths, visualPaths } from '../plugins/numbers-native/src/previews.mjs';
import { compatibilityReport } from '../plugins/numbers-native/src/compatibility.mjs';
import { nativeFingerprint } from '../plugins/numbers-native/src/native-files.mjs';

function fixture(mode = '') {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'numbers-pairs-test-')));
  const from = join(directory, 'Source.numbers'), to = join(directory, 'Target.numbers');
  writeFileSync(from, 'opaque native bytes');
  const store = new BindingStore([directory]); store.save(store.load(from));
  const calls = [];
  const session = { async call(action, args) {
    calls.push({ action, args });
    if (action === 'document_info' || action === 'save') return { document_id: args.document_id, path: args.document_id === 'new-id' ? to : from };
    if (action === 'template_check') return { open: mode === 'reopened' };
    if (action === 'open') {
      if (mode === 'open-failure') throw new Error('Mock Numbers open failure');
      if (mode === 'source-changed') writeFileSync(from, 'external edit');
      return { document_id: 'new-id', path: args.path };
    }
    return {};
  } };
  return { directory, from, to, store, session, calls };
}
test('backup copies verified native bytes and retargets even an empty companion', async () => {
  const f = fixture(), original = readFileSync(f.from);
  const r = await backupPair(f.session, f.store, { document_id: 'source-id', path: f.to });
  assert.deepEqual(readFileSync(f.to), original); assert.equal(r.native_copy_verified, true);
  assert.ok(existsSync(r.companion_path)); assert.equal(f.store.load(f.to).manifest.document_path, f.to);
  assert.ok(!f.calls.some(c => c.action === 'close')); assert.ok(existsSync(f.from));
});
test('restore opens a new recovered pair and retains the backup', async () => {
  const f = fixture(); const r = await restorePair(f.session, f.store, { backup_path: f.from, path: f.to });
  assert.equal(r.document_id, 'new-id'); assert.ok(r.backup_retained);
  assert.ok(existsSync(f.from)); assert.ok(existsSync(f.from + '.numbers-native.json')); assert.ok(existsSync(r.companion_path));
});
test('move removes original pair only after verified copy and destination open', async () => {
  const f = fixture(); const r = await movePair(f.session, f.store, { document_id: 'source-id', path: f.to });
  assert.equal(r.moved, true); assert.equal(r.document_id, 'new-id');
  assert.equal(existsSync(f.from), false); assert.equal(existsSync(f.from + '.numbers-native.json'), false);
  assert.ok(existsSync(f.to)); assert.ok(existsSync(r.companion_path));
  assert.deepEqual(f.calls.filter(c => c.action === 'close').map(c => c.args.document_id), ['source-id']);
});
test('failed open, reopened source and intervening edits keep recoverable source copies', async () => {
  for (const mode of ['open-failure', 'reopened', 'source-changed']) {
    const f = fixture(mode);
    await assert.rejects(movePair(f.session, f.store, { document_id: 'source-id', path: f.to }), e => e.code === 'PAIR_MOVE_INCOMPLETE');
    assert.ok(existsSync(f.from)); assert.ok(existsSync(f.from + '.numbers-native.json'));
    assert.ok(existsSync(f.to)); assert.ok(existsSync(f.to + '.numbers-native.json'));
  }
});
test('destination collision and bad source metadata fail before saving or closing', async () => {
  const f = fixture(); writeFileSync(f.to + '.numbers-native.json', 'invalid metadata');
  await assert.rejects(movePair(f.session, f.store, { document_id: 'source-id', path: f.to }));
  assert.equal(f.calls.filter(c => ['save', 'close'].includes(c.action)).length, 0); assert.equal(existsSync(f.to), false);
  const g = fixture(); writeFileSync(g.from + '.numbers-native.json', 'invalid');
  await assert.rejects(backupPair(g.session, g.store, { document_id: 'source-id', path: g.to }), e => e.code === 'INVALID_CHART_METADATA');
  assert.equal(g.calls.filter(c => c.action === 'save').length, 0);
});
test('native package fingerprints cover file content independently of copy metadata', () => {
  const f = fixture(); const a = join(f.directory, 'a.numbers'), b = join(f.directory, 'b.numbers');
  mkdirSync(a); mkdirSync(b); writeFileSync(join(a, 'entry'), 'bytes'); writeFileSync(join(b, 'entry'), 'bytes');
  assert.equal(nativeFingerprint(a), nativeFingerprint(b));
  writeFileSync(join(b, 'entry'), 'changed'); assert.notEqual(nativeFingerprint(a), nativeFingerprint(b));
});
test('preview paths enforce no overwrite, root boundaries and distinct before/after pairs', () => {
  const f = fixture(), pdf = join(f.directory, 'preview.pdf');
  const result = previewPaths(pdf, [f.directory]); assert.equal(result.image_path, pdf.replace('.pdf', '.png'));
  assert.throws(() => visualPaths({ before_path: pdf, after_path: pdf }, [f.directory]), e => e.code === 'PREVIEW_PATH_COLLISION');
  writeFileSync(result.image_path, 'existing'); assert.throws(() => previewPaths(pdf, [f.directory]), e => e.code === 'DESTINATION_EXISTS');
  const other = realpathSync(mkdtempSync(join(tmpdir(), 'numbers-preview-outside-')));
  assert.throws(() => previewPaths(join(other, 'x.pdf'), [f.directory]), e => e.code === 'PATH_NOT_ALLOWED');
});
test('diagnostics distinguish unknown templates and unverified versions', () => {
  const unknown = compatibilityReport({ numbers_version: '99', automation_tested: false });
  assert.ok(unknown.chart_profiles.every(p => !p.version_verified && p.template_installed === null));
  const checked = compatibilityReport({ numbers_version: '14.5', automation_tested: true }, ['Application/21_Table_and_Chart/Traditional']);
  assert.equal(checked.chart_profiles.find(p => p.id === 'column').template_installed, true);
  assert.equal(checked.chart_profiles.find(p => p.id === 'pie').template_installed, false);
});
