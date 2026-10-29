import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {verifyCognitiveBatch,checkCognitiveDeclarations} from './cognitive-intake-check.mjs';
import {isDataModule} from './cognitive-content.mjs';
import os from 'node:os';
const require=createRequire(new URL('../../server-version/backend/package.json',import.meta.url));
const ts=require('typescript');
const id=(version='1.0.0')=>({testType:'reaction',engineVersion:'1.0.0',scoringVersion:version});
const packages=[{task:'reaction',identities:[id(),id('1.1.0')],directory:'task/reaction',acceptance:{frontendSuites:['src/modules/cognitive/shared.test.tsx','src/modules/cognitive/tasks/reaction/Reaction.test.tsx']}}];
const decision=identity=>({identity,technical:{ready:true,blockers:[]},pilotPublish:{ready:true,blockers:[]}});
function valid() {return structuredClone({schemaVersion:1,kind:'cognitive-onboarding-batch',selectionIsScopeEvidence:false,exitCode:0,selectedTasks:['reaction'],selectedIdentities:packages[0].identities,checks:[{name:'manifest',status:'PASS'},{name:'dependencies',status:'PASS'},{name:'frontend-acceptance',status:'PASS',details:{suites:packages[0].acceptance.frontendSuites,count:2}}],identityResults:packages[0].identities.map(identity=>({identity,checks:['contract','readiness','presentation','fixtures-scorer-report'].map(name=>({name,status:'PASS'}))})),decisions:packages[0].identities.map(decision)});}
const verify=report=>verifyCognitiveBatch(JSON.stringify(report),{tasks:['reaction']},packages);
test('batch verifier requires exact nonempty tasks identities actual suites all stages and ready gates',()=>{assert.equal(verify(valid()).exitCode,0);});
test('empty zero-exit legacy NDJSON and partial output cannot qualify',()=>{for(const output of ['', '{}',JSON.stringify(decision(id()))+'\n'+JSON.stringify(decision(id('1.1.0')))])assert.throws(()=>verifyCognitiveBatch(output,{tasks:['reaction']},packages));});
test('missing duplicate stale foreign failed cancelled or skipped stages reject',()=>{
  const changes=[r=>r.selectedTasks=[],r=>r.selectedTasks.push('reaction'),r=>r.selectedIdentities.pop(),r=>r.identityResults.pop(),r=>r.decisions.pop(),r=>r.checks.pop(),r=>r.identityResults[0].checks.pop(),r=>r.checks[2].details.suites=['unrelated'],r=>r.checks[2].details.count=0,r=>r.decisions[0].technical.ready=false,r=>r.decisions[0].pilotPublish.blockers=[{severity:'ERROR'}],r=>r.identityResults[0].identity.engineVersion='stale',r=>r.exitCode=1,r=>r.selectionIsScopeEvidence=true];
  for(const mutate of changes){const r=valid();mutate(r);assert.throws(()=>verify(r));}
  for(const status of ['FAIL','SKIPPED','CANCELLED',undefined]){const r=valid();r.checks[0].status=status;assert.throws(()=>verify(r));}
});

