/* Native JXA worker. Fixed program, JSON request on stdin. No eval or shell execution.
 * Copyright (c) 2026 Viames Marino. MIT License.
 */
ObjC.import('Foundation');
ObjC.import('AppKit');

function fail(code, message, details) {
  var error = new Error(message); error.nativeCode = code; error.details = details || {}; throw error;
}
function unwrap(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return { date: value.toISOString() };
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}
function color16(value) {
  if(!Array.isArray(value)||value.length!==3)return null;
  var normalized=value.every(function(v){return typeof v==='number'&&v>=0&&v<=1;});
  return value.map(function(v){return Math.round(normalized?v*65535:v);});
}
function getPath(d) { var f = d.file(); return f ? String(f) : null; }
function canonicalNativePath(path) { return path?ObjC.unwrap($.NSString.stringWithString(path).stringByResolvingSymlinksInPath):null; }
function pdfCapability() {
  try {ObjC.import('PDFKit');return {available:true,framework:'macOS PDFKit / AppKit'};}
  catch(e){return {available:false,message:e.message};}
}
function renderPreview(app,d,a) {
  if($.NSFileManager.defaultManager.fileExistsAtPath(a.path)||$.NSFileManager.defaultManager.fileExistsAtPath(a.image_path))fail('DESTINATION_EXISTS','Preview files must be new.');
  if(!pdfCapability().available)fail('PDFKIT_UNAVAILABLE','The native PDF renderer is unavailable.');
  var manager=$.NSFileManager.defaultManager;
  var parent=ObjC.unwrap($.NSString.stringWithString(a.path).stringByDeletingLastPathComponent);
  var temporary=parent+'/.numbers-native-preview-'+ObjC.unwrap($.NSUUID.UUID.UUIDString);
  if(!manager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(temporary,false,$({}),null))fail('PREVIEW_RENDER_FAILED','Cannot create native preview staging directory.');
  var previous=null,stable=false,attempt,count,number=a.page||1,bitmap,png,pdfPath;
  try {
    // Numbers can acknowledge restored cell values before its chart cache settles.
    // Render independent exports until the selected page matches twice, bounded.
    for(attempt=1;attempt<=4;attempt++) {
      $.NSThread.sleepForTimeInterval(attempt===1?0.5:0.4);
      pdfPath=temporary+'/'+attempt+'.pdf';app.export(d,{to:Path(pdfPath),as:'PDF'});
      var pdf=$.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(pdfPath));
      if(!pdf||pdf.isNil())fail('PREVIEW_PDF_INVALID','Numbers exported an unreadable PDF.');
      count=Number(pdf.pageCount);
      if(number<1||number>count){manager.copyItemAtPathToPathError(pdfPath,a.path,null);fail('PREVIEW_PAGE_RANGE','Requested page exceeds the exported PDF.',{page_count:count,pdf_path:a.path});}
      var page=pdf.pageAtIndex(number-1),bounds=page.boundsForBox($.kPDFDisplayBoxMediaBox),edge=a.max_dimension||1200;
      var scale=edge/Math.max(bounds.size.width,bounds.size.height);
      var thumbnail=page.thumbnailOfSizeForBox($.NSMakeSize(bounds.size.width*scale,bounds.size.height*scale),$.kPDFDisplayBoxMediaBox);
      bitmap=$.NSBitmapImageRep.imageRepWithData(thumbnail.TIFFRepresentation);
      png=bitmap.representationUsingTypeProperties($.NSPNGFileType,$({}));
      if(!png||png.isNil())fail('PREVIEW_RENDER_FAILED','Native PNG rendering failed.');
      if(previous&&png.isEqualToData(previous)){stable=true;break;}
      previous=png;
    }
    if(!manager.copyItemAtPathToPathError(pdfPath,a.path,null))fail('PREVIEW_RENDER_FAILED','Cannot publish the new preview PDF.');
    var staged=temporary+'/page.png';
    if(!png.writeToFileAtomically(staged,true)||!manager.copyItemAtPathToPathError(staged,a.image_path,null))fail('PREVIEW_RENDER_FAILED','Cannot publish the new preview PNG.',{pdf_path:a.path});
    return {pdf_path:a.path,image_path:a.image_path,page:number,page_count:count,width:Number(bitmap.pixelsWide),height:Number(bitmap.pixelsHigh),renderer:'macOS PDFKit / AppKit',source_path:getPath(d),render_stable:stable,render_attempts:Math.min(attempt,4),chart_references_introspected:false,...(!stable?{notice:'Selected-page output was still changing; inspect or generate a fresh preview.'}:{})};
  } finally {manager.removeItemAtPathError(temporary,null);}
}
function info(d) { return { document_id: d.id(), name: d.name(), path: getPath(d), modified: d.modified() }; }
function lookup(collection, ref, label) {
  var items = collection();
  if (typeof ref === 'number') {
    if (ref < 1 || ref > items.length) fail('NOT_FOUND', label + ' index is out of bounds.');
    return items[ref - 1];
  }
  var found = items.filter(function(x) { return x.name() === ref; });
  if (found.length !== 1) fail(found.length ? 'AMBIGUOUS_NAME' : 'NOT_FOUND', 'Expected one ' + label + ' named ' + ref + '. Use a 1-based index if names are duplicated.');
  return found[0];
}
function documentById(app, id) {
  var docs = app.documents().filter(function(d) { return d.id() === id; });
  if (docs.length !== 1) fail('DOCUMENT_NOT_FOUND', 'This Numbers document is no longer open. List or reopen documents to obtain its current ID.');
  return docs[0];
}
function requireName(a) { if (!a.name) fail('NAME_REQUIRED', 'This action requires a name.'); }
function unique(collection, name) {
  if (collection().some(function(x) { return x.name() === name; })) fail('NAME_EXISTS', 'An item with that name already exists.');
}
function colName(n) { var s = ''; while(n > 0) { n--; s = String.fromCharCode(65+n%26)+s; n=Math.floor(n/26); } return s; }
function bounds(t, value) {
  var m = /^([A-Z]{1,3})([1-9][0-9]*)(?::([A-Z]{1,3})([1-9][0-9]*))?$/.exec(value);
  if (!m) fail('INVALID_RANGE', 'Expected table-relative A1 notation.');
  function column(s) { return s.split('').reduce(function(n,c){return n*26+c.charCodeAt(0)-64;},0); }
  var b={ column:column(m[1]), row:Number(m[2]), endColumn:column(m[3]||m[1]), endRow:Number(m[4]||m[2]) };
  if (b.endColumn<b.column || b.endRow<b.row || b.endColumn>t.columnCount() || b.endRow>t.rowCount()) fail('RANGE_OUT_OF_BOUNDS', 'Range exceeds this table. Resize the table explicitly first.');
  if ((b.endColumn-b.column+1)*(b.endRow-b.row+1)>2000) fail('CELL_LIMIT', 'Use at most 2,000 cells.');
  return b;
}
function readCells(t, range) {
  var b=bounds(t,range), r=t.ranges.byName(range), cells=[], row=[];
  // Four Apple Events for the entire range rather than four events per cell.
  var values=r.cells.value(), formatted=r.cells.formattedValue(), formulas=r.cells.formula(), formats=r.cells.format();
  var k=0;
  for(var y=b.row;y<=b.endRow;y++) {
    row=[];
    for(var x=b.column;x<=b.endColumn;x++,k++) row.push({address:colName(x)+y,value:formats[k]==='checkbox'&&values[k]!==null&&values[k]!==undefined?!!values[k]:unwrap(values[k]),formatted:unwrap(formatted[k]),formula:unwrap(formulas[k]),format:unwrap(formats[k])});
    cells.push(row);
  }
  return { range:range, cells:cells };
}
function assignValue(c,v,oldFormat,preserve) {
  var numeric=['automatic','number','currency','percent','duration','fraction','scientific','rating','slider','stepper'];
  var restore=null;
  if(typeof v==='string') {c.format='text';c.value=v;restore='text';}
  else if(v&&typeof v==='object'&&v.formula) {
    if(oldFormat==='text')c.format='automatic';c.value=v.formula;
    if(preserve&&oldFormat!=='text'&&oldFormat!=='other')restore=oldFormat;
  }
  else if(v&&typeof v==='object'&&v.date) {c.format='date and time';c.value=new Date(v.date);restore='date and time';}
  else if(typeof v==='boolean') {c.format='checkbox';c.value=v;restore='checkbox';}
  else {
    if(v!==null&&oldFormat==='text')c.format='automatic';c.value=v;
    if(preserve&&oldFormat!=='other'&&(v===null||numeric.indexOf(oldFormat)>=0))restore=oldFormat;
  }
  // Numbers' value setter can reset even currency/percent to Automatic.
  if(restore)c.format=restore;
  return restore;
}
function tableInfo(t, index) {
  return { index:index, name:t.name(), rows:t.rowCount(), columns:t.columnCount(), header_rows:t.headerRowCount(), header_columns:t.headerColumnCount(), footer_rows:t.footerRowCount(), freeze_header_rows:t.headerRowsFrozen(), freeze_header_columns:t.headerColumnsFrozen(), filtered:t.filtered(),position:t.position(),width:t.width(),height:t.height(),locked:t.locked() };
}
function checkExpectedTarget(s,t,a) {
  if(a._expected_target) {
    var expectedTarget=a._expected_target,actualTarget=tableInfo(t,a.table);
    if(s.name()!==expectedTarget.sheet_name||Object.keys(expectedTarget).some(function(k){return k!=='sheet_name'&&JSON.stringify(actualTarget[k])!==JSON.stringify(expectedTarget[k]);}))fail('WORKFLOW_REVISION_CHANGED','Target table structure changed before mutation. Inspect earlier workflow writes.');
  }
  if(a._expected_cells) {
    var current=readCells(t,a._expected_range||a.range).cells;
    for(var ey=0;ey<current.length;ey++)for(var ex=0;ex<current[ey].length;ex++) {
      var expected=a._expected_cells[ey]&&a._expected_cells[ey][ex],actual=current[ey][ex];
      if(!expected||actual.formula!==expected.formula||(!actual.formula&&JSON.stringify(actual.value)!==JSON.stringify(expected.value)))fail('WORKFLOW_REVISION_CHANGED','Target content changed immediately before mutation. Earlier workflow writes may have applied.',{address:actual.address});
    }
  }
}
function inspect(d) {
  var out=info(d);
  out.sheets=d.sheets().map(function(s,i){return {index:i+1,name:s.name(),tables:s.tables().map(function(t,j){return tableInfo(t,j+1);}),objects:{charts:s.charts.length,images:s.images.length,shapes:s.shapes.length,text:s.textItems.length,lines:s.lines.length,groups:s.groups.length}};});
  return out;
}
function applyGeometry(o,a) {
  if (a.locked === false) o.locked=false;
  if (a.x!==undefined || a.y!==undefined) { var pos=o.position(); o.position={x:a.x===undefined?pos.x:a.x,y:a.y===undefined?pos.y:a.y}; }
  if (a.width!==undefined) o.width=a.width;
  if (a.height!==undefined) o.height=a.height;
  if (a.locked===true) o.locked=true;
}
function objectCollection(s,kind) { return s[{text:'textItems',shape:'shapes',image:'images',chart:'charts',line:'lines',group:'groups'}[kind]]; }
function applyObjectStyle(o,a) {
  if(a.font_name!==undefined)o.objectText.font=a.font_name;
  if(a.font_size!==undefined)o.objectText.size=a.font_size;
  if(a.text_color!==undefined)o.objectText.color=a.text_color;
  if(a.opacity!==undefined)o.opacity=a.opacity;
  if(a.rotation!==undefined)o.rotation=a.rotation;
  if(a.reflection!==undefined)o.reflectionShowing=a.reflection;
  if(a.reflection_value!==undefined)o.reflectionValue=a.reflection_value;
}
function objects(s) {
  var out=[];
  ['text','shape','image','chart','line','group'].forEach(function(kind){objectCollection(s,kind)().forEach(function(o,i){
    var item={kind:kind,index:i+1,position:o.position(),width:o.width(),height:o.height()};
    if(kind!=='group') item.locked=o.locked();
    if(kind==='text'||kind==='shape') {item.text=o.objectText();item.font_name=unwrap(o.objectText.font());item.font_size=unwrap(o.objectText.size());item.text_color=color16(o.objectText.color());}
    if(['text','shape','image'].indexOf(kind)>=0)item.opacity=o.opacity();
    if(['text','shape','image','line','group'].indexOf(kind)>=0)item.rotation=o.rotation();
    if(['text','shape','image','line'].indexOf(kind)>=0){item.reflection=o.reflectionShowing();item.reflection_value=o.reflectionValue();}
    out.push(item);
  });});
  return {objects:out};
}
function chartContext(d,b) {
  var s=lookup(d.sheets,b.source.sheet.index,'source sheet'),t=lookup(s.tables,b.source.table.index,'source table');
  var cs=lookup(d.sheets,b.chart.sheet.index,'chart sheet');
  if((b.source.sheet.name&&s.name()!==b.source.sheet.name)||(b.source.table.name&&t.name()!==b.source.table.name)||(b.chart.sheet.name&&cs.name()!==b.chart.sheet.name))fail('BINDING_STALE','The registered source or chart sheet changed. Inspect and register the known source again.');
  if(b.chart.index>cs.charts.length)fail('BINDING_STALE','The registered chart is missing.');
  var c=cs.charts[b.chart.index-1],full='A1:'+colName(t.columnCount())+t.rowCount();
  if(b.source.range!==full)fail('BINDING_STALE','Guided updates require the registered range to cover the entire source table. Its size may have changed.');
  if(t.headerRowCount()!==1||t.footerRowCount()!==0||t.filtered()||t.rowCount()<2||t.columnCount()<2)fail('CHART_SOURCE_LAYOUT','Guided sources need one header row, no footer/filter, at least two rows/columns.');
  if(t.rowCount()*t.columnCount()>500)fail('CHART_CELL_LIMIT','Guided chart sources support at most 500 cells.');
  var expectedHeaders=(b.orientation==='xy'||b.orientation==='xyz')?0:1;
  if(t.headerColumnCount()!==expectedHeaders)fail('CHART_SOURCE_LAYOUT','Source header-column layout does not match the declared orientation.');
  return {document_id:d.id(),path:getPath(d),guard:{
    source_sheet:{index:b.source.sheet.index,name:s.name()},source_table:{index:b.source.table.index,name:t.name(),rows:t.rowCount(),columns:t.columnCount(),header_rows:t.headerRowCount(),header_columns:t.headerColumnCount(),footer_rows:t.footerRowCount(),filtered:t.filtered(),locked:t.locked()},
    chart_sheet:{index:b.chart.sheet.index,name:cs.name()},chart:{index:b.chart.index,count:cs.charts.length,position:c.position(),width:c.width(),height:c.height(),locked:c.locked()}
  },source:readCells(t,full)};
}
function resolveApp() {
  var url=$.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier('com.apple.iWork.Numbers');
  if (url && !url.isNil()) return ObjC.unwrap(url.path);
  var paths=['/Applications/Numbers.app',ObjC.unwrap($.NSHomeDirectory())+'/Applications/Numbers.app'];
  for(var i=0;i<paths.length;i++) if($.NSFileManager.defaultManager.fileExistsAtPath(paths[i])) return paths[i];
  fail('NUMBERS_NOT_INSTALLED','Install Apple Numbers on this Mac.');
}

