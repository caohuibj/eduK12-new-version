/** Independent E-only real compiled consumers; never relabel old B evidence. Importing this file loads no application,
 * Prisma, database, queue, or service. Finalize only accepts existing evidence. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {publicFailure} from './c21-error-redaction.mjs'
import {observeResultDecrypt,assertConsumerPhaseBounds,immutableFixtureIdentity as originalFixtureIdentity,analyzeConsumerRecords as analyzeOriginalRecords,consumerQualification as originalQualification} from './c25-consumers.mjs'
import {assertWindow} from './c25-client.mjs'
import {readMissingPrerequisites} from './c25-missing-contract.mjs'

const directory=path.dirname(fileURLToPath(import.meta.url))
const backend=path.resolve(directory,'../../backend'),repo=path.resolve(backend,'../..')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const stable=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
const digest=value=>sha(stable(value))
const copy=value=>JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='bigint'?v.toString():v))
const hash=value=>assert.match(value,/^[a-f0-9]{64}$/)
const nullableHash=value=>{if(value!==null)hash(value)}
const nonempty=value=>{assert.equal(typeof value,'string');assert.ok(value.length>0);return value}
const resultFields=['resultSnapshotEncrypted','scoreEncrypted','qualityFlagsEncrypted']
const headerFields=['aggregateInputHash','attemptEpoch','contextHash','slotSetHash','status']
export const consumerQualification=Object.freeze({scope:'NEW_SYNTHETIC_C25_PROBE_E_ONLY',case:'E',
  consumerPrisma:'ACTUAL_DIST_CONFIG_DATABASE_SINGLETON_SEPARATE_PROCESS',
  sqlAttribution:'SEQUENTIAL_CONSUMER_CALL_WINDOWS_NOT_LIVE_API',
  historyProof:'SINGLE_ROW_PROJECTION_AND_QUERY_SHAPE_ONLY',nPlusOne:false,capacity:false,browser:false})

/** Only exact ciphertext strings from the actual E result row are counted.
 * Runtime/config/context decryptions are deliberately outside this counter. */
