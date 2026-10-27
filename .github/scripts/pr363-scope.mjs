import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {participantAccessOutputs} from './participant-access-scope.mjs';
export const REPOSITORY='caohuibj/eduK12-new-version';
export const BRANCH='perf/four-entry-feedback-20261027';
export const MARKER='.github/scripts/pr363-bindings.json';
export const CONTROL_FILES=Object.freeze([MARKER,'.github/scripts/pr363-scope.mjs','.github/scripts/pr363-checks.mjs','.github/scripts/pr363-controls.test.mjs','.github/scripts/pr363-control-evidence.json','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml'].sort());
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const JOBS=['pr363-backend-build','pr363-frontend-build','pr363-backend-checks','pr363-frontend-checks','pr363-audit','pr363-pg','pr363-browser','pr363-backend-scan','pr363-frontend-scan'];
export const binding=JSON.parse(readFileSync(new URL('./pr363-bindings.json',import.meta.url),'utf8'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
export function safePath(p){assert(typeof p==='string'&&p.length&&!p.startsWith('/')&&!/[\\\x00-\x1f]/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'),'Unsafe path');return p;}
export function validateExecution(e,admissions=[]){
 for(const a of admissions){assert.equal(a.schemaVersion,1);assert(['backend','frontend','pg'].includes(a.phase));assert(['vitest','command'].includes(a.kind));assert(a.proofs&&a.selectors&&sha(a.reviewCheckpoint));}
 assert(e&&e.finalized===true,'Execution selections NOTREADY');assert.deepEqual(e.feedbackModes,['IMMEDIATE','SCHEDULED']);
 for(const phase of ['backend','frontend','pg','browser']){
  const p=e[phase];assert(p&&Array.isArray(p.steps),'Missing '+phase+' selection');
  assert(p.environment&&typeof p.environment==='object'&&Object.keys(p.environment).length,'Frozen phase environment required');
  assert(Array.isArray(p.inputs)&&p.inputs.length,'Missing '+phase+' input closure');
  for(const f of p.inputs){safePath(f.path);assert(sha(f.blob));assert(['100644','100755'].includes(f.mode));}
  assert.equal(new Set(p.inputs.map(f=>f.path)).size,p.inputs.length,'Duplicate closure path');
  assert.equal(new Set(p.steps.map(s=>s.id)).size,p.steps.length,'Duplicate phase step');
  assert(Array.isArray(p.requiredOutcomes)&&p.requiredOutcomes.length,'Final outcome inventory required');
  const selected=[];
  for(const step of p.steps){
   for(const [key,value] of Object.entries(step.environment??{})){assert(/^[A-Z][A-Z0-9_]*$/.test(key)&&!(/^(GITHUB_|RUNNER_|CODEX_)/.test(key))&&!['PATH','HOME','GH_TOKEN','CI','CI_POSTGRES_SERVICE_ID','PR363_PG_PORT','PR363_REDIS_PORT'].includes(key),'Cannot forge runner or service identity');assert(typeof value==='string');}
   assert(['vitest','browser','command','receipt'].includes(step.kind));if(phase==='browser')assert.notEqual(step.kind,'vitest','Compiled browser coverage cannot be replaced by unit tests');
   assert(typeof step.id==='string'&&/^[a-z0-9-]+$/.test(step.id));
   assert.equal(step.expectedExitCode,0,'Qualification requires actual exit0');
   assert(Array.isArray(step.argv)&&step.argv.length>=2&&step.argv.every(v=>typeof v==='string'));assert.equal(step.argv[0],'node');safePath(step.argv[1]);
   assert(['host-node','builder-node'].includes(step.runner),'Explicit executor location required');
   if(step.runner==='builder-node'){
    assert(['backend','frontend'].includes(step.component));
    const lock='server-version/'+step.component+'/package-lock.json';assert.equal(step.dependencySource?.lockPath,lock);
    assert(p.inputs.some(f=>f.path===lock&&f.blob===step.dependencySource.lockBlob),'Builder dependency lock missing from closure');
    assert(step.argv[1].startsWith('node_modules/')||p.inputs.some(f=>f.path==='server-version/'+step.component+'/'+step.argv[1]),'Builder executor source missing');
   }else assert(p.inputs.some(f=>f.path===step.argv[1]),'Host executable must be a frozen Git source');
   assert(Array.isArray(step.dependencies)&&step.dependencies.every(c=>['backend','frontend'].includes(c)),'Explicit dependency components required, including [] for builtins only');
   if(step.siblingBackend)assert(step.runner==='builder-node'&&step.component==='frontend'&&step.dependencies.includes('backend'));
   if(['command','receipt'].includes(step.kind)){
    assert(!JSON.stringify(step.argv).includes('--if-present'),'Optional scripts cannot establish command qualification');assert.equal(step.outcomeId,step.id);assert.equal(step.expectedCases,undefined,'Commands are not Vitest cases');selected.push(step.id);
   }else{assert(Array.isArray(step.expectedCases)&&step.expectedCases.length);selected.push(...step.expectedCases);}
   if(step.kind!=='command'){safePath(step.report);assert(step.report.startsWith('pr363-evidence/'));}
   if(step.kind==='receipt'){assert(Array.isArray(step.assertions)&&step.assertions.length);for(const a of step.assertions){assert(typeof a.pointer==='string'&&a.pointer.startsWith('/'));assert(Object.hasOwn(a,'equals'));}}
  }
  if(phase==='browser'){
   const actual=p.steps.filter(step=>step.kind==='browser');assert.equal(actual.length,1,'A real compiled browser consumer is required exactly once');const step=actual[0];
   assert.equal(step.runner,'host-node');assert.deepEqual(step.argv,['node','server-version/e2e/pr363-browser.cjs']);assert.deepEqual(step.dependencies,['backend']);assert.equal(step.report,'pr363-evidence/browser.json');assert.deepEqual([...step.expectedCases].sort(),['SCHOOL:IMMEDIATE','TEACHER:IMMEDIATE','TEACHER:SCHEDULED']);assert.equal(Object.keys(step.environment??{}).length,0,'Browser fixture environment is job-owned');
  }
  for(const a of admissions.filter(a=>a.phase===phase)){assert(['vitest','command'].includes(a.kind));assert(Array.isArray(a.outcomes)&&a.outcomes.length);selected.push(...a.outcomes);}
  assert.equal(new Set(selected).size,selected.length,'Fresh and historical outcomes overlap');assert.deepEqual([...selected].sort(),[...p.requiredOutcomes].sort(),'Missing or extra final outcomes');
 }
 assert(Array.isArray(e.frontend.buildArgs)&&e.frontend.buildArgs.every(v=>/^VITE_[A-Z0-9_]+=(true|false)$/.test(v)));
}
export function pr363Plan(entries,base,head,read=git,env=process.env,b=binding){
 const ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 const known=ref===BRANCH||String(env.CI_PR_NUMBER)==='363';
 if(!known&&!entries.some(e=>e.file===MARKER))return null;
 assert.notEqual(env.CI_EVENT,'workflow_dispatch','PR363 manual full/probe forbidden');
 const postMerge=env.CI_EVENT==='push';let sourceHead=env.CI_SOURCE_HEAD;
 if(postMerge){
  assert.equal(env.GITHUB_REF_NAME||ref,'main');assert.equal(env.GITHUB_REPOSITORY,REPOSITORY);
  const parents=read('cat-file','-p',head).split('\n').filter(v=>v.startsWith('parent ')).map(v=>v.slice(7));assert.equal(parents.length,2);assert.equal(parents[0],base);sourceHead=parents[1];read('fetch','--no-tags','--depth=1','origin',sourceHead);
 }else{
  assert.equal(env.CI_EVENT,'pull_request');assert.equal(ref,BRANCH);assert.equal(String(env.CI_PR_NUMBER),'363');assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,REPOSITORY);
 }
 assert.notEqual(env.CI_FORCE_FULL,'true');assert.notEqual(env.CI_FULL_ACCEPTANCE,'true');
 assert.equal(b.enabled,true,'PR363 NOTREADY; root final freeze required');assert.equal(b.readiness,'READY');assert.deepEqual(b.unresolved,[]);
 assert.equal(b.schemaVersion,1);assert.equal(b.branch,BRANCH);assert.equal(base,b.base);assert(sha(base)&&sha(head)&&sha(b.product)&&sha(sourceHead));
 assert.equal(read('rev-parse',sourceHead+'^{tree}'),read('rev-parse',head+'^{tree}'),'PR source/checkout tree drift');
 assert(sha(b.controlCheckpoint),'Reviewed immutable control checkpoint required');assert.deepEqual(Object.keys(b.controlBefore).sort(),CONTROL_FILES,'Control names are code-owned, not manifest-extensible');
 for(const path of Object.keys(b.source)){assert(!path.startsWith('.github/'),'Unknown or aliased control path');assert(!CONTROL_FILES.includes(path));}
 const checkpointEntry=path=>{try{return read('ls-tree',b.controlCheckpoint,'--',path);}catch{read('fetch','--no-tags','--depth=1','origin',b.controlCheckpoint);return read('ls-tree',b.controlCheckpoint,'--',path);}};
 const expected=[...Object.keys(b.source),...CONTROL_FILES];assert.equal(expected.length,new Set(expected).size);
 assert.deepEqual(entries.map(e=>e.file).sort(),expected.sort(),'Complete diff drift');
 for(const e of entries){
  safePath(e.file);assert.equal(e.newMode,'100644');assert(['A','M'].includes(e.status));assert.equal(e.oldMode,e.status==='A'?'000000':'100644');
  const s=b.source[e.file],before=s?s.before:b.controlBefore[e.file];
  assert.equal(e.status,before?'M':'A');if(before){assert(sha(before));assert.equal(read('rev-parse',base+':'+e.file),before);}
  if(s){assert(sha(s.after));assert.equal(read('rev-parse',head+':'+e.file),s.after);}
  else if(e.file!==MARKER){const expected=checkpointEntry(e.file);assert(expected.startsWith('100644 blob '),'Control checkpoint entry missing/unsafe');assert.equal(read('ls-tree',head,'--',e.file),expected,'Reviewed control bytes drift: '+e.file);}
 }
 assert(b.components&&Object.keys(b.components).sort().join(',')==='backend,frontend');
 for(const[c,tree]of Object.entries(b.components)){assert(sha(tree));assert.equal(read('rev-parse',head+':server-version/'+c),tree);assert.equal(read('rev-parse',b.product+':server-version/'+c),tree);}
 assert(b.protectedInputs&&Object.keys(b.protectedInputs).length);
 for(const[path,blob]of Object.entries(b.protectedInputs)){safePath(path);assert(sha(blob));assert.equal(read('rev-parse',head+':'+path),blob);}
 assert(Array.isArray(b.historicalAdmissions));
 validateExecution(b.execution,b.historicalAdmissions);
 for(const phase of ['backend','frontend','pg','browser'])for(const f of b.execution[phase].inputs)assert.equal(read('ls-tree',head,'--',f.path),`${f.mode} blob ${f.blob}\t${f.path}`,'Consumer input drift');
 return {schema:1,route:'pr363',base,head,sourceHead,tree:read('rev-parse',head+'^{tree}'),components:b.components,postMerge,qualificationClaim:false,draft:!postMerge&&env.CI_IS_DRAFT==='true',controlCheckpoint:b.controlCheckpoint,bindingsSHA256:digest(b),executionSHA256:digest(b.execution),historySHA256:digest(b.historicalAdmissions),inventorySHA256:digest(entries)};
}
export function pr363Outputs(p){const o=participantAccessOutputs(p);delete o.participant_access_plan;return {...o,application_route:'pr363',scenario:'pr363',pr363_plan:JSON.stringify(p)};}
export function requirePr363Jobs(needs){assert.deepEqual(Object.keys(needs).sort(),['scope',...JOBS].sort());for(const k of ['scope',...JOBS])assert.equal(needs[k]?.result,'success',k+' did not succeed');}
