import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NativeError } from './bridge.mjs';
import { columnName } from './paths.mjs';
import { digest } from './bindings.mjs';
import { capture, capturedCells, resolveTable, plannedChanges, applyWrites, evaluate, ruleTargets, same, targetGuard, verifyFinalWrites } from './workflows.mjs';

const fail = (code, message, details) => { throw new NativeError(code, message, details); };
export function parseDelimited(text, delimiter) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\0')) fail('IMPORT_ENCODING', 'NUL is not valid input; provide UTF-8 CSV/TSV.');
  const rows = []; let row = [], field = '', quoted = false, afterQuote = false, fieldStart = true, pending = false;
  function pushField() { row.push(field); field = ''; fieldStart = true; afterQuote = false; if (row.length > 100) fail('IMPORT_LIMIT', 'Use at most 100 source columns.'); }
  function pushRow() { pushField(); rows.push(row); row = []; pending = false; if (rows.length > 501) fail('IMPORT_LIMIT', 'Use at most 500 source records plus one header.'); }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]; pending = true;
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else field += ch;
    } else if (ch === delimiter) pushField();
    else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (ch === '"') { if (!fieldStart || afterQuote) fail('IMPORT_CSV_SYNTAX', 'Unexpected quote in an unquoted CSV field.'); quoted = true; fieldStart = false; }
    else { if (afterQuote) fail('IMPORT_CSV_SYNTAX', 'Only a separator or line ending may follow a closing quote.'); field += ch; fieldStart = false; }
    if (field.length > 32768) fail('IMPORT_LIMIT', 'A source field exceeds 32,768 characters.');
  }
  if (quoted) fail('IMPORT_CSV_SYNTAX', 'Unclosed quoted field.');
  if (pending || row.length || field.length || afterQuote) pushRow();
  if (!rows.length || !rows[0].length) fail('IMPORT_EMPTY', 'A CSV/TSV header is required.');
  const width = rows[0].length;
  if (rows.some(r => r.length !== width)) fail('IMPORT_CSV_SHAPE', 'All CSV/TSV records must have the same number of fields as the header.');
  if (rows[0].some(h => !h.trim()) || new Set(rows[0]).size !== width) fail('IMPORT_HEADERS', 'Source headers must be nonempty and unique.');
  if (rows.length * width > 5000) fail('IMPORT_LIMIT', 'Use at most 5,000 source fields including headers.');
  if (rows.length === 1) fail('IMPORT_EMPTY', 'At least one data record is required.');
  return rows;
}
export function parseSource(path, delimiter = 'auto') {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) fail('IMPORT_LIMIT', 'Use a regular UTF-8 CSV/TSV file of at most 2 MiB.');
  const bytes = readFileSync(path); if (bytes.length > 2 * 1024 * 1024) fail('IMPORT_LIMIT', 'Source grew beyond 2 MiB.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('IMPORT_ENCODING', 'Input must be valid UTF-8, optionally with a BOM.'); }
  let matrix;
  if (delimiter === 'auto') {
    const choices = [];
    for (const d of [',', ';', '\t']) {
      try { const m = parseDelimited(text, d); if (m[0].length > 1) choices.push({ delimiter: d, matrix: m }); } catch {}
    }
    if (choices.length > 1) fail('IMPORT_DELIMITER_AMBIGUOUS', 'Several delimiters are plausible. Choose one explicitly.');
    if (choices.length === 1) ({ delimiter, matrix } = choices[0]);
    else { delimiter = path.toLowerCase().endsWith('.tsv') ? '\t' : ','; matrix = parseDelimited(text, delimiter); }
  } else matrix = parseDelimited(text, delimiter);
  return { matrix, delimiter, sha256: createHash('sha256').update(bytes).digest('hex') };
}
export const SKIP = Symbol('skip empty field');
export function convertField(raw, mapping) {
  if (raw === '') {
    if (mapping.empty === 'error') fail('IMPORT_EMPTY_FIELD', 'An empty field is forbidden by its mapping.');
    return mapping.empty === 'skip' ? SKIP : null;
  }
  if (mapping.type === 'text') return raw;
  const input = raw.trim();
  if (mapping.type === 'number') {
    const decimal = mapping.decimal_separator ?? '.', group = mapping.group_separator === 'space' ? ' ' : mapping.group_separator === 'none' || !mapping.group_separator ? '' : mapping.group_separator;
    if (group && group === decimal) fail('IMPORT_NUMBER_FORMAT', 'Decimal and group separators must differ.');
    let number = input;
    if (group) {
      const escaped = group === '.' ? '\\.' : group;
      const integer = number.split(decimal)[0];
      if (integer.includes(group) && !new RegExp(`^[+-]?\\d{1,3}(?:${escaped}\\d{3})+$`).test(integer)) fail('IMPORT_NUMBER', 'Grouping must use groups of three digits.');
      if (number.split(decimal).slice(1).some(part => part.includes(group))) fail('IMPORT_NUMBER', 'A grouping separator cannot appear in the fractional part.');
      number = number.split(group).join('');
    }
    if (decimal === ',') number = number.replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(number) || !Number.isFinite(Number(number))) fail('IMPORT_NUMBER', 'Invalid number for the declared separators; currency symbols are not inferred.');
    return Number(number);
  }
  if (mapping.type === 'boolean') {
    if (/^(true|1)$/i.test(input)) return true;
    if (/^(false|0)$/i.test(input)) return false;
    fail('IMPORT_BOOLEAN', 'Boolean fields accept true/false or 1/0.');
  }
  let date;
  if (mapping.date_format === 'dd/mm/yyyy' || mapping.date_format === 'yyyy-mm-dd') {
    const m = (mapping.date_format === 'dd/mm/yyyy' ? /^(\d{2})\/(\d{2})\/(\d{4})$/ : /^(\d{4})-(\d{2})-(\d{2})$/).exec(input);
    if (!m) fail('IMPORT_DATE', 'Date does not match its declared format.');
    const y = Number(m[mapping.date_format === 'dd/mm/yyyy' ? 3 : 1]), month = Number(m[2]), day = Number(m[mapping.date_format === 'dd/mm/yyyy' ? 1 : 3]);
    date = new Date(0); date.setUTCFullYear(y, month - 1, day); date.setUTCHours(0, 0, 0, 0);
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) fail('IMPORT_DATE', 'Invalid calendar date.');
  } else {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input)) fail('IMPORT_DATE', 'ISO dates require an explicit time and timezone; choose yyyy-mm-dd for date-only input.');
    date = new Date(input);
    // Date.parse normalizes invalid February days; validate the source calendar too.
    convertField(input.slice(0, 10), { type: 'date', date_format: 'yyyy-mm-dd' });
    if (!Number.isFinite(date.getTime())) fail('IMPORT_DATE', 'Invalid ISO date.');
  }
  return { date: date.toISOString() };
}
export function planImport(doc, snapshot, source, args) {
  const resolved = resolveTable(doc, args), t = resolved.info;
  if (t.header_rows !== 1 || t.footer_rows !== 0 || t.filtered || t.locked) fail('IMPORT_TABLE_LAYOUT', 'Import needs one header row, no footer, no active filter and an unlocked table.');
  const target = { sheet: resolved.sheet, table: resolved.table, range: `A1:${columnName(t.columns)}${t.rows}` };
  const current = capturedCells(snapshot, target), headers = current[0].map(c => c.value);
  if (headers.some(h => typeof h !== 'string' || !h.trim()) || new Set(headers).size !== headers.length) fail('IMPORT_HEADERS', 'Target headers must be nonempty unique text.');
  const mapped = args.mapping.map(m => {
    const sourceIndex = source.matrix[0].indexOf(m.source), targetIndex = headers.indexOf(m.target);
    if (sourceIndex < 0 || targetIndex < 0) fail('IMPORT_MAPPING', 'Every mapping must identify an exact source and target header.', { source: m.source, target: m.target });
    return { ...m, sourceIndex, targetIndex };
  });
  if (new Set(mapped.map(m => m.targetIndex)).size !== mapped.length) fail('IMPORT_MAPPING', 'A target column can be mapped only once.');
  const records = source.matrix.slice(1).map((row, i) => mapped.map(m => {
    try { return convertField(row[m.sourceIndex], m); }
    catch (e) { e.details = { ...e.details, source_record: i + 2, column: m.source }; throw e; }
  }));
  let last = 1;
  for (let y = 1; y < current.length; y++) if (current[y].some(c => c.value !== null || c.formula)) last = y + 1;
  const keys = new Map(); let keyMapping = -1;
  if (args.mode === 'upsert') {
    keyMapping = mapped.findIndex(m => m.target === args.key_column);
    if (keyMapping < 0 || !['text', 'number'].includes(mapped[keyMapping].type)) fail('IMPORT_KEY', 'upsert requires a mapped text/number key_column.');
    const x = mapped[keyMapping].targetIndex;
    for (let y = 1; y < last; y++) {
      const c = current[y][x];
      if (c.formula || c.value === null || c.value === '' || !['string', 'number'].includes(typeof c.value)) fail('IMPORT_KEY', 'Existing data rows need literal, nonempty text/number keys.', { address: c.address });
      const key = JSON.stringify(c.value);
      if (keys.has(key)) fail('IMPORT_DUPLICATE_KEY', 'Existing target keys must be unique.', { address: c.address });
      keys.set(key, y + 1);
    }
  }
  let next = last + 1, inserted = 0, updated = 0; const seen = new Set(), assignments = [];
  records.forEach((record, i) => {
    let row;
    if (args.mode === 'upsert') {
      const value = record[keyMapping];
      if (value === SKIP || value === null || value === '') fail('IMPORT_KEY', 'Source keys must be nonempty.');
      const key = JSON.stringify(value);
      if (seen.has(key)) fail('IMPORT_DUPLICATE_KEY', 'Source keys must be unique; duplicate records are not guessed.', { source_record: i + 2 });
      seen.add(key); row = keys.get(key);
    }
    if (row === undefined) { row = next++; inserted++; } else updated++;
    record.forEach((value, j) => { if (value !== SKIP) assignments.push({ row, column: mapped[j].targetIndex + 1, value }); });
  });
  if (assignments.length > 2000) fail('WORKFLOW_WRITE_LIMIT', 'Import writes at most 2,000 mapped cells.');
  const rows = Math.max(t.rows, next - 1);
  if (rows * t.columns > 2000) fail('IMPORT_TABLE_LIMIT', 'The complete target table after import must fit 2,000 cells. Split or reduce the table.');
  // Extend the captured table with known empty cells for post-resize guards.
  const expanded = structuredClone(snapshot), structureTable = resolveTable(expanded.structure, target).info;
  structureTable.rows = rows;
  const full = expanded.ranges.find(r => r.sheet === target.sheet && r.table === target.table && r.range === target.range);
  for (let y = t.rows + 1; y <= rows; y++) full.cells.push(Array.from({ length: t.columns }, (_, x) => ({ address: `${columnName(x + 1)}${y}`, value: null, formula: null, format: 'automatic', formatted: null })));
  full.range = `A1:${columnName(t.columns)}${rows}`;
  // Coalesce adjacent rows per column, leaving unmapped cells and formulas untouched.
  const writes = [];
  assignments.sort((a, b) => a.column - b.column || a.row - b.row);
  for (const a of assignments) {
    const lastWrite = writes.at(-1);
    if (lastWrite && lastWrite.column === a.column && lastWrite.lastRow + 1 === a.row) { lastWrite.values.push([a.value]); lastWrite.lastRow = a.row; lastWrite.range = `${lastWrite.start}:${columnName(a.column)}${a.row}`; }
    else writes.push({ sheet: target.sheet, table: target.table, column: a.column, lastRow: a.row, start: `${columnName(a.column)}${a.row}`, range: `${columnName(a.column)}${a.row}`, values: [[a.value]] });
  }
  if (writes.length > 100) fail('IMPORT_FRAGMENTATION', 'Import would require over 100 write blocks. Sort source records by target order or split the input.');
  const changes = plannedChanges(expanded, writes);
  const formulas = changes.filter(c => c.replaces_formula).length;
  if (formulas && !args.overwrite_formulas) fail('IMPORT_FORMULA_PROTECTED', 'Mapped cells contain formulas. Preview again with overwrite_formulas=true only if replacing them is intended.', { formula_overwrites: formulas });
  return { writes, expanded, changes, rows, added_table_rows: rows - t.rows, inserted_records: inserted, matched_records: updated, formula_overwrites: formulas, target };
}
export async function runImport(session, args) {
  const source = parseSource(args.source_path, args.delimiter);
  const doc = await session.call('inspect', { document_id: args.document_id }), t = resolveTable(doc, args);
  if (t.info.rows * t.info.columns > 2000) fail('IMPORT_TABLE_LIMIT', 'Import inspects the complete target table, up to 2,000 cells.');
  const target = { sheet: t.sheet, table: t.table, range: `A1:${columnName(t.info.columns)}${t.info.rows}` };
  const targets = [target, ...ruleTargets(args.checks)];
  const snapshot = await capture(session, args.document_id, targets, doc), plan = planImport(doc, snapshot, source, args);
  const { preview, expected_revision, ...request } = args;
  const revision = digest({ snapshot, source_sha256: source.sha256, request });
  const summary = { revision, source_path: args.source_path, source_sha256: source.sha256, delimiter: source.delimiter, source_records: source.matrix.length - 1, inserted_records: plan.inserted_records, matched_records: plan.matched_records, added_table_rows: plan.added_table_rows, change_count: plan.changes.length, changes: plan.changes.slice(0, 100), changes_truncated: plan.changes.length > 100, formula_overwrites: plan.formula_overwrites, checks_before: evaluate(snapshot, args.checks), note: 'Unmapped columns are untouched; new-row formulas are not filled automatically. Growth does not certify expansion of chart references. Keys compare exact typed values.' };
  if (args.preview) return { ...summary, preview: true, applied: false };
  if (args.expected_revision !== revision) fail('WORKFLOW_REVISION_CHANGED', 'Source bytes, request and inspected document must match the preview.');
  if (!same(snapshot, await capture(session, args.document_id, targets)) || parseSource(args.source_path, args.delimiter).sha256 !== source.sha256) fail('WORKFLOW_REVISION_CHANGED', 'The document or input changed before application. Preview again.');
  let phase = 'resize', resized = false, progress;
  try {
    if (plan.added_table_rows) {
      await session.call('table', { document_id: args.document_id, sheet: t.sheet, table: t.table, action: 'configure', rows: plan.rows, _expected_target: targetGuard(t), _expected_range: target.range, _expected_cells: capturedCells(snapshot, target).map(row => row.map(c => ({ value: c.value, formula: c.formula }))) }); resized = true;
      // New rows may inherit formats or formulas from Numbers. Capture the real result.
      const grownTargets = [{ ...target, range: `A1:${columnName(t.info.columns)}${plan.rows}` }, ...ruleTargets(args.checks)];
      const grown = await capture(session, args.document_id, grownTargets);
      const expectedOld = capturedCells(snapshot, target), actualOld = capturedCells(grown, target);
      if (!same(expectedOld, actualOld)) fail('WORKFLOW_REVISION_CHANGED', 'Original cells changed while growing the table.');
      // Do not silently replace formulas inherited by Numbers in newly created rows.
      const newFormulas = plan.writes.flatMap(w => capturedCells(grown, w).flat()).filter(c => c.formula);
      if (newFormulas.length && !args.overwrite_formulas) fail('IMPORT_FORMULA_PROTECTED', 'Numbers populated new target cells with formulas. Inspect before replacing them.');
      plan.expanded = grown;
    }
    phase = 'write'; progress = await applyWrites(session, args.document_id, plan.writes, plan.expanded);
    phase = 'post-check';
    const afterTargets = [{ ...target, range: `A1:${columnName(t.info.columns)}${plan.rows}` }, ...ruleTargets(args.checks)];
    const after = await capture(session, args.document_id, afterTargets);
    verifyFinalWrites(after, plan.writes);
    const validation = evaluate(after, args.checks);
    phase = 'save'; if (args.save) await session.call('save', { document_id: args.document_id });
    return { ...summary, ...progress, preview: false, applied: true, saved: args.save, checks_after: validation, validation_passed: validation.passed, autosave_possible: true };
  } catch (e) { e.details = { ...e.details, ...progress, phase, resize_attempted: plan.added_table_rows > 0, resize_completed: resized, document_id: args.document_id, partial_application_possible: true, instruction: 'Inspect the table and completed writes. No rollback or automatic mutation retry.' }; throw e; }
}
