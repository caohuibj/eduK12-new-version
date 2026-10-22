import {verifyOfficialSource} from './admin-authenticator-reuse.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {bindings,marker,branch,authenticatorPlan,authenticatorOutputs} from './admin-authenticator-scope.mjs';
import {verifyLocalReports} from './admin-authenticator-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head='a'.repeat(40),env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_PR_REPOSITORY:'caohuibj/eduK12-new-version'};
const entries=[...Object.entries(bindings.source).map(([file,b])=>({file,status:b.before?'M':'A',oldMode:b.before?'100644':'000000',newMode:'100644'})),...bindings.controls.map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}))];
const read=(_command,value)=>{
 const [revision,...parts]=value.split(':'),file=parts.join(':');
 if(file==='server-version/backend')return bindings.components.backend;
 if(file==='server-version/frontend')return bindings.components.frontend;
 if(bindings.source[file])return revision===bindings.base?bindings.source[file].before:bindings.source[file].after;
 if(bindings.historicalInputs[file])return bindings.historicalInputs[file];throw Error('Unexpected Git input: '+value);
};
const plan=()=>authenticatorPlan(entries,bindings.base,head,read,env);
test('pins all 33 product paths and keeps every legacy consumer disabled',()=>{
 const p=plan(),outputs=authenticatorOutputs(p);assert.equal(Object.keys(bindings.source).length,33);assert.equal(p.components.backend,bindings.components.backend);
 for(const key of ['frontend_build','run_performance_tests','ui_required','maintenance','frontend','content','presentation'])assert.equal(outputs[key],false);
 assert.equal(outputs.codeql,true);assert.equal(outputs.application_route,'admin-authenticator');
});
test('unknown, missing, deleted, renamed and executable paths are refused',()=>{
 for(const bad of [[...entries,{file:'new-unknown.ts',status:'A',oldMode:'000000',newMode:'100644'}],entries.slice(1),entries.map((e,i)=>i?e:{...e,status:'D'}),entries.map((e,i)=>i?e:{...e,newMode:'100755'}),[...entries,entries[0]]])assert.throws(()=>authenticatorPlan(bad,bindings.base,head,read,env));
});
test('rejects new base, source drift, foreign branch, external PR, full and manual events',()=>{
 assert.throws(()=>authenticatorPlan(entries,'b'.repeat(40),head,read,env));
 assert.throws(()=>authenticatorPlan(entries,bindings.base,head,()=> 'c'.repeat(40),env));
 for(const override of [{CI_EVENT:'workflow_dispatch'},{CI_FORCE_FULL:'true'},{CI_HEAD_REF:'another-branch'},{CI_PR_REPOSITORY:'foreign/repo'}])assert.throws(()=>authenticatorPlan(entries,bindings.base,head,read,{...env,...override}));
 assert.throws(()=>authenticatorPlan(entries.filter(e=>e.file!==marker),bindings.base,head,read,env));
});
test('a normal unrelated diff stays on its existing route',()=>assert.equal(authenticatorPlan([],bindings.base,head,read,{CI_EVENT:'pull_request',CI_HEAD_REF:'unrelated'}),null));
test('strict gate rejects draft, failure, skipped, absent and forged flags',()=>{
 const outputs=Object.fromEntries(Object.entries(authenticatorOutputs(plan())).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs},'admin-authenticator':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','admin-authenticator','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 assert.ok(failedChecks(needs,true).length);
 for(const key of ['scope','admin-authenticator','codeql'])for(const result of ['failure','skipped','cancelled',undefined])assert.ok(failedChecks({...needs,[key]:{...needs[key],result}},false).length);
 assert.ok(failedChecks({...needs,scope:{...needs.scope,outputs:{...outputs,frontend_build:'true'}}},false).length);
});
test('admits 83 unique historical assertions, never the 12 filtered ones',()=>{
 const r=verifyLocalReports();assert.equal(r.passed,83);assert.equal(r.ciExecuted,false);assert.equal(r.originalExecutionSigned,false);assert.equal(r.skippedAssertionsAdmitted,0);
});
test('altered historical reports cannot be admitted',()=>assert.throws(()=>verifyLocalReports(name=>Buffer.concat([readFileSync('.github/evidence/admin-authenticator/'+name),Buffer.from(' ')]))));
test('workflow has no duplicated application tests or production image claim',()=>{
 const ci=readFileSync('.github/workflows/ci-admin-authenticator.yml','utf8');assert.ok(!ci.includes('vitest'));assert.ok(ci.includes('node .github/scripts/admin-authenticator-reuse.mjs'));assert.ok(!ci.includes('vite build'));assert.ok(!ci.includes('prisma migrate deploy'));
 const main=readFileSync('.github/workflows/ci.yml','utf8');assert.ok(main.includes('needs: [scope, admin-authenticator,'));assert.ok(main.includes("application_route == 'admin-authenticator'"));
});

test('official reuse rejects wrong run, failed audit, foreign repository and expired source',()=>{
 const b=bindings.officialReuse,s=b.frontend,now=Date.now();
 const run={id:b.runId,head_sha:b.head,event:'pull_request',path:'.github/workflows/ci.yml',head_repository:{full_name:'caohuibj/eduK12-new-version'},pull_requests:[{number:333}]};
 const job={id:s.jobId,run_id:b.runId,name:s.jobName,status:'completed',conclusion:'success',completed_at:new Date(now-60000).toISOString(),steps:[{name:'integrated app types and one frontend compilation',conclusion:'success'},{name:'audit actual production dependency closure at HIGH threshold',conclusion:'success'}]};
 verifyOfficialSource(run,job,'frontend',now);
 for(const override of [{id:1},{head_sha:'a'.repeat(40)},{head_repository:{full_name:'external/repo'}},{event:'workflow_dispatch'},{pull_requests:[]}])assert.throws(()=>verifyOfficialSource({...run,...override},job,'frontend',now));
 for(const override of [{conclusion:'failure'},{completed_at:new Date(now-25*3600000).toISOString()},{steps:job.steps.slice(0,1)}])assert.throws(()=>verifyOfficialSource(run,{...job,...override},'frontend',now));
});
