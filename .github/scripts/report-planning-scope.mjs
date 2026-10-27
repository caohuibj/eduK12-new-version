import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {participantAccessOutputs} from './participant-access-scope.mjs';
export const binding=JSON.parse(readFileSync(new URL('./report-planning-bindings.json',import.meta.url),'utf8'));
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function reportPlanningPlan(entries,base,head,read=git,env=process.env,b=binding){
 const ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(!entries.some(e=>e.file==='.github/scripts/report-planning-bindings.json')){if(ref===b.branch)throw Error('Report-planning binding missing; no platform fallback');return null;}
 assert.equal(base,b.base);assert.equal(base,'dff80f0604163a04e2f5a8119d7d4295116eeb41');assert.match(head,/^[a-f0-9]{40}$/);
 assert(['pull_request','push'].includes(env.CI_EVENT));assert.notEqual(env.CI_FORCE_FULL,'true');assert.notEqual(env.CI_FULL_ACCEPTANCE,'true');
 if(env.CI_EVENT==='pull_request'){
  assert.equal(ref,b.branch);assert.equal(String(env.CI_PR_NUMBER),'361');assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');assert.match(env.CI_SOURCE_HEAD||'',/^[a-f0-9]{40}$/);
  assert.equal(read('rev-parse',env.CI_SOURCE_HEAD+'^{tree}'),read('rev-parse',head+'^{tree}'));
 }else{
  assert.equal(env.GITHUB_REF_NAME||ref,'main');read('fetch','--no-tags','--depth=2','origin',head);
  const parents=read('cat-file','-p',head).split('\n').filter(x=>x.startsWith('parent ')).map(x=>x.slice(7));assert.equal(parents.length,2);assert.equal(parents[0],base);assert.equal(read('rev-parse',parents[1]+'^{tree}'),read('rev-parse',head+'^{tree}'));
 }
 const expected=[...Object.keys(b.source),...b.controls];assert.equal(new Set(expected).size,expected.length);assert.deepEqual(entries.map(e=>e.file).sort(),expected.sort());
 for(const e of entries){const s=b.source[e.file];if(s){assert.equal(e.status,s.status);assert.equal(e.oldMode,s.oldMode);assert.equal(e.newMode,s.newMode);if(s.before)assert.equal(read('rev-parse',base+':'+e.file),s.before);assert.equal(read('rev-parse',head+':'+e.file),s.after);}else{assert.equal(e.newMode,'100644');assert(['A','M'].includes(e.status));assert.equal(e.oldMode,e.status==='A'?'000000':'100644');}}
 for(const[c,tree]of Object.entries(b.components))assert.equal(read('rev-parse',head+':server-version/'+c),tree);
 return {schema:1,route:'report-planning',base,head,product:b.product,components:b.components,postMerge:env.CI_EVENT==='push',changes:entries};
}
export function reportPlanningOutputs(p){const o=participantAccessOutputs(p);delete o.participant_access_plan;return {...o,application_route:'report-planning',scenario:'report-planning',report_planning_plan:JSON.stringify(p)};}
