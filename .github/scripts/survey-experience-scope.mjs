import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
export const bindingPath='.github/scripts/survey-experience-bindings.json';
export const binding=JSON.parse(readFileSync(new URL('./survey-experience-bindings.json',import.meta.url)));
export const controls=[bindingPath,...['scope.mjs','scope.test.mjs','candidate.mjs','local.json','browser.cjs'].map(s=>'.github/scripts/survey-experience-'+s),'.github/workflows/ci-survey-experience.yml','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','docs/release/README.md'];
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function surveyExperiencePlan(entries,base,head,read=git,env=process.env){
 if(!entries.some(e=>e.file===bindingPath))return null;
 assert.equal(base,binding.base,'Survey base drift');assert.match(head,/^[a-f0-9]{40}$/);
 assert.ok(['pull_request','push'].includes(env.CI_EVENT||'pull_request'));assert.notEqual(env.CI_FORCE_FULL,'true');
 if(env.CI_EVENT==='pull_request'){
  assert.equal(env.CI_HEAD_REF||env.GITHUB_HEAD_REF,'work/survey-experience-20261022');
  if(env.CI_SOURCE_HEAD)assert.equal(read('rev-parse',head+'^{tree}'),read('rev-parse',env.CI_SOURCE_HEAD+'^{tree}'));
 }
 assert.equal(new Set(entries.map(e=>e.file)).size,entries.length);
 for(const e of entries){assert.ok(controls.includes(e.file)||Object.hasOwn(binding.source,e.file),'Unknown Survey path '+e.file);assert.equal(e.newMode,'100644');assert.ok(e.status==='A'&&e.oldMode==='000000'||e.status==='M'&&e.oldMode==='100644');}
 for(const[file,b]of Object.entries(binding.source)){const e=entries.find(e=>e.file===file);assert.ok(e,file);assert.equal(read('rev-parse',head+':'+file),b.after);if(b.before)assert.equal(read('rev-parse',base+':'+file),b.before);else assert.equal(e.status,'A');}
 assert.equal(read('rev-parse',head+':server-version/frontend'),binding.frontendTree,'Full frontend inputs changed');
 for(const[file,blob]of Object.entries(binding.dependencyInputs))assert.equal(read('rev-parse',head+':'+file),blob,file);
 return {schema:1,route:'survey-experience',base,head,frontendTree:binding.frontendTree,changes:entries};
}
export function surveyExperienceOutputs(plan){
 const acceptance=JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json',import.meta.url)));
 return {...Object.fromEntries(['maintenance','documentation','content','presentation','frontend','frontend_test','frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle','training_functional_only','admin_permissions_functional_only','run_performance_tests',...Object.keys(acceptance)].map(k=>[k,false])),application_route:'survey-experience',scenario:'survey-experience',codeql:true,runner_profile:'hosted',media_selection:'[]',media_groups:'[]',survey_experience_plan:JSON.stringify(plan)};
}
