import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NumbersBridge } from './bridge.mjs';
import { NumbersTools, tools } from './tools.mjs';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')).version;

export function createServer({ bridge = new NumbersBridge(), roots } = {}) {
  const server = new McpServer({ name: 'numbers-native', version }, {
    maxToolInputElements: 15000,
    instructions: 'Use Apple Numbers directly. Call numbers_status first. Use explicit document IDs and table-relative ranges; read before editing. Writes preserve compatible native base formats. Strings are literal; formulas need explicit objects. For multi-table edits and CSV/TSV imports use preview and the identical request with expected_revision. Inspect native post-checks: failed validation does not roll back edits. Import types/separators are explicit and keys compare exact typed values. For chart documents read profiles, respect fixed axes and known source mappings. Guided updates default to preview: apply the identical request with its expected_revision only after checking the changes. Companions record known bindings, not private reference introspection. Custom .numbers prototypes are copied without saving the source. Mutations can partially apply; never automatically retry errors/timeouts. No Excel conversion or Accessibility helper.'
  });
  const service = new NumbersTools(bridge, { roots });
  for (const spec of tools) server.registerTool(spec.name, {
    description: spec.description, inputSchema: spec.schema, annotations: spec.annotations
  }, async args => {
    try {
      const result = await service.execute(spec.name, args);
      if (['status', 'diagnostics'].includes(spec.action)) result.plugin_version = version;
      const content = [];
      const previews = spec.action === 'preview' ? [result] : result.visual_check ? [result.visual_check.before, result.visual_check.after] : [];
      for (const preview of previews.filter(Boolean)) {
        try {
          const data = readFileSync(preview.image_path);
          if (data.length <= 10 * 1024 * 1024) content.push({ type: 'image', mimeType: 'image/png', data: data.toString('base64') });
          else (result.inline_preview_notices ??= []).push({ path: preview.image_path, reason: 'Image exceeds 10 MiB; inspect the saved file.' });
        } catch (e) { (result.inline_preview_notices ??= []).push({ path: preview.image_path, reason: e.code ?? 'IMAGE_READ_FAILED' }); }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }, ...content], structuredContent: result };
    } catch (e) {
      const error = { code: e.code ?? 'INVALID_ARGUMENT', message: e.message, ...(e.details ? { details: e.details } : {}) };
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error }) }] };
    }
  });
  return server;
}