export function knownResultCiphertexts(row){
  assert.ok(row&&typeof row==='object')
  const known=new Set(resultFields.map(key=>row[key]).filter(v=>typeof v==='string'&&v.length>0))
  assert.ok(known.size>0,'Actual E result ciphertext is required')
  return known
}
export const isKnownResultCipher=(value,known)=>typeof value==='string'&&known.has(value)
/** Explicit E-only schema. The four-case identity parser is unchanged. */
export function immutableProbeIdentity(f){
  assert.equal(f?.schemaVersion,1);assert.equal(f.scope,consumerQualification.scope);assert.equal(f.name,'E');assert.equal(f.cases,undefined);hash(f.originalFixtureSha256)
  const c=f.case;assert.equal(c?.name,'E');assert.equal(c.mode,'SCHEDULED');assert.equal(c.participant,'AUTHENTICATED')
  assert.deepEqual(Object.keys(c.children).sort(),['cognitiveSessionId']);nonempty(c.children.cognitiveSessionId)
  assert.equal(c.compositeId,f.product.id);assert.equal(c.courseId,f.courseId)
  assert.equal(c.accessTokenId,null);assert.equal(c.roundId,null);nullableHash(c.contextSnapshotHash)
  assert.ok(Number.isSafeInteger(c.attemptEpoch)&&c.attemptEpoch>0)
  assert.equal(c.slots.length,1);assert.equal(c.slots[0].unitType,'COGNITIVE');nonempty(c.slots[0].slotKey)
  assert.notEqual(f.actors.student.id,f.inheritedStudentId,'E history must use a new isolated student')
  const schedule={t0:nonempty(f.schedule?.t0),releaseAt:nonempty(f.schedule?.releaseAt)}
  assert.equal(Date.parse(schedule.releaseAt)-Date.parse(schedule.t0),300000)
  assert.deepEqual(f.restoreCases,[{name:'E',mode:'SCHEDULED',participant:'AUTHENTICATED',compositeId:c.compositeId,attemptId:c.attemptId,courseId:c.courseId,accessTokenId:null,roundId:null}])
  return {schemaVersion:1,scope:f.scope,name:'E',courseId:nonempty(f.courseId),teacherId:nonempty(f.teacherId),
    cognitiveAssignmentId:nonempty(f.cognitiveAssignmentId),studentId:nonempty(f.actors.student.id),inheritedStudentId:nonempty(f.inheritedStudentId),
    originalFixtureSha256:f.originalFixtureSha256,publicationId:nonempty(f.product.id),schedule,case:{name:'E',mode:c.mode,participant:c.participant,
      compositeId:nonempty(c.compositeId),attemptId:nonempty(c.attemptId),attemptEpoch:c.attemptEpoch,courseId:c.courseId,
      accessTokenId:null,roundId:null,contextSnapshotHash:c.contextSnapshotHash,children:copy(c.children),slotsSha256:digest(c.slots)}}
}
export function verifyProbeSource(f,original){
  const identity=immutableProbeIdentity(f)
  assert.equal(original.schemaVersion,1);assert.equal(original.scope,'NEW_SYNTHETIC_C25_ONLY')
  assert.equal(identity.courseId,original.courseId);assert.equal(identity.teacherId,original.actors.teacher.id)
  assert.equal(identity.cognitiveAssignmentId,original.resources.cognitive);assert.equal(identity.inheritedStudentId,original.actors.student.id)
  assert.ok(Object.values(original.actors).every(actor=>actor.id!==identity.studentId))
  assert.ok(Object.values(original.cases).every(c=>c.attemptId!==identity.case.attemptId&&c.compositeId!==identity.publicationId&&c.children.cognitiveSessionId!==identity.case.children.cognitiveSessionId))
  return identity
}
function databaseCaseBinding(rows,identity){
  assert.equal(rows.length,1);const row=rows[0],c=identity.case,p=row.compositeAssessment
  assert.equal(row.id,c.attemptId);assert.equal(row.compositeAssessmentId,c.compositeId);assert.equal(p.id,identity.publicationId)
  assert.equal(row.attemptEpoch,c.attemptEpoch);assert.equal(row.asyncReportEpoch,c.attemptEpoch);assert.equal(row.deliveryCourseId,c.courseId)
  assert.equal(row.userId,identity.studentId);assert.notEqual(row.userId,identity.inheritedStudentId)
  assert.equal(row.accessTokenId,null);assert.equal(row.contextSnapshotHash,c.contextSnapshotHash);nullableHash(row.contextSnapshotHash)
  assert.equal(row.status,'COMPLETED');hash(row.aggregateInputHash)
  for(const field of ['trainingFeedbackSnapshotHash','trainingPersistenceSnapshotHash','frozenActiveSlotSetHash'])hash(row[field])
  hash(p.trainingFeedbackPolicyHash);hash(p.trainingPersistencePolicyHash)
  assert.deepEqual(p.trainingFeedbackPolicy,{schemaVersion:1,mode:'SCHEDULED',releaseAt:identity.schedule.releaseAt})
  assert.deepEqual(p.trainingPersistencePolicy,{schemaVersion:1,checkpoint:{enabled:true,ttlHours:1},localCognitive:{enabled:true,ttlHours:1}})
  for(const [snapshot,policy] of [['trainingFeedbackSnapshot','trainingFeedbackPolicy'],['trainingPersistenceSnapshot','trainingPersistencePolicy']]){
    assert.equal(digest(row[snapshot]),row[snapshot+'Hash']);assert.equal(digest(p[policy]),p[policy+'Hash'])
    const frozen=row[snapshot];assert.equal(frozen.attemptId,c.attemptId);assert.equal(frozen.attemptEpoch,c.attemptEpoch)
    assert.equal(frozen.compositeId,c.compositeId);assert.equal(frozen.courseId,c.courseId);if(snapshot==='trainingFeedbackSnapshot')assert.equal(frozen.accessTokenId,null);assert.equal(frozen.roundId,null)
    assert.equal(frozen.policyHash,p[policy+'Hash']);assert.deepEqual(frozen.policy,p[policy])
  }
  assert.deepEqual(row.scaleAssessments,[]);assert.deepEqual(row.situationalAttempts,[]);assert.deepEqual(row.formSectionAttempts,[])
  assert.deepEqual(row.cognitiveSessions,[{id:c.children.cognitiveSessionId}])
  return {E:{attemptId:row.id,attemptEpoch:row.attemptEpoch,userId:row.userId,compositeId:p.id,status:row.status,
    asyncReportEpoch:row.asyncReportEpoch,aggregateInputHash:row.aggregateInputHash,contextSnapshotHash:row.contextSnapshotHash,
    frozenActiveSlotSetHash:row.frozenActiveSlotSetHash,feedbackSnapshotHash:row.trainingFeedbackSnapshotHash,
    persistenceSnapshotHash:row.trainingPersistenceSnapshotHash,feedbackPolicyHash:p.trainingFeedbackPolicyHash,
    persistencePolicyHash:p.trainingPersistencePolicyHash,publicationAt:new Date(p.publishedAt).toISOString(),cognitiveSessionId:c.children.cognitiveSessionId}}
}

