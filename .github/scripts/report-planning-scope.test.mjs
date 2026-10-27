import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {binding,reportPlanningPlan,reportPlanningOutputs} from './report-planning-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
import {validatePgReport,defaultFiles} from './report-planning-checks.mjs';
const head='a'.repeat(40),source='b'.repeat(40),tree='d'.repeat(40);
const env={CI_EVENT:'pull_request',CI_HEAD_REF:binding.branch,CI_SOURCE_HEAD:source,CI_PR_NUMBER:'361',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version'};
const entries=()=>[...Object.entries(binding.source).map(([file,s])=>({file,status:s.status,oldMode:s.oldMode,newMode:s.newMode})),...binding.controls.map(file=>({file,status:['.github/workflows/ci.yml','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs'].includes(file)?'M':'A',oldMode:['.github/workflows/ci.yml','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs'].includes(file)?'100644':'000000',newMode:'100644'}))];
function read(command,arg){if(command==='fetch')return '';if(command==='cat-file')return 'parent '+binding.base+'\nparent '+source;if(arg.endsWith('^{tree}'))return tree;const i=arg.indexOf(':'),ref=arg.slice(0,i),file=arg.slice(i+1);if(file.startsWith('server-version/')&&Object.hasOwn(binding.components,file.slice(15)))return binding.components[file.slice(15)];const s=binding.source[file];if(s)return ref===binding.base?s.before:s.after;throw Error('Unlisted source read');}
const make=(es=entries(),e=env,reader=read)=>reportPlanningPlan(es,binding.base,head,reader,e);
test('exact full source binds the candidate and unchanged frontend, without unrelated jobs',()=>{const p=make(),o=reportPlanningOutputs(p);assert.equal(p.changes.length,Object.keys(binding.source).length+binding.controls.length);for(const key of ['frontend','frontend_build','run_performance_tests'])assert.equal(o[key],false);assert.equal(o.codeql,true);});
test('unknown, missing, changed mode/blob/component and alternate source tree fail closed',()=>{
 const es=entries();assert.throws(()=>make([...es,{file:'server-version/backend/src/unknown.ts',status:'A',oldMode:'000000',newMode:'100644'}]));assert.throws(()=>make(es.slice(1)));
 assert.throws(()=>make(es.map((e,i)=>i?e:{...e,newMode:'100755'})));
 assert.throws(()=>make(es,env,(c,a)=>a===head+':'+Object.keys(binding.source)[0]?'f'.repeat(40):read(c,a)));
 assert.throws(()=>make(es,env,(c,a)=>a===head+':server-version/frontend'?'f'.repeat(40):read(c,a)));
 assert.throws(()=>make(es,env,(c,a)=>a===source+'^{tree}'?'f'.repeat(40):read(c,a)));
});
test('missing marker and unsupported manual/full/foreign PR cannot fall back to platform',()=>{assert.throws(()=>make([]));for(const patch of [{CI_EVENT:'workflow_dispatch'},{CI_FORCE_FULL:'true'},{CI_FULL_ACCEPTANCE:'true'},{CI_PR_NUMBER:'360'},{CI_HEAD_REF:'other'},{CI_PR_REPOSITORY:'other/repo'}])assert.throws(()=>make(entries(),{...env,...patch}));assert.throws(()=>reportPlanningPlan(entries(),'e'.repeat(40),head,read,env));});
test('main uses raw two-parent commit/tree identity under shallow checkout',()=>{const p=make(entries(),{CI_EVENT:'push',GITHUB_REF_NAME:'main'});assert.equal(p.postMerge,true);assert.equal(reportPlanningOutputs(p).codeql,false);assert.throws(()=>make(entries(),{CI_EVENT:'push',GITHUB_REF_NAME:'main'},(c,a)=>c==='cat-file'?'parent '+binding.base:read(c,a)));});
test('stable gate requires actual source, scoped backend and CodeQL success and non-Draft',()=>{
 const p=make(),o=Object.fromEntries(Object.entries(reportPlanningOutputs(p)).map(([k,v])=>[k,String(v)]));const needs={scope:{result:'success',outputs:o},'report-planning':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','report-planning','codeql']);assert.deepEqual(failedChecks(needs,false),[]);assert(failedChecks(needs,true).includes('scope'));
 for(const state of ['failure','skipped','cancelled',undefined])assert(failedChecks({...needs,'report-planning':{result:state}},false).includes('report-planning'));
 assert(failedChecks({...needs,scope:{result:'success',outputs:{...o,frontend:'true'}}},false).includes('scope'));
});
test('report verifier rejects empty, filtered, wrong-file or fabricated aggregate success',()=>{const r={success:true,numTotalTests:9,numPassedTests:9,numFailedTests:0,numPendingTests:0,testResults:defaultFiles.map(name=>({name:'/app/'+name,status:'passed',assertionResults:Array.from({length:3},()=>({status:'passed'}))}))};validatePgReport(r,defaultFiles,9);for(const mutate of [x=>x.success=false,x=>x.testResults[0].name='wrong.ts',x=>x.testResults[0].assertionResults.pop(),x=>x.testResults[0].assertionResults[0].status='skipped',x=>x.numPendingTests=1]){const bad=structuredClone(r);mutate(bad);assert.throws(()=>validatePgReport(bad,defaultFiles,9));}});
test('workflow retains a single cached backend build and both exact PG formats',()=>{const s=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8'),part=s.slice(s.indexOf('  report-planning:'),s.indexOf('  pr357-admission:'));assert.match(part,/postgres:16\.15-bookworm/);assert.match(part,/SET|runtime-role-defaults/);assert.match(part,/ASSESSMENT_SHARED_CONTROL_ENABLED=true/);assert.match(part,/docker save report-planning-runtime/);assert.match(part,/--severity HIGH,CRITICAL/);assert.doesNotMatch(part,/frontend|full_acceptance|continue-on-error/);assert.equal((part.match(/--target build/g)||[]).length,1);});
