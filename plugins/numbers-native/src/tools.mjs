import { z } from 'zod';
import { canonicalPath, configuredRoots, parseRange, columnName } from './paths.mjs';
import { NativeError } from './bridge.mjs';
import { chartProfiles } from './chart-profiles.mjs';
import { BindingStore } from './bindings.mjs';
import { registerChart, guidedUpdate } from './guided.mjs';
import { copyNativePrototype } from './native-files.mjs';
import { backupPair, restorePair, movePair } from './pairs.mjs';
import { previewPaths, visualPaths } from './previews.mjs';
import { compatibilityReport } from './compatibility.mjs';
import { edit, checks, consistency, rangeTarget, mapping } from './workflow-schemas.mjs';
import { runEdit, runCheck } from './workflows.mjs';
import { runImport } from './imports.mjs';

const text = z.string().min(1).max(1000);
const index = z.number().int().min(1);
const ref = z.union([text, index]).describe('Exact name or 1-based index. Duplicate names are rejected; use an index.');
const doc = { document_id: text.describe('Native document ID returned by open/create/documents. Never a frontmost-document shortcut.') };
const sheet = { ...doc, sheet: ref };
const table = { ...sheet, table: ref };
const a1 = z.string().regex(/^[A-Z]{1,3}[1-9][0-9]*(?::[A-Z]{1,3}[1-9][0-9]*)?$/);
const range = { ...table, range: a1 };
const color = z.array(z.number().int().min(0).max(65535)).length(3);
const geometry = { x: z.number().finite().optional(), y: z.number().finite().optional(), width: z.number().positive().max(10000).optional(), height: z.number().positive().max(10000).optional(), locked: z.boolean().optional() };
const value = z.union([
  z.string().max(32768), z.number().finite(), z.boolean(), z.null(),
  z.strictObject({ formula: z.string().min(2).max(32768).startsWith('=') }),
  z.strictObject({ date: z.iso.datetime({ offset: true }) })
]);
const formats = ['automatic', 'text', 'number', 'currency', 'percent', 'date and time', 'duration', 'fraction', 'scientific', 'checkbox', 'rating', 'slider', 'stepper', 'pop up menu', 'numeral system'];
const definitions = [];
function tool(name, description, shape, { read = false, destructive = !read } = {}) {
  definitions.push({ name: `numbers_${name}`, action: name, description, schema: z.strictObject(shape), annotations: { readOnlyHint: read, destructiveHint: destructive, idempotentHint: read, openWorldHint: false } });
}

