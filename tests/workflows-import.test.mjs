import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NumbersTools } from '../plugins/numbers-native/src/tools.mjs';
import { parseDelimited, parseSource, convertField, SKIP } from '../plugins/numbers-native/src/imports.mjs';
import { parseRange, columnName } from '../plugins/numbers-native/src/paths.mjs';
import { capture, evaluate } from '../plugins/numbers-native/src/workflows.mjs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'numbers-workflow-test-'));
  const native = join(directory, 'data.numbers'); writeFileSync(native, 'opaque');
  const matrices = [ [['Codice','Importo','Note'],['001',120,'A'],['002',80,'B']], [['Budget','Residuo'],[300,100],[null,null]] ];
  const cells = matrices.map(m => m.map((row, y) => row.map((v,x) => ({ address: `${columnName(x+1)}${y+1}`, value: v, formula: null, formatted: v === null ? null : String(v), format: typeof v === 'string' ? 'text' : 'number' }))));
  const doc = { document_id: 'd', path: native, sheets: [{ index: 1, name: 'Foglio', tables: matrices.map((m,i) => ({ index: i+1, name: i ? 'Riepilogo' : 'Dati', rows: m.length, columns: m[0].length, header_rows: 1, header_columns: 0, footer_rows: 0, filtered: false, locked: false })) }] };
  const calls = []; let failWrite = 0, writeCount = 0, onResize = () => {}, onWrite = () => {};
  const bridge = {
    exclusive: task => task(bridge),
    async call(action, a = {}) {
      calls.push({ action, args: a });
      if (action === 'inspect') return structuredClone(doc);
      if (action === 'document_info') return { document_id: 'd', path: native };
      if (action === 'save') return {};
      if (action === 'table') {
        const t = doc.sheets[0].tables[a.table-1], matrix = cells[a.table-1];
        while (matrix.length < a.rows) matrix.push(Array.from({length:t.columns},(_,x) => ({address:`${columnName(x+1)}${matrix.length+1}`,value:null,formula:null,formatted:null,format:'automatic'})));
        t.rows = a.rows; onResize(matrix, t); return structuredClone(doc);
      }
      const table = cells[a.table-1], b = parseRange(a.range);
      if (action === 'read') return { cells: structuredClone(table.slice(b.row-1,b.endRow).map(r => r.slice(b.column-1,b.endColumn))) };
      if (action === 'write') {
        if (++writeCount === failWrite) throw Object.assign(new Error('native failure'), {code:'PARTIAL_WRITE',details:{completed_cells:0}});
        a.values.forEach((row,y) => row.forEach((v,x) => Object.assign(table[b.row-1+y][b.column-1+x],{value:v,formula:null,formatted:v===null?null:String(v)})));
        onWrite(writeCount);
        return { ...(await bridge.call('read',a)), written:a.values.flat().length };
      }
      throw Error(action);
    }
  };
  const service = new NumbersTools(bridge, { roots: [directory] });
  const call = (name,args) => service.execute(`numbers_${name}`,{document_id:'d',...args});
  const csv = contents => { const path = join(directory,'input.csv'); writeFileSync(path,contents); return path; };
  return { directory,doc,cells,calls,bridge,call,csv,setFail:n=>{failWrite=n;},onResize:fn=>{onResize=fn;},onWrite:fn=>{onWrite=fn;} };
}
const mapping = [{source:'Codice',target:'Codice',type:'text'},{source:'Importo',target:'Importo',type:'number',decimal_separator:','}];

