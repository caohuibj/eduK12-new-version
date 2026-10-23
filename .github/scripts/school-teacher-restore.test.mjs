import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreStorageTables,snapshots} from './school-teacher-checks.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {backendEnvironment,backendCompactFactsEnabled}=require('../../server-version/e2e/school-teacher-browser.cjs');
const tables=['assessments','composite_form_answers','composite_form_section_attempts','composite_assessment_attempts','assessment_run_executions','relational_assessment_assignments','assessment_result_facts'];
const identity={head:'a'.repeat(40),runId:'123'};
const report=()=>({status:'PASSED',source:{head:identity.head},runId:identity.runId,startups:['SCHOOL','TEACHER'].map(product=>({product,ready:true})),storageModes:['SCHOOL','TEACHER'].map(product=>({product,compactFactsEnabled:backendEnvironment({runtimeUrl:'synthetic',secrets:{}},'/tmp/synthetic',3187,'redis://127.0.0.1',product,{ASSESSMENT_COMPACT_FACTS_ENABLED:'true'}).ASSESSMENT_COMPACT_FACTS_ENABLED==='true'}))});
test('restore mode is tied to both actual backend environments and current successful journey, not ambient CI flags',()=>{
 assert.throws(()=>backendCompactFactsEnabled({ASSESSMENT_COMPACT_FACTS_ENABLED:'unknown'}));
 assert.deepEqual(restoreStorageTables(tables,report(),identity).at(-1),{table:'assessment_result_facts',expectEmpty:true});
 for(const mutate of [r=>delete r.storageModes[0].compactFactsEnabled,r=>r.storageModes[0].compactFactsEnabled=true,r=>r.startups[1].ready=false,r=>r.runId='old',r=>r.source.head='old',r=>r.status='FAILED']){const r=report();mutate(r);assert.throws(()=>restoreStorageTables(tables,r,identity));}
 assert.throws(()=>restoreStorageTables(tables.filter(x=>x!=='assessments'),report(),identity));
});
test('restore snapshots keep full columns and hashes, reject empty actual facts and require disabled compact rows to remain exactly zero',async()=>{
 const client=values=>({query:async sql=>sql.startsWith('SELECT column_name')?{rows:[{column_name:'id'},{column_name:'value'}]}:{rows:values.map(value=>({row:JSON.stringify(value)}))}});
 await assert.rejects(snapshots(client([]),['assessments']));
 await assert.rejects(snapshots(client([]),[{table:'assessments',expectEmpty:true}]));
 const empty=await snapshots(client([]),[{table:'assessment_result_facts',expectEmpty:true}]);assert.equal(empty[0].count,0);assert.deepEqual(await snapshots(client([]),empty),empty);
 await assert.rejects(snapshots(client([{id:'synthetic'}]),empty));
 const before=await snapshots(client([{id:'synthetic',value:'one'}]),['assessments']);assert.deepEqual(before[0].columns,['id','value']);assert.deepEqual(await snapshots(client([{id:'synthetic',value:'one'}]),before),before);
 assert.notDeepEqual(await snapshots(client([{id:'synthetic',value:'changed'}]),before),before);
});