tool('status', 'Check macOS, Numbers, native capabilities and limits. launch=true starts Numbers and tests Automation permission. No document edits.', { launch: z.boolean().default(false) }, { read: true });
tool('diagnostics', 'Report local Node/macOS/Numbers/locale/PDFKit capabilities and verified chart-version/template availability. launch=true tests Automation and reads installed template IDs; it creates no test documents. Unknown availability remains unknown. Does not claim another Mac/version was tested.', { launch: z.boolean().default(false) }, { read: true });
tool('edit', 'Preview or apply guarded cell edits across existing tables in ONE document. Max 20 nonoverlapping edits/2,000 written cells, 5,000 inspected cells. Apply the identical request with expected_revision. Reports formula overwrites and post-checks using native Numbers results. No formula translation, rollback or transaction; failed post-checks do not undo edits.', { ...doc, edits: z.array(edit).min(1).max(20), checks, ...consistency });
tool('check', 'Read-only native value/formula checks: required, unique, formula presence, numeric bounds, equality and balances. Explicit ranges/checks only, at most 5,000 inspected cells, 2,000 per range. Missing formula results are suspected errors; no complete dependency analysis.', { ...doc, ranges: z.array(rangeTarget).max(20).default([]), checks }, { read: true });
tool('import', 'Preview/apply UTF-8 CSV/TSV into an existing native table using explicit header/type mappings. append or exact typed-key upsert, no deletion. Source bytes and target snapshot must match expected_revision. One header, no footer/filter, target <=2,000 cells including growth, <=2,000 written cells. Strings remain literal; formulas protected by default. No automatic formula fill or certified chart-reference growth.', { ...table, source_path: text, delimiter: z.enum(['auto', ',', ';', '\t']).default('auto'), mode: z.enum(['append', 'upsert']), key_column: text.optional(), mapping: z.array(mapping).min(1).max(20), overwrite_formulas: z.boolean().default(false), checks, ...consistency });
tool('preview', 'Export the current document to a NEW PDF path and render one page to a NEW sibling PNG using macOS PDFKit. Returns native image content for inspection without Poppler or UI automation. Page is PDF-page index, not sheet index. Does not certify chart references. Existing files are not overwritten.', { ...doc, path: text, page: index.default(1), max_dimension: z.number().int().min(400).max(2400).default(1200) }, { destructive: false });
tool('restore', 'Restore a native .numbers backup AND its chart companion to a NEW path, opening the recovered copy. Backup remains untouched; no overwrite of an existing document. Stale known bindings are reported, never silently repaired.', { backup_path: text, path: text }, { destructive: false });
tool('move', 'Move/rename an identified native document AND its chart companion to a NEW path. Saves/closes only that source, copies/verifies both files, opens destination, then removes originals only if unchanged and still closed. Returns new document ID. Partial failures retain recoverable copies; no automatic retry.', { ...doc, path: text });
tool('documents', 'List open Numbers documents with native IDs and paths. Does not open files.', {}, { read: true });
tool('templates', 'List installed Numbers template IDs and localized names.', {}, { read: true });
tool('create', 'Create and immediately save a native .numbers document at a new absolute path, optionally from a template ID. Does not overwrite.', { path: text, template_id: text.optional() }, { destructive: false });
tool('from_template', 'Create a NEW native document by copying an existing .numbers prototype file/package and opening the copy. Never saves/changes the source; save or close an open modified prototype first. Preserves native objects/styles/formulas. Copies valid chart companion bindings by default; no automatic discovery of unknown chart references.', { template_path: text, path: text, copy_bindings: z.boolean().default(true) }, { destructive: false });
tool('chart_bind', 'Register a KNOWN existing chart/source-table relationship for guided updates. Does not create a link or introspect series references. Verify the source visually first. Whole source table, one header row, no footer/filter; 500 cells max. Writes a .numbers-native.json companion. replace_binding explicitly refreshes an existing binding ID/label.', { ...table, range: a1, chart_sheet: ref.optional(), chart: index, label: text, orientation: z.enum(['columns', 'rows', 'xy', 'xyz']).default('columns'), replace_binding: text.optional() }, { destructive: false });
tool('chart_bindings', 'List saved chart/source bindings from this document companion. These record known relationships, not a discovery of private chart-series references. Updates recheck source/structure.', doc, { read: true });
tool('chart_update', 'Preview (default) or apply a guided source update. Apply requires expected_revision of the SAME request. Optional visual_check before_path/after_path generates native PDF+PNG pairs only on apply. Inspect returned images; no automatic claim that private chart references are correct. Native formats preserved. No type/style/reference editing.', { ...doc, binding: text, mode: z.enum(['replace', 'append', 'series']), headers: z.array(z.string().max(1000)).min(2).max(11).optional(), data: z.array(z.array(z.union([z.string().max(1000), z.number().finite()])).min(2).max(11)).min(1).max(100).optional(), series: text.optional(), values: z.array(z.number().finite()).min(1).max(100).optional(), preview: z.boolean().default(true), expected_revision: z.string().regex(/^[a-f0-9]{64}$/).optional(), visual_check: z.strictObject({ before_path: text, after_path: text }).optional() });
tool('chart_profiles', 'List verified native template chart profiles, data orientation and limits. Availability depends on installed Numbers templates; no document access.', {}, { read: true });
tool('chart_create', 'Create a NEW .numbers document with one template-linked chart and populated source table. Registers a guided binding in a local companion by default. Use chart_profiles first. Rows: category plus numeric series; scatter X,Y; bubble X,Y,size. Dual-axis/scatter/bubble have FIXED weather/fuel/sales axes: use matching meanings. Template type/styles/internal title remain; title is separate text. Max 100 points, profile-specific series, 500 cells.', { path: text, profile: z.enum(chartProfiles.map(p => p.id)), headers: z.array(text).min(2).max(11), data: z.array(z.array(z.union([z.string().max(1000), z.number().finite()])).min(2).max(11)).min(1).max(100), title: text.optional(), managed: z.boolean().default(true) }, { destructive: false });
tool('open', 'Open an existing .numbers file in Numbers; return its ID. No conversion, no support for encrypted-file password prompts.', { path: text }, { destructive: false });
tool('inspect', 'Inspect sheets, tables, dimensions and object counts of one document. Does not read every cell.', doc, { read: true });
tool('save', 'Save changes to the existing native Numbers file. Numbers also autosaves edits.', doc);
tool('close', 'Close this specific document. Saves by default; save=false explicitly discards unsaved changes.', { ...doc, save: z.boolean().default(true) });
tool('backup', 'Save the source document, then copy and verify the native file/package AND any valid chart companion to a NEW .numbers path. Keeps the source open and retargets copied metadata. Never overwrites files.', { ...doc, path: text }, { destructive: false });
tool('export', 'Export a document using Numbers itself to PDF or CSV at a NEW path. Native source remains .numbers. CSV can produce multiple files for multiple tables.', { ...doc, path: text, format: z.enum(['pdf', 'csv']) }, { destructive: false });
tool('sheet', 'Create, rename, delete or activate a sheet. Create needs name; other actions need sheet. Deleting a sheet removes all its contents.', { ...doc, action: z.enum(['create', 'rename', 'delete', 'activate']), sheet: ref.optional(), name: text.optional() });
tool('table', 'Create, rename, delete or configure a table. Configure can resize (shrinking removes cells), set headers/footers, freeze headers and move the table.', { ...sheet, action: z.enum(['create', 'rename', 'delete', 'configure']), table: ref.optional(), name: text.optional(), rows: index.max(1000000).optional(), columns: index.max(1000).optional(), header_rows: z.number().int().min(0).max(5).optional(), header_columns: z.number().int().min(0).max(5).optional(), footer_rows: z.number().int().min(0).max(5).optional(), freeze_header_rows: z.boolean().optional(), freeze_header_columns: z.boolean().optional(), ...geometry });
tool('read', 'Read a bounded table-relative A1 range: native values, formatted text, formulas and formats. Max 2,000 cells; paginate larger tables.', range, { read: true });
tool('write', 'Write a rectangular matrix; preserve compatible native base formats by default and return readback. Strings are literal text; formulas use {formula:"=SUM(A2:A4)"}; dates use {date:ISO-8601}; null clears a value. Explicit strings/dates/booleans choose their type format. Custom format details are not exposed. Max 2,000 cells. Not atomic.', { ...table, start: a1, values: z.array(z.array(value).min(1).max(1000)).min(1).max(2000), preserve_format: z.boolean().default(true) });
tool('format', 'Format a range using native properties. Colors are RGB arrays in 0..65535. Number-format subtype only: decimal precision, currency symbol, pop-up options and border editing are not exposed.', { ...range, format: z.enum(formats).optional(), font_name: text.optional(), font_size: z.number().min(1).max(1000).optional(), text_color: color.optional(), background_color: color.optional(), alignment: z.enum(['auto align', 'left', 'center', 'right', 'justify']).optional(), vertical_alignment: z.enum(['top', 'center', 'bottom']).optional(), text_wrap: z.boolean().optional() });
tool('clear', 'Clear values only, or values AND styling, in a bounded range. Max 2,000 cells.', { ...range, styling: z.boolean().default(false) });
tool('merge', 'Merge or unmerge a bounded native range. Merging may discard non-leading cell content.', { ...range, action: z.enum(['merge', 'unmerge']) });
tool('sort', 'Sort a native table by one 1-based column index. Headers/footers are handled by Numbers.', { ...table, column: index.max(1000), direction: z.enum(['ascending', 'descending']).default('ascending') });
tool('transpose', 'Transpose a native table; Numbers manages formula references. Changes table structure.', table);
tool('axis', 'Insert or delete rows/columns. at and count are 1-based; insert occurs before at. Deletion removes cell content.', { ...table, axis: z.enum(['row', 'column']), action: z.enum(['insert', 'delete']), at: index, count: index.max(100) });
tool('dimensions', 'Set height of rows or width of columns over a 1-based inclusive index interval.', { ...table, axis: z.enum(['row', 'column']), first: index, last: index, size: z.number().positive().max(10000) });
tool('selection', 'Read selection ranges, or select a range in an explicitly identified table. Selecting changes the active sheet.', { ...doc, sheet: ref.optional(), table: ref.optional(), range: a1.optional() }, { destructive: false });
tool('find', 'Search native formatted text or formulas within a bounded range. Literal text matching; max 2,000 cells and 100 hits.', { ...range, query: text, case_sensitive: z.boolean().default(false), in_formulas: z.boolean().default(false) }, { read: true });
tool('objects', 'List existing charts/images/shapes/text items/lines/groups and their native geometry on one sheet. No chart data or series API is exposed by Numbers.', sheet, { read: true });
tool('object', 'Create a text item, shape or image; update native geometry, font/color, opacity, rotation and reflection where supported, or delete an object. Charts currently expose geometry only.', { ...sheet, action: z.enum(['create', 'update', 'delete']), kind: z.enum(['text', 'shape', 'image', 'chart', 'line', 'group']), object: index.optional(), text: z.string().max(32768).optional(), image_path: text.optional(), font_name: text.optional(), font_size: z.number().min(1).max(1000).optional(), text_color: color.optional(), opacity: z.number().int().min(0).max(100).optional(), rotation: z.number().int().min(0).max(359).optional(), reflection: z.boolean().optional(), reflection_value: z.number().min(0).max(100).optional(), ...geometry });