const sqlJob=q=>/\b(?:from|join)\s+(?:"?public"?\.)?"?composite_report_jobs"?\b/i.test(q)
const locking=q=>/\bfor\s+(?:update|share|no\s+key\s+update|key\s+share)\b/i.test(q)
const payload=q=>/encrypted|ciphertext|\bpayload\b|\banswers\b|result_snapshot|quality_flags|\bmetrics\b/i.test(q)
const fields=select=>Object.keys(select??{}).sort()
const transactionControl=q=>/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(q)
function readOnlyRecord(record){
  assert.ok(record&&Array.isArray(record.sql)&&Array.isArray(record.middleware));assert.equal(record.observerError,null)
  // Nested relation reads may use transaction control. These are counted
  // separately, never presented as SELECTs or presumed to occur in advance.
  for(const event of record.sql){assert.ok(/^\s*SELECT\b/i.test(event.query)||transactionControl(event.query));assert.equal(locking(event.query),false)}
  for(const call of record.middleware){assert.equal(call.error,null);assert.ok(['queryRaw','findUnique','findMany','findFirst','count'].includes(call.params.action))}
}
export function analyzeConsumerRecords(mode,records,identity){
  const byName=name=>{const found=records.filter(r=>r.name===name);assert.equal(found.length,1);readOnlyRecord(found[0]);return found[0]}
  assert.deepEqual(records.map(r=>r.name),['clock-before','case-bindings','known-result-row','compact-context','loaded-parent','history','clock-after'])
  const before=byName('clock-before'),after=byName('clock-after')
  for(const record of [before,after]){assert.equal(record.sql.length,1);assert.match(record.sql[0].query,/clock_timestamp\s*\(/i);assert.equal(record.value.length,1)}
  const bounds=assertConsumerPhaseBounds(mode,{...identity.schedule,serverNowBefore:new Date(before.value[0].now).toISOString(),serverNowAfter:new Date(after.value[0].now).toISOString()})
  const dbBinding=databaseCaseBinding(byName('case-bindings').value,identity),b=identity.case
  assert.equal(dbBinding.E.asyncReportEpoch,b.attemptEpoch)
  const knownRecord=byName('known-result-row');assert.equal(knownRecord.middleware.length,1);assert.equal(knownRecord.middleware[0].params.model,'CognitiveSession');assert.equal(knownRecord.middleware[0].params.action,'findMany');assert.deepEqual(knownRecord.middleware[0].params.args.where,{userId:identity.studentId,status:'COMPLETED'});const knownRows=knownRecord.value;assert.equal(knownRows.length,1,'E must have exactly one actual completed Cognitive row')
  const known=knownRows[0];assert.equal(known.id,b.children.cognitiveSessionId);assert.equal(known.userId,identity.studentId)
  assert.equal(known.compositeAttemptId,b.attemptId);assert.equal(known.status,'COMPLETED');knownResultCiphertexts(known)
  const resultCipherSha256=Object.fromEntries(resultFields.map(k=>[k,known[k]==null?null:sha(known[k])]))
  const context=byName('compact-context');assert.equal(context.sql.length,1);assert.equal(context.middleware.length,1)
  assert.equal(context.middleware[0].params.action,'queryRaw');assert.equal(payload(context.sql[0].query),false)
  assert.ok(sqlJob(context.sql[0].query));assert.match(context.sql[0].query,/JOIN\s+composite_assessments\b/i)
  assert.match(context.sql[0].query,/FROM\s+composite_assessment_attempts\b/i)
  assert.doesNotMatch(context.sql[0].query,/(?:\b\w+\.)?\*/)
  assert.equal(context.value.parent.id,b.attemptId);assert.equal(context.value.parent.status,'COMPLETED');assert.equal(context.value.job.status,'READY')
  assert.equal(context.value.parent.trainingFeedbackSnapshotHash,dbBinding.E.feedbackSnapshotHash)
  assert.equal(context.value.parent.contextSnapshotHash,identity.case.contextSnapshotHash);nullableHash(context.value.parent.contextSnapshotHash)
  assert.equal(context.value.job.contextHash,identity.case.contextSnapshotHash);nullableHash(context.value.job.contextHash)
  assert.deepEqual(context.middleware[0].result,[context.value])
  assert.equal(context.decrypt.resultDecryptCalls,0)
  const loaded=byName('loaded-parent'),expectedJobs=mode==='closed'?0:1
  assert.equal(loaded.value,mode==='closed');assert.equal(loaded.sql.length,expectedJobs);assert.equal(loaded.middleware.length,expectedJobs)
  assert.equal(loaded.decrypt.resultDecryptCalls,0)
  if(expectedJobs){const call=loaded.middleware[0];assert.equal(call.params.model,'CompositeReportJob');assert.equal(call.params.action,'findUnique')
    assert.deepEqual(fields(call.params.args.select),headerFields);assert.deepEqual(call.params.args.where,{attemptId_attemptEpoch:{attemptId:b.attemptId,attemptEpoch:b.attemptEpoch}})
    assert.ok(sqlJob(loaded.sql[0].query));assert.equal(payload(loaded.sql[0].query),false);assert.equal(call.result.status,'READY')}
  const history=byName('history'),sessionCalls=history.middleware.filter(c=>c.params.model==='CognitiveSession')
  assert.equal(sessionCalls.length,1);const sessionCall=sessionCalls[0];assert.equal(sessionCall.params.action,'findMany')
  assert.equal(sessionCall.params.args.where.userId,identity.studentId);assert.equal(sessionCall.params.args.where.status,'COMPLETED')
  assert.equal(sessionCall.params.args.where.id,undefined);assert.equal(sessionCall.params.args.where.compositeAttemptId,undefined,'Actual history must not be narrowed to E by a test-only filter')
  assert.equal(sessionCall.params.args.take,undefined);assert.equal(sessionCall.params.args.skip,undefined,'Actual service applies pagination after visibility')
  for(const field of ['id',...resultFields])assert.equal(sessionCall.params.args.select[field],true)
  for(const field of ['metricsEncrypted','configSnapshotEncrypted','rawSubmissions','trials'])assert.ok(!sessionCall.params.args.select[field])
  assert.ok(sessionCall.params.args.select.compositeAttempt.select.trainingFeedbackSnapshot)
  assert.equal(sessionCall.result.length,1);assert.equal(sessionCall.result[0].id,known.id)
  for(const field of resultFields)assert.equal(sessionCall.result[0][field],known[field])
  const jobCalls=history.middleware.filter(c=>c.params.model==='CompositeReportJob'),jobSql=history.sql.filter(e=>sqlJob(e.query))
  assert.equal(jobCalls.length,expectedJobs);assert.equal(jobSql.length,expectedJobs)
  if(expectedJobs){const call=jobCalls[0];assert.equal(call.params.action,'findMany')
    assert.deepEqual(fields(call.params.args.select),['aggregateInputHash','attemptEpoch','attemptId','contextHash','slotSetHash','status'])
    assert.deepEqual(call.params.args.where,{OR:[{attemptId:b.attemptId,attemptEpoch:b.attemptEpoch}]})
    assert.equal(call.result.length,1);assert.equal(call.result[0].attemptId,b.attemptId);assert.equal(call.result[0].status,'READY');assert.equal(payload(jobSql[0].query),false)}
  assert.equal(history.value.total,1);assert.equal(history.value.list.length,1)
  const shown=history.value.list[0];assert.equal(shown.sessionId,known.id);assert.equal(shown.source,'composition')
  if(mode==='closed'){assert.equal(shown.feedbackDeferred,true);assert.equal(shown.score,null);assert.equal(shown.qualityState,null);assert.equal(history.decrypt.resultDecryptCalls,0)}
  else{assert.notEqual(shown.feedbackDeferred,true);assert.ok(shown.score!=null||shown.qualityState!=null);assert.ok(history.decrypt.resultDecryptCalls>0,'Open phase must prove the actual result decrypt observer is sensitive')}
  return {bounds,dbBinding,resultCipherSha256,observations:{
    compactContext:{sqlQueries:context.sql.length,statement:'SELECT',joinedJobHeader:true,locking:false,resultCipherSelected:false,resultDecryptCalls:0},
    loadedParent:{sqlQueries:loaded.sql.length,jobHeaderQueries:expectedJobs,headerProjection:expectedJobs?headerFields:[],deferred:loaded.value,resultDecryptCalls:0},
    history:{completedRows:knownRows.length,returnedRows:history.value.list.length,sqlQueries:history.sql.filter(e=>!transactionControl(e.query)).length,
      transactionControlEvents:history.sql.filter(e=>transactionControl(e.query)).length,jobHeaderQueries:jobSql.length,
      jobQueryShape:expectedJobs?'ONE_FIND_MANY_OR_BATCH_WITH_ONE_PARENT':'NO_JOB_QUERY',sessionProjection:fields(sessionCall.params.args.select),
      resultDecryptCalls:history.decrypt.resultDecryptCalls,otherDecryptCalls:history.decrypt.otherDecryptCalls,proof:consumerQualification.historyProof}}}
}

/** Pure acceptance of hash-bound successful child files. Missing/mutated result
 * or private observations fail closed; no consumer invocation occurs here. */
export function aggregateConsumerEvidence({closedBytes,openBytes,probePhase,inputBinding,fixtureIdentity,privateFiles}){
  assert.equal(probePhase?.passed,true);assert.equal(probePhase.phase,'missing-probe')
  assert.equal(probePhase.qualification?.scope,consumerQualification.scope)
  assert.deepEqual(probePhase.fixtureIdentity,fixtureIdentity);assert.equal(probePhase.inheritedRowsUnchanged,true)
  for(const field of ['submittedAt','closedStartedAt','closedFinishedAt','observedOpenAt'])nonempty(probePhase.schedule?.[field])
  assertWindow(probePhase.schedule)
  assert.deepEqual({t0:probePhase.schedule?.t0,releaseAt:probePhase.schedule?.releaseAt},fixtureIdentity.schedule)
  const phases={}
  for(const [mode,bytes] of [['closed',closedBytes],['open',openBytes]]){
    assert.ok(Buffer.isBuffer(bytes)||typeof bytes==='string','Required consumer result is missing')
    const reference=probePhase.consumerEvidence?.[mode]
    assert.equal(reference?.path,`c25-missing-consumer-${mode}-result.json`);assert.equal(reference.sha256,sha(bytes),'Scheduled child-result hash mismatch')
    const result=JSON.parse(bytes.toString());assert.equal(result.schemaVersion,1);assert.equal(result.passed,true);assert.equal(result.mode,mode)
    assert.deepEqual(result.qualification,consumerQualification);assert.deepEqual(result.inputBinding,inputBinding)
    assert.deepEqual(result.fixtureIdentity,fixtureIdentity);hash(result.fixtureSha256)
    for(const [kind,expectedFile] of [['fixture',`c25-missing-consumer-${mode}-fixture-private.json`],['observations',`c25-missing-consumer-${mode}-observations-private.json`]]){
      const artifact=result.artifacts?.[kind];assert.equal(artifact?.file,expectedFile)
      assert.ok(Object.hasOwn(privateFiles,expectedFile),'Required private consumer evidence is missing')
      assert.equal(sha(privateFiles[expectedFile]),artifact.sha256,'Private consumer evidence changed')
    }
    const fixture=JSON.parse(privateFiles[result.artifacts.fixture.file].toString())
    assert.equal(result.fixtureSha256,result.artifacts.fixture.sha256);assert.deepEqual(immutableProbeIdentity(fixture),fixtureIdentity)
    const observation=JSON.parse(privateFiles[result.artifacts.observations.file].toString())
    assert.equal(observation.schemaVersion,1);assert.equal(observation.mode,mode);assert.deepEqual(observation.inputBinding,inputBinding);assert.deepEqual(observation.fixtureIdentity,fixtureIdentity)
    assert.deepEqual(analyzeConsumerRecords(mode,observation.records,fixtureIdentity),result.proof)
    assert.ok(Number.isSafeInteger(result.process.pid)&&result.process.pid>0)
    assert.ok(Number.isSafeInteger(result.process.liveApiPid)&&result.process.liveApiPid>0);assert.notEqual(result.process.pid,result.process.liveApiPid)
    phases[mode]=result
  }
  assert.deepEqual(phases.closed.proof.dbBinding,phases.open.proof.dbBinding,'Frozen E database identity changed')
  assert.deepEqual(phases.closed.proof.resultCipherSha256,phases.open.proof.resultCipherSha256,'E result ciphertext changed')
  assert.equal(phases.closed.process.liveApiPid,phases.open.process.liveApiPid)
  assert.notEqual(phases.closed.process.pid,phases.open.process.pid,'Closed/open require separate child processes')
  return {schemaVersion:1,passed:true,phase:'missing-consumers',qualification:consumerQualification,inputBinding,fixtureIdentity,
    dbBinding:phases.closed.proof.dbBinding,resultCipherSha256:phases.closed.proof.resultCipherSha256,
    process:{liveApiPid:phases.closed.process.liveApiPid,closedPid:phases.closed.process.pid,openPid:phases.open.process.pid},
    evidence:{closed:{...probePhase.consumerEvidence.closed,fixtureSha256:phases.closed.fixtureSha256},open:{...probePhase.consumerEvidence.open,fixtureSha256:phases.open.fixtureSha256}},
    observations:{closed:phases.closed.proof.observations,open:phases.open.proof.observations},
    bounds:{closed:phases.closed.proof.bounds,open:phases.open.proof.bounds},probesRerun:false}
}

/** Original four-case open remains a distinct receipt, never an E alias or
 * replacement for the failed original closed/scheduled phase. */
export function verifyOriginalOpenEvidence({missingOpen,openBytes,originalBytes,privateFiles,inputBinding,liveApiPid}){
  assert.equal(missingOpen.schemaVersion,1);assert.equal(missingOpen.passed,true);assert.equal(missingOpen.phase,'missing-open')
  assert.equal(missingOpen.acceptedRowsUnchanged,true);assert.equal(missingOpen.originalFixtureSha256,sha(originalBytes))
  assert.deepEqual(missingOpen.consumerEvidence.open,{path:'c25-consumer-open-result.json',sha256:sha(openBytes)})
  const result=JSON.parse(openBytes),identity=originalFixtureIdentity(JSON.parse(originalBytes))
  assert.equal(result.schemaVersion,1);assert.equal(result.passed,true);assert.equal(result.mode,'open');assert.deepEqual(result.qualification,originalQualification)
  const originalNames=['c25-consumers.mjs','c21-error-redaction.mjs','runtime-fingerprint.cjs','loopback-only.cjs'].map(name=>'server-version/scripts/recovery/'+name)
  const expectedBinding={...inputBinding,sourceSha256:Object.fromEntries(originalNames.map(name=>[name,inputBinding.sourceSha256[name]]))}
  assert.deepEqual(result.inputBinding,expectedBinding);assert.deepEqual(result.fixtureIdentity,identity)
  for(const kind of ['fixture','observations']){
    const name=`c25-consumer-open-${kind}-private.json`;assert.equal(result.artifacts[kind].file,name)
    assert.ok(Object.hasOwn(privateFiles,name));assert.equal(sha(privateFiles[name]),result.artifacts[kind].sha256)
  }
  assert.equal(result.fixtureSha256,sha(originalBytes));assert.equal(result.artifacts.fixture.sha256,sha(originalBytes))
  assert.deepEqual(Buffer.from(privateFiles['c25-consumer-open-fixture-private.json']),Buffer.from(originalBytes))
  const observation=JSON.parse(privateFiles['c25-consumer-open-observations-private.json'])
  assert.equal(observation.schemaVersion,1);assert.equal(observation.mode,'open');assert.deepEqual(observation.inputBinding,expectedBinding);assert.deepEqual(observation.fixtureIdentity,identity)
  assert.deepEqual(analyzeOriginalRecords('open',observation.records,identity),result.proof)
  assert.equal(result.process.liveApiPid,liveApiPid);assert.ok(Number.isSafeInteger(result.process.pid)&&result.process.pid>0);assert.notEqual(result.process.pid,liveApiPid)
  return {execution:'ORIGINAL_FOUR_CASE_OPEN_ONLY',qualification:originalQualification,result:{path:'c25-consumer-open-result.json',sha256:sha(openBytes)},
    originalFixtureSha256:sha(originalBytes),fixtureIdentity:identity,proof:result.proof,process:result.process}
}

function readPrivate(state,name){
  const file=path.join(state,name),info=fs.lstatSync(file)
  assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1);assert.equal(info.mode&0o777,0o600,'Private evidence must be mode 0600')
  return fs.readFileSync(file)
}
function writePrivate(state,name,value){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2))
  fs.writeFileSync(path.join(state,name),bytes,{flag:'wx',mode:0o600});return {file:name,sha256:sha(bytes)}
}
function currentInputs(state,require){
  const frozenBytes=readPrivate(state,'frozen-inputs.json'),frozen=JSON.parse(frozenBytes)
  assert.match(frozen.head,/^[a-f0-9]{40}$/)
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',timeout:5000}).trim(),frozen.head)
  const sourceSha256={}
  for(const name of ['c25-missing-consumers.mjs','c25-missing-probe.mjs','c25-missing-open.mjs','c25-missing-contract.mjs','c25-consumers.mjs','c25-client.mjs','c25-fixture.mjs','c20-materials-client.mjs','c21-error-redaction.mjs','runtime-fingerprint.cjs','loopback-only.cjs']){
    const relative='server-version/scripts/recovery/'+name,file=path.join(directory,name),binding=frozen.sourceInputs[relative]
    assert.ok(binding,'Missing frozen consumer source');assert.equal(fs.realpathSync(file),binding.realpath)
    assert.equal(fs.statSync(file).mode&0o777,binding.mode);assert.equal(sha(fs.readFileSync(file)),binding.sha256);sourceSha256[relative]=binding.sha256
  }
  const {fingerprint}=require(path.join(directory,'runtime-fingerprint.cjs')),runtimeFingerprint=fingerprint(backend)
  assert.deepEqual(runtimeFingerprint,frozen.runtimeFingerprint,'Actual compiled runtime differs from frozen inputs')
  return {sourceHead:frozen.head,frozenInputsSha256:sha(frozenBytes),sourceSha256,runtimeFingerprint,runtimeFingerprintSha256:digest(runtimeFingerprint)}
}