function createChartDocument(app,a) {
  var p=a._chart_profile;
  if(!p||p.id!==a.profile)fail('CHART_PROFILE_REQUIRED','Use a verified chart profile.');
  if(app.version()!==p.verified_numbers)fail('CHART_PROFILE_UNVERIFIED','Chart profiles are verified for Numbers '+p.verified_numbers+'. This release needs native template verification before chart creation is enabled. Other native tools remain available.');
  if($.NSFileManager.defaultManager.fileExistsAtPath(a.path))fail('DESTINATION_EXISTS','Destination exists.');
  var templates=app.templates().filter(function(t){return t.id()===p.template_id;});
  if(templates.length!==1)fail('TEMPLATE_NOT_FOUND','This Numbers release does not include the required chart template.');
  var created=app.Document({documentTemplate:templates[0]});created.make();
  var phase='template validation',saved=false;
  try {
    var expectedSheets=p.template_id==='Application/21_Simple_Charts/Traditional'?8:1;
    if(created.sheets.length!==expectedSheets)fail('CHART_TEMPLATE_CHANGED','Template sheet layout differs from the verified profile.');
    var initial=created.sheets[p.sheet-1];
    if(initial.tables.length!==1||initial.charts.length!==p.chart_count)fail('CHART_TEMPLATE_CHANGED','Template object counts differ from the verified profile.');
    var initialTable=initial.tables[0];
    if(initialTable.rowCount()!==p.rows||initialTable.columnCount()!==p.columns||initialTable.headerRowCount()!==1||initialTable.headerColumnCount()!==p.header_columns)fail('CHART_TEMPLATE_CHANGED','Template source table differs from the verified profile.');
    phase='initial save';app.save(created,{in:Path(a.path)});saved=true;
    phase='template preparation';
    for(var i=created.sheets.length-1;i>=0;i--)if(i!==p.sheet-1)app.delete(created.sheets[i]);
    var s=created.sheets[0];
    for(var i=s.charts.length-1;i>=0;i--)if(i!==p.chart-1)app.delete(s.charts[i]);
    for(var i=s.textItems.length-1;i>=0;i--)app.delete(s.textItems[i]);
    s.name='Chart';var t=s.tables[0],c=s.charts[0];t.name='Chart data';
    // Remove unlinked blank columns from Table and Chart before expanding INSIDE
    // the existing reference. Appending outside a reference is not equivalent.
    if(p.id==='column')t.columnCount=3;
    var matrix=[a.headers].concat(a.data);
    if(p.orientation==='rows')matrix=matrix[0].map(function(_,x){return matrix.map(function(row){return row[x];});});
    var rows=matrix.length,columns=matrix[0].length;
    phase='source resize';
    while(t.rowCount()<rows)app.addRowAbove(t.rows[t.rowCount()-1]);
    while(t.columnCount()<columns)app.addColumnBefore(t.columns[t.columnCount()-1]);
    if(t.rowCount()>rows)t.rowCount=rows;
    if(t.columnCount()>columns)t.columnCount=columns;
    phase='source population';
    t.ranges.byName('A1:'+colName(columns)+rows).format='number';
    for(var y=0;y<rows;y++)for(var x=0;x<columns;x++) {
      var cell=t.cells.byName(colName(x+1)+(y+1)),v=matrix[y][x];
      if(typeof v==='string')cell.format='text';
      cell.value=v;
    }
    phase='layout';
    c.locked=false;c.position={x:30,y:140};c.width=600;c.height=340;
    t.locked=false;t.position={x:30,y:600};
    if(a.title){var title=app.TextItem({objectText:a.title});s.textItems.push(title);title.position={x:30,y:10};title.width=600;title.height=45;title.objectText.size=22;}
    created.activeSheet=s;app.save(created);
    var out=inspect(created);
    out.chart={profile:p.id,index:1,template_id:p.template_id,type_source:'verified template profile; not a native chart-type readback',title_is_separate_text_item:!!a.title,internal_title_editable:false,source:{sheet:1,table:1,range:'A1:'+colName(columns)+rows,series_orientation:p.orientation==='rows'?'rows':'columns'},input_headers:a.headers,input_points:a.data.length};
    if(p.fixed_axes){out.chart.fixed_axes=p.fixed_axes;out.chart.notice=p.scope;}
    out.source_values=t.cells.value().map(unwrap);
    return out;
  } catch(e) {
    if(!saved&&phase==='template validation'){app.close(created,{saving:'no'});throw e;}
    fail(e.errorNumber===-1712?'APPLE_EVENT_TIMEOUT':'CHART_CREATION_INCOMPLETE','Chart creation failed during '+phase+'. Inspect this document before any retry.',{document_id:created.id(),path:a.path,phase:phase,native_message:e.message});
  }
}

