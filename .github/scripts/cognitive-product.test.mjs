import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {cognitiveProductPlan,cognitiveProductOutputs} from './cognitive-product-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
import {productCommands,verifyRegistrationReport,registrationTitle,runnerTasks,verifyBehaviorReport} from './cognitive-product-check.mjs';
const base='a'.repeat(40),head='b'.repeat(40),root='server-version/backend/src/modules/cognitive/';
const entry=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const manifest={schemaVersion:1,task:'sample',identities:[{testType:'sample',engineVersion:'1.0.0',scoringVersion:'1.0.0'}],frontend:[{testType:'sample',engineVersion:'1.0.0'}]};
const entries=[entry(root+'tasks/sample/generator.ts'),entry(root+'cognitive.registry.ts')];
const read=file=>file.endsWith('/task-package.json')?JSON.stringify(manifest):'unchanged';
const plan=()=>cognitiveProductPlan(entries,base,head,read,read);
const needs=p=>({scope:{result:'success',outputs:Object.fromEntries(Object.entries(cognitiveProductOutputs(p)).map(([k,v])=>[k,String(v)]))},'cognitive-product':{result:'success'},docker:{result:'success'},codeql:{result:'success'}});

test('runtime and scorer changes select a product job and SAST without all-platform jobs',()=>{
 const p=plan(),n=needs(p);assert.ok(p);assert.equal(p.route,'cognitive-product');
 assert.deepEqual(requiredChecks(n,false),['scope','cognitive-product','docker','codeql']);assert.deepEqual(requiredChecks(n,true),['scope']);
 assert.deepEqual(failedChecks(n,false),[]);
 for(const key of ['content','frontend','frontend_build','media2','canonical_visual','ops','perf_smoke'])assert.equal(n.scope.outputs[key],'false',key);
});
test('dependency schema native input other modules and executable changes cannot use the product route',()=>{
 for(const f of ['server-version/backend/prisma/schema.prisma','server-version/frontend/package-lock.json','server-version/backend/src/modules/scale/scoring.ts','server-version/frontend/src/modules/cognitive/native-runners.tsx'])assert.equal(cognitiveProductPlan([...entries,entry(f)],base,head,read,read),null,f);
 assert.equal(cognitiveProductPlan([{...entries[0],newMode:'100755'},entries[1]],base,head,read,read),null);
 assert.equal(cognitiveProductPlan([{...entries[0],status:'D',newMode:'000000'},entries[1]],base,head,read,read),null);
});
test('an existing task identity cannot disappear while taking the directed route',()=>{
 const removed=file=>file.endsWith('/task-package.json')?JSON.stringify({...manifest,identities:[{...manifest.identities[0],scoringVersion:'2.0.0'}]}):'unchanged';
 assert.equal(cognitiveProductPlan(entries,base,head,removed,read),null);
});
test('the exact administrator mount retains existing guards; other authority edits reject',()=>{
 const file='server-version/backend/src/modules/admin-permissions/routes.ts';
 const before="adminPermissionsRouter.use(authenticate, originGuard, requireSystemAdmin, limiter)\n";
 const after="import { cognitiveIntakeAdminRouter } from '../cognitive/onboarding/admin.routes'\n"+before+"adminPermissionsRouter.use('/cognitive-intake', cognitiveIntakeAdminRouter)\n";
 const get=(text)=>p=>p===file?text:read(p);
 assert.ok(cognitiveProductPlan([...entries,entry(file)],base,head,get(after),get(before)));
 assert.equal(cognitiveProductPlan([...entries,entry(file)],base,head,get(after.replace('requireSystemAdmin, ','')),get(before)),null);
});
test('missing failed skipped or cancelled required jobs never become success',()=>{
 for(const job of ['cognitive-product','docker','codeql'])for(const result of [undefined,'failure','skipped','cancelled']){
  const n=needs(plan());n[job]=result?{result}:{};assert.ok(failedChecks(n,false).includes(job),job+':'+result);
 }
 const n=needs(plan());n.scope.outputs.content='true';assert.ok(failedChecks(n,false).includes('scope'));
});
test('the directed recipe runs real behavior without unrelated catalog suites or duplicate compilation',()=>{
 const commands=productCommands('/candidate');assert.deepEqual(commands.map(c=>c.name),['manifest','dependencies','runners','scorer-freeze-intake','frontend-types']);
 const text=JSON.stringify(commands);assert.doesNotMatch(text,/onboarding-check|db:seed|restore|npm run build/);
 assert.match(text,/admin-intake\.postgres/);assert.match(text,/union-freeze-scorer/);
 assert.match(text,/cognitive-union-readiness/);
});
test('empty filtered wrong-title and failed registration output cannot pass the selected assertion',()=>{
 verifyRegistrationReport({numFailedTests:0,testResults:[{assertionResults:[registrationTitle,...runnerTasks.map(t=>t+' current report seed enters its actual introduction through the host')].map(title=>({title,status:'passed'}))}]});
 for(const row of [{title:registrationTitle,status:'pending'},{title:'not the selected test',status:'passed'}])assert.throws(()=>verifyRegistrationReport({numFailedTests:0,testResults:[{assertionResults:[row]}]}));
 assert.throws(()=>verifyRegistrationReport({numFailedTests:0,testResults:[]}));
 assert.throws(()=>verifyRegistrationReport({numFailedTests:1,testResults:[{assertionResults:[{title:registrationTitle,status:'passed'}]}]}));
});
test('workflow wires normal compile evidence and independent SAST into the stable gate',()=>{
 const ci=fs.readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8'),workflow=ci.slice(ci.indexOf('  cognitive-product:'),ci.indexOf('  content:',ci.indexOf('  cognitive-product:')));
 assert.match(ci,/cognitive_product_plan: \$\{\{ steps.scope.outputs.cognitive_product_plan \}\}/);
 assert.doesNotMatch(workflow,/uses: \.\/\.github\/workflows\//);
 assert.match(workflow,/COGNITIVE_PRODUCT_PLAN: \$\{\{ needs.scope.outputs.cognitive_product_plan \}\}/);
 assert.match(ci.slice(ci.indexOf('  merge-gate:')),/    - cognitive-product/);
 assert.match(workflow,/run: node \.github\/scripts\/cognitive-product-check.mjs/);
 assert.match(workflow,/prisma migrate deploy/);assert.match(workflow,/COGNITIVE_INSTALL_TEST_DATABASE_URL/);
 assert.doesNotMatch(workflow,/db:seed|ffmpeg|playwright.*install|workflow_dispatch/);
});

test('the real PostgreSQL intake and scorer freeze cannot qualify when opt-in tests skip',()=>{
 const report={numFailedTests:0,testResults:[{name:'/src/union-freeze-scorer.test.ts',assertionResults:[{status:'passed'}]},{name:'/src/admin-intake.postgres.integration.test.ts',assertionResults:Array.from({length:4},()=>({status:'passed'}))}]};
 verifyBehaviorReport(report);
 const skipped=structuredClone(report);skipped.testResults[1].assertionResults[0].status='pending';assert.throws(()=>verifyBehaviorReport(skipped));
 const missing=structuredClone(report);missing.testResults.pop();assert.throws(()=>verifyBehaviorReport(missing));
});
