import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {participantAccessOutputs} from './participant-access-scope.mjs';

export const BRANCH='fix/education-resource-pagination-20261028';
export const BASE='5c427f2bfe646def2200162bab449a0711a6e133';
export const MARKER='.github/scripts/pr364-bindings.json';
export const CONTROLS=Object.freeze([MARKER,'.github/scripts/pr364-scope.mjs','.github/scripts/pr364-checks.mjs','.github/scripts/pr364-controls.test.mjs','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml'].sort());
export const binding=JSON.parse(readFileSync(new URL('./pr364-bindings.json',import.meta.url),'utf8'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sha=value=>assert.match(value??'',/^[a-f0-9]{40}$/);

/** One immutable pagination patch. Unknown changes never select a broad fallback. */
export function pr364Plan(entries,base,head,read=git,env=process.env,b=binding){
 const ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(ref!==BRANCH&&String(env.CI_PR_NUMBER)!=='364'&&!entries.some(e=>e.file===MARKER))return null;
 assert.equal(b.enabled,true,'PR364 pending independent activation review');
 assert.equal(base,BASE);assert.equal(b.base,BASE);sha(head);sha(b.product);sha(b.controlCheckpoint);
 assert.equal(env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
 assert(['pull_request','push'].includes(env.CI_EVENT),'Manual/full execution is not this route');
 assert.notEqual(env.CI_FORCE_FULL,'true');assert.notEqual(env.CI_FULL_ACCEPTANCE,'true');
 const postMerge=env.CI_EVENT==='push';let sourceHead=env.CI_SOURCE_HEAD;
 if(postMerge){
  assert.equal(env.GITHUB_REF_NAME,'main');read('fetch','--no-tags','--depth=2','origin',head);
  const parents=read('cat-file','-p',head).split('\n').filter(row=>row.startsWith('parent ')).map(row=>row.slice(7));
  assert.equal(parents.length,2);assert.equal(parents[0],base);sourceHead=parents[1];
 }else{
  assert.equal(ref,BRANCH);assert.equal(String(env.CI_PR_NUMBER),'364');
  assert.equal(env.CI_PR_REPOSITORY,'caohuibj/eduK12-new-version');
 }
 const object=(commit,suffix)=>{
  sha(commit);
  try{return read('rev-parse',commit+suffix);}catch{
   // Scope checkout is shallow. Fetch only the immutable object requested;
   // never substitute the moving branch or weaken source/merge equality.
   read('fetch','--no-tags','--depth=1','origin',commit);
   return read('rev-parse',commit+suffix);
  }
 };
 sha(sourceHead);assert.equal(object(sourceHead,'^{tree}'),read('rev-parse',head+'^{tree}'),'Source/merge tree drift');
 assert.deepEqual(Object.keys(b.controlBefore).sort(),CONTROLS);
 const expected=[...Object.keys(b.source),...CONTROLS];assert.equal(new Set(expected).size,expected.length);
 assert.deepEqual(entries.map(e=>e.file).sort(),expected.sort(),'Complete change inventory drift');
 for(const e of entries){
  assert.equal(e.newMode,'100644');const source=b.source[e.file],before=source?.before??b.controlBefore[e.file];
  assert.equal(e.status,before?'M':'A');assert.equal(e.oldMode,before?'100644':'000000');
  if(before)assert.equal(read('rev-parse',base+':'+e.file),before);
  if(source){assert(!e.file.startsWith('.github/'));sha(source.after);assert.equal(read('rev-parse',head+':'+e.file),source.after);}
  else if(e.file!==MARKER){
   let checkpoint;try{checkpoint=read('ls-tree',b.controlCheckpoint,'--',e.file);}catch{read('fetch','--no-tags','--depth=1','origin',b.controlCheckpoint);checkpoint=read('ls-tree',b.controlCheckpoint,'--',e.file);}
   assert(checkpoint.startsWith('100644 blob '));assert.equal(read('ls-tree',head,'--',e.file),checkpoint,'Control checkpoint drift');
  }
 }
 assert.deepEqual(Object.keys(b.components).sort(),['backend','frontend']);
 for(const [component,tree]of Object.entries(b.components)){
  sha(tree);assert.equal(read('rev-parse',head+':server-version/'+component),tree);
  assert.equal(object(b.product,':server-version/'+component),tree);
 }
 return {schema:1,route:'pr364',base,head,sourceHead,tree:read('rev-parse',head+'^{tree}'),product:b.product,components:b.components,controlCheckpoint:b.controlCheckpoint,postMerge,draft:!postMerge&&env.CI_IS_DRAFT==='true'};
}
export function pr364Outputs(plan){const o=participantAccessOutputs(plan);delete o.participant_access_plan;return {...o,application_route:'pr364',scenario:'pr364',pr364_plan:JSON.stringify(plan)};}