async function probe(state,mode,require,inputBinding,fixtureBytes,identity,status){
  const result={schemaVersion:1,passed:false,mode,qualification:consumerQualification,inputBinding,fixtureIdentity:identity,
    fixtureSha256:sha(fixtureBytes),process:{pid:process.pid,liveApiPid:status.pids?.api},artifacts:{}}
  const records=[];let active=null,prisma,security,original,observer,error
  // Reserve output before opening any database connection; no implicit replay.
  const resultFile=path.join(state,`c25-missing-consumer-${mode}-result.json`),fd=fs.openSync(resultFile,'wx',0o600)
  try{
    result.artifacts.fixture=writePrivate(state,`c25-missing-consumer-${mode}-fixture-private.json`,fixtureBytes)
    assert.ok(Number.isSafeInteger(status.pids?.api)&&status.pids.api>0);assert.notEqual(status.pids.api,process.pid)
    const databaseFile=require.resolve(path.join(backend,'dist/config/database.js'))
    const historyFile=require.resolve(path.join(backend,'dist/modules/cognitive/history.service.js'))
    const securityFile=require.resolve(path.join(backend,'dist/modules/cognitive/cognitive.security.js'))
    assert.equal(require.cache[databaseFile],undefined);assert.equal(globalThis.prisma,undefined)
    assert.equal(require.cache[historyFile],undefined,'History must not be loaded before decrypt instrumentation')
    assert.equal(require.cache[securityFile],undefined)
    ;({prisma}=require(databaseFile));assert.equal(globalThis.prisma,prisma)
    assert.equal(require(databaseFile).prisma,prisma)
    prisma.$on('query',event=>{if(active)try{active.sql.push(copy(event))}catch(e){active.observerError=String(e)}})
    prisma.$use(async(params,next)=>{
      const record=active;let value,error
      try{value=await next(params);return value}catch(e){error=e;throw e}
      finally{if(record)try{record.middleware.push({params:copy(params),result:value===undefined?null:copy(value),error:error?{name:error.name,code:error.code??null}:null})}catch(e){record.observerError=String(e)}}
    })
    async function capture(name,run){
      assert.equal(active,null);const before=copy(observer?.counts??{totalCalls:0,resultDecryptCalls:0,otherDecryptCalls:0})
      const record={name,sql:[],middleware:[],observerError:null};active=record;records.push(record)
      try{const value=await run();await new Promise(resolve=>setImmediate(resolve));record.value=copy(value);return value}
      finally{record.decrypt=Object.fromEntries(Object.keys(before).map(k=>[k,(observer?.counts[k]??0)-before[k]]));active=null}
    }
    const clock=()=>prisma.$queryRawUnsafe('SELECT clock_timestamp() AS now')
    const start=await capture('clock-before',clock)
    assertConsumerPhaseBounds(mode,{...identity.schedule,serverNowBefore:new Date(start[0].now).toISOString(),serverNowAfter:new Date(start[0].now).toISOString()})
    await capture('case-bindings',()=>prisma.compositeAssessmentAttempt.findMany({where:{id:{in:[identity.case.attemptId]}},orderBy:{id:'asc'},select:{
      id:true,userId:true,status:true,attemptEpoch:true,asyncReportEpoch:true,compositeAssessmentId:true,deliveryCourseId:true,accessTokenId:true,
      contextSnapshotHash:true,frozenActiveSlotSetHash:true,aggregateInputHash:true,trainingFeedbackSnapshot:true,trainingFeedbackSnapshotHash:true,
      trainingPersistenceSnapshot:true,trainingPersistenceSnapshotHash:true,compositeAssessment:{select:{id:true,publishedAt:true,trainingFeedbackPolicy:true,trainingFeedbackPolicyHash:true,trainingPersistencePolicy:true,trainingPersistencePolicyHash:true}},
      scaleAssessments:{select:{id:true}},cognitiveSessions:{select:{id:true}},situationalAttempts:{select:{id:true,compositeItemId:true}},formSectionAttempts:{select:{id:true,sectionId:true}},
    }}))
    const knownRows=await capture('known-result-row',()=>prisma.cognitiveSession.findMany({where:{userId:identity.studentId,status:'COMPLETED'},select:{
      id:true,userId:true,status:true,compositeAttemptId:true,resultSnapshotEncrypted:true,scoreEncrypted:true,qualityFlagsEncrypted:true,
    }}));assert.equal(knownRows.length,1)
    assert.equal(knownRows[0].id,identity.case.children.cognitiveSessionId)
    assert.equal(require.cache[securityFile],undefined);security=require(securityFile);original=security.decryptCognitivePayload
    observer=observeResultDecrypt(original,knownResultCiphertexts(knownRows[0]));security.decryptCognitivePayload=observer.wrapped
    assert.equal(security.decryptCognitivePayload,observer.wrapped)
    const feedback=require(path.join(backend,'dist/modules/assessment-policy/participant-feedback.js'))
    const context=await capture('compact-context',()=>feedback.readCompositeParticipantFeedbackContext(identity.case.attemptId))
    // Original returned parent, no joined job argument: exercise its actual lookup.
    await capture('loaded-parent',()=>feedback.isLoadedCompositeParticipantFeedbackDeferred(context.parent))
    assert.equal(require.cache[historyFile],undefined,'History was loaded before its explicit instrumented require')
    const {listMyHistory}=require(historyFile)
    await capture('history',()=>listMyHistory(identity.studentId,{page:1,pageSize:100,skip:0,take:100}))
    await capture('clock-after',clock)
    result.proof=analyzeConsumerRecords(mode,records,identity)
    assert.deepEqual(currentInputs(state,require),inputBinding,'Consumer input bytes changed during observation')
    assert.deepEqual(immutableProbeIdentity(JSON.parse(readPrivate(state,'c25-missing-probe-fixture-private.json'))),identity)
    result.passed=true
  }catch(e){error=e;result.error=publicFailure(e)}
  finally{
    if(security&&original)security.decryptCognitivePayload=original
    try{
      // Do not import queues just to close them. Close only an actual dependency
      // that the production consumer loaded in this isolated child process.
      const queue=path.join(backend,'dist/config/queue.js');if(require.cache[queue])await require.cache[queue].exports.closeQueues()
      if(prisma)await prisma.$disconnect()
    }catch(e){error??=e;result.passed=false;result.error=publicFailure(e)}
    try{result.artifacts.observations=writePrivate(state,`c25-missing-consumer-${mode}-observations-private.json`,{schemaVersion:1,mode,inputBinding,fixtureIdentity:identity,records})}
    catch(e){error??=e;result.passed=false;result.error=publicFailure(e)}
    if(error)writePrivate(state,`c25-missing-consumer-${mode}-error-private.log`,Buffer.from(String(error.stack??error)))
    fs.writeFileSync(fd,JSON.stringify(result,null,2));fs.closeSync(fd)
  }
  if(error)throw error
  console.log('PASS C25 E '+mode+' real compiled consumer observations; one history row, compact and minimal-header query counts verified')
}

