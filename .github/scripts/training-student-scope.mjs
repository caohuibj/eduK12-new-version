import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
export const marker='.github/scripts/training-student-bindings.json';
export const branch='work/training-student-20261022';
export const binding=JSON.parse(readFileSync(new URL('./training-student-bindings.json',import.meta.url)));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function studentPlan(entries,base,head,read=git,env=process.env){
 const selected=entries.some(e=>e.file===marker);
 if(!selected){
  // Actual routing/aggregate callers supply CI_SOURCE_HEAD; legacy fixture plans do not.
  if(env.CI_SOURCE_HEAD)assert.notEqual(env.CI_HEAD_REF||env.GITHUB_HEAD_REF,branch,'Student scope marker missing; no platform fallback');
  return null;
 }
 assert.ok(['pull_request','push'].includes(env.CI_EVENT),'PR or exact post-merge event required');
 assert.notEqual(env.CI_FORCE_FULL,'true','No full-platform fallback');
 assert.equal(base,binding.base,'Frozen main changed');assert.match(head,/^[a-f0-9]{40}$/);
 if(env.CI_EVENT==='pull_request'){
  assert.equal(env.CI_HEAD_REF||env.GITHUB_HEAD_REF,branch);
  assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
  assert.match(env.CI_SOURCE_HEAD||'',/^[a-f0-9]{40}$/,'Exact PR source required');
  assert.equal(read('rev-parse',env.CI_SOURCE_HEAD+'^{tree}'),read('rev-parse',head+'^{tree}'),'PR merge differs from source tree');
 }
 const expected=new Set([...Object.keys(binding.source),...binding.controls]);
 assert.equal(expected.size,Object.keys(binding.source).length+binding.controls.length);
 assert.equal(entries.length,expected.size,'Complete exact diff required');assert.equal(new Set(entries.map(e=>e.file)).size,entries.length);
 for(const e of entries){
  assert.ok(expected.has(e.file),'Unknown path: '+e.file);assert.equal(e.newMode,'100644');
  assert.ok((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644'),'No deletion, rename, symlink or executable');
  if(binding.controls.includes(e.file)){
   const before=binding.controlBefore[e.file];assert.equal(e.status,before?'M':'A','Control status drift');
   if(before)assert.equal(read('rev-parse',base+':'+e.file),before,'Control baseline drift');
  }
  const b=binding.source[e.file];
  if(b){assert.equal(e.status,b.before?'M':'A');assert.equal(read('rev-parse',head+':'+e.file),b.after);if(b.before)assert.equal(read('rev-parse',base+':'+e.file),b.before);}
 }
 for(const [component,tree]of Object.entries(binding.components))assert.equal(read('rev-parse',head+':server-version/'+component),tree,'Application tree drift: '+component);
 for(const [file,blob]of Object.entries(binding.protectedInputs))assert.equal(read('rev-parse',head+':'+file),blob,'Protected input drift: '+file);
 return {schema:1,route:'training-workspace',candidate:'student-followup',base,head,product:binding.product,components:binding.components,changes:entries};
}
