import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {sha256,git,inventory,productFingerprint,REPOSITORY,exactCandidatePlan,validExactPlan} from './exact-candidate-scope.mjs';

export const LOCAL_REQUIRED=Object.freeze(['backend-types',
  'affected-unit-contracts','connected-schema-runtime','connected-pg-contracts','connected-http-contracts']);
// Exact historical assertions and the separately authorized new Cognitive proof
// received independent raw-evidence/source review. This reviewed digest is not
// a retrospective execution signature or a replacement for remaining CI gates.
export const REVIEWED_ATTESTATION_SHA256 = 'fe2873c30ce5f848e93d4ceafc1ec2dc70bafe1643bf4f7990a673fe678f1e7f';
export const backendTypePath = p => p==='server-version/backend/tsconfig.json'
  || p==='server-version/backend/package.json'||p==='server-version/backend/package-lock.json'
  || p==='server-version/backend/prisma/schema.prisma'
  || (p.startsWith('server-version/backend/src/')&&!p.startsWith('server-version/backend/src/__tests__/'));
export function backendTypesFingerprint(rows) {return sha256(JSON.stringify(rows.filter(r=>backendTypePath(r.path))));}
const requireValue=(x,message)=>{if(!x)throw Error(message);};
export function reviewedWrapperReporterException(c,execution) {
  return c.id==='affected-unit-contracts'&&c.admission==='selected-successful-cases'
          &&execution.id==='cognitive-wrapper-unit-json'&&execution.exitCode===null&&execution.status==='unknown'
          &&c.evidence.some(e=>e.sha256==='37a235136fb3e72ba8d613784e5e2ee6b40de8ed6677f1915c6597c1de606f9a')
          &&c.selectedCases.length===35
          &&sha256(JSON.stringify(c.selectedCases.map(t=>t.name)))==='589514def1e6cb9e9ac1aeed75e9ed76071bb559698938beca77c0fa64464390'
          &&c.sourceBindingAssurance==='reconstructed-not-contemporaneously-run-bound'&&c.historicalInputBinding===false
          &&c.invocationCompletionProven===false;
}
export function verifyRecordedEnvironment(e,wrapperReporterException=false) {
  requireValue(e?.assurance==='reviewed-historical-not-cryptographic-environment'
    &&e.fullHistoricalDependencyByteManifest===false
    &&Array.isArray(e.limitations)&&e.limitations.length>0
    &&e.limitations.every(x=>typeof x==='string'&&x.trim().length>0),
    'Historical environment assurance/limitations must remain explicit');
  for(const field of ['originalToolHashes','lockfiles','generatedInputs','retainedPackageVersions']) {
    const entries=e[field];
    if(!Array.isArray(entries)) {
      if(entries?.unavailable===true) {
        requireValue(wrapperReporterException&&['originalToolHashes','generatedInputs'].includes(field)
          &&typeof entries.rationale==='string'&&entries.rationale.trim().length>=30,
          'Unavailable historical inputs require the exact reviewed wrapper reporter exception');
        continue;
      }
      requireValue(entries?.notApplicable===true&&typeof entries.rationale==='string'
        &&entries.rationale.trim().length>=20,'Missing recorded environment field: '+field);
      continue;
    }
    requireValue(entries.length>0,'Empty recorded environment field: '+field);
    for(const entry of entries) {
      if(field==='lockfiles') requireValue(typeof entry.path==='string'&&entry.path.length>0
        &&/^[a-f0-9]{40}$/.test(entry.blob||''),'Missing original lock blob');
      else if(field==='retainedPackageVersions') requireValue(typeof entry.name==='string'&&entry.name.length>0
        &&typeof entry.version==='string'&&entry.version.length>0
        &&entry.provenance==='retained-version-matches-original-lock','Retained package version is corroboration only');
      else requireValue(typeof entry.name==='string'&&entry.name.length>0
        &&/^[a-f0-9]{64}$/.test(entry.sha256||''),'Missing original recorded tool/generated hash');
    }
  }
}
export function verifyConsumedInputs(inputs,overlays,selectedCases,rows) {
  requireValue(Array.isArray(inputs)&&inputs.length>0&&new Set(inputs.map(r=>r.path)).size===inputs.length,
    'Missing reviewed complete input closure');
  requireValue(Array.isArray(overlays)&&new Set(overlays.map(o=>o.path)).size===overlays.length,
    'Malformed exact disjoint overlays');
  const current=new Map(rows.map(r=>[r.path,r])), used=new Set();
  for(const original of inputs) {
    const actual=current.get(original.path);
    if(actual?.blob===original.blob&&actual.mode===original.mode) continue;
    const o=overlays.find(o=>o.path===original.path);
    requireValue(o&&o.before===original.blob&&o.after===actual?.blob
      &&(o.change==='added'?original.blob===null&&original.mode===null:o.mode===original.mode)
      &&o.mode===actual.mode&&o.reviewed===true,'Changed historical consumed input');
    requireValue(Array.isArray(o.selectedCases)&&JSON.stringify([...o.selectedCases].sort())===
      JSON.stringify([...selectedCases].sort()),'Disjoint overlay does not cover these exact selected cases');
    requireValue(o.review?.transitiveEffects==='unaffected'
      &&['imports','sharedState','validators','callees','config','schema'].every(k=>o.review[k]==='reviewed-unaffected')
      &&typeof o.review.rationale==='string'&&o.review.rationale.trim().length>=30,
      'Incomplete independent transitive disjoint review');
    used.add(o.path);
  }
  requireValue(used.size===overlays.length,'Unused/unrelated disjoint overlay');
}
export function admitNewCognitive(c,plan,rows) {
  requireValue(c?.id==='frontend-cognitive-types'&&c.kind==='recorded-local-execution'
    &&c.reviewed===true&&c.status==='passed'&&c.exitCode===0&&c.ciExecuted===false
    &&c.originalExecutionSigned===false&&c.trackedCheckoutUnchanged===true,
    'Missing reviewed newly executed Cognitive proof');
  requireValue(c.productInventorySha256===plan.productInventorySha256&&/^[a-f0-9]{40}$/.test(c.sourceHead||'')&&/^[a-f0-9]{40}$/.test(c.head||''),
    'Cognitive execution source identity mismatch');
  requireValue(JSON.stringify(c.command)===JSON.stringify(['node','--require','capture-reads.cjs',
    'node_modules/typescript/bin/tsc','-p','tsconfig.cognitive.json','--noEmit']),
    'Not the single authorized Cognitive type command');
  requireValue(c.nodeVersion==='24.21.0'&&c.typescriptVersion==='5.6.3'
    &&/^[a-f0-9]{64}$/.test(c.nodeSha256||'')
    &&c.officialDependencyArchiveSha256===plan.components?.frontend?.archiveSha256,
    'Cognitive toolchain or official dependency input changed');
  requireValue(Number.isFinite(Date.parse(c.startedAt))&&Number.isFinite(Date.parse(c.finishedAt))
    &&Date.parse(c.finishedAt)>=Date.parse(c.startedAt),'Missing original Cognitive execution timestamps');
  requireValue(Array.isArray(c.evidence)&&['execution.json','consumed-reads.json','original-command.log',
    'original-command.exit','capture-reads.cjs','run-once.py'].every(name=>c.evidence.some(e=>
      e.name===name&&/^[a-f0-9]{64}$/.test(e.sha256||''))), 'Missing original Cognitive receipt evidence');
  verifyConsumedInputs(c.sourceInputs,[],[],rows);
  requireValue(Array.isArray(c.dependencyInputs)&&c.dependencyInputs.length>0
    &&new Set(c.dependencyInputs.map(r=>r.path)).size===c.dependencyInputs.length
    &&c.dependencyInputs.every(r=>r.path.startsWith('node_modules/')&&!r.path.split('/').includes('..')
      &&/^[a-f0-9]{64}$/.test(r.sha256||'')),'Missing verified official dependency read closure');
  return {id:c.id,kind:c.kind,exitCode:c.exitCode,startedAt:c.startedAt,finishedAt:c.finishedAt};
}
export function admitHistorical(bytes,plan,rows,reviewedDigest=REVIEWED_ATTESTATION_SHA256) {
  requireValue(validExactPlan(plan)&&plan.postMerge===false,'A ready PR qualification plan is required');
  requireValue(/^[a-f0-9]{64}$/.test(reviewedDigest||'')&&sha256(bytes)===reviewedDigest,'Historical attestation has not received exact independent review');
  const a=JSON.parse(bytes);
  requireValue(a.schema===1&&a.kind==='reviewed-local-evidence'&&a.historicalKind==='reviewed-historical-local'&&a.candidate===plan.candidate,
    'Not this candidate historical-local attestation');
  requireValue(a.productInventorySha256===plan.productInventorySha256,'Attestation product changed');
  requireValue(a.originalExecutionSigned===false&&a.ciExecuted===false,'Historical execution cannot be relabeled signed/CI');
  requireValue(Array.isArray(a.checks)&&a.checks.length===LOCAL_REQUIRED.length
    &&new Set(a.checks.map(c=>c.id)).size===a.checks.length,'Duplicate/missing/extra claims');
  requireValue(JSON.stringify(a.required)===JSON.stringify(LOCAL_REQUIRED),'Historical required-check selection changed');
  for(const id of LOCAL_REQUIRED) {
    const c=a.checks.find(c=>c.id===id);
    requireValue(c&&c.reviewed===true&&c.outcome==='passed',`Missing independently reviewed historical check: ${id}`);
    requireValue(Array.isArray(c.evidence)&&c.evidence.length>0&&c.evidence.every(e=>typeof e.name==='string'
      &&/^[a-f0-9]{64}$/.test(e.sha256||'')),'Missing exact original evidence hashes: '+id);
    requireValue(Array.isArray(c.selectedCases)&&c.selectedCases.length>0
      &&c.selectedCases.every(t=>t.status==='passed'&&typeof t.name==='string'&&t.name.length>0)
      &&new Set(c.selectedCases.map(t=>t.name)).size===c.selectedCases.length,'Skipped/duplicate/unrun cases cannot pass: '+id);
    requireValue(Array.isArray(c.failureHistory),'Original failure history required');
    if(c.executions) {
      requireValue(Array.isArray(c.executions)&&c.executions.length>0
        &&new Set(c.executions.map(e=>e.id)).size===c.executions.length,'Distinct original executions required');
      for(const execution of c.executions) {
        const wrapperException=reviewedWrapperReporterException(c,execution);
        verifyRecordedEnvironment(execution.environmentEvidence,wrapperException);
        requireValue(typeof execution.id==='string'&&(Number.isInteger(execution.exitCode)||execution.exitCode===null)
          &&['passed','failed','unknown'].includes(execution.status)&&Array.isArray(execution.cases)
          &&execution.cases.length>0&&new Set(execution.cases.map(t=>t.name)).size===execution.cases.length,
          'Incomplete original execution');
        requireValue(execution.exitCode===null?execution.status==='unknown'&&c.admission==='selected-successful-cases':
          execution.exitCode===0?execution.status==='passed':execution.status==='failed',
          'Original execution status relabeled');
        requireValue(execution.cases.every(t=>['passed','failed','skipped'].includes(t.status)),
          'Unknown original case status');
      }
      for(const selected of c.selectedCases) {
        const original=c.executions.find(e=>e.id===selected.executionId);
        requireValue(original?.cases.some(t=>t.name===selected.name&&t.status==='passed'),
          'Selected case was not actually passed in the named original execution');
      }
    } else {
      verifyRecordedEnvironment(c.environmentEvidence);
      requireValue(c.originalExitCode===0&&c.originalStatus==='passed','Original failure is not a passing invocation: '+id);
    }
    // No broad arbitrary recipe or free-form closure is admitted.
    if(id==='backend-types') requireValue(c.inputClosure===backendTypesFingerprint(rows),'Backend type input closure changed');
    else {
      requireValue(c.closureReview==='reviewed-transitive-source-and-recorded-environment','Incomplete dependency closure: '+id);
      if(c.executions) {
        const selectedExecutions=[...new Set(c.selectedCases.map(t=>t.executionId))];
        requireValue(Array.isArray(c.inputSets)&&c.inputSets.length===selectedExecutions.length
          &&new Set(c.inputSets.map(s=>s.executionId)).size===selectedExecutions.length,
          'Each selected original execution needs its own complete input closure');
        for(const executionId of selectedExecutions) {
          const set=c.inputSets.find(s=>s.executionId===executionId);
          requireValue(set,'Missing execution input closure');
          verifyConsumedInputs(set.inputs,set.overlays??[],c.selectedCases.filter(t=>t.executionId===executionId).map(t=>t.name),rows);
        }
      } else verifyConsumedInputs(c.inputs,c.overlays??[],c.selectedCases.map(t=>t.name),rows);
    }
  }
  requireValue(Array.isArray(a.freshChecks)&&a.freshChecks.length===1,'Exactly one new local Cognitive check required');
  const fresh=admitNewCognitive(a.freshChecks[0],plan,rows);
  return {schema:1,status:'success',kind:a.kind,historicalKind:a.historicalKind,freshChecks:[fresh],attestationSha256:reviewedDigest,
    candidate:plan.candidate,sourceHead:plan.sourceHead,checkoutHead:plan.head,
    historicalChecks:LOCAL_REQUIRED,ciExecuted:false,originalExecutionSigned:false};
}
export function recheckPlan(plan,env=process.env) {
  requireValue(validExactPlan(plan),'Malformed qualification plan');
  requireValue(plan.head===git('rev-parse','HEAD'),'Checkout identity changed');
  const actual=exactCandidatePlan(plan.base,plan.head,env);
  requireValue(JSON.stringify(actual)===JSON.stringify(plan),'Qualification plan changed');
  return actual;
}
export function validateBrowserRecords(proof,run,jobs,artifact,report,plan) {
  requireValue(proof&&proof.candidate===plan.candidate&&proof.productInventorySha256===plan.productInventorySha256,
    'Missing fixed successful browser proof for this product');
  requireValue(run.id===proof.runId&&run.head_sha===proof.head&&run.run_attempt===proof.attempt
    &&run.repository?.full_name===REPOSITORY&&run.head_repository?.full_name===REPOSITORY
    &&run.event==='push'&&run.path==='.github/workflows/ci-measurement-browser.yml'
    &&run.head_branch==='ci/measurement-browser-20261020'&&run.status==='completed'&&run.conclusion==='success',
    'Original bounded browser run did not succeed with its fixed identity');
  requireValue(Array.isArray(proof.jobs)&&proof.jobs.length===6
    &&new Set(proof.jobs.map(j=>j.id)).size===6&&new Set(jobs.map(j=>j.id)).size===jobs.length,
    'Missing or duplicate fixed browser jobs');
  for(const expected of proof.jobs) {
    const actual=jobs.find(j=>j.id===expected.id);
    requireValue(actual?.name===expected.name&&actual.status==='completed'&&actual.conclusion==='success',
      'Failed/missing original browser prerequisite: '+expected.name);
  }
  requireValue(artifact.id===proof.artifact.id&&artifact.name===proof.artifact.name
    &&artifact.size_in_bytes===proof.artifact.bytes&&artifact.expired===false
    &&artifact.workflow_run?.id===proof.runId&&artifact.workflow_run?.head_sha===proof.head,
    'Browser artifact identity/expiry mismatch');
  requireValue(report.head===proof.head&&report.status==='PASS'&&report.selectedPhase==='journeys'
    &&['pageErrors','blockedExternalRequests','callbackFailures'].every(k=>Array.isArray(report[k])&&!report[k].length),
    'Failed or incomplete original journey report');
  requireValue(Array.isArray(proof.requiredChecks)&&proof.requiredChecks.length>0
    &&Array.isArray(report.checks)&&report.checks.every(c=>c.status==='PASS')
    // Two original generic checks are genuinely executed on both Training and
    // Survey. Preserve the exact ordered sequence and multiplicity; do not
    // deduplicate them or claim 38 unique check names.
    &&JSON.stringify(report.checks.map(c=>c.name))===JSON.stringify(proof.requiredChecks),
    'Browser checks differ from the independently reviewed complete selection');
  return {schema:1,status:'success',scope:'bounded compiled browser only',sourceHead:plan.sourceHead,
    originalRun:proof.runId,originalHead:proof.head,originalAttempt:proof.attempt,
    originalArtifact:proof.artifact.id,originalChecks:proof.requiredChecks};
}
async function api(path,raw=false) {
  const response=await fetch(`https://api.github.com/repos/${REPOSITORY}/${path}`,{
    headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(raw) {
    requireValue(response.status===302,'Artifact download redirect required');
    const url=new URL(response.headers.get('location'));
    requireValue(url.protocol==='https:'&&!url.username&&!url.password,'Unsafe artifact location');
    // GitHub credentials never leave api.github.com.
    const body=await fetch(url,{signal:AbortSignal.timeout(120000)});
    requireValue(body.ok,'Artifact download failed');
    return Buffer.from(await body.arrayBuffer());
  }
  requireValue(response.ok,'GitHub source verification failed: '+response.status);
  return response.json();
}
async function admitBrowser(plan) {
  const bindings=JSON.parse(readFileSync(new URL('./exact-candidate-bindings.json',import.meta.url),'utf8'));
  const proof=bindings.candidates[plan.candidate]?.browser;
  requireValue(proof,'Fixed successful browser proof is still missing');
  requireValue(productFingerprint(inventory(proof.head))===plan.productInventorySha256,
    'Original browser source is not the candidate product');
  const run=await api(`actions/runs/${proof.runId}/attempts/${proof.attempt}`);
  const jobs=[];let total;
  for(let page=1;page<=10;page++) {
    const data=await api(`actions/runs/${proof.runId}/attempts/${proof.attempt}/jobs?per_page=100&page=${page}`);
    total=data.total_count;jobs.push(...data.jobs);if(jobs.length>=total)break;
  }
  requireValue(jobs.length===total,'Incomplete original job inventory');
  const artifact=await api(`actions/artifacts/${proof.artifact.id}`);
  requireValue(artifact.size_in_bytes<=64*1024*1024,'Browser evidence exceeds bounded size');
  const zip=await api(`actions/artifacts/${proof.artifact.id}/zip`,true);
  requireValue(zip.length===proof.artifact.bytes&&sha256(zip)===proof.artifact.sha256,
    'Original browser ZIP hash/size mismatch');
  const dir=mkdtempSync(join(tmpdir(),'exact-browser-'));
  try {
    const file=join(dir,'evidence.zip');writeFileSync(file,zip,{flag:'wx',mode:0o600});
    const result=execFileSync('python3',['-c',[
      'import sys,zipfile',
      'with zipfile.ZipFile(sys.argv[1]) as z:',
      ' names=z.namelist()',
      ' assert len(names)==len(set(names))',
      ' info=z.getinfo(sys.argv[2])',
      ' assert info.file_size<=4*1024*1024',
      ' sys.stdout.buffer.write(z.read(info))',
    ].join('\n'),file,proof.artifact.reportMember],{maxBuffer:4*1024*1024});
    requireValue(sha256(result)===proof.artifact.reportSha256,'Original browser report hash mismatch');
    return validateBrowserRecords(proof,run,jobs,artifact,JSON.parse(result),plan);
  } finally {rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [mode,planPath,outputPath]=process.argv.slice(2);
    const plan=JSON.parse(readFileSync(planPath,'utf8')); recheckPlan(plan);
    requireValue(['historical','browser'].includes(mode),'Explicit admission mode required');
    const receipt=mode==='browser'?await admitBrowser(plan):admitHistorical(
      readFileSync(new URL('./exact-candidate-attestation.json',import.meta.url)),plan,inventory(plan.head));
    requireValue(outputPath,'Output path required');
    writeFileSync(outputPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    console.log('ADMITTED '+mode+' evidence; original identities preserved; no application checks repeated.');
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
