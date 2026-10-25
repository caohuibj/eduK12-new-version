import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
import {participantAccessOutputs} from './participant-access-scope.mjs';
export const branch='work/survey-governance-20261025',marker='.github/scripts/survey-governance-bindings.json';
export const binding=JSON.parse(readFileSync(new URL('./survey-governance-bindings.json',import.meta.url)));
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function assertBrowserOrigin(origin){assert.equal(origin,'https://training.eduk12.top','Compiled browser must use the fixed secure production context');}
export function surveyGovernancePlan(entries,base,head,read=git,env=process.env){
 const selected=entries.some(e=>e.file===marker),ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(!selected){if(ref===branch)throw Error('Survey governance binding missing; no platform/manual fallback');return null;}
 assertBrowserOrigin(binding.browserOrigin);
 assert(['pull_request','push'].includes(env.CI_EVENT),'Manual/probe refused');
 assert.notEqual(env.CI_FORCE_FULL,'true','Full platform refused');assert.notEqual(env.CI_FULL_ACCEPTANCE,'true');
 assert.equal(base,binding.base,'Main base drift');assert.equal(binding.base,'31d9e4cb933395acda3e2123f100a0a1a66a869b');
 assert.equal(binding.product,'6fadf6de2a27394fd6b75de6b5389f11364142ce');assert.match(head,/^[a-f0-9]{40}$/);
 if(env.CI_EVENT==='pull_request'){
  assert.equal(ref,branch);assert.equal(String(env.CI_PR_NUMBER),'354');
  assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');assert.match(env.CI_SOURCE_HEAD||'',/^[a-f0-9]{40}$/);
  assert.equal(read('rev-parse',env.CI_SOURCE_HEAD+'^{tree}'),read('rev-parse',head+'^{tree}'),'Source/checkout tree drift');
 }else assert.equal(env.GITHUB_REF_NAME||ref,'main','Only main post-merge classification');
 const wanted=new Set([...Object.keys(binding.source),...binding.controls]);assert.equal(wanted.size,Object.keys(binding.source).length+binding.controls.length);
 assert.equal(entries.length,wanted.size,'Complete raw diff required');assert.equal(new Set(entries.map(e=>e.file)).size,entries.length);
 for(const e of entries){assert(wanted.has(e.file),'Unknown path: '+e.file);const s=binding.source[e.file];
  if(s){assert.equal(e.status,s.status);assert.equal(e.oldMode,s.oldMode);assert.equal(e.newMode,s.newMode);
   if(s.before)assert.equal(read('rev-parse',base+':'+e.file),s.before,'Product before drift');
   assert.equal(read('rev-parse',head+':'+e.file),s.after,'Product blob drift');
  }else{const old=binding.controlBefore[e.file];assert.equal(e.status,old?'M':'A');assert.equal(e.oldMode,old?'100644':'000000');assert.equal(e.newMode,'100644');if(old)assert.equal(read('rev-parse',base+':'+e.file),old,'Control base drift');}
 }
 for(const[c,tree]of Object.entries(binding.components))assert.equal(read('rev-parse',head+':server-version/'+c),tree,'Application tree drift');
 for(const[p,blob]of Object.entries(binding.protectedInputs))assert.equal(read('rev-parse',head+':'+p),blob,'Protected input drift: '+p);
 return {schema:1,route:'survey-governance',base,head,product:binding.product,components:binding.components,postMerge:env.CI_EVENT==='push',changes:entries};
}
export function surveyGovernanceOutputs(p){const o=participantAccessOutputs(p);delete o.participant_access_plan;return {...o,application_route:'survey-governance',scenario:'survey-governance',survey_governance_plan:JSON.stringify(p)};}
