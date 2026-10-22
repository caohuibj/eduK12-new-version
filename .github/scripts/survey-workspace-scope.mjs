import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
export const marker='.github/scripts/survey-workspace-bindings.json';
export const branch='work/survey-visual-20261022';
export const binding=JSON.parse(readFileSync(new URL('./survey-workspace-bindings.json',import.meta.url)));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function surveyWorkspacePlan(entries,base,head,read=git,env=process.env){
 if((env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME)===branch)assert.notEqual(env.CI_EVENT,'workflow_dispatch','No manual/full/probe fallback');
 const selected=entries.some(e=>e.file===marker);
 if(!selected){
  // Actual routing/aggregate callers supply CI_SOURCE_HEAD; legacy fixture plans do not.
  if(env.CI_SOURCE_HEAD)assert.notEqual(env.CI_HEAD_REF||env.GITHUB_HEAD_REF,branch,'Survey workspace scope marker missing; no platform fallback');
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
 return {schema:1,route:'survey-workspace',base,head,product:binding.product,components:binding.components,changes:entries};
}

export function surveyWorkspaceOutputs(plan){
 const acceptance=JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json',import.meta.url)));
 return {...Object.fromEntries(['maintenance','documentation','content','presentation','frontend','frontend_test','frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle','training_functional_only','admin_permissions_functional_only','run_performance_tests',...Object.keys(acceptance)].map(k=>[k,false])),...Object.fromEntries(['heavy_runner','light_runner','frontend_runner','docker_runner','codeql_runner','regression_runner','browser_runner','media_runner'].map(k=>[k,'["ubuntu-24.04"]'])),application_route:'survey-workspace',scenario:'survey-workspace',codeql:true,runner_profile:'hosted',media_selection:'[]',media_groups:'[]',survey_workspace_plan:JSON.stringify(plan)};
}
