import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NumbersBridge } from '../plugins/numbers-native/src/bridge.mjs';
import { NumbersTools } from '../plugins/numbers-native/src/tools.mjs';

const directory = mkdtempSync(join(tmpdir(), 'numbers-native-style-'));
const service = new NumbersTools(new NumbersBridge(), { roots: [directory] });
const call = (action, args = {}) => service.execute('numbers_' + action, args);
const path = join(directory, 'Object styling.numbers');
let id;
try {
  id = (await call('create', { path })).document_id;
  const s = { document_id: id, sheet: 1 };
  let result = await call('object', { ...s, action: 'create', kind: 'text', text: 'Titolo nativo', font_name: 'Helvetica-Bold', font_size: 18, text_color: [10000, 20000, 30000], opacity: 80, rotation: 5, reflection: true, reflection_value: 20, x: 400, y: 60, width: 250, height: 100 });
  let text = result.objects.find(o => o.kind === 'text');
  assert.equal(text.font_name, 'Helvetica-Bold'); assert.equal(text.font_size, 18);
  const nearColor = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= 2, 'Native 16-bit color rounding exceeds two units.'));
  nearColor(text.text_color, [10000, 20000, 30000]);
  assert.equal(text.opacity, 80); assert.equal(text.rotation, 5); assert.equal(text.reflection, true); assert.equal(text.reflection_value, 20);
  await call('object', { ...s, action: 'update', kind: 'text', object: text.index, text: 'Titolo aggiornato', font_size: 22, reflection: false });
  const table = { ...s, table: 1 };
  const colors = await call('format', { ...table, range: 'A1:B2', text_color: [12000, 22000, 32000], background_color: [40000, 45000, 50000] });
  nearColor(colors.text_color, [12000, 22000, 32000]); nearColor(colors.background_color, [40000, 45000, 50000]);
  await call('save', { document_id: id }); await call('close', { document_id: id }); id = null;
  id = (await call('open', { path })).document_id;
  result = await call('objects', { document_id: id, sheet: 1 });
  text = result.objects.find(o => o.kind === 'text');
  assert.equal(text.text, 'Titolo aggiornato'); assert.equal(text.font_size, 22); assert.equal(text.reflection, false); assert.equal(text.rotation, 5);
  console.log(JSON.stringify({ passed: true, checks: ['native font, size and 16-bit RGB readback', 'opacity, rotation and reflection', 'text update and styling', 'cell text/fill RGB normalization', 'save/reopen persistence'] }, null, 2));
} finally { if (id) await call('close', { document_id: id }); }
