import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../plugins/numbers-native/src/server-factory.mjs';
import { tools } from '../plugins/numbers-native/src/tools.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('official MCP client initializes, discovers schemas, calls tools and receives errors', async () => {
  const calls = [];
  const bridge = { async call(action, args) { calls.push({ action, args }); return { result: 'native-test', action }; } };
  const server = createServer({ bridge, roots: [] });
  const client = new Client({ name: 'numbers-contract-test', version: '1.0.0' });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s); await client.connect(c);
  try {
    const listed = await client.listTools();
    assert.equal(listed.tools.length, tools.length);
    const write = listed.tools.find(t => t.name === 'numbers_write');
    assert.equal(write.inputSchema.additionalProperties, false);
    assert.equal(write.annotations.destructiveHint, true);
    const r = await client.callTool({ name: 'numbers_status', arguments: {} });
    assert.equal(r.structuredContent.result, 'native-test');
    assert.equal(calls[0].args.launch, false);
    const invalid = await client.callTool({ name: 'numbers_read', arguments: { document_id: 'd', sheet: 1, table: 1, range: 'A1:A2001' } });
    assert.equal(invalid.isError, true); assert.ok(invalid.content[0].text.includes('CELL_LIMIT'));
    const unknown = await client.callTool({ name: 'numbers_save', arguments: { document_id: 'd', extra: true } });
    assert.equal(unknown.isError, true);
    assert.equal(calls.length, 1);
  } finally { await client.close(); await server.close(); }
});
test('official MCP client receives inline PNG previews without base64 in structured metadata', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'numbers-mcp-image-'));
  const bytes = Buffer.from('89504e470d0a1a0a', 'hex');
  const bridge = { async call(action, args) { assert.equal(action, 'preview'); writeFileSync(args.image_path, bytes); return { image_path: args.image_path, pdf_path: args.path, renderer: 'native-contract-test' }; } };
  const server = createServer({ bridge, roots: [] }), client = new Client({ name: 'image-client', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
  try {
    const r = await client.callTool({ name: 'numbers_preview', arguments: { document_id: 'd', path: join(directory, 'preview.pdf') } });
    assert.ok(!r.isError); assert.equal(r.content[1].type, 'image'); assert.equal(r.content[1].mimeType, 'image/png');
    assert.deepEqual(Buffer.from(r.content[1].data, 'base64'), bytes); assert.equal(r.structuredContent.renderer, 'native-contract-test'); assert.ok(!JSON.stringify(r.structuredContent).includes(bytes.toString('base64')));
  } finally { await client.close(); await server.close(); }
});
test('failed inline attachment reports a notice instead of hiding a completed native result', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'numbers-mcp-image-notice-'));
  const server = createServer({ bridge: { async call(action, args) { return { image_path: args.image_path, pdf_path: args.path, completed: true }; } }, roots: [] });
  const client = new Client({ name: 'image-notice-client', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
  try {
    const r = await client.callTool({ name: 'numbers_preview', arguments: { document_id: 'd', path: join(directory, 'missing.pdf') } });
    assert.ok(!r.isError); assert.equal(r.structuredContent.completed, true); assert.equal(r.structuredContent.inline_preview_notices.length, 1); assert.equal(r.content.length, 1);
  } finally { await client.close(); await server.close(); }
});
