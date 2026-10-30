import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {binding,CONTROLS,TASK1_CONTROLS,MARKER,BRANCHES,onboardingPlan,onboardingOutputs} from './onboarding-scope.mjs';
import {verifyTask1Evidence,verifyTask1ControlEvidence,task1Pointer,task1Report,task1SastConfig,requireOnboardingOutcomes} from './onboarding-checks.mjs';
import {changedEntries} from './content-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const h=c=>c.repeat(40),head=h('a'),source=h('b'),tree=h('c'),blob=h('d');
const review=JSON.parse(readFileSync('.github/scripts/onboarding-evidence.json')).candidates.task1;
function fixture(){
 const b={...binding.candidates.task1,enabled:true,controlCheckpoint:h('e')},controls=[...CONTROLS,...TASK1_CONTROLS];
 const entries=[...Object.entries(b.source).map(([file,v])=>({file,status:v.before?'M':'A',oldMode:v.before?'100644':'000000',newMode:'100644'})),...controls.map(file=>({file,status:b.controlBefore[file]?'M':'A',oldMode:b.controlBefore[file]?'100644':'000000',newMode:'100644'}))];
 const env={GITHUB_REPOSITORY:'caohuibj/eduK12-new-version',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_EVENT:'pull_request',CI_PR_NUMBER:'9001',CI_HEAD_REF:BRANCHES.task1,CI_SOURCE_HEAD:source,CI_IS_DRAFT:'false'};
 const read=(cmd,ref,...rest)=>{
  if(cmd==='ls-tree'){const path=rest.at(-1),before=b.controlBefore[path];return ref===b.base?(before?`100644 blob ${before}\t${path}`:''):`100644 blob ${blob}\t${path}`;}
  if(cmd==='rev-parse'){
   if(ref.endsWith('^{tree}'))return tree;
   for(const p of ['backend','frontend'])if(ref.endsWith(':server-version/'+p))return b.components[p];
   const index=ref.indexOf(':'),commit=ref.slice(0,index),path=ref.slice(index+1);return commit===b.base?(b.source[path]?.before??b.controlBefore[path]):b.source[path]?.after;
  }
  throw Error('Unexpected fixture Git command');
 };
 return {b,entries,env,read};
}
test('Task1 exact candidate remains disabled, while its reviewed scope permits both components without numeric PR guessing',()=>{
 const f=fixture();assert.equal(binding.candidates.task1.enabled,false);
 const p=onboardingPlan(f.entries,f.b.base,head,f.read,f.env,f.b);assert.equal(p.pr,'task1');assert.equal(p.product,'e71d5f71f7223fefdce3e4f36ee0f6e619acf361');
 assert.throws(()=>onboardingPlan(f.entries,f.b.base,head,f.read,f.env,{...f.b,enabled:false}),/pending independent activation review/);
 for(const patch of [{CI_EVENT:'workflow_dispatch'},{CI_PR_NUMBER:'task1'},{CI_PR_NUMBER:'0'},{CI_HEAD_REF:'other'},{CI_PR_REPOSITORY:'other/repo'},{CI_FORCE_FULL:'true'},{CI_FULL_ACCEPTANCE:'true'}])assert.throws(()=>onboardingPlan(f.entries,f.b.base,head,f.read,{...f.env,...patch},f.b));
 const outputs=onboardingOutputs(p);assert.equal(outputs.application_route,'onboarding-structure');assert.equal(outputs.scenario,'onboarding-structure');assert.equal(outputs.codeql,true);
});
test('Task1 scope refuses incomplete inventories, unknown source/control paths, modes, base and source/merge drift',()=>{
 const f=fixture(),call=(entries=f.entries,b=f.b,read=f.read,base=b.base)=>onboardingPlan(entries,base,head,read,f.env,b);
 assert.equal(call().pr,'task1');
 for(const entries of [f.entries.slice(1),[...f.entries,{file:'unknown',newMode:'100644'}],f.entries.map((v,i)=>i===0?{...v,newMode:'120000'}:v),f.entries.map((v,i)=>i===0?{...v,status:'D'}:v)])assert.throws(()=>call(entries));
 assert.throws(()=>call(f.entries,f.b,f.read,h('9')));
 assert.throws(()=>call(f.entries,f.b,(cmd,ref,...rest)=>ref===source+'^{tree}'?h('9'):f.read(cmd,ref,...rest)));
 const first=Object.keys(f.b.source)[0];assert.throws(()=>call(f.entries,f.b,(cmd,ref,...rest)=>ref===head+':'+first?h('9'):f.read(cmd,ref,...rest)));
 assert.throws(()=>call(f.entries,{...f.b,controlBefore:{...f.b.controlBefore,'unreviewed-control':null}}));
});
test('Task1 original embedded reports retain failed/filtered identities and only qualify the explicit disjoint passed selection',()=>{
 const result=verifyTask1Evidence(review);assert.equal(result.admitted.length,20);assert.equal(result.admitted.flatMap(r=>r.caseNames).length,57);assert.equal(result.observations[0].trialCount,136);
 assert(result.admitted.every(r=>r.ciExecuted===false));assert(result.types.every(t=>t.finalWholeTreeClaim===false));assert.deepEqual(result.openAcceptanceItems,['SAME_CP_SECOND_REGISTERED_NONEMPTY_R_BLOCKED']);
 const bad=structuredClone(review);bad.reports[0].selectedCases.push('not an original passed case');assert.throws(()=>verifyTask1Evidence(bad));
 assert.throws(()=>verifyTask1Evidence(review,path=>path===review.reports[0].path?Buffer.from('{}'):readFileSync(path)),/evidence drift/);
 const bytes=JSON.parse(readFileSync(review.reports[0].path));task1Pointer(bytes,review.reports[0].statusPointer).exitCode=1;
 const modified=Buffer.from(JSON.stringify(bytes)),badExit=structuredClone(review),digest=createHash('sha256').update(modified).digest('hex');
 for(const r of [...badExit.reports,...badExit.types])if(r.path===review.reports[0].path)r.sha256=digest;
 assert.throws(()=>verifyTask1Evidence(badExit,path=>path===review.reports[0].path?modified:readFileSync(path)));
});
test('Task1 projections cannot invent missing cases, empty successful selections or traverse non-owned pointers',()=>{
 assert.throws(()=>task1Pointer({},['missing']));assert.throws(()=>task1Pointer({},['__proto__']));assert.throws(()=>task1Report({success:true,passed:1,failed:0}));
 const bad=structuredClone(review);bad.reports[0].selectedCases=[];assert.throws(()=>verifyTask1Evidence(bad));
});
test('Task1 scan selection covers changed application and controls without selecting unrelated historical control sources',()=>{
 const f=fixture(),p=onboardingPlan(f.entries,f.b.base,head,f.read,f.env,f.b),config=task1SastConfig(p,f.b);
 for(const path of ['server-version/backend/src/modules/assessment-authorization/education-cognitive-profile-management.ts','server-version/frontend/src/pages/admin/EducationCognitiveConfigurations.tsx','.github/scripts/onboarding-checks.mjs','.github/scripts/task1-onboarding-controls.test.mjs'])assert(config.paths.includes(path));
 assert(config.paths.every(path=>/\.(?:[cm]?js|jsx|tsx?)$/.test(path)));assert(!config.paths.includes('.github/scripts/pr395-browser.mjs'));assert.throws(()=>task1SastConfig({...p,product:h('9')},f.b));
});
test('Task1 uses the existing admission/build/scan/gate, retaining missing builds once and leaving application producers dormant locally',()=>{
 const yaml=readFileSync('.github/workflows/ci.yml','utf8'),job=yaml.slice(yaml.indexOf('  onboarding-structure:\n'),yaml.indexOf('  report-planning:\n')),script=readFileSync('.github/scripts/onboarding-checks.mjs','utf8');
 assert(job.includes('node .github/scripts/onboarding-checks.mjs admit'));assert(job.includes('node .github/scripts/onboarding-checks.mjs task1-build'));assert(job.includes(".pr == 'task1'"));assert(job.includes('registry: https://registry.npmjs.org')||job.includes('NPM_CONFIG_REGISTRY: https://registry.npmjs.org'));assert(!job.includes('services:'));
 assert(yaml.includes('steps.task1-codeql-config.outputs.config ||'));assert(script.includes("['node_modules/typescript/bin/tsc']"));assert(script.includes("['node_modules/vite/bin/vite.js','build'"));assert(!job.includes('npm run build'));assert(!job.includes('npm test'));assert(job.includes('onboarding-evidence/'));
 const f=fixture(),p=onboardingPlan(f.entries,f.b.base,head,f.read,f.env,f.b),needs={scope:{result:'success',outputs:Object.fromEntries(Object.entries(onboardingOutputs(p)).map(([k,v])=>[k,String(v)]))},'onboarding-structure':{result:'success'},codeql:{result:'success'}};
 requireOnboardingOutcomes(needs);assert.deepEqual(requiredChecks(needs,false),['scope','onboarding-structure','codeql']);assert.equal(failedChecks(needs,false).length,0);assert(failedChecks(needs,true).length);
 for(const state of ['failure','cancelled','skipped',undefined]){const bad={...needs,'onboarding-structure':{result:state}};assert.throws(()=>requireOnboardingOutcomes(bad));assert(failedChecks(bad,false).length);}
});
test('Task1 control receipt admission preserves a failed original and requires an actual successful continuation',()=>{
 const log='ok 1 - unchanged\nnot ok 2 - repaired\n# pass 1\n# fail 1\n',next='ok 1 - repaired\n# pass 1\n# fail 0\n',sha=text=>createHash('sha256').update(text).digest('hex');
 const record=(id,log,exitCode,selectedCases)=>({id,log,logSHA256:sha(log),status:{command:['node','--test','controlled.test.mjs'],startedAt:'2026-10-30T00:00:00Z',finishedAt:'2026-10-30T00:00:01Z',exitCode},sourceAssociationBasis:'Unsigned synthetic control fixture only',selectedCases});
 const raw={schemaVersion:1,ciExecuted:false,originalExecutionSigned:false,reports:[{...record('first',log,1,['unchanged']),allowPartialFailure:true,failureContinuations:[{caseName:'repaired',reportId:'next'}]},record('next',next,0,['repaired'])],auxiliaryChecks:['ACTIONLINT','NODE_SYNTAX'].map(name=>({name,...record(name,'',0,[])}))};
 assert.equal(verifyTask1ControlEvidence(raw).length,2);assert.throws(()=>verifyTask1ControlEvidence({...raw,reports:raw.reports.slice(0,1)}));
 assert.throws(()=>verifyTask1ControlEvidence({...raw,reports:[]}));assert.throws(()=>verifyTask1ControlEvidence({...raw,auxiliaryChecks:[]}));
 const bad=structuredClone(raw);bad.reports[0].selectedCases=['repaired'];assert.throws(()=>verifyTask1ControlEvidence(bad));
 const missing=structuredClone(raw);delete missing.reports[1].status.exitCode;assert.throws(()=>verifyTask1ControlEvidence(missing));
});
test('Task1 final Git binding preserves disabled production state and verifies the actual fixed source/control inventory',{skip:process.env.TASK1_BINDING_FINAL_CHECK!=='1'},()=>{
 const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(),b=binding.candidates.task1,head=git('rev-parse','HEAD');
 assert.equal(b.enabled,false);const env={GITHUB_REPOSITORY:'caohuibj/eduK12-new-version',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_EVENT:'pull_request',CI_PR_NUMBER:'9001',CI_HEAD_REF:BRANCHES.task1,CI_SOURCE_HEAD:head,CI_IS_DRAFT:'false'};
 const retained=verifyTask1ControlEvidence(JSON.parse(readFileSync('docs/precise-authorization-20261029/ci-control-raw.json')));assert.equal(retained.flatMap(r=>r.caseNames).length,9);
 assert.throws(()=>onboardingPlan(changedEntries(b.base,head),b.base,head,git,env,b),/pending independent activation review/);
 const p=onboardingPlan(changedEntries(b.base,head),b.base,head,git,env,{...b,enabled:true});assert.equal(p.product,b.product);assert.equal(p.controlCheckpoint,b.controlCheckpoint);assert.equal(p.pr,'task1');
});
