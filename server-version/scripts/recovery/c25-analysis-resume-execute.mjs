/** Continue only the three already-accepted C19 report jobs and their consumers.
 * Importing this driver loads no application, database, credentials or services.
 * No creation or FINAL route is available to the remaining-phase clients. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {harness,publicFailure,prefix} from './c25-client.mjs'
import {privateBinding} from './c25-missing-contract.mjs'
import {coreState} from './c25-analysis-contract.mjs'
import {analysisResumeState,failedAnalysisState,qualification,captureAnalysisFailure,readAnalysisResumePrerequisites} from './c25-analysis-resume-contract.mjs'
import {assertScaleContract,verifyAnalysisDrain,readFacts,runAnalysisConsumers} from './c25-analysis-http.mjs'
import {runAnalysisChild,privateJson} from './c25-analysis-export.mjs'

const names=Object.freeze(['MA','SA','MB'])
const json=value=>JSON.parse(JSON.stringify(value))
const specs=Object.freeze({MA:{forms:1,scales:1,types:['FORM_SECTION','SCALE'],revision:2},SA:{forms:1,scales:0,types:['FORM_SECTION'],revision:1},MB:{forms:0,scales:1,types:['SCALE'],revision:1}})

/** Compare entire rows, including ciphertext and timestamps, after only the
 * Date -> JSON conversion used by the original frozen evidence writer. */
export function assertFrozenAnalysisBeforeDrain({fixture,baseline,frozen,actual}){
 assert.equal(fixture.schemaVersion,1);assert.equal(fixture.scope,'C25_C19_MINIMAL_ANALYSIS_SUPPLEMENT')
 assert.deepEqual(Object.keys(fixture.cases).sort(),[...names].sort())
 assert.equal(fixture.issued.filter(name=>name.startsWith('start-')).length,3)
 assert.equal(fixture.issued.filter(name=>name.startsWith('final-')).length,4)
 assert.equal(new Set(fixture.issued).size,fixture.issued.length)
 assert.equal(new Set(names.map(name=>fixture.cases[name].attemptId)).size,3)
 assert.deepEqual(json(actual),frozen,'Every actual pre-drain parent, job, child, snapshot and queue fact must equal the frozen failed-run evidence')
 assert.equal(frozen.cases.length,3);assert.equal(baseline.otherJobs.length,148)
 assert.deepEqual(frozen.otherJobs,baseline.otherJobs,'All 148 original jobs must remain exact')
 assert.deepEqual(baseline.queue,{id:'reports',pending:0})
 assert.deepEqual(frozen.queue,{id:'reports',pending:3},'Only the three already accepted jobs may hold queue budget')
 assert.equal(new Set(frozen.otherJobs.map(row=>row.id)).size,148)
 for(const name of names){
  const c=fixture.cases[name],spec=specs[name],fact=frozen.cases.find(row=>row.parent.id===c.attemptId)
  assert.ok(fact);assert.equal(c.finals.length,spec.types.length)
  assert.equal(c.actorId,fixture.actors[name==='SA'?'S':'M']);assert.equal(c.taskId,fixture.products[name==='MB'?'B':'A'].id)
  assert.equal(fact.parent.userId,c.actorId);assert.equal(fact.parent.compositeAssessmentId,c.taskId);assert.equal(fact.parent.deliveryCourseId,fixture.courseId)
  assert.equal(fact.parent.attemptEpoch,c.attemptEpoch);assert.equal(fact.parent.asyncReportEpoch,c.attemptEpoch);assert.equal(fact.parent.status,'IN_PROGRESS')
  assert.equal(fact.job.attemptId,c.attemptId);assert.equal(fact.job.attemptEpoch,c.attemptEpoch)
  assert.equal(fact.job.status,'PENDING');assert.equal(fact.job.attemptCount,0);assert.equal(fact.job.budgetHeld,true);assert.equal(fact.job.requestedRevision,spec.revision)
  assert.ok(!baseline.otherJobs.some(row=>row.id===fact.job.id))
  assert.equal(fact.forms.length,spec.forms);assert.equal(fact.scales.length,spec.scales)
  for(const row of [...fact.forms,...fact.scales]){assert.equal(row.status,'COMPLETED');assert.equal(row.attemptEpoch,c.attemptEpoch)}
  for(const key of ['cognitive','sjt','checkpoints'])assert.deepEqual(fact[key],[])
  assert.deepEqual(fact.snapshots.map(row=>row.unitType).sort(),[...spec.types].sort())
  for(const snapshot of fact.snapshots){assert.equal(snapshot.compositeAttemptId,c.attemptId);assert.equal(snapshot.attemptEpoch,c.attemptEpoch);assert.equal(snapshot.terminalState,'COMPLETED')}
 }
 assert.equal(frozen.cases.reduce((n,row)=>n+row.snapshots.length,0),4)
 return true
}

