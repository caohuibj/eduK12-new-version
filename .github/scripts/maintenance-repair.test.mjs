import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lstatSync,readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {posix} from 'node:path';
import {maintenanceRepairScope,maintenanceRepairOutputs} from './maintenance-repair-scope.mjs';
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
 for(const expected of ['assert-release-test-report.mjs','huiteacherFieldObservation.postgres.integration.test.ts','promtool','codeql-action/analyze'])assert(job.includes(expected));
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
 assert.match(workflow,/languages: javascript-typescript,python/);
 assert.match(workflow,/build-mode: none/);
 assert.match(workflow,/config-file: \.\/\.maintenance-repair-codeql\.json/);
});
