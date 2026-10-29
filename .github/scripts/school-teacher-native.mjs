// Bounded PR388 scenario. Historical School/SELF identities and proofs are never
// input to this lane. Activation and application evidence are still pending.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const NATIVE_BRANCH='feat/bundle-evc-profile-20261029';
export const NATIVE_MARKER='.github/scripts/school-teacher-native-bindings.json';
export const NATIVE_JOBS=['admission','frontend','backend-self','native-evidence','native-runtime','security'];
const hash=x=>createHash('sha256').update(x).digest('hex');
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
export const nativeBinding=()=>JSON.parse(readFileSync(new URL('./school-teacher-native-bindings.json',import.meta.url)));
export function nativeSastConfig(paths){
 const python=new Set(['.github/scripts/school-teacher-native-runtime.py','.github/scripts/school-teacher-native-runtime.test.py','.github/scripts/exact-candidate-runtime.py']);
 assert([...python].every(p=>paths.includes(p)),'Native Python extractor inputs missing');
 return {paths:['server-version/backend/src','server-version/frontend/src','.github/scripts'],
  'paths-ignore':paths.filter(p=>p.startsWith('.github/scripts/')&&p.endsWith('.py')&&!python.has(p)).sort(),queries:[{uses:'security-extended'}]};
}
export function requireNativeQualification(b){
 assert.equal(b.candidate,'native-bundle');
 assert.equal(b.branch,NATIVE_BRANCH);assert.equal(b.repository,'caohuibj/eduK12-new-version');
 assert.equal(b.enabled,true,'Native Bundle activation pending independent review');
 assert.equal(b.review.status,'INDEPENDENTLY_REVIEWED','Native controls not independently reviewed');
 assert.match(b.review.recordSha256||'',/^[a-f0-9]{64}$/);
 assert.deepEqual(b.requiredJobs,NATIVE_JOBS);
 assert.deepEqual(b.execution.buildComponents,['frontend','backend']);
 assert.deepEqual(b.execution.auditComponents,['frontend','backend']);
 assert.equal(b.execution.historicalOfficialReuse,false,'Historical School producer identities forbidden');
 assert.deepEqual(b.execution.runtime,{node:'node:24.21.0-bookworm-slim',nginx:'nginx:1.31.6-alpine3.24-slim',trivy:'0.70.0',severity:['CRITICAL','HIGH'],ignoreUnfixed:true});
 return true;
}
export function validateNativeBoundary(b,o,{draftPreflight=false}={}){
 assert.equal(b.candidate,'native-bundle');assert.equal(b.branch,NATIVE_BRANCH);
 assert.equal(o.repository,b.repository);assert(['pull_request','push'].includes(o.event));
 assert.equal(o.branch,o.event==='push'?'main':NATIVE_BRANCH);
 assert.equal(o.forceFull,false);assert.equal(o.draft,draftPreflight);
 if(draftPreflight)assert.equal(o.event,'pull_request');
 for(const key of ['base','productHead','productTree','frontendTree','backendTree'])assert(sha(b[key]),'Missing '+key);
 assert.equal(o.base,b.base);assert(sha(o.sourceHead));assert(sha(o.checkoutHead));
 assert(sha(o.sourceTree));assert.equal(o.sourceTree,o.checkoutTree,'PR source and merge-preview trees differ');
 assert.equal(o.productTree,b.productTree);assert.equal(o.frontendTree,b.frontendTree);assert.equal(o.backendTree,b.backendTree);
 const files={...b.source,...b.controls};
 assert.equal(Object.keys(files).length,Object.keys(b.source).length+Object.keys(b.controls).length,'Overlapping source/control paths');
 assert(Object.keys(b.source).length>0);assert(Object.hasOwn(b.controls,NATIVE_MARKER));
 assert.equal(o.entries.length,Object.keys(files).length,'Complete raw diff required');
 assert.equal(new Set(o.entries.map(e=>e.file)).size,o.entries.length);
 for(const e of o.entries){
  assert(Object.hasOwn(files,e.file),'Unknown native path '+e.file);
  const expected=files[e.file];
  assert(['A','M'].includes(e.status));assert.equal(e.newMode,'100644');
  assert.equal(e.oldMode,e.status==='A'?'000000':'100644');
  assert.equal(e.oldBlob,expected.before||'0'.repeat(40));assert(sha(e.newBlob));
  if(e.file!==NATIVE_MARKER){assert(sha(expected.after));assert.equal(e.newBlob,expected.after,'Changed native input '+e.file);}
 }
 assert(Object.keys(b.protectedInputs).length>10,'Runtime/config closure missing');
 assert.deepEqual(o.protectedInputs,b.protectedInputs,'Locked dependency/schema/runtime/control dependency drift');
 return {schema:1,route:'school-teacher',candidate:'native-bundle',base:b.base,head:o.checkoutHead,sourceHead:o.sourceHead,sourceTree:o.sourceTree,
  product:b.productHead,productTree:b.productTree,components:{frontend:b.frontendTree,backend:b.backendTree},...(draftPreflight?{preflightOnly:true}:{}),requiredJobs:draftPreflight?['admission']:NATIVE_JOBS,changes:o.entries,
  inputsSha256:hash(JSON.stringify({source:b.source,controls:b.controls,protectedInputs:b.protectedInputs,execution:b.execution}))};
}
export function nativePlan(entries,base,head,read,env,b=nativeBinding()){
 const branch=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 const marker=entries.some(e=>e.file===NATIVE_MARKER),known=branch===NATIVE_BRANCH;
 if(!known&&!marker)return null;
 assert.notEqual(env.CI_EVENT,'workflow_dispatch','Native manual/full/probe fallback forbidden');
 assert(branch===NATIVE_BRANCH||branch==='main'&&env.CI_EVENT==='push','Native marker on wrong branch');
 assert(marker,'Native marker missing; no platform fallback');
 assert(!entries.some(e=>['.github/scripts/school-teacher-bindings.json','.github/scripts/school-teacher-self-bindings.json'].includes(e.file)),'Mixed historical/native scenarios');
 // Draft runs only the closed control graph, never unchanged application
 // compile/tests. This is no approval of the pending application evidence.
 const draftPreflight=env.CI_EVENT==='pull_request'&&env.CI_IS_DRAFT==='true';
 if(!draftPreflight)requireNativeQualification(b);
 const source=env.CI_EVENT==='push'?read('rev-parse',head+'^2'):env.CI_SOURCE_HEAD;
 if(env.CI_EVENT==='push')assert.equal(read('rev-parse',head+'^1'),base,'Only exact normal main merge may be observed');
 const observed={event:env.CI_EVENT,branch,repository:env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,draft:env.CI_IS_DRAFT==='true',forceFull:env.CI_FORCE_FULL==='true',base,
  sourceHead:source,checkoutHead:head,sourceTree:read('rev-parse',source+'^{tree}'),checkoutTree:read('rev-parse',head+'^{tree}'),productTree:read('rev-parse',b.productHead+'^{tree}'),
  frontendTree:read('rev-parse',head+':server-version/frontend'),backendTree:read('rev-parse',head+':server-version/backend'),
  protectedInputs:Object.fromEntries(Object.keys(b.protectedInputs).map(p=>[p,read('rev-parse',head+':'+p)])),
  entries:entries.map(e=>({...e,oldBlob:e.oldMode==='000000'?'0'.repeat(40):read('rev-parse',base+':'+e.file),newBlob:read('rev-parse',head+':'+e.file)}))};
 return validateNativeBoundary(b,observed,{draftPreflight});
}
export function requireNativeEvidence(b){
 // Deliberately no generic attestation/admission engine. DOT must inspect the
 // retained raw cases/closures before selecting the small exact reader patch
 // or the specific missing assertions. A status string cannot grant success.
 assert.equal(b.evidence.status,'PENDING_INDEPENDENT_REVIEW');
 assert(Array.isArray(b.evidence.obligations)&&b.evidence.obligations.length>0);
 throw Error('Native application assertions not admitted: '+b.evidence.obligations.join(', '));
}