export function assertNoResumeExport(exports,fixture){
 assert.equal(exports.batches.length,42,'Exactly the 42 inherited batches must exist before any resume export')
 assert.equal(exports.artifacts.length,42,'Exactly the 42 inherited artifacts must exist before any resume export')
 const batchIds=new Set(exports.batches.map(row=>row.id));assert.equal(batchIds.size,42)
 assert.equal(new Set(exports.artifacts.map(row=>row.id)).size,42)
 for(const row of exports.batches)assert.notEqual(row.resourceId,fixture.courseId,'The inherited analysis course must not already have an export')
 for(const row of exports.artifacts){assert.ok(batchIds.has(row.batchId));assert.notEqual(row.resourceId,fixture.courseId)}
 return true
}

/** A deny-by-default transport fence. Authentication is the existing client's
 * login only; business writes can only analyze or enqueue this course once. */
export function remainingClient(raw,fixture,ledger){
 const route=`/courses/${fixture.courseId}/training-analysis`,attempts=new Set(names.map(name=>`${prefix}/attempts/${fixture.cases[name].attemptId}`))
 return {login:(identity,role)=>raw.login(identity,role),async request(url,method='GET',...args){
  const artifact=url.startsWith(route+'/export/artifacts/')&&/^[^/?#]+(?:\/status)?$/.test(url.slice((route+'/export/artifacts/').length))
  const allowed=method==='GET'&&(attempts.has(url)||url===route+'/sources'||artifact)||method==='POST'&&(url===route||url===route+'/exports')
  assert.ok(allowed,'Remaining-phase route denied: no course, product, attempt or FINAL creation is permitted')
  if(method==='POST'&&url===route+'/exports'){assert.equal(ledger.exportIssued,false,'The single remaining export cannot be enqueued twice');ledger.exportIssued=true}
  return raw.request(url,method,...args)
 }}
}

function boundJson(references,file){
 const binding=references[file];assert.ok(binding,'A pinned prerequisite binding is required for '+path.basename(file))
 assert.deepEqual(privateBinding(file),binding)
 const value=JSON.parse(fs.readFileSync(file))
 assert.deepEqual(privateBinding(file),binding)
 return value
}
export function loadResumeEvidence(){
 const failure=captureAnalysisFailure(),core=failure.originalCore
 const failed=name=>boundJson(failure.references,path.join(failedAnalysisState,name))
 return {failure,core,fixture:failed('c25-analysis-fixture-private.json'),frozen:failed('c25-analysis-before-drain-private.json'),baseline:failed('c25-analysis-report-baseline-private.json'),scalePrewrite:failed('c25-analysis-scale-prewrite-private.json'),
  source:boundJson(core.references,path.join(coreState,'c25-fixture-private.json')),E:boundJson(core.references,path.join(coreState,'c25-missing-probe-fixture-private.json'))}
}
const defaultIO={
 readFacts,
 readScale:(h,id)=>h.api.prisma.scale.findUniqueOrThrow({where:{id}}),
 async readExports(h){return {batches:await h.api.prisma.exportBatch.findMany({orderBy:{id:'asc'}}),artifacts:await h.api.prisma.exportArtifact.findMany({orderBy:{id:'asc'}})}},
 reserve:(h,value)=>privateJson(path.join(h.state,'c25-analysis-resume-started-private.json'),value),
 runChild:runAnalysisChild,
 verifyDrain:verifyAnalysisDrain,
 runConsumers:runAnalysisConsumers,
}

/** The real coordinator accepts I/O substitutions only for its pure preparation
 * tests. Assertions, route fence and once-only control flow remain identical. */
export async function runAnalysisResume(h,evidence,io=defaultIO){
 assert.equal(h.state,analysisResumeState)
 const {fixture,frozen,baseline,scalePrewrite,source,E}=evidence
 const actors={teacher:source.actors.teacher,M:source.actors.student,S:E.actors.student,otherTeacher:source.actors.otherTeacher}
 assert.equal(E.teacherId,actors.teacher.id);assert.equal(E.inheritedStudentId,actors.M.id);assert.notEqual(actors.S.id,actors.M.id)
 assert.deepEqual(fixture.actors,Object.fromEntries(Object.entries(actors).map(([key,actor])=>[key,actor.id])))
 assert.equal(fixture.scaleId,source.resources.scale);assert.equal(fixture.scaleCode,scalePrewrite.scale.code)
 const inherited={state:failedAnalysisState,failedReceiptPassed:false,attempts:3,finals:4,acceptedSnapshots:4,successfulHttpRequests:31}
 h.result.inheritedAnalysis=inherited
 h.result.executed={attemptsCreatedThisRun:0,finalsSubmittedThisRun:0,coursesCreatedThisRun:0,publicationsCreatedThisRun:0,reportDrainInvocations:0,reportJobsDrainedThisRun:0,exportsEnqueuedThisRun:0}
 const ids=names.map(name=>fixture.cases[name].attemptId)
 assertFrozenAnalysisBeforeDrain({fixture,baseline,frozen,actual:await io.readFacts(h,ids)})
 const scale=await io.readScale(h,fixture.scaleId)
 assert.deepEqual(json(scale),scalePrewrite.scale,'Full inherited Scale row must remain exact before authentication')
 assert.deepEqual(assertScaleContract(scale,{scaleId:fixture.scaleId,teacherId:actors.teacher.id}),fixture.scaleProof)
 assert.deepEqual(scalePrewrite.scaleProof,fixture.scaleProof)
 const exportsBefore=await io.readExports(h);assertNoResumeExport(exportsBefore,fixture)
 io.reserve(h,{schemaVersion:1,scope:'C25_C19_EXISTING_THREE_JOBS_REMAINING_ONLY',inherited,attemptIds:ids})
 h.write('c25-analysis-resume-exports-baseline-private.json',exportsBefore)
 const clients={},ledger={exportIssued:false}
 for(const [name,identity] of Object.entries(actors)){clients[name]=remainingClient(h.client(),fixture,ledger);await clients[name].login(identity,identity.role)}
 // Login may write sessions. No accepted/report fact may drift during it, and
 // the final full-row check is immediately before the sole original claim.
 const before=await io.readFacts(h,ids)
 assertFrozenAnalysisBeforeDrain({fixture,baseline,frozen,actual:before})
 assert.deepEqual(json(await io.readScale(h,fixture.scaleId)),scalePrewrite.scale)
 const justBefore=await io.readExports(h);assertNoResumeExport(justBefore,fixture);assert.deepEqual(justBefore,exportsBefore)
 h.write('c25-analysis-resume-before-drain-private.json',before)
 h.result.executed.reportDrainInvocations=1
 const verifiedBaseline={queue:baseline.queue,otherJobs:before.otherJobs}
 // The prior exact JSON comparison proves these are the frozen old rows;
 // retain their actual Prisma Date instances for the original drain oracle.
 const drain=await io.runChild(h,'report',{attempts:before.cases.map(row=>({attemptId:row.parent.id,attemptEpoch:row.parent.attemptEpoch,jobId:row.job.id})),oldJobIds:baseline.otherJobs.map(row=>row.id)})
 const after=await io.readFacts(h,ids);h.write('c25-analysis-after-drain-private.json',after)
 const pathProofs=await io.verifyDrain(h,{baseline:verifiedBaseline,before,after,fixture})
 h.result.executed.reportJobsDrainedThisRun=3
 const outcome=await io.runConsumers(h,{fixture,actors,clients,baseline:verifiedBaseline,before,after,drain,scale,pathProofs})
 assert.equal(ledger.exportIssued,true,'Remaining consumers must issue exactly one real HTTP export')
 h.result.executed.exportsEnqueuedThisRun=1
 const exportsAfter=await io.readExports(h)
 assert.equal(exportsAfter.batches.length,43);assert.equal(exportsAfter.artifacts.length,43)
 assert.deepEqual(exportsAfter.batches.filter(row=>row.id!==outcome.exportEvidence.batchId),exportsBefore.batches)
 assert.deepEqual(exportsAfter.artifacts.filter(row=>row.id!==outcome.exportEvidence.artifactId),exportsBefore.artifacts)
 h.result.analysisResume={inherited,...h.result.executed,summary:outcome.summary}
 h.check('Remaining phase created no course, publication, attempt or FINAL; all 42 inherited export batches and artifacts remain exact')
 return outcome
}

export async function main(){
 const inherited=readAnalysisResumePrerequisites(process.argv[2]),evidence=loadResumeEvidence()
 const h=await harness('analysis-resume',300);let error
 try{
  assert.equal(h.state,analysisResumeState);h.result.qualification={...h.result.qualification,...qualification}
  h.result.inheritedResumePrerequisites=inherited
  await runAnalysisResume(h,evidence)
  h.result.passed=true
 }catch(caught){error=caught}finally{await h.finish(error)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{
 try{if(process.argv[2]===analysisResumeState)fs.writeFileSync(path.join(analysisResumeState,'c25-analysis-resume-entry-error-private.log'),String(error.stack??error),{flag:'wx',mode:0o600})}catch{}
 console.error(JSON.stringify(publicFailure(error)));process.exitCode=1
})