test('CSV parser preserves BOM, escaped quotes, embedded CRLF and leading/trailing empty fields', () => {
  assert.deepEqual(parseDelimited('\ufeffCodice;Nota;Vuoto\r\n001;"una ""citazione""\r\ne due righe";\r\n',';'),[['Codice','Nota','Vuoto'],['001','una "citazione"\r\ne due righe','']]);
  assert.deepEqual(parseDelimited('a,b\n,x\ny,\n',','),[['a','b'],['','x'],['y','']]);
});
test('malformed, ragged, duplicate-header and oversized CSV fail explicitly', () => {
  for (const input of ['a,b\n"open,x','a,b\na"b,c','a,b\n"x"junk,y','a,b\nx','a,a\nx,y',',b\nx,y']) assert.throws(()=>parseDelimited(input,','));
  assert.throws(()=>parseDelimited('a\n'+ 'x'.repeat(32769),','),e=>e.code==='IMPORT_LIMIT');
});
test('source detection handles Italian separators and rejects ambiguous delimiters/invalid UTF8', () => {
  const f=fixture(); assert.equal(parseSource(f.csv('Codice;Importo\n001;1,50\n')).delimiter,';');
  assert.throws(()=>parseSource(f.csv('a,b;c\nx,y;z\n')),e=>e.code==='IMPORT_DELIMITER_AMBIGUOUS');
  const p=f.csv('a\nb');writeFileSync(p,Buffer.from([0xff,0xfe]));assert.throws(()=>parseSource(p),e=>e.code==='IMPORT_ENCODING');
});
test('explicit types preserve codes and reject ambiguous numbers, invalid dates and formulas', () => {
  assert.equal(convertField('001',{type:'text'}),'001');assert.equal(convertField('=SUM(A1)',{type:'text'}),'=SUM(A1)');
  assert.equal(convertField('1.234,56',{type:'number',decimal_separator:',',group_separator:'.'}),1234.56);
  assert.equal(convertField('1 234.56',{type:'number',group_separator:'space'}),1234.56);
  for(const s of ['12.34,56','1.234,5.6','12,3,4','=1+1','NaN','Infinity']) assert.throws(()=>convertField(s,{type:'number',decimal_separator:',',group_separator:'.'}));
  assert.equal(convertField('29/02/2024',{type:'date',date_format:'dd/mm/yyyy'}).date,'2024-02-29T00:00:00.000Z');
  for(const s of ['29/02/2025','31/04/2026'])assert.throws(()=>convertField(s,{type:'date',date_format:'dd/mm/yyyy'}));
  assert.throws(()=>convertField('2026-02-31T10:00:00Z',{type:'date',date_format:'iso'}));
  assert.equal(convertField('false',{type:'boolean'}),false);assert.throws(()=>convertField('maybe',{type:'boolean'}));
  assert.equal(convertField('',{type:'text',empty:'skip'}),SKIP);assert.throws(()=>convertField('',{type:'text',empty:'error'}));
});
test('multi-table edit preview is read-only and apply retains untouched cells',async()=>{
  const f=fixture(),a={edits:[{sheet:'Foglio',table:'Dati',start:'B2',values:[[150]]},{sheet:1,table:'Riepilogo',start:'B2',values:[[70]]}],checks:[{kind:'equals',source:{sheet:1,table:1,range:'B2'},value:150}]};
  const before=structuredClone(f.cells),p=await f.call('edit',a);assert.equal(p.change_count,2);assert.deepEqual(f.cells,before);assert.equal(f.calls.some(c=>c.action==='save'),false);
  const r=await f.call('edit',{...a,preview:false,expected_revision:p.revision});assert.equal(r.validation_passed,true);assert.equal(f.cells[0][1][0].value,'001');assert.equal(f.cells[1][1][1].value,70);
  assert.ok(f.calls.filter(c=>c.action==='write').every(c=>c.args._expected_cells&&c.args._expected_formats&&c.args._expected_target));
});
test('edit revision guards data, format, structure and exact request without writing',async()=>{
  for(const mode of ['value','format','structure','request']){
    const f=fixture(),a={edits:[{sheet:1,table:1,start:'B2',values:[[150]]}]},p=await f.call('edit',a);
    if(mode==='value')f.cells[0][1][1].value=121;
    if(mode==='format')f.cells[0][1][1].format='currency';
    if(mode==='structure')f.doc.sheets[0].tables[0].name='New name';
    if(mode==='request')a.edits[0].values=[[151]];
    await assert.rejects(f.call('edit',{...a,preview:false,expected_revision:p.revision}),e=>e.code==='WORKFLOW_REVISION_CHANGED');assert.equal(f.calls.some(c=>c.action==='write'),false);
  }
});
test('aliased overlapping edits and ragged matrices are rejected before writes',async()=>{
  const f=fixture();await assert.rejects(f.call('edit',{edits:[{sheet:'Foglio',table:'Dati',start:'B2',values:[[1]]},{sheet:1,table:1,start:'B2',values:[[2]]}]}),e=>e.code==='OVERLAPPING_EDITS');
  await assert.rejects(f.call('edit',{edits:[{sheet:1,table:1,start:'B2',values:[[1],[1,2]]}]}),e=>e.code==='RAGGED_MATRIX');assert.equal(f.calls.some(c=>c.action==='write'),false);
});
test('workflow write/read budgets and import source roots are enforced',async()=>{
  const f=fixture();await assert.rejects(f.call('edit',{edits:[{sheet:1,table:1,start:'A1',values:Array.from({length:1001},()=>[1,2])}]}),e=>e.code==='WORKFLOW_WRITE_LIMIT');
  f.doc.sheets[0].tables[0].rows=2000;
  await assert.rejects(f.call('check',{ranges:['A','B','C'].map(col=>({sheet:1,table:1,range:`${col}1:${col}2000`}))}),e=>e.code==='WORKFLOW_CELL_LIMIT');
  const outside=join(mkdtempSync(join(tmpdir(),'numbers-outside-')),'outside.csv');writeFileSync(outside,'Codice;Importo\n001;20\n');
  await assert.rejects(f.call('import',{sheet:1,table:1,source_path:outside,mode:'append',mapping}),e=>e.code==='PATH_NOT_ALLOWED');
  assert.equal(f.calls.some(c=>['write','table','save'].includes(c.action)),false);
});
test('partial multi-table failure reports completed writes without retry or rollback',async()=>{
  const f=fixture(),a={edits:[{sheet:1,table:1,start:'B2',values:[[150]]},{sheet:1,table:2,start:'B2',values:[[70]]}]};
  const p=await f.call('edit',a);f.setFail(2);await assert.rejects(f.call('edit',{...a,preview:false,expected_revision:p.revision}),e=>e.code==='PARTIAL_WRITE'&&e.details.completed_writes===1&&e.details.partial_application_possible);
  assert.equal(f.cells[0][1][1].value,150);assert.equal(f.cells[1][1][1].value,100);assert.equal(f.calls.filter(c=>c.action==='write').length,2);
});
test('post-check failure remains explicit after successful native writes',async()=>{
  const f=fixture(),a={edits:[{sheet:1,table:1,start:'B2',values:[[150]]}],checks:[{kind:'equals',source:{sheet:1,table:1,range:'B2'},value:999}]};
  const p=await f.call('edit',a),r=await f.call('edit',{...a,preview:false,expected_revision:p.revision});assert.equal(r.applied,true);assert.equal(r.saved,true);assert.equal(r.validation_passed,false);assert.equal(f.cells[0][1][1].value,150);
});
test('final verification detects a previously written cell changed during later blocks',async()=>{
  const f=fixture(),a={edits:[{sheet:1,table:1,start:'B2',values:[[150]]},{sheet:1,table:2,start:'B2',values:[[70]]}]};
  const p=await f.call('edit',a);f.onWrite(n=>{if(n===2)f.cells[0][1][1].value=999;});
  await assert.rejects(f.call('edit',{...a,preview:false,expected_revision:p.revision}),e=>e.code==='WORKFLOW_READBACK'&&e.details.applied&&e.details.completed_writes===2);
  assert.equal(f.cells[0][1][1].value,999);assert.equal(f.calls.some(c=>c.action==='save'),false);
});
test('read-only checks distinguish missing formulas, duplicates, numeric balances and suspected errors',async()=>{
  const f=fixture();f.cells[0][2][0].value='001';f.cells[1][2][1].formula='=1/0';
  const r=await f.call('check',{ranges:[{sheet:1,table:2,range:'B3'}],checks:[{kind:'required',source:{sheet:1,table:2,range:'A3'}},{kind:'unique',source:{sheet:1,table:1,range:'A2:A3'}},{kind:'formula',source:{sheet:1,table:2,range:'A2'}},{kind:'numeric_bounds',source:{sheet:1,table:1,range:'B2:B3'},max:100},{kind:'balance',terms:[{source:{sheet:1,table:1,range:'B2'}},{source:{sheet:1,table:1,range:'B3'}}],expected:200}]});
  assert.equal(r.read_only,true);assert.equal(r.violation_count,4);assert.equal(r.suspected_formula_error_count,1);assert.equal(f.calls.some(c=>['save','write'].includes(c.action)),false);
});
test('upsert preserves leading zeros and unmapped values while appending new keys',async()=>{
  const f=fixture(),a={sheet:1,table:1,source_path:f.csv('Codice;Importo\n001;150,50\n003;20,00\n'),mode:'upsert',key_column:'Codice',mapping};
  const p=await f.call('import',a);assert.equal(p.matched_records,1);assert.equal(p.inserted_records,1);assert.equal(p.added_table_rows,1);assert.equal(f.cells[0][1][1].value,120);
  const r=await f.call('import',{...a,preview:false,expected_revision:p.revision});assert.equal(r.applied,true);assert.equal(f.cells[0][1][0].value,'001');assert.equal(f.cells[0][1][1].value,150.5);assert.equal(f.cells[0][1][2].value,'A');assert.equal(f.cells[0][2][1].value,80);assert.equal(f.cells[0][3][0].value,'003');
});
test('import rejects changed bytes, duplicate keys, formula overwrite and filtered targets',async()=>{
  for(const mode of ['bytes','duplicate-source','duplicate-target','formula','filter']){
    const f=fixture(),a={sheet:1,table:1,source_path:f.csv('Codice;Importo\n001;150\n'),mode:'upsert',key_column:'Codice',mapping};
    if(mode==='bytes'){const p=await f.call('import',a);f.csv('Codice;Importo\n001;151\n');await assert.rejects(f.call('import',{...a,preview:false,expected_revision:p.revision}),e=>e.code==='WORKFLOW_REVISION_CHANGED');}
    else {if(mode==='duplicate-source')f.csv('Codice;Importo\n001;150\n001;151\n');if(mode==='duplicate-target')f.cells[0][2][0].value='001';if(mode==='formula')f.cells[0][1][1].formula='=100+20';if(mode==='filter')f.doc.sheets[0].tables[0].filtered=true;await assert.rejects(f.call('import',a));}
    assert.equal(f.calls.some(c=>['write','table','save'].includes(c.action)),false);
  }
});
test('append reuses empty trailing rows and handles skipped empty mapped fields',async()=>{
  const f=fixture();f.cells[0][2].forEach(c=>Object.assign(c,{value:null,formula:null,formatted:null}));
  const a={sheet:1,table:1,source_path:f.csv('Codice;Importo\n003;\n'),mode:'append',mapping:[mapping[0],{...mapping[1],empty:'skip'}]},p=await f.call('import',a);assert.equal(p.added_table_rows,0);
  await f.call('import',{...a,preview:false,expected_revision:p.revision});assert.equal(f.cells[0][2][0].value,'003');assert.equal(f.cells[0][2][1].value,null);
});
test('formula overwrite requires explicit import option and appears in preview',async()=>{
  const f=fixture();f.cells[0][1][1].formula='=100+20';const a={sheet:1,table:1,source_path:f.csv('Codice;Importo\n001;150\n'),mode:'upsert',key_column:'Codice',mapping,overwrite_formulas:true};
  const p=await f.call('import',a);assert.equal(p.formula_overwrites,1);await f.call('import',{...a,preview:false,expected_revision:p.revision});assert.equal(f.cells[0][1][1].formula,null);
});
test('formulas inherited during native growth stop import with recoverable resized state',async()=>{
  const f=fixture(),a={sheet:1,table:1,source_path:f.csv('Codice;Importo\n003;150\n'),mode:'upsert',key_column:'Codice',mapping};
  const p=await f.call('import',a);f.onResize(matrix=>{matrix[3][1].formula='=1';});
  await assert.rejects(f.call('import',{...a,preview:false,expected_revision:p.revision}),e=>e.code==='IMPORT_FORMULA_PROTECTED'&&e.details.resize_completed&&e.details.partial_application_possible);
  assert.equal(f.doc.sheets[0].tables[0].rows,4);assert.equal(f.cells[0][3][1].formula,'=1');assert.equal(f.calls.some(c=>c.action==='write'),false);
});
