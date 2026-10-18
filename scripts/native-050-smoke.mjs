import { NumbersBridge } from '../plugins/numbers-native/src/bridge.mjs';
import { NumbersTools } from '../plugins/numbers-native/src/tools.mjs';
import { mkdtempSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const directory=realpathSync(mkdtempSync(join(tmpdir(),'numbers-native-050-')));
const bridge=new NumbersBridge(), service=new NumbersTools(bridge), completed=[];
let id;
async function call(action,args={}) {
  for(let i=0;i<120;i++)try{return await service.execute('numbers_'+action,args);}catch(e){if(e.code!=='NUMBERS_BUSY')throw e;await new Promise(r=>setTimeout(r,500));}
  throw Error('Numbers busy');
}
const test=async(name,fn)=>{await fn();completed.push(name);console.log('PASS '+name);};
const target=(table,range)=>({sheet:1,table,range});
const checks=[{kind:'equals',source:target('Riepilogo','B2'),value:265},{kind:'equals',source:target('Riepilogo','B4'),value:35},{kind:'balance',terms:[{source:target('Riepilogo','B2')},{source:target('Riepilogo','B4')}],expected:300}];
try {
  await call('status',{launch:true});
  id=(await call('create',{path:join(directory,'Workflows.numbers')})).document_id;
  const d={document_id:id};
  await call('table',{...d,sheet:1,table:1,action:'rename',name:'Dati'});
  await call('table',{...d,sheet:1,table:'Dati',action:'configure',rows:4,columns:5,header_rows:1,header_columns:0,footer_rows:0});
  await call('write',{...d,sheet:1,table:'Dati',start:'A1',values:[['Codice','Importo','Data','Attivo','Note'],['001',120,null,true,'Materiali'],['002',80,null,false,'Servizi'],['003',35,null,true,'Trasporto']]});
  await call('format',{...d,sheet:1,table:'Dati',range:'B2:B4',format:'currency'});
  await call('table',{...d,sheet:1,action:'create',name:'Riepilogo',rows:4,columns:2,header_rows:1,header_columns:0,footer_rows:0});
  await call('write',{...d,sheet:1,table:'Riepilogo',start:'A1',values:[['Indicatore','Valore'],['Totale',{formula:'=SUM(Dati::B)'}],['Budget',300],['Residuo',{formula:'=B3-B2'}]]});
  await call('save',d);
  const edits=[{sheet:1,table:'Dati',start:'B2',values:[[150]]},{sheet:1,table:'Riepilogo',start:'A3',values:[['Budget disponibile']]}];
  let revision;
  await test('multi-table preview is read-only',async()=>{
    const p=await call('edit',{...d,edits,checks});revision=p.revision;assert.equal(p.change_count,2);assert.equal(p.applied,false);
    assert.equal((await call('read',{...d,...target('Dati','B2')})).cells[0][0].value,120);
  });
  await test('native multi-table apply recalculates and preserves currency',async()=>{
    const r=await call('edit',{...d,edits,checks,preview:false,expected_revision:revision});assert.equal(r.validation_passed,true);assert.equal(r.completed_writes,2);
    const c=(await call('read',{...d,...target('Dati','B2')})).cells[0][0];assert.equal(c.value,150);assert.equal(c.format,'currency');
  });
  await test('native read-only equality, bounds, unique, formula and balance checks',async()=>{
    const r=await call('check',{...d,ranges:[target('Riepilogo','B2:B4')],checks:[...checks,{kind:'required',source:target('Dati','A2:A4')},{kind:'unique',source:target('Dati','A2:A4')},{kind:'numeric_bounds',source:target('Dati','B2:B4'),min:0,max:200},{kind:'formula',source:target('Riepilogo','B2')}]});assert.equal(r.passed,true);assert.equal(r.formulas_checked,2);
  });
  await test('intervening native edit invalidates revision without replay',async()=>{
    const request={...d,edits:[{sheet:1,table:'Dati',start:'B2',values:[[160]]}]},p=await call('edit',request);
    await call('write',{...d,sheet:1,table:'Dati',start:'B2',values:[[155]]});
    await assert.rejects(call('edit',{...request,preview:false,expected_revision:p.revision}),e=>e.code==='WORKFLOW_REVISION_CHANGED');
    assert.equal((await call('read',{...d,...target('Dati','B2')})).cells[0][0].value,155);
    await call('write',{...d,sheet:1,table:'Dati',start:'B2',values:[[150]]});
  });
  await test('native boundary rejects stale literal content, formats and table identity',async()=>{
    const a={...d,sheet:1,table:1,start:'B2',range:'B2',values:[[999]],preserve_format:true};
    await assert.rejects(bridge.call('write',{...a,_expected_cells:[[{value:120,formula:null}]],_expected_formats:['currency']}),e=>e.code==='WORKFLOW_REVISION_CHANGED');
    await assert.rejects(bridge.call('write',{...a,_expected_cells:[[{value:150,formula:null}]],_expected_formats:['percent']}),e=>e.code==='WORKFLOW_REVISION_CHANGED');
    await assert.rejects(bridge.call('write',{...a,_expected_target:{sheet_name:'Wrong',name:'Dati'},_expected_cells:[[{value:150,formula:null}]],_expected_formats:['currency']}),e=>e.code==='WORKFLOW_REVISION_CHANGED');
    await assert.rejects(bridge.call('table',{...d,sheet:1,table:1,action:'configure',rows:5,_expected_target:{sheet_name:'Wrong',name:'Dati'}}),e=>e.code==='WORKFLOW_REVISION_CHANGED');
    assert.equal((await call('inspect',d)).sheets[0].tables[0].rows,4);
    assert.equal((await call('read',{...d,...target('Dati','B2')})).cells[0][0].value,150);
  });
  await test('native formula errors are reported and explicit formula replacement evaluated',async()=>{
    // Invalid formulas can force Numbers back to Automatic; this fixture explicitly permits it.
    await call('write',{...d,sheet:1,table:'Dati',start:'B3',values:[[{formula:'=1/0'}]],preserve_format:false});
    const r=await call('check',{...d,ranges:[target('Dati','B3')]});assert.equal(r.passed,false);assert.equal(r.suspected_formula_error_count,1);
    const a={...d,edits:[{sheet:1,table:'Dati',start:'B3',values:[[{formula:'=40+40'}]]}],checks:[{kind:'equals',source:target('Dati','B3'),value:80}]},p=await call('edit',a);assert.equal(p.formula_overwrites,1);
    assert.equal((await call('edit',{...a,preview:false,expected_revision:p.revision})).validation_passed,true);
  });
  const source=join(directory,'Import italiano.csv');
  writeFileSync(source,'\ufeffCodice;Importo;Data;Attivo;Note\r\n001;160,50;18/10/2026;true;"=SUM(A1)"\r\n004;20,25;19/10/2026;false;"Riga ""nuova"""\r\n');
  const mapping=[{source:'Codice',target:'Codice',type:'text'},{source:'Importo',target:'Importo',type:'number',decimal_separator:','},{source:'Data',target:'Data',type:'date',date_format:'dd/mm/yyyy'},{source:'Attivo',target:'Attivo',type:'boolean'},{source:'Note',target:'Note',type:'text'}];
  const request={...d,sheet:1,table:'Dati',source_path:source,mode:'upsert',key_column:'Codice',mapping};
  await test('native import preview maps Italian types without mutations',async()=>{
    const p=await call('import',request);assert.equal(p.delimiter,';');assert.equal(p.matched_records,1);assert.equal(p.inserted_records,1);assert.equal(p.added_table_rows,1);
    assert.equal((await call('inspect',d)).sheets[0].tables[0].rows,4);
  });
  await test('changed CSV bytes invalidate native import preview',async()=>{
    const p=await call('import',request),bytes=readFileSync(source);writeFileSync(source,Buffer.concat([bytes,Buffer.from('\r\n')]));
    // Use a valid changed source so rejection tests the digest, not parser syntax.
    writeFileSync(source,bytes.toString().replace('160,50','161,50'));
    await assert.rejects(call('import',{...request,preview:false,expected_revision:p.revision}),e=>e.code==='WORKFLOW_REVISION_CHANGED');writeFileSync(source,bytes);
  });
  await test('native upsert grows table, preserves formulas and literal injection text',async()=>{
    const p=await call('import',request),r=await call('import',{...request,preview:false,expected_revision:p.revision});assert.equal(r.applied,true);assert.equal(r.validation_passed,true);
    const matrix=(await call('read',{...d,...target('Dati','A2:E5')})).cells;
    assert.equal(matrix[0][0].value,'001');assert.equal(matrix[0][1].value,160.5);assert.equal(matrix[0][1].format,'currency');
    assert.equal(matrix[0][2].value.date,'2026-10-18T00:00:00.000Z');assert.equal(matrix[0][3].value,true);assert.equal(matrix[0][4].value,'=SUM(A1)');assert.equal(matrix[0][4].formula,null);
    assert.ok(matrix[1][1].formula);assert.equal(matrix[1][1].value,80);assert.equal(matrix[3][0].value,'004');assert.equal(matrix[3][1].value,20.25);assert.equal(matrix[3][3].value,false);
    assert.equal((await call('read',{...d,...target('Riepilogo','B2')})).cells[0][0].value,295.75);
  });
  await test('formula import protection and duplicate key rejection occur before mutation',async()=>{
    const protectedCSV=join(directory,'protected.csv');writeFileSync(protectedCSV,'Codice;Importo\n002;90\n');
    await assert.rejects(call('import',{...request,source_path:protectedCSV,mapping:mapping.slice(0,2)}),e=>e.code==='IMPORT_FORMULA_PROTECTED');
    writeFileSync(protectedCSV,'Codice;Importo\n001;90\n001;91\n');await assert.rejects(call('import',{...request,source_path:protectedCSV,mapping:mapping.slice(0,2)}),e=>e.code==='IMPORT_DUPLICATE_KEY');
    assert.equal((await call('read',{...d,...target('Dati','B3')})).cells[0][0].value,80);
  });
  await test('TSV append keeps leading zero keys and unmapped columns',async()=>{
    const tsv=join(directory,'append.tsv');writeFileSync(tsv,'Codice\tImporto\n005\t4.25\n');
    const a={...d,sheet:1,table:'Dati',source_path:tsv,mode:'append',mapping:[mapping[0],{source:'Importo',target:'Importo',type:'number'}]},p=await call('import',a);
    await call('import',{...a,preview:false,expected_revision:p.revision});const row=(await call('read',{...d,...target('Dati','A6:E6')})).cells[0];assert.equal(row[0].value,'005');assert.equal(row[1].value,4.25);assert.equal(row[4].value,null);
  });
  await test('save reopen retains native imported types and cross-table formula results',async()=>{
    await call('save',d);await call('close',d);id=(await call('open',{path:join(directory,'Workflows.numbers')})).document_id;
    const r=await call('check',{document_id:id,checks:[{kind:'equals',source:target('Riepilogo','B2'),value:300},{kind:'unique',source:target('Dati','A2:A6')},{kind:'formula',source:target('Dati','B3')}]});assert.equal(r.passed,true);
  });
  const report={passed:true,scenarios:completed.length,completed,directory,native_only:true,published:false};writeFileSync(join(directory,'verification.json'),JSON.stringify(report,null,2));
  if(process.env.NUMBERS_NATIVE_WORKFLOW_EVIDENCE)writeFileSync(process.env.NUMBERS_NATIVE_WORKFLOW_EVIDENCE,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{if(id)await call('close',{document_id:id});}