let entryContext=null
async function main(){
  process.umask(0o077)
  const [stateArg,flag,mode,...extra]=process.argv.slice(2)
  assert.equal(flag,'--mode');assert.ok(['closed','open','finalize'].includes(mode));assert.equal(extra.length,0)
  const state=path.resolve(nonempty(stateArg)),require=createRequire(path.join(backend,'package.json'))
  assert.equal(path.dirname(state),path.dirname(repo),'Consumer evidence must be in its dedicated scratch state')
  assert.match(path.basename(state),/^eduk12_c25_(?:http|continuation)_[0-9]{2}$/)
  for(let current=state;;current=path.dirname(current)){
    assert.equal(fs.lstatSync(current).isSymbolicLink(),false,'Consumer state alias is forbidden')
    if(current===path.dirname(current))break
  }
  const stateInfo=fs.lstatSync(state)
  assert.ok(stateInfo.isDirectory());assert.equal(stateInfo.mode&0o777,0o700);assert.equal(stateInfo.uid,process.getuid())
  entryContext={state,mode}
  readMissingPrerequisites(state)
  const inputBinding=currentInputs(state,require),fixtureBytes=readPrivate(state,'c25-missing-probe-fixture-private.json'),fixture=JSON.parse(fixtureBytes),identity=immutableProbeIdentity(fixture)
  const originalBytes=readPrivate(state,'c25-fixture-private.json');assert.equal(sha(originalBytes),identity.originalFixtureSha256);verifyProbeSource(fixture,JSON.parse(originalBytes))
  if(mode==='finalize'){
    const privateFiles=Object.fromEntries(['closed','open'].flatMap(phase=>['fixture','observations'].map(kind=>{
      const name=`c25-missing-consumer-${phase}-${kind}-private.json`;return [name,readPrivate(state,name)]
    })))
    const probePhaseBytes=readPrivate(state,'c25-missing-probe-result.json')
    assert.equal(JSON.parse(probePhaseBytes).fixtureSha256,sha(fixtureBytes),'Final E manifest differs from its successful phase')
    const result=aggregateConsumerEvidence({closedBytes:readPrivate(state,'c25-missing-consumer-closed-result.json'),openBytes:readPrivate(state,'c25-missing-consumer-open-result.json'),
      probePhase:JSON.parse(probePhaseBytes),inputBinding,fixtureIdentity:identity,privateFiles})
    result.probePhaseResultSha256=sha(probePhaseBytes)
    const missingOpenBytes=readPrivate(state,'c25-missing-open-result.json')
    result.inheritedFourCaseOpen=verifyOriginalOpenEvidence({missingOpen:JSON.parse(missingOpenBytes),openBytes:readPrivate(state,'c25-consumer-open-result.json'),originalBytes,privateFiles:Object.fromEntries(['fixture','observations'].map(kind=>{const name=`c25-consumer-open-${kind}-private.json`;return [name,readPrivate(state,name)]})),inputBinding,liveApiPid:result.process.liveApiPid})
    result.inheritedFourCaseOpen.phaseResult={path:'c25-missing-open-result.json',sha256:sha(missingOpenBytes)}
    result.evidenceScopes=['ORIGINAL_FOUR_CASE_OPEN_ONLY','NEW_E_CLOSED_AND_OPEN']
    assert.deepEqual(currentInputs(state,require),inputBinding)
    writePrivate(state,'c25-missing-consumers-result.json',result)
    console.log('PASS C25 accepted distinct E closed/open consumer evidence without rerunning probes');return
  }
  assert.equal(process.version,'v24.21.0');assert.equal(process.env.NODE_ENV,'test')
  const status=JSON.parse(readPrivate(state,'status.json'));assert.equal(status.head,inputBinding.sourceHead)
  assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
  const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.username,'eduk12_runtime')
  assert.ok(process.execArgv.some((arg,index)=>arg==='--require'&&path.resolve(process.execArgv[index+1])===path.join(directory,'loopback-only.cjs')))
  for(const [key,value] of Object.entries({PERF_ISOLATED_TEST_MODE:'1',PERF_SQL_EVENT_COUNT:'1',BACKGROUND_WORKERS_ENABLED:'false',HEAVY_PROCESSING_ENABLED:'false',VIDEO_PROCESSING_ENABLED:'false',ASSESSMENT_REPORT_ASYNC_ENABLED:'true',ASSESSMENT_WHOLE_SUBMIT_ENABLED:'true'}))assert.equal(process.env[key],value,key)
  await probe(state,mode,require,inputBinding,fixtureBytes,identity,status)
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{
  // Pre-probe failures must also retain their original stack privately. Never
  // overwrite an earlier failure or expose raw fixture/SQL details on stdout.
  try{if(entryContext)writePrivate(entryContext.state,`c25-missing-consumer-${entryContext.mode}-entry-error-private.log`,Buffer.from(String(error.stack??error)))}
  catch(journalError){console.error(JSON.stringify(publicFailure(journalError)))}
  console.error(JSON.stringify(publicFailure(error)));process.exitCode=1
})
