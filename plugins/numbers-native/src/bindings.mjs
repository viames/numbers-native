import { z } from 'zod';
import { existsSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { canonicalPath } from './paths.mjs';
import { NativeError } from './bridge.mjs';

const namedIndex = { index: z.number().int().positive(), name: z.string().min(1).max(1000) };
export const bindingSchema = z.strictObject({
  id: z.uuid(), label: z.string().min(1).max(1000),
  orientation: z.enum(['columns', 'rows', 'xy', 'xyz']),
  provenance: z.enum(['verified-template', 'declared-source']),
  profile: z.string().max(100).optional(),
  source: z.strictObject({ sheet: z.strictObject(namedIndex), table: z.strictObject(namedIndex), range: z.string().max(100) }),
  chart: z.strictObject({ sheet: z.strictObject(namedIndex), index: z.number().int().positive() }),
  // Opaque structural fingerprint produced by the fixed native worker, not code.
  guard: z.record(z.string(), z.unknown())
});
const manifestSchema = z.strictObject({ version: z.literal(1), document_path: z.string(), revision: z.uuid(), bindings: z.array(bindingSchema).max(100) });
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

export class BindingStore {
  constructor(roots = []) { this.roots = roots; }
  path(documentPath) {
    documentPath = canonicalPath(documentPath, { extensions: ['.numbers'], roots: this.roots });
    const path = documentPath + '.numbers-native.json';
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new NativeError('METADATA_SYMLINK', 'Chart companion metadata must not be a symbolic link.');
    if (canonicalPath(path, { extensions: ['.json'], roots: this.roots }) !== path) throw new NativeError('METADATA_PATH', 'Chart companion metadata path is not canonical.');
    return path;
  }
  load(documentPath) {
    documentPath = canonicalPath(documentPath, { extensions: ['.numbers'], roots: this.roots });
    const path = this.path(documentPath);
    if (!existsSync(path)) return { path, hash: null, manifest: { version: 1, document_path: documentPath, revision: randomUUID(), bindings: [] } };
    if (!lstatSync(path).isFile() || lstatSync(path).size > 128 * 1024) throw new NativeError('INVALID_CHART_METADATA', 'Invalid or oversized chart companion file.');
    const raw = readFileSync(path, 'utf8');
    let manifest;
    try { manifest = manifestSchema.parse(JSON.parse(raw)); }
    catch { throw new NativeError('INVALID_CHART_METADATA', 'Chart companion metadata is invalid. Do not recreate bindings by guessing.'); }
    if (manifest.document_path !== documentPath) throw new NativeError('METADATA_DOCUMENT_MISMATCH', 'The companion belongs to another path. Clone with numbers_from_template or register the known source again.');
    return { path, hash: digest(raw), manifest };
  }
  save(state) {
    const { path, manifest, hash } = state;
    this.path(manifest.document_path);
    if ((existsSync(path) ? digest(readFileSync(path, 'utf8')) : null) !== hash) throw new NativeError('METADATA_CONFLICT', 'Chart metadata changed during this operation. Inspect the document before retrying.');
    manifest.revision = randomUUID();
    const data = JSON.stringify(manifestSchema.parse(manifest), null, 2) + '\n';
    if (Buffer.byteLength(data, 'utf8') > 128 * 1024) throw new NativeError('CHART_METADATA_LIMIT', 'Chart companion would exceed its 128 KiB limit.');
    if (!hash) writeFileSync(path, data, { flag: 'wx', mode: 0o600 });
    else {
      const temporary = path + '.' + randomUUID() + '.tmp';
      try { writeFileSync(temporary, data, { flag: 'wx', mode: 0o600 }); renameSync(temporary, path); }
      finally { if (existsSync(temporary)) unlinkSync(temporary); }
    }
    state.hash = digest(data);
    return path;
  }
  add(state, binding, replace) {
    const targets = replace ? state.manifest.bindings.filter(b => b.id === replace || b.label === replace) : [];
    if (replace && targets.length !== 1) throw new NativeError('BINDING_NOT_FOUND', 'Choose one existing binding to refresh.');
    const old = targets[0];
    if (state.manifest.bindings.some(b => b.label === binding.label && b.id !== old?.id)) throw new NativeError('BINDING_NAME_EXISTS', 'Choose a unique chart binding label.');
    const saved = bindingSchema.parse({ ...binding, id: old?.id ?? randomUUID() });
    if (old) state.manifest.bindings[state.manifest.bindings.indexOf(old)] = saved;
    else state.manifest.bindings.push(saved);
    this.save(state);
    return saved;
  }
}