export const tools = definitions;

export class NumbersTools {
  constructor(bridge, { roots = configuredRoots() } = {}) { this.bridge = bridge; this.roots = roots; }
  async execute(name, input) {
    const spec = definitions.find(t => t.name === name);
    if (!spec) throw new NativeError('UNKNOWN_TOOL', 'Unknown Numbers tool.');
    const args = spec.schema.parse(input);
    if (['edit', 'check', 'import'].includes(spec.action)) {
      for (const rule of args.checks) if (rule.kind === 'numeric_bounds' && (rule.min === undefined && rule.max === undefined || rule.min !== undefined && rule.max !== undefined && rule.min > rule.max)) throw new NativeError('CHECK_BOUNDS', 'numeric_bounds requires min or max in ascending order.');
      if (spec.action === 'import') {
        if (args.mode === 'upsert' && !args.key_column || args.mode === 'append' && args.key_column !== undefined) throw new NativeError('IMPORT_KEY', 'key_column is required for upsert and not used for append.');
        for (const m of args.mapping) if (m.type === 'number' && m.group_separator === m.decimal_separator) throw new NativeError('IMPORT_NUMBER_FORMAT', 'Decimal and group separators must differ.');
        args.source_path = canonicalPath(args.source_path, { extensions: ['.csv', '.tsv'], mustExist: true, roots: this.roots });
      }
    }
    if (spec.action === 'chart_profiles') return { profiles: chartProfiles, input_layout: 'Each input row is one point/category; headers name the category/X column and numeric series/Y/size columns. Row-oriented templates are transposed internally.', limits: { cells_including_headers: 500, arbitrary_existing_document_insertion: false, change_type: false, edit_series_references: false, edit_chart_title: false, title_is_separate_text_item: true, accessibility: false } };
    if (spec.action === 'chart_create') {
      const profile = chartProfiles.find(p => p.id === args.profile);
      const series = args.headers.length - 1;
      if (series < profile.min_series || series > profile.max_series) throw new NativeError('CHART_SERIES_LIMIT', `Profile ${profile.id} needs ${profile.min_series}..${profile.max_series} numeric columns after the first column.`);
      if (args.data.some(row => row.length !== args.headers.length)) throw new NativeError('RAGGED_MATRIX', 'Every chart data row must match headers.');
      if ((args.data.length + 1) * args.headers.length > 500) throw new NativeError('CHART_CELL_LIMIT', 'Chart creation supports at most 500 cells including headers. Use fewer points or series.');
      const numericFirst = ['xy', 'xyz'].includes(profile.orientation);
      if (args.data.some(row => row.some((v, i) => (i > 0 || numericFirst) && typeof v !== 'number'))) throw new NativeError('CHART_NUMERIC_DATA', 'Series, X, Y and size cells must be finite numbers. Only category cells may be text.');
      if (['pie', 'donut'].includes(profile.id) && (args.data.some(row => row[1] < 0) || !args.data.some(row => row[1] > 0))) throw new NativeError('CHART_VALUES', 'Pie/donut values must be nonnegative with at least one positive value.');
      if (profile.id === 'bubble' && args.data.some(row => row[2] <= 0)) throw new NativeError('CHART_VALUES', 'Bubble sizes must be positive.');
      args._chart_profile = profile;
    }
    if (['sheet', 'table'].includes(spec.action)) {
      if (['create', 'rename'].includes(args.action) && !args.name) throw new NativeError('NAME_REQUIRED', 'This action requires a name.');
      if (args.action !== 'create' && args[spec.action] === undefined) throw new NativeError('TARGET_REQUIRED', `This action requires an explicit ${spec.action}.`);
    }
    if (spec.action === 'selection' && args.range && (args.sheet === undefined || args.table === undefined)) throw new NativeError('TARGET_REQUIRED', 'Selecting cells requires both sheet and table.');
    if (spec.action === 'object') {
      if (args.action !== 'create' && !args.object) throw new NativeError('TARGET_REQUIRED', 'This action requires an object index.');
      if (args.action === 'create' && !['text', 'shape', 'image'].includes(args.kind)) throw new NativeError('UNSUPPORTED', 'Only text, shape and image creation are supported.');
      if (args.action === 'create' && args.kind === 'image' && !args.image_path) throw new NativeError('IMAGE_PATH_REQUIRED', 'Image creation requires image_path.');
      if (args.kind === 'group' && args.locked !== undefined) throw new NativeError('UNSUPPORTED', 'Group locking is not exposed by the native dictionary.');
      if (args.text !== undefined && !['text', 'shape'].includes(args.kind)) throw new NativeError('UNSUPPORTED', 'Only text items and shapes expose object text.');
      if (['font_name', 'font_size', 'text_color'].some(k => args[k] !== undefined) && !['text', 'shape'].includes(args.kind)) throw new NativeError('UNSUPPORTED', 'Native rich-text styling is available for text items and shapes.');
      if (args.opacity !== undefined && !['text', 'shape', 'image'].includes(args.kind)) throw new NativeError('UNSUPPORTED', 'Opacity is available for text items, shapes and images.');
      if (args.rotation !== undefined && !['text', 'shape', 'image', 'line', 'group'].includes(args.kind)) throw new NativeError('UNSUPPORTED', 'This object kind does not expose native rotation.');
      if ((args.reflection !== undefined || args.reflection_value !== undefined) && !['text', 'shape', 'image', 'line'].includes(args.kind)) throw new NativeError('UNSUPPORTED', 'This object kind does not expose native reflection.');
    }
    if (args.range) {
      const r = parseRange(args.range);
      if (r.count > 2000) throw new NativeError('CELL_LIMIT', 'Use at most 2,000 cells per call. Paginate larger tables.');
    }
    if (spec.action === 'write') {
      const start = parseRange(args.start);
      if (start.count !== 1) throw new NativeError('INVALID_START', 'start must be one cell.');
      const width = args.values[0].length;
      if (args.values.some(r => r.length !== width)) throw new NativeError('RAGGED_MATRIX', 'All rows must contain the same number of values.');
      args.range = `${args.start}:${columnName(start.column + width - 1)}${start.row + args.values.length - 1}`;
      if (parseRange(args.range).count > 2000) throw new NativeError('CELL_LIMIT', 'Use at most 2,000 cells per call.');
    }
    if (args.document_id && this.roots.length) {
      const info = await this.bridge.call('document_info', { document_id: args.document_id });
      if (!info.path) throw new NativeError('PATH_NOT_ALLOWED', 'Unsaved documents are inaccessible while path restrictions are configured.');
      canonicalPath(info.path, { mustExist: true, roots: this.roots });
    }
    if (args.path) args.path = canonicalPath(args.path, {
      extensions: spec.action === 'export' ? [`.${args.format}`] : spec.action === 'preview' ? ['.pdf'] : ['.numbers'],
      mustExist: spec.action === 'open',
      mustBeNew: ['create', 'from_template', 'chart_create', 'backup', 'restore', 'move', 'preview', 'export'].includes(spec.action), roots: this.roots
    });
    if (args.template_path) args.template_path = canonicalPath(args.template_path, { extensions: ['.numbers'], mustExist: true, roots: this.roots });
    if (args.backup_path) args.backup_path = canonicalPath(args.backup_path, { extensions: ['.numbers'], mustExist: true, roots: this.roots });
    if (args.image_path) args.image_path = canonicalPath(args.image_path, { extensions: ['.png', '.jpg', '.jpeg', '.tiff', '.gif', '.heic'], mustExist: true, roots: this.roots });
    if (args.visual_check) args._visual_paths = visualPaths(args.visual_check, this.roots);
    const store = new BindingStore(this.roots);
    if (spec.action === 'edit') return this.bridge.exclusive(session => runEdit(session, args));
    if (spec.action === 'check') return this.bridge.exclusive(session => runCheck(session, args));
    if (spec.action === 'import') return this.bridge.exclusive(session => runImport(session, args));
    if (spec.action === 'backup') return this.bridge.exclusive(session => backupPair(session, store, args));
    if (spec.action === 'restore') return this.bridge.exclusive(session => restorePair(session, store, args));
    if (spec.action === 'move') return this.bridge.exclusive(session => movePair(session, store, args));
    if (spec.action === 'preview') return this.bridge.call('preview', { ...args, ...previewPaths(args.path, this.roots) });
    if (spec.action === 'diagnostics') {
      let native;
      try { native = await this.bridge.call('diagnostics', args); }
      catch (e) {
        if (!['MACOS_REQUIRED', 'NUMBERS_NOT_INSTALLED', 'AUTOMATION_DENIED'].includes(e.code)) throw e;
        return compatibilityReport({ available: false, automation_tested: false, error: { code: e.code, message: e.message } });
      }
      const templates = native.templates; delete native.templates;
      return compatibilityReport(native, templates);
    }
    if (spec.action === 'chart_create' && args.managed) {
      const empty = store.load(args.path);
      if (empty.hash) throw new NativeError('DESTINATION_EXISTS', 'A companion already exists for this new path. Choose a new name.');
      return this.bridge.exclusive(async session => {
        const result = await session.call('chart_create', args);
        try {
          const registered = await registerChart(session, store, { document_id: result.document_id, sheet: 1, table: 1, chart: 1, range: result.chart.source.range, label: 'Main chart' }, { profile: args._chart_profile, provenance: 'verified-template' });
          return { ...result, ...registered };
        } catch (e) { throw new NativeError('CHART_BINDING_INCOMPLETE', 'The chart document was created, but its companion could not be registered. Inspect before retrying.', { document_id: result.document_id, path: result.path, cause: e.code, message: e.message }); }
      });
    }
    if (spec.action === 'chart_bind') return this.bridge.exclusive(session => registerChart(session, store, args));
    if (spec.action === 'chart_bindings') return this.bridge.exclusive(async session => {
      const info = await session.call('document_info', args);
      if (!info.path) throw new NativeError('UNSAVED_DOCUMENT', 'Save before using chart companions.');
      const state = store.load(info.path);
      return { bindings: state.manifest.bindings, companion_path: state.hash ? state.path : null, references_introspected: false };
    });
    if (spec.action === 'chart_update') return this.bridge.exclusive(session => guidedUpdate(session, store, args));
    if (spec.action === 'from_template') return this.bridge.exclusive(async session => {
      const source = args.copy_bindings ? store.load(args.template_path) : null;
      const target = store.load(args.path);
      if (target.hash) throw new NativeError('DESTINATION_EXISTS', 'A chart companion already exists at the new destination.');
      await session.call('template_check', { path: args.template_path });
      copyNativePrototype(args.template_path, args.path);
      let phase = 'open copy', opened;
      try {
        opened = await session.call('open', { path: args.path });
        if (canonicalPath(opened.path, { mustExist: true, roots: this.roots }) !== args.path) throw new NativeError('CLONE_PATH_MISMATCH', 'Numbers opened a different document path.');
        phase = 'chart companions';
        if (source?.manifest.bindings.length) {
          for (const binding of source.manifest.bindings) {
            const context = await session.call('chart_context', { document_id: opened.document_id, binding });
            if (JSON.stringify(context.guard) !== JSON.stringify(binding.guard)) throw new NativeError('BINDING_STALE', 'Prototype bindings do not match the copied structure.');
          }
          target.manifest.bindings = structuredClone(source.manifest.bindings); store.save(target);
        }
        return { ...opened, template_path: args.template_path, source_saved: false, bindings_copied: target.manifest.bindings.length, companion_path: target.hash ? target.path : null };
      } catch (e) { throw new NativeError('TEMPLATE_COPY_INCOMPLETE', `The native copy exists, but ${phase} failed. Inspect before retrying.`, { path: args.path, document_id: opened?.document_id, phase, cause: e.code, message: e.message }); }
    });
    const result = await this.bridge.call(spec.action, args);
    if (spec.action === 'documents' && this.roots.length) result.documents = result.documents.filter(d => {
      try { if (!d.path) return false; canonicalPath(d.path, { mustExist: true, roots: this.roots }); return true; } catch { return false; }
    });
    if (spec.action === 'find') {
      const needle = args.case_sensitive ? args.query : args.query.toLocaleLowerCase();
      const matches = result.cells.flat().filter(c => {
        const text = args.in_formulas ? c.formula ?? '' : c.formatted ?? '';
        return (args.case_sensitive ? text : text.toLocaleLowerCase()).includes(needle);
      });
      return { range: args.range, matches: matches.slice(0, 100), total: matches.length, truncated: matches.length > 100 };
    }
    return result;
  }
}
