import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
export const branch='work/participant-access-20261023';
export const marker='.github/scripts/participant-access-bindings.json';
export const binding=JSON.parse(readFileSync(new URL('./participant-access-bindings.json',import.meta.url)));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function participantAccessPlan(entries,base,head,read=git,env=process.env){
 const selected=entries.some(e=>e.file===marker),ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(!selected){if(ref===branch)throw Error('Participant access marker missing; no platform/manual fallback');return null;}
 assert.ok(['pull_request','push'].includes(env.CI_EVENT),'No manual/full/probe route');
 assert.notEqual(env.CI_FORCE_FULL,'true','No full-platform fallback');assert.notEqual(env.CI_FULL_ACCEPTANCE,'true','No full acceptance');
 assert.equal(base,binding.base,'Frozen main changed');assert.match(head,/^[a-f0-9]{40}$/);
 assert.equal(binding.base,'3c8b0ad97f664b10fb0abcb5884606c18f9ac4be');
 assert.equal(binding.product,'93009c77695de55107cde22f11421b114daa50d0');
 if(env.CI_EVENT==='pull_request'){
  assert.equal(ref,branch);assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
  assert.match(String(env.CI_PR_NUMBER),/^[1-9][0-9]*$/,'Actual PR number required');assert.match(env.CI_SOURCE_HEAD||'',/^[a-f0-9]{40}$/);
  assert.equal(read('rev-parse',env.CI_SOURCE_HEAD+'^{tree}'),read('rev-parse',head+'^{tree}'),'PR source/merge tree differs');
 }else assert.equal(env.GITHUB_REF_NAME||ref,'main','Only exact main post-merge classification');
 const expected=new Set([...Object.keys(binding.source),...binding.controls]);
 assert.equal(expected.size,Object.keys(binding.source).length+binding.controls.length);
 assert.equal(entries.length,expected.size,'Complete raw diff required');assert.equal(new Set(entries.map(e=>e.file)).size,entries.length);
 for(const e of entries){
  assert.ok(expected.has(e.file),'Unknown path: '+e.file);const s=binding.source[e.file];
  if(s){assert.equal(e.status,s.status);assert.equal(e.oldMode,s.oldMode);assert.equal(e.newMode,s.newMode);
   if(s.before)assert.equal(read('rev-parse',base+':'+e.file),s.before,'Product base drift');
   assert.equal(read('rev-parse',head+':'+e.file),s.after,'Product content drift');
  }else{assert.equal(e.newMode,'100644');const before=binding.controlBefore[e.file];assert.equal(e.status,before?'M':'A');assert.equal(e.oldMode,before?'100644':'000000');if(before)assert.equal(read('rev-parse',base+':'+e.file),before);}
 }
 for(const[component,tree]of Object.entries(binding.components))assert.equal(read('rev-parse',head+':server-version/'+component),tree,'Component tree drift: '+component);
 for(const[file,blob]of Object.entries(binding.protectedInputs))assert.equal(read('rev-parse',head+':'+file),blob,'Protected input drift: '+file);
 return {schema:1,route:'participant-access',base,head,product:binding.product,components:binding.components,postMerge:env.CI_EVENT==='push',changes:entries};
}
export function participantAccessOutputs(plan){
 const acceptance=JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json',import.meta.url)));
 return {...Object.fromEntries(['maintenance','documentation','content','presentation','frontend','frontend_test','frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle','training_functional_only','admin_permissions_functional_only','run_performance_tests',...Object.keys(acceptance)].map(k=>[k,false])),...Object.fromEntries(['heavy_runner','light_runner','frontend_runner','docker_runner','codeql_runner','regression_runner','browser_runner','media_runner'].map(k=>[k,'["ubuntu-24.04"]'])),application_route:'participant-access',scenario:'participant-access',codeql:!plan.postMerge,runner_profile:'hosted',media_selection:'[]',media_groups:'[]',participant_access_plan:JSON.stringify(plan)};
}