function execute(action,a) {
  var path=resolveApp(), app=Application(path);
  if(action==='diagnostics') {
    if(a.launch){app.launch();app.documents.length;}
    return {numbers_path:path,numbers_version:app.version(),running:app.running(),automation_tested:!!a.launch,macos:ObjC.unwrap($.NSProcessInfo.processInfo.operatingSystemVersionString),locale:ObjC.unwrap($.NSLocale.currentLocale.localeIdentifier),pdf_renderer:pdfCapability(),templates:a.launch?app.templates().map(function(t){return t.id();}):[]};
  }
  if(action==='status') {
    if(a.launch) {app.launch(); app.documents.length;}
    return {platform:'macOS',numbers_path:path,numbers_version:app.version(),running:app.running(),automation_tested:!!a.launch,transport:'local stdio / Apple Events',limits:{cells_per_call:2000,axis_changes_per_call:100,timeout_seconds:120,atomic_mutations:false,chart_creation:'new document from verified native template profiles',chart_profiles_verified_numbers:'14.5',chart_profile_version_verified:app.version()==='14.5',chart_creation_cells:500,custom_native_prototypes:true,guided_chart_updates:true,chart_companion_metadata:true,write_format_preservation:'compatible exposed base formats',arbitrary_chart_insertion:false,chart_series_editing:false,chart_source_cell_editing:true,accessibility:false,pivot_creation:false,conditional_formatting_rules:false,excel_conversion:false}};
  }
  if(action==='documents'&&!app.running()) return {documents:[]};
  app.launch();
  if(action==='documents') return {documents:app.documents().map(info)};
  if(action==='templates') return {templates:app.templates().map(function(t){return {id:t.id(),name:t.name()};})};
  if(action==='template_check') {
    var matching=app.documents().filter(function(d){return canonicalNativePath(getPath(d))===canonicalNativePath(a.path);});
    if(matching.some(function(d){return d.modified();}))fail('TEMPLATE_UNSAVED','Save or close the prototype before copying it. The source is never saved implicitly.');
    return {open:matching.length>0,source_path:a.path};
  }
  if(action==='chart_create')return createChartDocument(app,a);
  if(action==='create') {
    if($.NSFileManager.defaultManager.fileExistsAtPath(a.path)) fail('DESTINATION_EXISTS','Destination exists.');
    var props={};
    {
      var templateID=a.template_id||'Application/Blank/Traditional';
      var ts=app.templates().filter(function(t){return t.id()===templateID;});
      if(ts.length!==1) fail('TEMPLATE_NOT_FOUND','Unknown template ID. List templates first.');
      props.documentTemplate=ts[0];
    }
    var created=app.Document(props); created.make();
    app.save(created,{in:Path(a.path)});
    return inspect(created);
  }
  if(action==='open') {
    var opened=app.open(Path(a.path));
    if(Array.isArray(opened)) opened=opened[0];
    return inspect(opened);
  }
  var d=documentById(app,a.document_id);
  if(action==='preview')return renderPreview(app,d,a);
  if(action==='chart_context')return chartContext(d,a.binding);
  if(action==='chart_prepare') {
    if(JSON.stringify(chartContext(d,a.binding))!==JSON.stringify(a.expected))fail('CHART_REVISION_CHANGED','Source data or structure changed since preview. Generate a fresh preview.');
    var sh=lookup(d.sheets,a.binding.source.sheet.index,'sheet'),source=lookup(sh.tables,a.binding.source.table.index,'table');
    if(a.rows<2||a.columns<2||a.rows*a.columns>500)fail('CHART_CELL_LIMIT','Invalid guided source dimensions.');
    // Growth within the existing reference, never append outside it.
    while(source.rowCount()<a.rows)app.addRowAbove(source.rows[source.rowCount()-1]);
    while(source.columnCount()<a.columns)app.addColumnBefore(source.columns[source.columnCount()-1]);
    if(source.rowCount()>a.rows)source.rowCount=a.rows;
    if(source.columnCount()>a.columns)source.columnCount=a.columns;
    return {prepared:true,rows:source.rowCount(),columns:source.columnCount()};
  }
  if(action==='document_info') return info(d);
  if(action==='inspect') return inspect(d);
  if(action==='save') { if(!getPath(d)) fail('UNSAVED_DOCUMENT','Save this document in Numbers first, or create a new document with numbers_create.'); app.save(d);return info(d); }
  if(action==='close') { if(a.save&&!getPath(d)) fail('UNSAVED_DOCUMENT','Choose a path and save in Numbers first.'); app.close(d,{saving:a.save?'yes':'no'});return {closed:true,document_id:a.document_id,saved:a.save}; }
  if(action==='export') {
    if($.NSFileManager.defaultManager.fileExistsAtPath(a.path)) fail('DESTINATION_EXISTS','Destination exists.');
    app.export(d,{to:Path(a.path),as:a.format==='pdf'?'PDF':'CSV'});
    return {path:a.path,format:a.format,source_path:getPath(d),exists:!!$.NSFileManager.defaultManager.fileExistsAtPath(a.path)};
  }
  if(action==='sheet') {
    var sh;
    if(a.action==='create') {requireName(a);unique(d.sheets,a.name);sh=app.Sheet({name:a.name});d.sheets.push(sh);}
    else {
      sh=lookup(d.sheets,a.sheet,'sheet');
      if(a.action==='delete') {if(d.sheets.length<=1) fail('LAST_SHEET','Cannot delete the last sheet.');app.delete(sh);return inspect(d);}
      if(a.action==='rename') {requireName(a);unique(d.sheets,a.name);sh.name=a.name;}
      if(a.action==='activate') d.activeSheet=sh;
    }
    return inspect(d);
  }
  if(action==='selection'&&!a.range) return {document_id:a.document_id,active_sheet:d.activeSheet.name(),selections:d.sheets().map(function(s){return {sheet:s.name(),tables:s.tables().map(function(t){var r=t.selectionRange();return {table:t.name(),range:r?r.name():null};})};})};
  var s=lookup(d.sheets,a.sheet,'sheet');
  if(action==='objects') return objects(s);
  if(action==='object') {
    var collection=objectCollection(s,a.kind),o;
    if(a.action==='create') {
      if(['text','shape','image'].indexOf(a.kind)<0) fail('UNSUPPORTED','Only text, shape and image creation are supported.');
      if(a.kind==='image'&&!a.image_path) fail('IMAGE_PATH_REQUIRED','Image creation requires image_path.');
      var p={}; if(a.text!==undefined)p.objectText=a.text;if(a.kind==='image')p.file=Path(a.image_path);
      o=app[{text:'TextItem',shape:'Shape',image:'Image'}[a.kind]](p);collection.push(o);
    } else {
      if(!a.object||a.object>collection.length) fail('NOT_FOUND','Use a current object index from numbers_objects.');o=collection[a.object-1];
      if(a.action==='delete') {app.delete(o);return objects(s);}
      if(a.text!==undefined) {if(a.kind!=='text'&&a.kind!=='shape')fail('UNSUPPORTED','Only text items and shapes expose object text.');o.objectText=a.text;}
    }
    applyGeometry(o,a);applyObjectStyle(o,a);return objects(s);
  }
  if(action==='table') {
    var target;
    if(a.action==='create') {
      requireName(a);unique(s.tables,a.name);
      target=app.Table({name:a.name,rowCount:a.rows||12,columnCount:a.columns||6});s.tables.push(target);
    } else {
      target=lookup(s.tables,a.table,'table');
      checkExpectedTarget(s,target,a);
      if(a.action==='delete') {app.delete(target);return inspect(d);}
      if(a.action==='rename') {requireName(a);unique(s.tables,a.name);target.name=a.name;}
    }
    var propsMap={rows:'rowCount',columns:'columnCount',header_rows:'headerRowCount',header_columns:'headerColumnCount',footer_rows:'footerRowCount',freeze_header_rows:'headerRowsFrozen',freeze_header_columns:'headerColumnsFrozen'};
    Object.keys(propsMap).forEach(function(k){if(a[k]!==undefined)target[propsMap[k]]=a[k];});
    applyGeometry(target,a);return inspect(d);
  }
  var t=lookup(s.tables,a.table,'table');
  if(action==='read'||action==='find') return readCells(t,a.range);
  if(action==='selection') {bounds(t,a.range);d.activeSheet=s;t.selectionRange=t.ranges.byName(a.range);return {sheet:s.name(),table:t.name(),range:t.selectionRange.name()};}
  if(action==='write') {
    var b=bounds(t,a.range),completed=0,formatExpectations=[];
    if(!a._write_formats||a._write_formats.length!==a.values.length*a.values[0].length)fail('FORMAT_PREFLIGHT_REQUIRED','Write format preflight is missing or changed size. Read the table and retry deliberately.');
    checkExpectedTarget(s,t,a);
    try {
      for(var y=0;y<a.values.length;y++) for(var x=0;x<a.values[y].length;x++) {
        var v=a.values[y][x],c=t.cells.byName(colName(b.column+x)+(b.row+y));
        formatExpectations.push(assignValue(c,v,a._write_formats[completed],a.preserve_format!==false));
        completed++;
      }
    } catch(e) {fail('PARTIAL_WRITE','Write failed after '+completed+' cells. Read the range before deciding what to do next.',{completed_cells:completed,native_message:e.message});}
    var readback=readCells(t,a.range);readback.written=completed;readback.format_expectations=formatExpectations;return readback;
  }
  if(action==='format') {
    bounds(t,a.range);var r=t.ranges.byName(a.range);
    var mapping={format:'format',font_name:'fontName',font_size:'fontSize',text_color:'textColor',background_color:'backgroundColor',alignment:'alignment',vertical_alignment:'verticalAlignment',text_wrap:'textWrap'};
    Object.keys(mapping).forEach(function(k){if(a[k]!==undefined)r[mapping[k]]=a[k];});
    return {range:a.range,format:unwrap(r.format()),font_name:unwrap(r.fontName()),font_size:unwrap(r.fontSize()),text_color:color16(r.textColor()),background_color:color16(r.backgroundColor()),alignment:unwrap(r.alignment()),vertical_alignment:unwrap(r.verticalAlignment()),text_wrap:unwrap(r.textWrap())};
  }
  if(action==='clear') {
    var b=bounds(t,a.range);
    if(a.styling)app.clear(t.ranges.byName(a.range));
    else for(var y=b.row;y<=b.endRow;y++)for(var x=b.column;x<=b.endColumn;x++)t.cells.byName(colName(x)+y).value=null;
    return readCells(t,a.range);
  }
  if(action==='merge') {bounds(t,a.range);app[a.action](t.ranges.byName(a.range));return {action:a.action,range:a.range};}
  if(action==='sort') {if(a.column>t.columnCount())fail('COLUMN_OUT_OF_BOUNDS','Sort column exceeds table width.');app.sort(t,{by:t.columns[a.column-1],direction:a.direction});return tableInfo(t);}
  if(action==='transpose') {app.transpose(t);return tableInfo(t);}
  if(action==='axis') {
    var collection=a.axis==='row'?t.rows:t.columns, count=collection.length;
    if(a.at>count)fail('INDEX_OUT_OF_BOUNDS','at must identify an existing row or column.');
    if(a.action==='delete'&&(a.at+a.count-1>count||a.count>=count))fail('INDEX_OUT_OF_BOUNDS','Deletion exceeds the axis or would remove every row/column.');
    for(var i=0;i<a.count;i++) {
      var item=collection[a.at-1];
      if(a.action==='delete')app.remove(item);
      else app[a.axis==='row'?'addRowAbove':'addColumnBefore'](item);
    }
    return tableInfo(t);
  }
  if(action==='dimensions') {
    var collection=a.axis==='row'?t.rows:t.columns;
    if(a.last<a.first||a.last>collection.length||a.last-a.first>=2000)fail('INDEX_OUT_OF_BOUNDS','Invalid axis interval (max 2,000 items).');
    for(var i=a.first-1;i<a.last;i++)collection[i][a.axis==='row'?'height':'width']=a.size;
    var sizes=[];for(var i=a.first-1;i<a.last;i++)sizes.push(a.axis==='row'?collection[i].height():collection[i].width());
    return {axis:a.axis,first:a.first,last:a.last,sizes:sizes};
  }
  fail('UNKNOWN_ACTION','Unknown native action.');
}

function run() {
  try {
    var input=$.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
    var request=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(input,$.NSUTF8StringEncoding)));
    return JSON.stringify({ok:true,result:execute(request.action,request.args||{})});
  } catch(e) {
    var code=e.nativeCode||'NATIVE_ERROR',message=e.message||String(e),details=e.details||{};
    if(e.errorNumber===-1743||message.indexOf('-1743')>=0) {code='AUTOMATION_DENIED';message='Allow the host application to control Numbers in System Settings > Privacy & Security > Automation.';}
    if(e.errorNumber===-1712) {code='APPLE_EVENT_TIMEOUT';message='Numbers timed out; the operation may have partially applied. Inspect it before retrying.';}
    if(e.errorNumber!==undefined)details.apple_event_number=e.errorNumber;
    return JSON.stringify({ok:false,error:{code:code,message:message,details:details}});
  }
}
