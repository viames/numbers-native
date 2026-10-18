import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const worker = fileURLToPath(new URL('../native/worker.js', import.meta.url));
const formatWorker = fileURLToPath(new URL('../native/read-formats.applescript', import.meta.url));
const lock = join(tmpdir(), `numbers-native-${process.getuid?.() ?? 'user'}.lock`);

export class NativeError extends Error {
  constructor(code, message, details = {}) { super(message); this.code = code; this.details = details; }
}

// Every native call is serialized, including reads: they must observe completed writes.
export class NumbersBridge {
  #tail = Promise.resolve();
  #uncertain = false;
  constructor({ timeout = 120_000, spawnProcess = spawn, platform = process.platform, lockPath = lock } = {}) {
    this.timeout = timeout;
    this.spawnProcess = spawnProcess;
    this.platform = platform;
    this.lockPath = lockPath;
  }
  call(action, args = {}) {
    return this.exclusive(session => session.call(action, args));
  }
  // Serialize a multi-step native workflow AND its local companion metadata.
  // This is a cooperative lock, not a Numbers transaction or rollback.
  exclusive(task) {
    const next = this.#tail.then(() => this.#withLock(task));
    this.#tail = next.catch(() => {});
    return next;
  }
  async #withLock(task) {
    const lock = this.lockPath;
    if (this.platform !== 'darwin') throw new NativeError('MACOS_REQUIRED', 'Apple Numbers automation requires macOS.');
    if (this.#uncertain) throw new NativeError('STATE_UNCERTAIN', 'A native call timed out. Inspect Numbers manually before restarting this MCP server. Do not retry the mutation automatically.');
    try { mkdirSync(lock, { mode: 0o700 }); }
    catch {
      let owner;
      try { owner = Number(readFileSync(join(lock, 'pid'), 'utf8')); } catch {}
      let alive = true;
      if (owner > 0) { try { process.kill(owner, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; } }
      if (alive) throw new NativeError('NUMBERS_BUSY', 'Another Numbers Native server is operating on Numbers. Wait for it to finish.');
      // Never race another process to reclaim a stale directory lock.
      throw new NativeError('STALE_LOCK', 'A previous Numbers Native process exited without releasing its lock. Verify that no operation is running, then remove the stale lock.', { lock });
    }
    writeFileSync(join(lock, 'pid'), String(process.pid), { mode: 0o600 });
    try {
      return await task({ call: (action, args = {}) => this.#invoke(action, args), readFormats: args => this.#readFormats(args) });
    } finally { if (!this.#uncertain && existsSync(lock)) rmSync(lock, { recursive: true }); }
  }
  async #invoke(action, args) {
    if(this.#uncertain) throw new NativeError('STATE_UNCERTAIN', 'Stop mutations and inspect Numbers before restarting the bridge.');
      const inputArgs = action === 'write' ? { ...args, _write_formats: await this.#readFormats(args) } : args;
      if (action === 'write' && args._expected_formats && JSON.stringify(args._expected_formats) !== JSON.stringify(inputArgs._write_formats)) throw new NativeError('WORKFLOW_REVISION_CHANGED', 'Target base formats changed before this write. Earlier workflow writes may have applied; inspect before retrying.');
      if (action === 'write' && args.preserve_format !== false) {
        const values = args.values.flat();
        if (inputArgs._write_formats.some((f, i) => f === 'other' && (values[i] === null || typeof values[i] === 'number' || values[i]?.formula))) throw new NativeError('UNSUPPORTED_NATIVE_FORMAT', 'A cell has an unrecognized native format. Inspect it or explicitly choose preserve_format=false before changing its type.');
      }
      const result = await new Promise((resolve, reject) => {
        const child = this.spawnProcess('/usr/bin/osascript', ['-l', 'JavaScript', worker], { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
        let output = '', errorOutput = '', timedOut = false;
        const timer = setTimeout(() => { timedOut = true; this.#uncertain = true; child.kill('SIGKILL'); }, this.timeout);
        child.stdout.on('data', d => {
          output += d;
          if (output.length > 16 * 1024 * 1024) { this.#uncertain = true; child.kill('SIGKILL'); }
        });
        child.stderr.on('data', d => { errorOutput = (errorOutput + d).slice(-3000); });
        child.on('error', e => { clearTimeout(timer); reject(e); });
        child.stdin.on('error', () => {});
        child.on('close', code => {
          clearTimeout(timer);
          if (timedOut) return reject(new NativeError('NATIVE_TIMEOUT', 'Numbers did not finish within the time limit. The operation may have partially completed. Inspect the document before restarting the server.'));
          if (this.#uncertain) return reject(new NativeError('NATIVE_OUTPUT_LIMIT', 'Native response exceeded the output limit; document state is uncertain.'));
          if (code !== 0) { this.#uncertain = true; return reject(new NativeError('NATIVE_PROCESS_FAILED', 'The native automation process failed. Inspect Numbers before restarting the bridge.', { diagnostic: errorOutput })); }
          try {
            const response = JSON.parse(output);
            if (!response.ok) {
              if (response.error.code === 'APPLE_EVENT_TIMEOUT') this.#uncertain = true;
              return reject(new NativeError(response.error.code, response.error.message, response.error.details));
            }
            resolve(response.result);
          } catch (e) { this.#uncertain = true; reject(new NativeError('INVALID_NATIVE_RESPONSE', 'Numbers returned an unreadable response. Inspect the document before retrying.', { diagnostic: e.message })); }
        });
        // JSON travels as data over stdin. Never interpolate document content into scripts or shell commands.
        child.stdin.end(JSON.stringify({ action, args: inputArgs }));
      });
      const cells = result.cells?.flat();
      if (cells?.some(c => c.format === null) || (action === 'format' && result.format === null)) {
        // JXA drops the 'text' and 'number' type descriptors. Read their exact identity
        // with a fixed AppleScript helper; do not infer a format from cell content.
        const formats = await this.#readFormats(args);
        if (cells) {
          if (formats.length !== cells.length) throw new NativeError('FORMAT_READBACK_MISMATCH', 'Native format readback changed size. Inspect the range.');
          cells.forEach((cell, i) => { if (cell.format === null && formats[i] !== 'other') cell.format = formats[i]; });
        } else if (formats.every(f => f === formats[0]) && formats[0] !== 'other') result.format = formats[0];
      }
      if (result.format_expectations && cells) {
        const mismatch = cells.findIndex((c, i) => result.format_expectations[i] && c.format !== result.format_expectations[i]);
        if (mismatch >= 0) throw new NativeError('FORMAT_PRESERVATION_FAILED', 'The value was written but its native base format did not match. Inspect the range.', { address: cells[mismatch].address, expected: result.format_expectations[mismatch], actual: cells[mismatch].format });
        result.formats_verified = true;
        delete result.format_expectations;
      }
      return result;
  }
  #readFormats(args) {
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess('/usr/bin/osascript', [formatWorker, args.document_id, typeof args.sheet === 'number' ? 'index' : 'name', String(args.sheet), typeof args.table === 'number' ? 'index' : 'name', String(args.table), args.range], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let output = '', timedOut = false;
      const timer = setTimeout(() => { timedOut = true; this.#uncertain = true; child.kill('SIGKILL'); }, this.timeout);
      child.stdout.on('data', d => { output += d; });
      child.stderr.on('data', () => {});
      child.on('error', e => { clearTimeout(timer); reject(e); });
      child.on('close', code => {
        clearTimeout(timer);
        if (timedOut) return reject(new NativeError('NATIVE_TIMEOUT', 'Format readback timed out. Earlier edits may have applied. Inspect Numbers before restarting.'));
        if (code !== 0) return reject(new NativeError('FORMAT_READBACK_FAILED', 'Native format readback failed. Earlier edits may have applied. Inspect the range.'));
        const formats = output.trim().split('\t');
        if (!formats.every(f => ['text', 'number', 'other', 'automatic', 'currency', 'percent', 'date and time', 'duration', 'fraction', 'scientific', 'checkbox', 'rating', 'slider', 'stepper', 'pop up menu'].includes(f))) return reject(new NativeError('FORMAT_READBACK_FAILED', 'Unexpected native format response.'));
        resolve(formats);
      });
    });
  }
}
