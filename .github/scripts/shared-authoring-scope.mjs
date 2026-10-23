import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
export const branch='work/shared-assessment-authoring-20261023';
export const marker='.github/scripts/shared-authoring-bindings.json';
export const binding=JSON.parse(readFileSync(new URL('./shared-authoring-bindings.json',import.meta.url)));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function sharedAuthoringPlan(entries,base,head,read=git,env=process.env){
 const selected=entries.some(e=>e.file===marker),ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(!selected){if(env.CI_SOURCE_HEAD&&ref===branch)throw Error('Shared authoring marker missing; no platform fallback');return null;}
 assert.ok(['pull_request','push'].includes(env.CI_EVENT),'No manual/full/probe route');
 assert.notEqual(env.CI_FORCE_FULL,'true','No full-platform fallback');
 assert.equal(base,binding.base,'Frozen main changed');assert.match(head,/^[a-f0-9]{40}$/);
 assert.equal(binding.product,'0814c74f49b5bd47ccec27966f9ff55e1b112011');
 assert.equal(binding.evidenceProduct,'693fd489e626eec6b34869657b2b23c5faeae69a');
 assert.equal(binding.base,'4dd9f1340fef2bc3df2d066b9bf7712bc2eb3c66');
 if(env.CI_EVENT==='pull_request'){
  assert.equal(ref,branch);assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
  assert.match(env.CI_SOURCE_HEAD||'',/^[a-f0-9]{40}$/);
  assert.equal(read('rev-parse',env.CI_SOURCE_HEAD+'^{tree}'),read('rev-parse',head+'^{tree}'),'PR source/merge tree differs');
 }else assert.equal(env.GITHUB_REF_NAME||ref,'main','Only exact main post-merge classification');
 const expected=new Set([...Object.keys(binding.source),...binding.controls]);
 assert.equal(expected.size,Object.keys(binding.source).length+binding.controls.length);
 assert.equal(entries.length,expected.size,'Complete raw diff required');assert.equal(new Set(entries.map(e=>e.file)).size,entries.length);
 for(const e of entries){
  assert.ok(expected.has(e.file),'Unknown path: '+e.file);
  const s=binding.source[e.file];
  if(s){assert.equal(e.status,s.status);assert.equal(e.oldMode,s.oldMode);assert.equal(e.newMode,s.newMode);
   if(s.before)assert.equal(read('rev-parse',base+':'+e.file),s.before,'Product base drift');
   if(s.after)assert.equal(read('rev-parse',head+':'+e.file),s.after,'Product content drift');
   // The sole deleted path is an identical-blob move into the shared layer.
   if(e.status==='D')assert.equal(s.before,binding.source['server-version/frontend/src/modules/assessment-core/scale/authoringInput.ts'].after);
  }else{assert.equal(e.newMode,'100644');const before=binding.controlBefore[e.file];assert.equal(e.status,before?'M':'A');assert.equal(e.oldMode,before?'100644':'000000');if(before)assert.equal(read('rev-parse',base+':'+e.file),before);}
 }
 for(const[component,tree]of Object.entries(binding.components))assert.equal(read('rev-parse',head+':server-version/'+component),tree,'Product tree drift: '+component);
 for(const[file,blob]of Object.entries(binding.protectedInputs))assert.equal(read('rev-parse',head+':'+file),blob,'Protected input drift: '+file);
 return {schema:1,route:'shared-authoring',base,head,product:binding.product,components:binding.components,postMerge:env.CI_EVENT==='push',changes:entries};
}
export function sharedAuthoringOutputs(plan){
 const acceptance=JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json',import.meta.url)));
 return {...Object.fromEntries(['maintenance','documentation','content','presentation','frontend','frontend_test','frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle','training_functional_only','admin_permissions_functional_only','run_performance_tests',...Object.keys(acceptance)].map(k=>[k,false])),...Object.fromEntries(['heavy_runner','light_runner','frontend_runner','docker_runner','codeql_runner','regression_runner','browser_runner','media_runner'].map(k=>[k,'["ubuntu-24.04"]'])),application_route:'shared-authoring',scenario:'shared-authoring',codeql:!plan.postMerge,runner_profile:'hosted',media_selection:'[]',media_groups:'[]',shared_authoring_plan:JSON.stringify(plan)};
}
