import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {participantAccessOutputs} from './participant-access-scope.mjs';
export const REPOSITORY='caohuibj/eduK12-new-version';
export const BRANCH='perf/four-entry-feedback-20261027';
export const MARKER='.github/scripts/pr363-bindings.json';
export const JOBS=['pr363-backend-build','pr363-frontend-build','pr363-backend-checks','pr363-frontend-checks','pr363-audit','pr363-pg','pr363-browser','pr363-backend-scan','pr363-frontend-scan'];
export const binding=JSON.parse(readFileSync(new URL('./pr363-bindings.json',import.meta.url),'utf8'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
export function safePath(p){assert(typeof p==='string'&&p.length&&!p.startsWith('/')&&!/[\\\x00-\x1f]/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'),'Unsafe path');return p;}
export function validateExecution(e){
 assert(e&&e.finalized===true,'Execution selections NOTREADY');
 assert.deepEqual(e.feedbackModes,['IMMEDIATE','SCHEDULED']);
 for(const phase of ['backend','frontend','pg','browser']){
  const p=e[phase];assert(p&&Array.isArray(p.steps)&&p.steps.length,'Missing '+phase+' consumer');
  assert(Array.isArray(p.inputs)&&p.inputs.length,'Missing '+phase+' input closure');
  for(const f of p.inputs){safePath(f.path);assert(sha(f.blob));assert(['100644','100755'].includes(f.mode));}
  assert.equal(new Set(p.steps.map(s=>s.id)).size,p.steps.length,'Duplicate phase step');
  for(const s of p.steps){
   assert(['vitest','browser'].includes(s.kind));if(phase==='browser')assert.equal(s.kind,'browser');else assert.equal(s.kind,'vitest');
   assert(typeof s.id==='string'&&/^[a-z0-9-]+$/.test(s.id));assert(Array.isArray(s.argv)&&s.argv.length>=2&&s.argv.every(v=>typeof v==='string'));
   assert.equal(s.argv[0],'node','Only reviewed Node consumers are supported');safePath(s.argv[1]);
   assert(p.inputs.some(f=>f.path===s.argv[1]),'Executable must be in frozen input closure');
   assert(Array.isArray(s.expectedCases)&&s.expectedCases.length&&new Set(s.expectedCases).size===s.expectedCases.length,'Nonempty exact cases required');
   safePath(s.report);assert(s.report.startsWith('pr363-evidence/'));
  }
 }
 assert(Array.isArray(e.frontend.buildArgs)&&e.frontend.buildArgs.every(v=>/^VITE_[A-Z0-9_]+=(true|false)$/.test(v)),'Freeze explicit frontend flags');
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
 const expected=[...Object.keys(b.source),...Object.keys(b.controlBefore)];assert(expected.length&&expected.includes(MARKER));assert.equal(expected.length,new Set(expected).size);
 assert.deepEqual(entries.map(e=>e.file).sort(),expected.sort(),'Complete diff drift');
 for(const e of entries){
  safePath(e.file);assert.equal(e.newMode,'100644');assert(['A','M'].includes(e.status));assert.equal(e.oldMode,e.status==='A'?'000000':'100644');
  const s=b.source[e.file],before=s?s.before:b.controlBefore[e.file];
  assert.equal(e.status,before?'M':'A');if(before){assert(sha(before));assert.equal(read('rev-parse',base+':'+e.file),before);}
  if(s){assert(sha(s.after));assert.equal(read('rev-parse',head+':'+e.file),s.after);}
 }
 assert(b.components&&Object.keys(b.components).sort().join(',')==='backend,frontend');
 for(const[c,tree]of Object.entries(b.components)){assert(sha(tree));assert.equal(read('rev-parse',head+':server-version/'+c),tree);assert.equal(read('rev-parse',b.product+':server-version/'+c),tree);}
 assert(b.protectedInputs&&Object.keys(b.protectedInputs).length);
 for(const[path,blob]of Object.entries(b.protectedInputs)){safePath(path);assert(sha(blob));assert.equal(read('rev-parse',head+':'+path),blob);}
 assert.deepEqual(b.historicalAdmissions,[],'PR363 application history admission is not implemented; preserve missing evidence');
 validateExecution(b.execution);
 for(const phase of ['backend','frontend','pg','browser'])for(const f of b.execution[phase].inputs)assert.equal(read('ls-tree',head,'--',f.path),`${f.mode} blob ${f.blob}\t${f.path}`,'Consumer input drift');
 return {schema:1,route:'pr363',base,head,sourceHead,tree:read('rev-parse',head+'^{tree}'),components:b.components,postMerge,qualificationClaim:false,draft:!postMerge&&env.CI_IS_DRAFT==='true',execution:b.execution,changes:entries};
}
export function pr363Outputs(p){const o=participantAccessOutputs(p);delete o.participant_access_plan;return {...o,application_route:'pr363',scenario:'pr363',pr363_plan:JSON.stringify(p)};}
export function requirePr363Jobs(needs){assert.deepEqual(Object.keys(needs).sort(),['scope',...JOBS].sort());for(const k of ['scope',...JOBS])assert.equal(needs[k]?.result,'success',k+' did not succeed');}
