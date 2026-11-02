import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lstatSync,readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {posix} from 'node:path';
import {maintenanceRepairScope,maintenanceRepairOutputs,maintenanceRepairPlan,maintenanceRepairCodeqlConfig,assertMaintenanceTestReport} from './maintenance-repair-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const entry=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const source=entry('server-version/backend/src/services/passwordChangeService.ts');
test('only bounded maintenance sources are selected, not unrelated business, dependencies or schema',()=>{
 assert(maintenanceRepairScope([source]));
 for(const file of ['server-version/backend/prisma/schema.prisma','server-version/backend/package-lock.json','server-version/backend/src/index.ts','server-version/frontend/src/App.tsx'])assert(!maintenanceRepairScope([source,entry(file)]));
 assert(!maintenanceRepairScope([{...source,newMode:'120000'}]));
 const before={scripts:{build:'npm run bundle:onboarding:check && tsc'},dependencies:{zod:'unchanged'}};
 const after={scripts:{build:'npm run bundle:declarations:check && tsc','bundle:declarations:check':'tsx src/scripts/bundle-onboarding.ts check-public'},dependencies:{zod:'unchanged'}};
 const entries=[source,entry('server-version/backend/package.json')];
 assert(maintenanceRepairScope(entries,()=>JSON.stringify(before),()=>JSON.stringify(after)));
 after.dependencies.zod='changed';assert(!maintenanceRepairScope(entries,()=>JSON.stringify(before),()=>JSON.stringify(after)));
});
test('required real checks cannot be absent, skipped, failed or cancelled',()=>{
 const scope={result:'success',outputs:Object.fromEntries(Object.entries(maintenanceRepairOutputs()).map(([k,v])=>[k,String(v)]))};
 const needs={scope,'maintenance-repair':{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','maintenance-repair']);
 assert.deepEqual(failedChecks(needs,false),[]);
 for(const result of ['failure','skipped','cancelled',undefined])assert(failedChecks({...needs,'maintenance-repair':{result}},false).includes('maintenance-repair'));
 assert(failedChecks(needs,true).includes('scope'));
 const job=readFileSync('.github/workflows/ci.yml','utf8');
 for(const expected of ['--test "$CI_BASE_SHA"','promtool','codeql-action/analyze'])assert(job.includes(expected));
 const legacy=maintenanceRepairPlan([entry('server-version/scripts/host-ops/monitor.py')]);
 assert(legacy.postgres.some(g=>g.file==='src/__tests__/integration/huiteacherFieldObservation.postgres.integration.test.ts'));
});
test('mixed-language CodeQL CLI retains all runtime and control inputs using directory roots',()=>{
 const expected=[
  '.github/scripts/content-scope.mjs','.github/scripts/local-validation.mjs',
  '.github/scripts/maintenance-repair-scope.mjs','.github/scripts/merge-gate.mjs','.github/scripts/post356-scope.mjs',
  'server-version/backend/src/controllers/changePasswordController.ts',
  'server-version/backend/src/modules/assessment-bundle/onboarding/public-check.ts',
  'server-version/backend/src/modules/huiteacher/consensus.service.ts',
  'server-version/backend/src/modules/huiteacher/fieldEventAccess.ts',
  'server-version/backend/src/modules/huiteacher/observer.service.ts',
  'server-version/backend/src/modules/reporting/service.ts',
  'server-version/backend/src/scripts/bundle-onboarding.ts',
  'server-version/backend/src/services/classroomSocketHandler.ts',
  'server-version/backend/src/services/passwordChangeService.ts',
  'server-version/backend/src/services/socketService.ts',
  'server-version/miniprogram-v2/scripts/feature-inventory.cjs',
  'server-version/scripts/cognitive/acceptance.cjs','server-version/scripts/cognitive/frontend-tests.cjs',
  'server-version/scripts/host-ops/monitor.py',
 ].sort();
 const config=JSON.parse(execFileSync(process.execPath,['.github/scripts/maintenance-repair-scope.mjs','--codeql-config'],{encoding:'utf8'}));
 assert.deepEqual(Object.keys(config).sort(),['paths','paths-ignore']);
 assert.equal(config.paths.length,10);
 const included=[];
 for(const directory of config.paths){
  assert(lstatSync(directory).isDirectory(),directory);
  for(const name of readdirSync(directory)){
   const file=posix.join(directory,name);
   if(config['paths-ignore'].includes(file))continue;
   assert(lstatSync(file).isFile(),file);
   included.push(file);
  }
 }
 assert.deepEqual(included.sort(),expected);
 const workflow=readFileSync('.github/workflows/ci.yml','utf8').split('  maintenance-repair:')[1].split('\n  maintenance:')[0];
 assert.match(workflow,/languages: \$\{\{ steps.repair.outputs.languages \}\}/);
 assert.match(workflow,/build-mode: none/);
 assert.match(workflow,/config-file: \.\/\.maintenance-repair-codeql\.json/);
});

const backend='server-version/backend/';
const authorizationRuntime=[
 'src/controllers/questionnaireController.ts','src/utils/courseAccess.ts','src/modules/campus/activity.tasks.ts',
 'src/modules/huiteacher/consensus.service.ts','src/services/passwordChangeService.ts','src/services/classroomSocketHandler.ts',
 'src/modules/cognitive/assignment.service.ts','src/modules/bundle-product/routes.ts','src/modules/bundle-product/admin-authoring.ts',
 'src/modules/bundle-product/package-release.ts','src/modules/cognitive/cognitive.routes.ts',
].map(p=>backend+p);
const authorizationEntries=authorizationRuntime.map(entry);
test('authorization changes select migration/HTTP/PG/concurrency consumers without unrelated maintenance',()=>{
 const p=maintenanceRepairPlan(authorizationEntries);
 assert.equal(p.legacy,false);
 assert.equal(p.checks.length,7);assert.equal(p.tests.length,10);assert.equal(p.postgres.length,4);
 assert(p.tests.includes('src/__tests__/bundle-product/system-authority.routes.test.ts'));
 assert(p.tests.includes('src/__tests__/controllers/password-change-canonical.test.ts'));
 assert(p.postgres.some(g=>g.file.endsWith('assignment-publication-race.postgres.integration.test.ts')));
 assert.equal(p.postgres.find(g=>g.file.includes('campusActivity')).count,2);
 assert.equal(p.postgres.find(g=>g.file.includes('huiteacherConsensus')).count,2);
 assert.deepEqual(p.sources, [...authorizationRuntime,'.github/scripts/maintenance-repair-scope.mjs'].sort());
 assert.equal(p.languages,'javascript-typescript');
 const migration=entry(backend+'prisma/migrations/20261101234500_campus_task_current_product_access/migration.sql');
 assert.deepEqual(maintenanceRepairPlan([migration]).checks,['school-access']);
 assert.deepEqual(maintenanceRepairPlan([source]).checks,['password-transition']);
 assert.deepEqual(maintenanceRepairPlan([source]).tests,['src/__tests__/controllers/password-change-canonical.test.ts']);
 assert.equal(maintenanceRepairPlan([source]).postgres.length,0);
 const roleFixture=entry(backend+'src/__tests__/bundle-onboarding/content.postgres.integration.test.ts');
 assert.deepEqual(maintenanceRepairPlan([roleFixture]).checks,['system-content-authority']);
});
test('unknown mixtures and unsafe raw metadata cannot be classified as bounded authorization repair',()=>{
 for(const file of [
  backend+'prisma/migrations/20990101000000_unreviewed/migration.sql',backend+'prisma/schema.prisma',
  backend+'package-lock.json',backend+'src/config/database.ts',backend+'src/utils/cos.ts',
  'server-version/frontend/src/App.tsx','server-version/miniprogram-v2/app.js','.github/workflows/unreviewed.yml',
 ])assert.equal(maintenanceRepairPlan([...authorizationEntries,entry(file)]),null,file);
 for(const bad of [
  {...authorizationEntries[0],status:'D',newMode:'000000'},
  {...authorizationEntries[0],status:'R'},
  {...authorizationEntries[0],newMode:'120000'},
  {...authorizationEntries[0],oldMode:'100755'},
 ])assert.equal(maintenanceRepairPlan([bad]),null);
 assert.equal(maintenanceRepairPlan([]),null);
 assert.equal(maintenanceRepairPlan([entry('.github/workflows/ci.yml')]),null);
});
test('mixed legacy repairs retain their real checks and every newly affected SAST input',()=>{
 const p=maintenanceRepairPlan([...authorizationEntries,entry('server-version/scripts/host-ops/monitor.py')]);
 assert.equal(p.legacy,true);assert(p.sources.includes('server-version/scripts/host-ops/monitor.py'));
 for(const source of authorizationRuntime)assert(p.sources.includes(source),source);
 assert.equal(p.languages,'javascript-typescript,python');
 assert.equal(p.postgres.find(g=>g.file.includes('huiteacherConsensus')).pattern,undefined);
 assert.equal(p.tests.length,new Set(p.tests).size);
});
test('authorization CodeQL directory roots include exactly the selected runtime and controls',()=>{
 const plan=maintenanceRepairPlan([...authorizationEntries,entry('.github/scripts/maintenance-repair.test.mjs'),entry('.github/workflows/ci.yml')]);
 const config=maintenanceRepairCodeqlConfig(plan.sources),included=[];
 for(const directory of config.paths)for(const name of readdirSync(directory)){
  const file=posix.join(directory,name);
  if(!config['paths-ignore'].includes(file)){assert(lstatSync(file).isFile(),file);included.push(file);}
 }
 assert.deepEqual(included.sort(),plan.sources);
 assert(!included.some(p=>p.includes('/miniprogram')||p.endsWith('/index.ts')||p.includes('/utils/cos')));
});
test('filtered PG evidence requires every selected assertion to pass and never counts unrelated pending cases',()=>{
 const selection={file:'src/__tests__/integration/fixture.test.ts',pattern:'selected guard',count:2};
 const suite={name:'/synthetic/backend/'+selection.file,assertionResults:[
  {fullName:'selected guard permits restored access',status:'passed'},
  {fullName:'selected guard refuses revoked access',status:'passed'},
  {fullName:'unrelated existing flow',status:'pending'},
 ]};
 const report={success:true,numFailedTests:0,testResults:[suite]};
 assert.deepEqual(assertMaintenanceTestReport(report,selection),{file:selection.file,passed:2,unselected:1});
 for(const mutate of [
  r=>r.success=false,r=>r.numFailedTests=1,r=>r.testResults=[],r=>r.testResults.push(structuredClone(suite)),
  r=>r.testResults[0].assertionResults.shift(),r=>r.testResults[0].assertionResults=[],
  ...['pending','skipped','failed','todo'].map(status=>r=>r.testResults[0].assertionResults[0].status=status),
 ]){const value=structuredClone(report);mutate(value);assert.throws(()=>assertMaintenanceTestReport(value,selection));}
 assert.throws(()=>assertMaintenanceTestReport(report,{file:selection.file}),'unfiltered suites cannot hide pending assertions');
});
test('the existing formal job binds plan, migration, actual tests, tsc and SAST to the same complete diff',()=>{
 const workflow=readFileSync('.github/workflows/ci.yml','utf8').split('  maintenance-repair:')[1].split('\n  maintenance:')[0];
 for(const expected of ['--plan "$CI_BASE_SHA"','--test "$CI_BASE_SHA"','--codeql-config "$CI_BASE_SHA"',
  'COGNITIVE_ASSIGNMENT_INTEGRATION_DB_URL:','prisma/build/index.js migrate deploy','typescript/bin/tsc --noEmit',
  'codeql-action/init@v3','codeql-action/analyze@v3','CI_BASE_SHA: ${{ needs.scope.outputs.diff_base }}'])assert(workflow.includes(expected),expected);
 const steps=workflow.split('      - name: ');
 for(const step of steps.filter(s=>/miniprogram-v2|product-route-inventory|promtool|bundle-onboarding.ts (manifest-check|check-public)/.test(s)))
  assert.match(step,/if: steps.repair.outputs.legacy == 'true'/);
 assert.doesNotMatch(workflow,/pull_request.number|full_acceptance|mark.*success/);
 const ci=readFileSync('.github/workflows/ci.yml','utf8');
 for(const name of ['pr-light-backend','pr-light-frontend','miniprogram']){
  const block=ci.split('\n  '+name+':')[1]?.split('\n    steps:')[0]??'';
  assert(block.includes("application_route == 'legacy'"),name+' must remain outside this route');
 }
});
