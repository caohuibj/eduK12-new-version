import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
