import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {participantAccessOutputs} from './participant-access-scope.mjs';
export const binding=JSON.parse(readFileSync(new URL('./pr357-bindings.json',import.meta.url),'utf8'));
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function pr357Plan(entries,base,head,read=git,env=process.env,b=binding){
 const ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(!entries.some(e=>e.file==='.github/scripts/pr357-bindings.json')){if(ref===b.branch)throw Error('PR357 binding missing; no platform fallback');return null;}
 assert.equal(base,b.base);assert.equal(b.base,'04a8d994207d7b831b874d4be4f5c31640466458');assert.match(head,/^[a-f0-9]{40}$/);
 assert(['pull_request','push'].includes(env.CI_EVENT));assert.notEqual(env.CI_FORCE_FULL,'true');assert.notEqual(env.CI_FULL_ACCEPTANCE,'true');
 if(env.CI_EVENT==='pull_request'){
  assert.equal(ref,b.branch);assert.equal(String(env.CI_PR_NUMBER),'357');assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');assert.match(env.CI_SOURCE_HEAD||'',/^[a-f0-9]{40}$/);
  assert.equal(read('rev-parse',env.CI_SOURCE_HEAD+'^{tree}'),read('rev-parse',head+'^{tree}'));
 }else{
  assert.equal(env.GITHUB_REF_NAME||ref,'main');read('fetch','--no-tags','--depth=2','origin',head);
  const parents=read('cat-file','-p',head).split('\n').filter(x=>x.startsWith('parent ')).map(x=>x.slice(7));assert.equal(parents.length,2);assert.equal(parents[0],base);assert.equal(read('rev-parse',parents[1]+'^{tree}'),read('rev-parse',head+'^{tree}'));
 }
 const wanted=[...Object.keys(b.source),...b.controls];assert.equal(new Set(wanted).size,wanted.length);assert.deepEqual(entries.map(e=>e.file).sort(),wanted.sort());
 for(const e of entries){const source=b.source[e.file];
  if(source){assert.equal(e.status,source.status);assert.equal(e.oldMode,source.oldMode);assert.equal(e.newMode,source.newMode);if(e.oldMode!=='000000')assert.equal(read('rev-parse',base+':'+e.file),source.before);if(e.newMode!=='000000')assert.equal(read('rev-parse',head+':'+e.file),source.after);}
  else{assert(['A','M'].includes(e.status));assert.equal(e.newMode,'100644');assert.equal(e.oldMode,e.status==='A'?'000000':'100644');}
 }
 for(const [c,tree]of Object.entries(b.components))assert.equal(read('rev-parse',head+':server-version/'+c),tree);
 return {schema:1,route:'pr357',base,head,product:b.product,components:b.components,postMerge:env.CI_EVENT==='push',changes:entries};
}
export function pr357Outputs(p){const o=participantAccessOutputs(p);delete o.participant_access_plan;return {...o,application_route:'pr357',scenario:'pr357',pr357_plan:JSON.stringify(p)};}