// Execute the real CLI orchestration in a VM with explicit synthetic leaf services.
// These tests validate batch execution/reporting, never application/scoring correctness.
async function cli(args,{identityFailure=false,discoveryFailure=false,acceptanceFailure=false}={}) {
  const source=fs.readFileSync(new URL('../../server-version/backend/src/scripts/cognitive-onboarding-check.ts',import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const calls={manifest:0,dependencies:0,acceptance:0,fixtures:[],suites:[]};let stdout='',stderr='';
  const proc={argv:['node','checker',...args],stdout:{write:x=>{stdout+=x;}},stderr:{write:x=>{stderr+=x;}},exitCode:undefined};
  const loaded=structuredClone(packages);
  const imports={
    '../modules/cognitive/onboarding/decision':{composeCognitiveOnboardingDecision:f=>({...decision(f.identity),technical:{ready:!f.technicalBlockers.some(b=>b.severity==='ERROR'),blockers:f.technicalBlockers},pilotPublish:{ready:!f.technicalBlockers.some(b=>b.severity==='ERROR')&&!f.pilotPublishBlockers.some(b=>b.severity==='ERROR'),blockers:f.pilotPublishBlockers}}),serializeCognitiveOnboardingDecision:d=>JSON.stringify(d)+'\n',formatCognitiveOnboardingDecision:d=>JSON.stringify(d)+'\n',cognitiveOnboardingExitCode:ds=>ds.length&&ds.every(d=>d.technical.ready&&d.pilotPublish.ready)?0:1},
    '../../../scripts/cognitive/manifests.cjs':{ROOT:'/synthetic',discover:()=>{if(discoveryFailure)throw Error('discovery failed');return loaded;},generate:()=>{calls.manifest++;}},
    '../../../scripts/cognitive/dependencies.cjs':{guard:()=>{calls.dependencies++;return 3;}},
    '../../../scripts/cognitive/acceptance.cjs':{runAcceptance:(_,p)=>{calls.acceptance++;calls.suites=p.acceptance.frontendSuites;if(acceptanceFailure)throw Error('real child failure');return calls.suites.length;}},
    '../../../scripts/cognitive/onboarding-selection.cjs':require('../../server-version/scripts/cognitive/onboarding-selection.cjs'),
    '../../../scripts/cognitive/content-policy.cjs':{classifyChangedPath:()=> 'TASK_OWNED'},
    '../modules/cognitive/cognitive.registry':{getCognitiveRegistryEntry:(_,__,version)=>{if(identityFailure&&version==='1.0.0')throw Error('first identity error');return {version};}},
    '../modules/cognitive/v2/registry':{buildCognitiveV2TaskDefinition:x=>x},
    '../modules/cognitive/v2/publication-gate':{validateTaskDefinition:()=>[]},
    '../modules/cognitive/library/product-readiness':{evaluateCognitiveProductReadiness:()=>({blockers:[]})},
    '../modules/cognitive/library/scientific-qualification':{evaluateCognitiveScientificQualification:()=>({maxEligibleMaturity:'PILOT'})},
    '../modules/cognitive/generated/scientific':{cognitiveGovernance:loaded[0].identities},
    '../modules/cognitive/generated/seeds':{cognitiveSeeds:loaded[0].identities.map(identity=>({...identity,config:{}}))},
    '../modules/cognitive/participant-presentation':{resolveParticipantPresentation:()=>({title:'Task',disclaimer:'Limit',presentationVersion:'1.0.0'})},
    '../modules/cognitive/onboarding/fixtures':{validateExecutableFixtures:entry=>{calls.fixtures.push(entry.version);return [];}},
    'node:fs':{readFileSync:()=> '{}'},'node:path':path,'node:child_process':{execFileSync:()=>''},
  };
  const context=vm.createContext({exports:{},process:proc,require:name=>{if(!(name in imports))throw Error('Unexpected import '+name);return imports[name];},console});
  new vm.Script(js,{filename:'cognitive-onboarding-check.js'}).runInContext(context);
  // Drain the asynchronous import/leaf chain and outer catch, without real subprocesses.
  for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));
  return {stdout,stderr,exitCode:proc.exitCode,calls};
}
test('real CLI batch orchestrates globals once and all identity stages',async()=>{const r=await cli(['--tasks','reaction','--json']);assert.equal(r.exitCode,0);assert.equal(r.calls.manifest,1);assert.equal(r.calls.dependencies,1);assert.equal(r.calls.acceptance,1);assert.deepEqual(r.calls.fixtures,['1.0.0','1.1.0']);verifyCognitiveBatch(r.stdout,{tasks:['reaction']},packages);});
test('per-identity exception keeps the remaining actual result and fails batch',async()=>{const r=await cli(['--tasks','reaction','--json'],{identityFailure:true});assert.equal(r.exitCode,1);const report=JSON.parse(r.stdout);assert.equal(report.identityResults.length,2);assert.equal(report.decisions.length,2);assert.deepEqual(r.calls.fixtures,['1.1.0']);assert.equal(report.decisions[1].technical.ready,true);assert.throws(()=>verifyCognitiveBatch(r.stdout,{tasks:['reaction']},packages));});
test('outer discovery exception emits failed envelope instead of empty success',async()=>{const r=await cli(['--tasks','reaction','--json'],{discoveryFailure:true});assert.equal(r.exitCode,1);assert.equal(JSON.parse(r.stdout).exitCode,1);assert.equal(r.calls.acceptance,0);});
test('DOM child failure propagates and legacy JSON stays one decision per line',async()=>{const failed=await cli(['--tasks','reaction','--json'],{acceptanceFailure:true});assert.equal(failed.exitCode,1);assert.equal(JSON.parse(failed.stdout).checks.find(c=>c.name==='frontend-acceptance').status,'FAIL');const old=await cli(['reaction','--json']);assert.equal(old.exitCode,0);const lines=old.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(lines.length,2);assert.ok(lines.every(x=>x.kind===undefined));});
test('mixing backend implementation never disables the existing declaration AST guard',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cognitive-declaration-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file='server-version/backend/src/modules/cognitive/tasks/reaction/seeds.ts',absolute=path.join(root,file);fs.mkdirSync(path.dirname(absolute),{recursive:true});
  const selection={taskModes:{reaction:'task'},entries:[{file},{file:file.replace('seeds.ts','definitions.ts')}]};
  fs.writeFileSync(absolute,'export const seeds=[{count:1}]');assert.doesNotThrow(()=>checkCognitiveDeclarations(root,selection,isDataModule));
  fs.writeFileSync(absolute,'export const seeds=loadRuntimeConfig()');assert.throws(()=>checkCognitiveDeclarations(root,selection,isDataModule),/UNSAFE_DECLARATION/);
});
