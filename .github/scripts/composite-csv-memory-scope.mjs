import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
export const bindingPath='.github/scripts/composite-csv-memory-bindings.json';
export const binding=JSON.parse(readFileSync(new URL('./composite-csv-memory-bindings.json',import.meta.url)));
const tools=new Set([bindingPath,'.github/scripts/composite-csv-memory-scope.mjs','.github/scripts/composite-csv-memory-scope.test.mjs','.github/scripts/composite-csv-memory-probe.cjs','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','.github/workflows/ci-composite-csv-memory.yml','docs/release/README.md']);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function compositeCsvMemoryPlan(entries,base,head,read=git){
 const marker=entries.find(e=>e.file===bindingPath);
 if(!marker)return null;
 if(marker.status!=='A'||base!==binding.base||!/^[a-f0-9]{40}$/.test(head))throw Error('CSV memory candidate requires its exact current-main base and new binding');
 if(!['pull_request','push'].includes(process.env.CI_EVENT||'pull_request')||process.env.CI_FORCE_FULL==='true')throw Error('CSV memory candidate does not admit dispatch or full-platform fallback');
 if(process.env.CI_EVENT==='pull_request'&&process.env.CI_SOURCE_HEAD&&read('rev-parse',head+'^{tree}')!==read('rev-parse',process.env.CI_SOURCE_HEAD+'^{tree}'))throw Error('CSV PR merge tree differs from source');
 if(new Set(entries.map(e=>e.file)).size!==entries.length)throw Error('Duplicate CSV candidate diff path');
 for(const e of entries){
  if(!tools.has(e.file)&&!Object.hasOwn(binding.source,e.file))throw Error('Unknown CSV candidate path: '+e.file);
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))throw Error('CSV candidate deletion, rename or mode change');
 }
 for(const[file,b]of Object.entries(binding.source)){
  const e=entries.find(e=>e.file===file);
  if(!e||read('rev-parse',head+':'+file)!==b.after||(b.before?e.status!=='M'||read('rev-parse',base+':'+file)!==b.before:e.status!=='A'))throw Error('CSV candidate source changed: '+file);
 }
 return {schema:1,route:'composite-csv-memory',base,head,sourceCount:Object.keys(binding.source).length,changes:entries};
}
export function compositeCsvMemoryOutputs(plan){
 const acceptance=JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json',import.meta.url)));
 return {...Object.fromEntries(['maintenance','documentation','content','presentation','frontend','frontend_test','frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle','training_functional_only','admin_permissions_functional_only','run_performance_tests',...Object.keys(acceptance)].map(k=>[k,false])),
  application_route:'composite-csv-memory',scenario:'composite-csv-memory',codeql:true,runner_profile:'hosted',media_selection:'[]',media_groups:'[]',composite_csv_memory_plan:JSON.stringify(plan)};
}
