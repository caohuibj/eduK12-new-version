import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,appendFileSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {sha256,inventory,productFingerprint,TOOLS,validExactPlan} from './exact-candidate-scope.mjs';
import {recheckPlan} from './exact-candidate-admission.mjs';

// This is an independently reviewed, bounded historical-local exception, not
// retrospective CI execution, signed execution, or missing-case PASS.
export const REVIEWED_MAC_ATTESTATION_SHA256 = 'e09878016940f13ecd944e0d84707e32a30b1a5808d3d8a6391fa7fe90f4ed71';
export function productDelta(base,head) {
  const before=new Map(inventory(base).filter(r=>!TOOLS.includes(r.path)).map(r=>[r.path,r]));
  const after=new Map(inventory(head).filter(r=>!TOOLS.includes(r.path)).map(r=>[r.path,r]));
  return [...new Set([...before.keys(),...after.keys()])].sort().flatMap(path=>{
    const a=before.get(path)||null,b=after.get(path)||null;
    return JSON.stringify(a)===JSON.stringify(b)?[]:[{path,before:a,after:b}];
  });
}
export function verifyMacHistory(bytes,plan,delta,originalFingerprint,reviewedDigest=REVIEWED_MAC_ATTESTATION_SHA256) {
  assert.ok(validExactPlan(plan)&&plan.candidate==='training-mac'&&!plan.postMerge,'Exact Mac PR plan required');
  assert.match(reviewedDigest||'',/^[a-f0-9]{64}$/,'Independent raw-evidence review is pending');
  assert.equal(sha256(bytes),reviewedDigest,'Reviewed historical record changed');
  const record=JSON.parse(bytes);
  assert.equal(record.schema,1);assert.equal(record.candidate,'training-mac');
  assert.equal(record.reviewed,true);assert.equal(record.ciExecuted,false);assert.equal(record.originalExecutionSigned,false);
  assert.equal(record.kind,'reviewed-historical-local-with-disclosed-limits');
  assert.equal(record.originalProductInventorySha256,originalFingerprint);
  assert.equal(record.productInventorySha256,plan.productInventorySha256);
  assert.deepEqual(record.reviewedProductDelta,delta);
  assert.ok(record.limitations.length>0);
  assert.equal(record.executions.length,9);
  for(const row of record.executions) {
    assert.ok([0,1].includes(row.originalExitCode));
    assert.equal(row.originalStatus,row.originalExitCode===0?'passed':'failed');
    assert.match(row.receiptSha256,/^[a-f0-9]{64}$/);assert.match(row.logSha256,/^[a-f0-9]{64}$/);
    assert.equal(row.passingCaseNamesOriginallyRecorded,false);
    assert.deepEqual(row.originalPassingCaseNames,[]);
    if(row.kind==='test') {
      assert.ok(row.aggregate && ['passed','failed','filtered'].every(k=>Number.isInteger(row.aggregate[k])&&row.aggregate[k]>=0));
      assert.equal(row.originalExitCode===0,row.aggregate.failed===0);
    } else assert.equal(row.countedAsApplicationTest,false);
  }
  assert.equal(record.compiledOutput.originalExitCode,null);
  assert.equal(record.compiledOutput.admission,'historical-completed-output-only-new-official-build-required-for-delivery');
  assert.equal(record.types.admittedAsPassed,false);
  return {schema:1,status:'success',kind:record.kind,sourceHead:plan.sourceHead,tree:plan.tree,
    ciExecuted:false,originalExecutionSigned:false,attestationSha256:reviewedDigest,
    historicalInvocations:record.executions,limitations:record.limitations,
    qualification:'Only the fixed historical record is admitted. Current compile/types, affected PG/HTTP/browser, images/scans and recovery remain required.'};
}
export function verifyRuntimeIdentity(result,plan,planBytes,inputBytes,env=process.env) {
  assert.ok(validExactPlan(plan)&&plan.candidate==='training-mac'&&!plan.postMerge);
  assert.equal(result.planSha256,sha256(planBytes));assert.equal(result.inputsSha256,sha256(inputBytes));
  for(const key of ['head','sourceHead','tree']) assert.equal(result[key],plan[key]);
  assert.equal(String(result.consumerRunId),env.GITHUB_RUN_ID);
  assert.equal(String(result.consumerAttempt),env.GITHUB_RUN_ATTEMPT);
  assert.ok(Array.isArray(result.phases));
  assert.equal(new Set(result.phases.map(p=>p.name)).size,result.phases.length);
}
export function verifyCompleteRuntime(result,plan) {
  assert.equal(result.status,'success');
  const required=['prepare','backend-compile','frontend-compile','frontend-app-types','changed-lint',
    'dependency-audit','compiled-browser','scoped-pg-http','runtime-packaging','runtime-scans','schema-upgrade-restore'];
  assert.deepEqual([...plan.macRuntime.requiredRuntimePhases].sort(),[...required].sort());
  assert.deepEqual(result.phases.map(p=>p.name).sort(),[...required].sort());
  for(const phase of result.phases) assert.equal(phase.status,'success',phase.name);
}
async function fileHash(path) {
  const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');
}
async function verifyImages(result,dir) {
  for(const component of ['backend','frontend']) {
    const image=result.components[component];assert.match(image.runtimeImageId,/^sha256:[a-f0-9]{64}$/);
    const scan=JSON.parse(readFileSync(join(dir,component+'-scan.json')));
    assert.equal(scan.imageId,image.runtimeImageId);assert.equal(scan.exitCode,0);
    assert.deepEqual(scan.findings,[]);assert.deepEqual(scan.severity,['HIGH','CRITICAL']);
    assert.equal(await fileHash(join(dir,component+'-runtime.tar.gz')),image.runtimeArchiveSha256);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    let [mode,planPath,out]=process.argv.slice(2);
    if(!['runtime','retain-compiles','retain-images'].includes(mode)) {out=planPath;planPath=mode;mode='historical';}
    assert.ok(planPath&&out);
    const planBytes=readFileSync(planPath),plan=JSON.parse(planBytes);recheckPlan(plan);
    if(mode==='historical') {
      const bytes=readFileSync(new URL('./training-mac-attestation.json',import.meta.url));
      const original=JSON.parse(bytes).originalSource;
      assert.equal(execFileSync('git',['rev-parse',original+'^{tree}'],{encoding:'utf8'}).trim(),JSON.parse(bytes).originalTree);
      const result=verifyMacHistory(bytes,plan,productDelta(original,plan.head),productFingerprint(inventory(original)));
      writeFileSync(out,JSON.stringify(result,null,2)+'\n');
    } else {
      const resultPath=join(out,'runtime-result.json');
      if(!existsSync(resultPath)&&mode!=='runtime') process.exit(0);
      const result=JSON.parse(readFileSync(resultPath));
      verifyRuntimeIdentity(result,plan,planBytes,readFileSync(new URL('./training-mac-inputs.json',import.meta.url)));
      if(mode==='runtime') {verifyCompleteRuntime(result,plan);await verifyImages(result,out);}
      if(mode==='retain-images') {
        if(['runtime-packaging','runtime-scans'].every(name=>result.phases.some(p=>p.name===name&&p.status==='success'))) {
          await verifyImages(result,out);appendFileSync(process.env.GITHUB_OUTPUT,'eligible=true\n');
        }
      }
      if(mode==='retain-compiles') {
        for(const component of ['backend','frontend']) {
          const phase=result.phases.find(p=>p.name===component+'-compile');
          if(phase?.status!=='success')continue;
          assert.match(phase.details.archiveSha256,/^[a-f0-9]{64}$/);
          assert.equal(await fileHash(join(out,component+'-compiled.tar.gz')),phase.details.archiveSha256);
          appendFileSync(process.env.GITHUB_OUTPUT,component+'=true\n');
        }
      }
    }
  } catch(error) {console.error('Mac qualification refused:',error.message);process.exitCode=1;}
}
