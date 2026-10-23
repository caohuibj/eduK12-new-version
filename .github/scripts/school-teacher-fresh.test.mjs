import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requireFreshQualification,requireSuccess,JOBS} from './school-teacher-scope.mjs';
import {verifyFreshManifest,verifyTestReport,requireNoHistoricalAcceptance,safeTestFailure} from './school-teacher-checks.mjs';
const fresh=()=>({qualification:'fresh-integrated-authoring',base:'69497181d569d4a5f7d61cdab108b977894cf9b3',frontendBuildDecision:'fresh-current-source',backendBuildDecision:'fresh-current-source',execution:{finalized:true,frontend:{types:true,batches:[{}]},backend:{batches:[{}]},auditComponents:['frontend','backend']}});
test('fresh qualification requires exact new base two fresh builds and finalized affected work',()=>{
 assert.equal(requireFreshQualification(fresh()),true);
 for(const mutate of [b=>b.base='4dd9f1340fef2bc3df2d066b9bf7712bc2eb3c66',b=>b.frontendBuildDecision='fixed-run15-frontend-build',b=>b.backendBuildDecision='fixed-official-backend-build',b=>b.execution.finalized=false,b=>b.execution.frontend.types=false,b=>b.execution.backend.batches=[],b=>b.execution.auditComponents=['frontend']]){const b=fresh();mutate(b);assert.throws(()=>requireFreshQualification(b));}
});
test('fresh manifests require current SHA run component lock and actual artifact bytes',()=>{
 const expected={kind:'frontend',head:'a'.repeat(40),runId:'1234',lockDigest:'b'.repeat(64),contentDigest:'c'.repeat(64)};
 const manifest={schemaVersion:1,sha:expected.head,runId:expected.runId,kind:expected.kind,lockDigest:expected.lockDigest,contentDigest:expected.contentDigest};
 assert.deepEqual(verifyFreshManifest(manifest,expected),manifest);
 for(const key of ['sha','runId','kind','lockDigest','contentDigest'])assert.throws(()=>verifyFreshManifest({...manifest,[key]:'stale'},expected));
});
test('fresh selections reject skipped or missing assertions and admit no local historical results',()=>{
 const batch={expectedPassed:['current assertion'],expectedFiltered:[]};const report={success:true,numFailedTests:0,testResults:[{assertionResults:[{fullName:'current assertion',status:'passed'}]}]};
 assert.equal(verifyTestReport(report,batch).passed,1);
 assert.throws(()=>verifyTestReport({...report,testResults:[{assertionResults:[{fullName:'current assertion',status:'skipped'}]}]},batch));
 assert.throws(()=>requireNoHistoricalAcceptance({schemaVersion:1,acceptedGroups:[{ciExecuted:false}]}));
});
test('fresh aggregate still requires all existing groups to actually succeed',()=>{
 for(const failure of ['skipped','failure','cancelled',undefined]){const needs=Object.fromEntries(JOBS.map(id=>[id,{result:'success'}]));needs.connected.result=failure;assert.throws(()=>requireSuccess({requiredJobs:JOBS},needs));}
});
test('fresh workflow uses real browser upgrade restore and same-run artifacts without old receipt downloads',()=>{
 const workflow=readFileSync(new URL('../workflows/ci-school-teacher.yml',import.meta.url),'utf8');
 assert(workflow.includes('school-teacher-checks.mjs migrate'));assert(workflow.includes('school-teacher-checks.mjs restore'));assert(workflow.includes('node server-version/e2e/school-teacher-browser.cjs'));
 assert(!workflow.includes("EDUCATION_MATERIAL_CAPACITY_PROBE_STUB:"));assert(!workflow.includes('official-frontend-build-reuse.json'));assert(!workflow.includes('git fetch'));
 const checks=readFileSync(new URL('./school-teacher-checks.mjs',import.meta.url),'utf8');assert(checks.includes("await migrate(b)"));assert(checks.includes("batches('backend',b.execution.backend.batches)"));assert(checks.includes("assert.notEqual(process.env.EDUCATION_MATERIAL_CAPACITY_PROBE_STUB,'true'"));
});
test('School CodeQL scans actual application while shared-authoring remains independent',()=>{
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 assert(ci.includes("application_route == 'school-teacher' && 'paths: [server-version/backend/src, server-version/frontend/src, server-version/e2e, .github/scripts]'"));
 assert(ci.includes("application_route == 'shared-authoring'"));assert(ci.includes('uses: ./.github/workflows/ci-shared-authoring.yml'));assert(!ci.includes('school-teacher-checks.mjs sast-reuse'));
});

test('fresh failure diagnostics retain only known error types and tracked relative code locations',()=>{
 const result=safeTestFailure(["TypeError: secret TOKEN=never-publish\n at fn (/tmp/private/server-version/backend/src/modules/example.ts:12:4)\n at secret (/tmp/secret-user.ts:1:2)"],new Set(['src/modules/example.ts']));
 assert.deepEqual(result.errorTypes,['TypeError']);assert.deepEqual(result.codeLocations,['src/modules/example.ts:12:4']);assert(!JSON.stringify(result).includes('TOKEN'));assert(!JSON.stringify(result).includes('/tmp'));assert(!JSON.stringify(result).includes('secret-user'));assert.match(result.diagnosticSha256,/^[a-f0-9]{64}$/);
});
