import assert from 'node:assert/strict';
import {test} from 'node:test';
import {binding,bindingPath,trainingWorkspacePlan,trainingWorkspaceOutputs} from './training-workspace-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head='a'.repeat(40);
const entries=()=>[...Object.entries(binding.source).map(([file,b])=>({file,status:b.before?'M':'A',oldMode:b.before?'100644':'000000',newMode:'100644'})),{file:bindingPath,status:'A',oldMode:'000000',newMode:'100644'}];
const read=(_,ref)=>{const [sha,file]=ref.split(':');return binding.source[file]?.[sha===binding.base?'before':'after']};
test('admits exactly the frozen integrated application and no unrelated acceptance',()=>{
 const p=trainingWorkspacePlan(entries(),binding.base,head,read),out=trainingWorkspaceOutputs(p);
 assert.equal(p.sourceCount,60);assert.equal(out.perf_smoke,false);assert.equal(out.ops,false);assert.equal(out.frontend_build,false);
 assert.deepEqual(requiredChecks({scope:{outputs:out}},false),['scope','training-workspace','codeql']);
});
for(const [label,mutate]of [
 ['unknown source',e=>e.push({file:'server-version/backend/prisma/schema.prisma',status:'M',oldMode:'100644',newMode:'100644'})],
 ['missing source',e=>e.splice(0,1)],['deletion',e=>{e[0].status='D';e[0].newMode='000000'}],
 ['symlink',e=>{e[0].newMode='120000'}],['duplicate',e=>e.push({...e[0]})],['changed binding',e=>{e.at(-1).status='M';e.at(-1).oldMode='100644'}],
])test('rejects '+label,()=>{const e=entries();mutate(e);assert.throws(()=>trainingWorkspacePlan(e,binding.base,head,read))});
test('rejects changed product blobs and moved base',()=>{
 assert.throws(()=>trainingWorkspacePlan(entries(),binding.base,head,()=>head));
 assert.throws(()=>trainingWorkspacePlan(entries(),head,head,read));
 assert.equal(trainingWorkspacePlan([],binding.base,head),null);
});
test('requires all real jobs and refuses draft, failure, missing and skipped qualification',()=>{
 const outputs=Object.fromEntries(Object.entries(trainingWorkspaceOutputs(trainingWorkspacePlan(entries(),binding.base,head,read))).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs},'training-workspace':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(failedChecks(needs,false),[]);assert.ok(failedChecks(needs,true).length);
 for(const key of ['scope','training-workspace','codeql'])for(const result of ['failure','skipped','cancelled',undefined])assert.ok(failedChecks({...needs,[key]:{...needs[key],result}},false).length);
 assert.ok(failedChecks({...needs,scope:{...needs.scope,outputs:{...outputs,perf_smoke:'true'}}},false).length);
});
test('rejects full/manual execution rather than using the platform fallback',()=>{
 const previous={event:process.env.CI_EVENT,force:process.env.CI_FORCE_FULL};
 try{process.env.CI_EVENT='workflow_dispatch';assert.throws(()=>trainingWorkspacePlan(entries(),binding.base,head,read));process.env.CI_EVENT='pull_request';process.env.CI_FORCE_FULL='true';assert.throws(()=>trainingWorkspacePlan(entries(),binding.base,head,read))}
 finally{for(const[k,v]of Object.entries({CI_EVENT:previous.event,CI_FORCE_FULL:previous.force})){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});
