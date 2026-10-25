import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {binding,branch,surveyGovernancePlan,surveyGovernanceOutputs} from './survey-governance-scope.mjs';
import {verifyEvidence,loadEvidence,verifyReport,verifyTestRepairs,selectedOutcomes,changedLanguages,verifyBuiltFiles,sha} from './survey-governance-checks.mjs';import {requiredChecks,failedChecks} from './merge-gate.mjs';
const entries=()=>[...Object.entries(binding.source).map(([file,s])=>({file,status:s.status,oldMode:s.oldMode,newMode:s.newMode})),...binding.controls.map(file=>({file,status:binding.controlBefore[file]?'M':'A',oldMode:binding.controlBefore[file]?'100644':'000000',newMode:'100644'}))];
const head='1'.repeat(40),source='2'.repeat(40),env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:source,CI_PR_NUMBER:'354',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version'};
function read(_,...args){const x=args.join('');if(x.endsWith('^{tree}'))return '3'.repeat(40);const colon=x.indexOf(':'),ref=x.slice(0,colon),p=x.slice(colon+1);if(p.startsWith('server-version/')&&['frontend','backend'].includes(p.slice(15)))return binding.components[p.slice(15)];const s=binding.source[p];if(s)return ref===binding.base?s.before:s.after;if(binding.controlBefore[p])return binding.controlBefore[p];if(binding.protectedInputs[p])return binding.protectedInputs[p];throw Error('Unbound fixture read '+x);}
const plan=(es=entries(),ev=env,rd=read,base=binding.base)=>surveyGovernancePlan(es,base,head,rd,ev);
test('only exact complete product and finite controls qualify',()=>assert.equal(plan().route,'survey-governance'));
for(const [name,change]of [['unknown',es=>es.push({...es[0],file:'other.ts'})],['omitted',es=>es.pop()],['duplicate',es=>es.push(es[0])],['mode',es=>es[0].newMode='100755'],['deletion',es=>es[0].status='D']])test('refuses '+name+' diff',()=>{const es=entries();change(es);assert.throws(()=>plan(es));});
test('refuses product source drift',()=>assert.throws(()=>plan(entries(),env,(op,x)=>x===head+':'+Object.keys(binding.source)[0]?'0'.repeat(40):read(op,x))));
test('refuses moved main',()=>assert.throws(()=>plan(entries(),env,read,'4'.repeat(40))));
for(const [k,v]of [['CI_EVENT','workflow_dispatch'],['CI_FORCE_FULL','true'],['CI_FULL_ACCEPTANCE','true'],['CI_HEAD_REF','other'],['CI_PR_NUMBER','353'],['CI_PR_REPOSITORY','other/repo']])test('refuses wrong '+k,()=>assert.throws(()=>plan(entries(),{...env,[k]:v})));
test('refuses unequal source/checkout trees',()=>assert.throws(()=>plan(entries(),env,(op,x)=>x===source+'^{tree}'?'4'.repeat(40):read(op,x))));
test('known branch cannot omit marker or fall back',()=>assert.throws(()=>plan(entries().filter(e=>e.file!=='.github/scripts/survey-governance-bindings.json'))));
test('other candidates retain original routing',()=>assert.equal(surveyGovernancePlan([],binding.base,head,read,{CI_HEAD_REF:'other'}),null));
test('main classifies only without replay',()=>{const p=plan(entries(),{CI_EVENT:'push',GITHUB_REF_NAME:'main'}),o=surveyGovernanceOutputs(p);assert(p.postMerge);for(const k of ['codeql','frontend','frontend_build'])assert.equal(o[k],false);});
function needs(){const p=plan();return {scope:{result:'success',outputs:Object.fromEntries(Object.entries(surveyGovernanceOutputs(p)).map(([k,v])=>[k,String(v)]))},'survey-governance':{result:'success'},codeql:{result:'success'}};}
test('stable gate selects actual full qualification and SAST',()=>{assert.deepEqual(requiredChecks(needs(),false),['scope','survey-governance','codeql']);assert.deepEqual(failedChecks(needs(),false),[]);});
for(const status of ['failure','skipped','cancelled',undefined])test('gate refuses '+status,()=>{const n=needs();n['survey-governance']={result:status};assert(failedChecks(n,false).includes('survey-governance'));});
test('draft cannot merge',()=>assert(failedChecks(needs(),true).includes('scope')));
test('exact original reporters prove 20 disjoint accepted cases',()=>assert.equal(verifyEvidence(loadEvidence()).cases,20));
test('duplicated old cases cannot qualify',()=>{const e=loadEvidence();e.suites.push(e.suites[0]);assert.throws(()=>verifyEvidence(e));});
test('changed old reporter cannot qualify',()=>{const e=loadEvidence();e.reports['unit-010157.json'].sha256='0'.repeat(64);assert.throws(()=>verifyEvidence(e));});
test('imported input drift cannot qualify',()=>assert.throws(()=>verifyEvidence(loadEvidence(),p=>p===Object.keys(loadEvidence().suites[0].inputSHA256)[0]?Buffer.from('changed'):readFileSync(p))));
test('empty or skipped selected tests cannot qualify',()=>{for(const r of [{numFailedTests:0,numPendingTests:0,numPassedTests:0,testResults:[]},{numFailedTests:0,numPendingTests:1,numPassedTests:1,testResults:[]}])assert.throws(()=>verifyReport(r,[]));});
test('admitted files are not selected for replay',()=>{assert(!binding.checks.backendUnit.some(p=>p.endsWith('tool-management-policy.test.ts')));assert(!binding.checks.frontendTests.some(p=>p.endsWith('GovernedToolsWorkspace.test.tsx')));});

test("exact reviewed repair cannot change passed setup",()=>{verifyTestRepairs(p=>{const changes=binding.resume.testRepairs[p];return changes.map(x=>x.before).join("\n");},p=>binding.resume.testRepairs[p].map(x=>x.after).join("\n"));});

for(const status of ["failure","skipped","cancelled",undefined])test("explicit continuation outcome blocks "+status,()=>{assert.throws(()=>selectedOutcomes(status,"success"));assert.throws(()=>selectedOutcomes("success",status));});

test("only changed SAST languages run; previous Python success is not replayed",()=>{assert.equal(changedLanguages(["checks.mjs"]),"javascript-typescript");assert.equal(changedLanguages(["database.py"]),"python");assert.equal(changedLanguages(["checks.mjs","database.py"]),"javascript-typescript,python");assert.throws(()=>changedLanguages([]));});

const files={'index.html':Buffer.from('<script src="/assets/a.js"></script>'),'assets/a.js':Buffer.from('compiled')};
const buildManifest=()=>({files:Object.fromEntries(Object.entries(files).map(([p,b])=>[p,{bytes:b.length,sha256:sha(b)}]))});
test('same complete original compiled artifact is admitted without rebuild',()=>verifyBuiltFiles(buildManifest(),p=>files[p],Object.keys(files)));
test('changed or missing emitted bytes cannot retain original qualification',()=>{assert.throws(()=>verifyBuiltFiles(buildManifest(),p=>p==='assets/a.js'?Buffer.from('modified'):files[p],Object.keys(files)));assert.throws(()=>verifyBuiltFiles(buildManifest(),p=>files[p],['index.html']));});
