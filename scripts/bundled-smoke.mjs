import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const folder = mkdtempSync(join(tmpdir(), 'Numbers Native clean – '));
// Only the distributable plugin is copied. No node_modules in this tree.
cpSync(resolve(process.argv[2] ?? 'plugins/numbers-native'), join(folder, 'plugin'), { recursive: true });
assert.equal(existsSync(join(folder, 'node_modules')), false);
const transport = new StdioClientTransport({ command: process.execPath, args: [join(folder, 'plugin/dist/server.mjs')], cwd: folder });
const client = new Client({ name: 'numbers-native-clean-client', version: '1.0.0' });
await client.connect(transport);
let id;
async function call(name, args = {}) {
  const r = await client.callTool({ name: `numbers_${name}`, arguments: args });
  if (r.isError) throw new Error(r.content[0].text);
  return r.structuredContent;
}
try {
  const list = await client.listTools(); assert.equal(list.tools.length, 38);
  const status = await call('status', { launch: true }); assert.equal(status.automation_tested, true);
  const path = join(folder, 'Clean install.numbers');
  id = (await call('create', { path })).document_id;
  const target = { document_id: id, sheet: 1, table: 1 };
  const written = await call('write', { ...target, start: 'A1', values: [[10, 20, { formula: '=SUM(A1:B1)' }]] });
  assert.equal(written.cells[0][2].value, 30);
  await call('save', { document_id: id }); await call('close', { document_id: id }); id = null;
  id = (await call('open', { path })).document_id;
  assert.equal((await call('read', { document_id: id, sheet: 1, table: 1, range: 'C1' })).cells[0][0].value, 30);
  const result = { passed: true, tools: list.tools.length, native_version: status.numbers_version, clean_path_with_spaces_and_unicode: true, runtime_node_modules_required: false, tested: ['MCP initialize/list/call', 'native create/write/formula/save/close/reopen/read'] };
  if (process.env.NUMBERS_NATIVE_BUNDLE_EVIDENCE) writeFileSync(process.env.NUMBERS_NATIVE_BUNDLE_EVIDENCE, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (id) await call('close', { document_id: id });
  await client.close();
}
