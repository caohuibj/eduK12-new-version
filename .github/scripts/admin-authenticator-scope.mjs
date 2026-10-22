import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
export const bindings=JSON.parse(readFileSync(new URL('./admin-authenticator-bindings.json',import.meta.url)));
export const marker='.github/scripts/admin-authenticator-bindings.json';
export const branch='work/admin-authenticator-main-20261022';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function authenticatorPlan(entries,base,head,read=git,env=process.env){
 const selected=entries.some(e=>e.file===marker);
 if(!selected){if((env.CI_HEAD_REF||env.GITHUB_HEAD_REF)===branch)throw Error('Authenticator marker missing; no platform fallback');return null;}
 assert.ok(['pull_request','push'].includes(env.CI_EVENT),'PR or exact post-merge only');
 assert.notEqual(env.CI_FORCE_FULL,'true','No full-platform fallback');
 assert.equal(base,bindings.base,'Frozen main changed');assert.match(head,/^[a-f0-9]{40}$/);
 if(env.CI_EVENT==='pull_request'){
  assert.equal(env.CI_HEAD_REF||env.GITHUB_HEAD_REF,branch,'Exact branch');
  assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version','No external PR');
 }
 const expected=new Set([...Object.keys(bindings.source),...bindings.controls]);
 assert.equal(expected.size,Object.keys(bindings.source).length+bindings.controls.length,'No overlapping paths');
 assert.equal(entries.length,expected.size,'Complete diff');assert.equal(new Set(entries.map(e=>e.file)).size,entries.length);
 for(const e of entries){
  assert.ok(expected.has(e.file),'Unknown path: '+e.file);assert.equal(e.newMode,'100644');
  assert.ok((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644'),'Deletion, rename, or mode change');
  const b=bindings.source[e.file];
  if(b){assert.equal(e.status,b.before?'M':'A');assert.equal(read('rev-parse',head+':'+e.file),b.after);if(b.before)assert.equal(read('rev-parse',base+':'+e.file),b.before);}
 }
 for(const [component,tree]of Object.entries(bindings.components))assert.equal(read('rev-parse',head+':server-version/'+component),tree,'Product drift: '+component);
 for(const [file,blob]of Object.entries(bindings.historicalInputs))assert.equal(read('rev-parse',head+':'+file),blob,'Historical input drift: '+file);
 return {schema:1,route:'admin-authenticator',base,head,product:bindings.product,components:bindings.components,changes:entries,postMerge:env.CI_EVENT==='push'};
}
export function authenticatorOutputs(plan){
 const acceptance=JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json',import.meta.url)));
 return {...Object.fromEntries(['maintenance','documentation','content','presentation','frontend','frontend_test','frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle','training_functional_only','admin_permissions_functional_only','run_performance_tests',...Object.keys(acceptance)].map(k=>[k,false])),application_route:'admin-authenticator',scenario:'admin-authenticator',codeql:true,runner_profile:'hosted',media_selection:'[]',media_groups:'[]',admin_authenticator_plan:JSON.stringify(plan)};
}
