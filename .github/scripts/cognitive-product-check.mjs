import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {changedEntries} from './content-scope.mjs';
import {cognitiveProductPlan} from './cognitive-product-scope.mjs';
export const registrationFile='src/modules/cognitive/__tests__/cognitive-union-readiness.test.tsx';
export const registrationTitle='the combined current identities keep exact C/S/R seeds, execution, runners and startup declarations';
export const runnerTasks=['lineangle','sharegame','embeddedfigures','icarmatrix','sentencecheck','visualwm','auditorynback'];
export function verifyRegistrationReport(report){
 const rows=(report.testResults||[]).flatMap(file=>file.assertionResults||[]);
 assert.equal(report.numFailedTests,0,'Runner failures');
 for(const title of [registrationTitle,...runnerTasks.map(t=>t+' current report seed enters its actual introduction through the host')])
  assert.equal(rows.filter(row=>row.title===title&&row.status==='passed').length,1,'Missing actual runner assertion: '+title);
}
export function verifyBehaviorReport(report){
 assert.equal(report.numFailedTests,0,'Behavior failures');
 for(const [name,count] of [['union-freeze-scorer.test.ts',1],['admin-intake.postgres.integration.test.ts',4]]){
  const file=(report.testResults||[]).find(f=>f.name.endsWith('/'+name));
  assert.ok(file,'Missing behavior file '+name);assert.equal(file.assertionResults.length,count,name);
  assert.ok(file.assertionResults.every(row=>row.status==='passed'),'Skipped or failed actual behavior: '+name);
 }
}
export function productCommands(root){
 const node=process.execPath,back=path.join(root,'server-version/backend'),front=path.join(root,'server-version/frontend'),output=path.join(root,'cognitive-product-evidence');
 return [
  {name:'manifest',cwd:root,args:[node,'server-version/scripts/cognitive/manifests.cjs','--check']},
  {name:'dependencies',cwd:root,args:[node,'server-version/scripts/cognitive/dependencies.cjs']},
  {name:'runners',cwd:front,args:[node,'node_modules/vitest/vitest.mjs','run',registrationFile,'--no-file-parallelism','--reporter=json','--outputFile='+path.join(output,'runners.json')]},
  {name:'scorer-freeze-intake',cwd:back,args:[node,'node_modules/vitest/vitest.mjs','run','src/__tests__/cognitive/union-freeze-scorer.test.ts','src/__tests__/cognitive/admin-intake.postgres.integration.test.ts','--no-file-parallelism','--reporter=json','--outputFile='+path.join(output,'behavior.json')]},
  // Production images compile BE and FE once; Vite itself does not type-check.
  {name:'frontend-types',cwd:front,args:[node,'node_modules/typescript/bin/tsc','--project','tsconfig.app.json','--noEmit']},
 ];
}
export function recomputeProductPlan({root=process.cwd(),plan=JSON.parse(process.env.COGNITIVE_PRODUCT_PLAN||'null')}={}){
 assert.ok(plan&&plan.route==='cognitive-product','Missing product plan');
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const read=ref=>file=>{try{return execFileSync('git',['show',ref+':'+file],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{return null;}};
 assert.equal(plan.head,head,'Checkout changed');assert.deepEqual(plan,cognitiveProductPlan(changedEntries(plan.base,head),plan.base,head,read(head),read(plan.base)),'Product scope changed');
 return plan;
}
export function runProductChecks({root=process.cwd(),plan=JSON.parse(process.env.COGNITIVE_PRODUCT_PLAN||'null')}={}){
 recomputeProductPlan({root,plan});const output=path.join(root,'cognitive-product-evidence');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'plan.json'),JSON.stringify(plan,null,2)+'\n');
 for(const command of productCommands(root)){
  const result=spawnSync(command.args[0],command.args.slice(1),{cwd:command.cwd,env:{...process.env,NODE_ENV:'test',COGNITIVE_MODULE_ENABLED:'true',VITE_COGNITIVE_MODULE_ENABLED:'true'},encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024});
  fs.writeFileSync(path.join(output,command.name+'.log'),(result.stdout||'')+(result.stderr||''));assert.ok(!result.error,result.error?.message);assert.equal(result.status,0,command.name+' failed; see actual log');
  if(command.name==='runners')verifyRegistrationReport(JSON.parse(fs.readFileSync(path.join(output,'runners.json'),'utf8')));
  if(command.name==='scorer-freeze-intake')verifyBehaviorReport(JSON.parse(fs.readFileSync(path.join(output,'behavior.json'),'utf8')));
 }
 return {status:'PASS',head:plan.head,checks:productCommands(root).map(command=>command.name),productionDeployment:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(process.argv[2]==='plan'?recomputeProductPlan():runProductChecks()));}catch(error){console.error(error.stack||error.message);process.exitCode=1;}}
