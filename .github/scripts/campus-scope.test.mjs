import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {admitsCampus,campusFiles} from './campus-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const entry=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const page=entry('server-version/frontend/src/school/SchoolApp.tsx');
test('only exact campus files and ordinary additions/modifications are admitted',()=>{
 assert.equal(admitsCampus([page]),true);
 for(const file of ['server-version/backend/src/middleware/auth.ts','server-version/backend/prisma/schema.prisma','server-version/frontend/package-lock.json','server-version/frontend/src/training/TrainingPortal.tsx','.github/workflows/ci-backend.yml','unknown'])assert.equal(admitsCampus([page,entry(file)]),false);
 for(const bad of [{status:'D',newMode:'000000'},{status:'T',newMode:'120000'},{newMode:'100755'},{oldMode:'120000'}])assert.equal(admitsCampus([{...page,...bad}]),false);
 assert.equal(admitsCampus([]),false);assert.equal(admitsCampus([entry('.github/scripts/merge-gate.mjs')]),false);
 assert.equal(campusFiles.has('server-version/backend/src/modules/campus/mfa.service.ts'),false);
});
test('campus requires contracts and CodeQL even for drafts, never skipped evidence',()=>{
 const outputs={application_route:'campus',scenario:'campus',codeql:'true',campus_plan:JSON.stringify({schema:1,route:'campus',changed:['frontend','backend'],required:['campus-contracts','candidate-browser','runtime-scans','sast']}),...Object.fromEntries(['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'].map(k=>[k,'false']))};
 const needs={scope:{result:'success',outputs},campus:{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,true),['scope','campus','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const job of ['campus','codeql','scope'])for(const result of ['failure','cancelled','skipped',undefined])assert.ok(failedChecks({...needs,[job]:{...needs[job],result}},false).includes(job));
 assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,campus_plan:'{}'}}},false).includes('scope'));
});
test('campus is mutually exclusive with unrelated jobs and gates the actual candidate',()=>{
 const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 for(const job of ['backend','backend-regression','frontend-build','frontend','browser','docker','accept-media','accept-ui','accept-perf','accept-ops','miniprogram']){
 const block=workflow.split('\n  '+job+':\n')[1]?.split(/\n  [a-z][a-z-]+:\n/)[0];assert.ok(block?.includes("application_route == 'legacy'"),job);
 }
 assert.match(workflow,/release-tools, campus\]/);assert.match(workflow,/campus_plan: \$\{\{ steps.scope.outputs.campus_plan/);
 const candidate=readFileSync(new URL('../workflows/ci-campus.yml',import.meta.url),'utf8');
 for(const check of ['campus-candidate.py','campus-browser.mjs','HIGH,CRITICAL','--exit-code 1','failure()'])assert.ok(candidate.includes(check),check);
});
