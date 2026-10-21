import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
export const bindingPath='.github/scripts/training-workspace-bindings.json';
export const binding=JSON.parse(readFileSync(new URL('./training-workspace-bindings.json',import.meta.url)));
const tools=new Set([bindingPath,'.github/scripts/training-workspace-scope.mjs','.github/scripts/training-workspace-scope.test.mjs','.github/scripts/training-workspace-checks.mjs','.github/scripts/training-workspace-browser.mjs','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','.github/workflows/ci-training-workspace.yml']);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function trainingWorkspacePlan(entries,base,head,read=git){
 const marker=entries.find(e=>e.file===bindingPath);
 if(!marker)return null;
 if(marker.status!=='A'||base!==binding.base||!/^[a-f0-9]{40}$/.test(head))throw Error('Training workspace requires its exact current-main base and new binding');
 if(!['pull_request','push'].includes(process.env.CI_EVENT||'pull_request')||process.env.CI_FORCE_FULL==='true')throw Error('Training workspace does not admit dispatch or full-platform fallback');
 if(new Set(entries.map(e=>e.file)).size!==entries.length)throw Error('Duplicate workspace diff path');
 for(const e of entries){
  if(!tools.has(e.file)&&!Object.hasOwn(binding.source,e.file))throw Error('Unknown workspace path: '+e.file);
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))throw Error('Workspace deletion, rename or mode change');
 }
 for(const[file,b]of Object.entries(binding.source)){
  const e=entries.find(e=>e.file===file);
  if(!e||read('rev-parse',head+':'+file)!==b.after||(b.before?e.status!=='M'||read('rev-parse',base+':'+file)!==b.before:e.status!=='A'))throw Error('Workspace source changed: '+file);
 }
 return {schema:1,route:'training-workspace',base,head,sourceCount:Object.keys(binding.source).length,changes:entries};
}
export function trainingWorkspaceOutputs(plan){
 const acceptance=JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json',import.meta.url)));
 return {...Object.fromEntries(['maintenance','documentation','content','presentation','frontend','frontend_test','frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle','training_functional_only','admin_permissions_functional_only','run_performance_tests',...Object.keys(acceptance)].map(k=>[k,false])),
  application_route:'training-workspace',scenario:'training-workspace',codeql:true,runner_profile:'hosted',media_selection:'[]',media_groups:'[]',training_workspace_plan:JSON.stringify(plan)};
}
