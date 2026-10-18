import { existsSync, rmSync, readFileSync, unlinkSync } from 'node:fs';
import { copyNativePrototype, nativeFingerprint } from './native-files.mjs';
import { canonicalPath } from './paths.mjs';
import { NativeError } from './bridge.mjs';
import { digest } from './bindings.mjs';

function vacant(store, path) {
  canonicalPath(path, { extensions: ['.numbers'], mustBeNew: true, roots: store.roots });
  const state = store.load(path);
  if (state.hash) throw new NativeError('DESTINATION_EXISTS', 'A companion already exists at the destination. Choose a new path.');
  return state;
}
async function bindingStates(session, doc, bindings) {
  const statuses = [];
  for (const b of bindings) {
    try {
      const c = await session.call('chart_context', { document_id: doc.document_id, binding: b });
      statuses.push({ id: b.id, label: b.label, status: JSON.stringify(c.guard) === JSON.stringify(b.guard) ? 'matched' : 'stale' });
    } catch (e) {
      if (['NATIVE_TIMEOUT', 'APPLE_EVENT_TIMEOUT', 'STATE_UNCERTAIN', 'NATIVE_PROCESS_FAILED'].includes(e.code)) throw e;
      statuses.push({ id: b.id, label: b.label, status: 'stale', reason: e.code });
    }
  }
  return statuses;
}
async function copyPair(session, store, from, to, { open = false } = {}) {
  from = canonicalPath(from, { extensions: ['.numbers'], mustExist: true, roots: store.roots });
  const source = store.load(from), target = vacant(store, to);
  let phase = 'copy native document', doc;
  try {
    const hash = nativeFingerprint(from);
    copyNativePrototype(from, to);
    if (nativeFingerprint(to) !== hash || nativeFingerprint(from) !== hash) throw new NativeError('PAIR_COPY_VERIFY_FAILED', 'Native bytes changed during copying.');
    phase = 'copy companion';
    // Even an empty valid companion is retained; no source content is dropped.
    if (source.hash) { target.manifest.bindings = structuredClone(source.manifest.bindings); store.save(target); }
    if ((existsSync(source.path) ? digest(readFileSync(source.path, 'utf8')) : null) !== source.hash) throw new NativeError('METADATA_CONFLICT', 'Source companion changed while copying.');
    let statuses;
    if (open) {
      phase = 'open and validate destination'; doc = await session.call('open', { path: to });
      if (canonicalPath(doc.path, { mustExist: true, roots: store.roots }) !== to) throw new NativeError('CLONE_PATH_MISMATCH', 'Numbers opened a different document path.');
      statuses = await bindingStates(session, doc, target.manifest.bindings);
    }
    return { ...(doc ?? {}), path: to, source: from, exists: true, native_copy_verified: true, native_fingerprint: hash, companion_path: target.hash ? target.path : null, bindings_copied: target.manifest.bindings.length, ...(statuses ? { binding_status: statuses } : {}), source_hash: source.hash };
  } catch (e) {
    throw new NativeError('PAIR_COPY_INCOMPLETE', `File-pair copy failed during ${phase}. Existing source is retained; inspect any destination files before retrying.`, { source: from, path: to, document_id: doc?.document_id, phase, cause: e.code, message: e.message });
  }
}

export async function backupPair(session, store, args) {
  const info = await session.call('document_info', args);
  if (!info.path) throw new NativeError('UNSAVED_DOCUMENT', 'Save the native document before backing it up.');
  const from = canonicalPath(info.path, { mustExist: true, roots: store.roots });
  store.load(from); vacant(store, args.path); // Fail before saving on bad paths/metadata.
  await session.call('save', { document_id: args.document_id });
  const result = await copyPair(session, store, from, args.path);
  delete result.source_hash;
  return { ...result, saved: true, source_document_id: args.document_id };
}
export async function restorePair(session, store, args) {
  // Never restore over an existing document; the backup remains untouched.
  await session.call('template_check', { path: args.backup_path });
  const result = await copyPair(session, store, args.backup_path, args.path, { open: true });
  delete result.source_hash;
  return { ...result, restored: true, backup_retained: true };
}
export async function movePair(session, store, args) {
  const info = await session.call('document_info', args);
  if (!info.path) throw new NativeError('UNSAVED_DOCUMENT', 'Save the document before moving it.');
  const from = canonicalPath(info.path, { mustExist: true, roots: store.roots });
  store.load(from); vacant(store, args.path);
  await session.call('save', { document_id: args.document_id });
  await session.call('close', { document_id: args.document_id, save: true });
  const identity = nativeFingerprint(from, { identity: true });
  let phase = 'copy and validate new location', result;
  try {
    result = await copyPair(session, store, from, args.path, { open: true });
    phase = 'verify original before removal';
    if ((await session.call('template_check', { path: from })).open) throw new NativeError('SOURCE_REOPENED', 'The original was reopened while moving. Both locations are retained.');
    if (nativeFingerprint(from, { identity: true }) !== identity || (existsSync(store.path(from)) ? digest(readFileSync(store.path(from), 'utf8')) : null) !== result.source_hash) throw new NativeError('SOURCE_CHANGED', 'The original changed after closing. Both locations are retained.');
    const current = await session.call('document_info', { document_id: result.document_id });
    if (canonicalPath(current.path, { mustExist: true, roots: store.roots }) !== args.path) throw new NativeError('DESTINATION_CHANGED', 'Destination document moved again. Both locations are retained.');
    phase = 'remove original native file'; rmSync(from, { recursive: true });
    phase = 'remove original companion';
    if (result.source_hash) unlinkSync(from + '.numbers-native.json');
    delete result.source_hash;
    return { ...result, moved: true, previous_path: from, previous_document_id: args.document_id, original_removed: true };
  } catch (e) {
    throw new NativeError('PAIR_MOVE_INCOMPLETE', `Move failed during ${phase}. Inspect both paths before retrying; no automatic rollback occurs.`, { source: from, path: args.path, document_id: result?.document_id, phase, cause: e.code, message: e.message });
  }
}
