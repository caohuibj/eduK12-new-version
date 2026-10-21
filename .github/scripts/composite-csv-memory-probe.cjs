'use strict';
// Isolated serialization-function microbenchmark, not a complete service or production peak measurement.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const path=require('node:path');
const ts=require(process.env.CSV_TYPESCRIPT_ROOT||path.resolve('server-version/backend/node_modules/typescript'));
const BASE='bcacf2430784533d117299b72e83f281a8f85c31';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=(ref,file)=>ref==='candidate'?fs.readFileSync(file,'utf8'):fs.readFileSync(path.join(process.env.CSV_BASELINE_ROOT,file),'utf8');
function declaration(text,name){
 const file=ts.createSourceFile('source.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const nodes=file.statements.filter(s=>ts.isFunctionDeclaration(s)?s.name?.text===name:ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text===name));
 assert.equal(nodes.length,1,'Unique actual source declaration required: '+name);
 if(ts.isVariableStatement(nodes[0]))assert.equal(nodes[0].declarationList.declarations.length,1);
 return nodes[0].getText(file);
}
function load(text,names,deps={}){
 const exact=names.map(name=>declaration(text,name)).join('\n');
 const js=ts.transpileModule(exact+'\nexport { '+names.join(',')+' };',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports',...Object.keys(deps),js)(exports,...Object.values(deps));
 return {exports,sourceHash:sha(exact)};
}
if(process.argv[2]==='child'){
 assert.equal(typeof global.gc,'function');
 const ref=process.argv[3];assert(['baseline','candidate'].includes(ref));
 const root='server-version/backend/src/';
 const guard=load(source(ref,root+'utils/exportCsvCell.ts'),['threatPrefix','protectCsvCell']);
 const cognitive=load(source(ref,root+'modules/cognitive/export.service.ts'),['csvValue','exportCognitiveToCSV']);
 let consumedRows;
 const composite=load(source(ref,root+'modules/composite/composite-export.service.ts'),['exportToCSV'],{
  protectCsvCell:guard.exports.protectCsvCell,
  exportCognitiveToCSV:(data,transform)=>{consumedRows=data.rows;return cognitive.exports.exportCognitiveToCSV(data,transform);},
 });
 const fields=Array.from({length:100},(_,i)=>({name:'f'+i,type:i%2?'string':'number',...(i%2?{formSource:{encoding:'SCALAR'}}:{})}));
 const rows=Array.from({length:1000},(_,r)=>Object.fromEntries(fields.map((f,i)=>[f.name,i%2?'\u200B=synthetic '+r+','+i:r-i])));
 const data={fields,rows};const inputHash=sha(JSON.stringify(data));
 global.gc();const before=process.memoryUsage().heapUsed;
 const output=composite.exports.exportToCSV(data);
 // Retain exactly the table observed at the real serializer boundary and the equal CSV output.
 global.gc();const after=process.memoryUsage().heapUsed;
 assert.equal(sha(JSON.stringify(data)),inputHash,'Input mutation');
 const replacementRows=consumedRows.filter((row,i)=>row!==rows[i]).length;
 console.log(JSON.stringify({ref,inputHash,csv:output,csvHash:sha(output),byteLength:Buffer.byteLength(output),replacementRows,
  retainedReplacementProperties:consumedRows.reduce((sum,row,i)=>sum+(row===rows[i]?0:Object.keys(row).length),0),
  retainedPreparationAndOutputHeapDelta:after-before,sourceHashes:{guard:guard.sourceHash,cognitive:cognitive.sourceHash,composite:composite.sourceHash}}));
}else{
 const run=ref=>JSON.parse(execFileSync(process.execPath,['--expose-gc',__filename,'child',ref],{encoding:'utf8',maxBuffer:16*1024*1024}));
 const old=run('baseline'),current=run('candidate');
 assert.equal(old.inputHash,current.inputHash);assert.equal(old.csv,current.csv,'Actual old/new serialization bytes must be identical');
 assert.equal(old.sourceHashes.guard,current.sourceHashes.guard,'CSV protection dependency changed');
 assert.equal(old.replacementRows,1000);assert.equal(current.replacementRows,0);
 assert.equal(old.retainedReplacementProperties,100000);assert.equal(current.retainedReplacementProperties,0);
 delete old.csv;delete current.csv;
 const result={status:'PASS',base:BASE,kind:'isolated actual-source serialization functions',rows:1000,fields:100,bytesEqual:true,baseline:old,candidate:current,
  limitation:'Retains the serializer input table to isolate removed copies. Heap samples include equal CSV output; not production peak memory, latency or full-service execution.'};
 fs.writeFileSync(process.env.CSV_PROBE_REPORT||'csv-memory-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
