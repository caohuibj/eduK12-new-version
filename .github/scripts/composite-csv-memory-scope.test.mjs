import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {binding,bindingPath,compositeCsvMemoryPlan,compositeCsvMemoryOutputs} from './composite-csv-memory-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head='1'.repeat(40),entry=file=>({file,status:file===bindingPath?'A':'M',oldMode:file===bindingPath?'000000':'100644',newMode:'100644'});
const rows=[bindingPath,...Object.keys(binding.source)].map(entry);
const read=(op,value)=>{const i=value.indexOf(':');return binding.source[value.slice(i+1)][value.slice(0,i)===binding.base?'before':'after'];};
test('only exact CSV product blobs and ordinary modes enter; unknown input is refused',()=>{
 const p=compositeCsvMemoryPlan(rows,binding.base,head,read);assert.equal(p.route,'composite-csv-memory');
 for(const path of ['server-version/backend/package-lock.json','server-version/backend/src/workers/exportBatchTask.ts','server-version/frontend/src/main.tsx'])assert.throws(()=>compositeCsvMemoryPlan([...rows,entry(path)],binding.base,head,read));
 assert.throws(()=>compositeCsvMemoryPlan(rows,'2'.repeat(40),head,read));
 assert.throws(()=>compositeCsvMemoryPlan([...rows,rows[0]],binding.base,head,read));
 assert.throws(()=>compositeCsvMemoryPlan([rows[0]],binding.base,head,read));
 assert.throws(()=>compositeCsvMemoryPlan(rows,binding.base,head,()=> '3'.repeat(40)));
 for(const newMode of ['120000','100755','000000'])assert.throws(()=>compositeCsvMemoryPlan([{...rows[0],newMode},...rows.slice(1)],binding.base,head,read));
});
test('all selected actual jobs must succeed, with no application/full fallback',()=>{
 const p=compositeCsvMemoryPlan(rows,binding.base,head,read),outputs=Object.fromEntries(Object.entries(compositeCsvMemoryOutputs(p)).map(([k,v])=>[k,String(v)]));
 const n={scope:{result:'success',outputs},'composite-csv-memory':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(n,false),['scope','composite-csv-memory','codeql']);assert.deepEqual(failedChecks(n,false),[]);
 for(const job of requiredChecks(n,false))for(const result of ['failure','skipped','cancelled',undefined])assert(failedChecks({...n,[job]:{...n[job],result}},false).includes(job));
 assert(failedChecks(n,true).includes('scope'));
});
test('one backend compiler, no DB/frontend, strict consumer report and genuine function probe',()=>{
 const w=readFileSync(new URL('../workflows/ci-composite-csv-memory.yml',import.meta.url),'utf8');
 assert.match(w,/--target build/);assert.match(w,/--target runtime/);assert.match(w,/diff -qr/);
 assert.doesNotMatch(w,/prisma migrate|postgres:|redis:|playwright|frontend\/package/);
 assert.match(w,/assert.equal\(rows\[0\].status,'passed'/);assert.match(w,/--severity HIGH,CRITICAL/);
 const p=readFileSync(new URL('./composite-csv-memory-probe.cjs',import.meta.url),'utf8');
 assert.match(p,/declaration\(text,name\)/);assert.match(p,/\['threatPrefix','protectCsvCell'\]/);assert.match(p,/\['csvValue','exportCognitiveToCSV'\]/);
 assert.match(p,/assert.equal\(old.csv,current.csv/);assert.match(p,/not production peak memory/);
});

test('manual and forced platform requests cannot reinterpret this frozen candidate',()=>{
 const old={event:process.env.CI_EVENT,force:process.env.CI_FORCE_FULL};
 try{
  process.env.CI_EVENT='workflow_dispatch';assert.throws(()=>compositeCsvMemoryPlan(rows,binding.base,head,read));
  process.env.CI_EVENT='pull_request';process.env.CI_FORCE_FULL='true';assert.throws(()=>compositeCsvMemoryPlan(rows,binding.base,head,read));
 }finally{
  if(old.event===undefined)delete process.env.CI_EVENT;else process.env.CI_EVENT=old.event;
  if(old.force===undefined)delete process.env.CI_FORCE_FULL;else process.env.CI_FORCE_FULL=old.force;
 }
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 for(const block of ci.split(/\n  (?=probe-)/).slice(1))assert.match(block.split(/\n  [a-z]/)[0],/work\/composite-csv-memory-20261021/);
 assert.match(ci,/needs: \[scope, composite-csv-memory,/);
});
