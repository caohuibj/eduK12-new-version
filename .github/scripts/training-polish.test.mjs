import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {binding,branch,trainingPolishPlan,trainingPolishOutputs} from './training-polish-scope.mjs';
import {verifyEvidence,loadEvidence,verifyManifest,verifyHtmlEntry} from './training-polish-checks.mjs';import {failedChecks,requiredChecks} from './merge-gate.mjs';
const entries=()=>[...Object.entries(binding.source).map(([file,s])=>({file,status:s.status,oldMode:s.oldMode,newMode:s.newMode})),...binding.controls.map(file=>({file,status:binding.controlBefore[file]?'M':'A',oldMode:binding.controlBefore[file]?'100644':'000000',newMode:'100644'}))];
const head='1'.repeat(40),source='2'.repeat(40);const env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:source,CI_PR_NUMBER:'352',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version'};
function read(_,...args){const x=args.join('');if(x.endsWith('^{tree}'))return '3'.repeat(40);const colon=x.indexOf(':'),ref=x.slice(0,colon),p=x.slice(colon+1);if(p.startsWith('server-version/')&&['frontend','backend'].includes(p.slice(15)))return binding.components[p.slice(15)];
 const s=binding.source[p];if(s)return ref===binding.base?s.before:s.after;if(binding.controlBefore[p])return binding.controlBefore[p];if(binding.protectedInputs[p])return binding.protectedInputs[p];throw Error('Unbound fixture read '+x);}
const plan=(es=entries(),ev=env,rd=read,base=binding.base)=>trainingPolishPlan(es,base,head,rd,ev);
test('admits only complete exact non-permission product and finite controls',()=>assert.equal(plan().route,'training-polish'));
for(const [n,change]of [['unknown',es=>es.push({...es[0],file:'server-version/backend/src/modules/admin-permissions/service.ts'})],['omitted',es=>es.pop()],['duplicate',es=>es.push(es[0])],['mode',es=>es[0].newMode='100755'],['deletion',es=>es[0].status='D']])test('refuses '+n+' diff',()=>{const es=entries();change(es);assert.throws(()=>plan(es));});
test('refuses source blob drift',()=>assert.throws(()=>plan(entries(),env,(op,x)=>x===head+':'+Object.keys(binding.source)[0]?'0'.repeat(40):read(op,x))));
test('refuses moved main base',()=>assert.throws(()=>plan(entries(),env,read,'4'.repeat(40))));
for(const [k,v]of [['CI_EVENT','workflow_dispatch'],['CI_FORCE_FULL','true'],['CI_FULL_ACCEPTANCE','true'],['CI_HEAD_REF','other'],['CI_PR_NUMBER','353'],['CI_PR_REPOSITORY','other/repo']])test('refuses wrong '+k,()=>assert.throws(()=>plan(entries(),{...env,[k]:v})));
test('refuses mismatched PR source and checkout trees',()=>assert.throws(()=>plan(entries(),env,(op,x)=>x===source+'^{tree}'?'4'.repeat(40):read(op,x))));
test('known branch cannot omit marker or fall back to platform',()=>assert.throws(()=>plan(entries().filter(e=>e.file!=='.github/scripts/training-polish-bindings.json'))));
test('other candidates without marker retain their routes',()=>assert.equal(trainingPolishPlan([],binding.base,head,read,{CI_HEAD_REF:'other'}),null));
test('post-merge classifies the same product without application or SAST execution',()=>{const p=plan(entries(),{CI_EVENT:'push',GITHUB_REF_NAME:'main'}),o=trainingPolishOutputs(p);assert.equal(p.postMerge,true);assert.equal(o.codeql,false);assert.equal(o.frontend,false);});
function needs(){const p=plan();return {scope:{result:'success',outputs:Object.fromEntries(Object.entries(trainingPolishOutputs(p)).map(([k,v])=>[k,String(v)]))},'training-polish':{result:'success'},codeql:{result:'success'}};}
test('stable gate requires the real selected qualification and SAST',()=>{const n=needs();assert.deepEqual(requiredChecks(n,false),['scope','training-polish','codeql']);assert.deepEqual(failedChecks(n,false),[]);});
for(const status of ['failure','skipped','cancelled',undefined])test('gate blocks '+String(status)+' qualification',()=>{const n=needs();n['training-polish']={result:status};assert(failedChecks(n,false).includes('training-polish'));});
test('draft cannot qualify',()=>assert(failedChecks(needs(),true).includes('scope')));
test('original fixed evidence decodes and all admitted cases really passed',()=>assert.equal(verifyEvidence(loadEvidence()).cases,binding.admittedCases));
test('case duplication is refused',()=>{const e=loadEvidence();e.acceptedSuites.push(e.acceptedSuites[0]);assert.throws(()=>verifyEvidence(e));});
test('original failed execution cannot claim type success',()=>{const e=loadEvidence();e.executions['frontend-types-repair'].exitCode=2;assert.throws(()=>verifyEvidence(e));});
test('modified report is refused',()=>{const e=loadEvidence();e.reports['integrated-ui-tests'].sha256='0'.repeat(64);assert.throws(()=>verifyEvidence(e));});
test('imported source drift is refused',()=>assert.throws(()=>verifyEvidence(loadEvidence(),p=>p===Object.keys(loadEvidence().acceptedSuites.find(s=>s.inputSHA256&&Object.keys(s.inputSHA256).length).inputSHA256)[0]?Buffer.from('changed'):readFileSync(p))));
test('selected route does not enable unrelated application flags',()=>{const o=trainingPolishOutputs(plan());for(const k of ['frontend','frontend_build','scale','cognitive','situational','ui_required'])assert.equal(o[k],false);});

test('retains actual index and compiled runtime without inventing a Vite manifest',()=>{const files={'index.html':{sha256:'a',bytes:1},'assets/index.js':{sha256:'b',bytes:1}},expected={checkout:'source',source:'head',run:1,attempt:1};verifyManifest({...expected,source:'source',sourceHead:'head',frontendTree:binding.components.frontend,files},files,expected);verifyHtmlEntry('<script type="module" src="/assets/index.js"></script>',files);});
test('changed emitted files are refused',()=>assert.throws(()=>verifyManifest({source:'s',sourceHead:'h',frontendTree:binding.components.frontend,run:1,attempt:1,files:{'index.html':{sha256:'a'}}},{'index.html':{sha256:'b'}},{checkout:'s',source:'h',run:1,attempt:1})));
test('HTML must reference the exact retained compiled runtime',()=>assert.throws(()=>verifyHtmlEntry('<script src="/missing.js"></script>',{'index.html':{},'assets/index.js':{}})));
