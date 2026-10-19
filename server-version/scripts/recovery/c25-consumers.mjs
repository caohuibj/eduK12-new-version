/** C25-only real compiled consumers. Importing this file loads no application,
 * Prisma, database, queue, or service. Finalize only accepts existing evidence. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {publicFailure} from './c21-error-redaction.mjs'

const directory=path.dirname(fileURLToPath(import.meta.url))
const backend=path.resolve(directory,'../../backend'),repo=path.resolve(backend,'../..')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const stable=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
const digest=value=>sha(stable(value))
const copy=value=>JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='bigint'?v.toString():v))
const hash=value=>assert.match(value,/^[a-f0-9]{64}$/)
const nonempty=value=>{assert.equal(typeof value,'string');assert.ok(value.length>0);return value}
const resultFields=['resultSnapshotEncrypted','scoreEncrypted','qualityFlagsEncrypted']
const headerFields=['aggregateInputHash','attemptEpoch','contextHash','slotSetHash','status']
export const consumerQualification=Object.freeze({scope:'NEW_SYNTHETIC_C25_ONLY',
  consumerPrisma:'ACTUAL_DIST_CONFIG_DATABASE_SINGLETON_SEPARATE_PROCESS',
  sqlAttribution:'SEQUENTIAL_CONSUMER_CALL_WINDOWS_NOT_LIVE_API',
  historyProof:'SINGLE_ROW_PROJECTION_AND_QUERY_SHAPE_ONLY',nPlusOne:false,capacity:false,browser:false})

/** Only exact ciphertext strings from the actual B result row are counted.
 * Runtime/config/context decryptions are deliberately outside this counter. */
export function knownResultCiphertexts(row){
  assert.ok(row&&typeof row==='object')
  const known=new Set(resultFields.map(key=>row[key]).filter(v=>typeof v==='string'&&v.length>0))
  assert.ok(known.size>0,'Actual B result ciphertext is required')
  return known
}
export const isKnownResultCipher=(value,known)=>typeof value==='string'&&known.has(value)
export function observeResultDecrypt(original,known){
  assert.equal(typeof original,'function');assert.ok(known instanceof Set&&known.size>0)
  const counts={totalCalls:0,resultDecryptCalls:0,otherDecryptCalls:0}
  return {counts,wrapped:function(...args){
    counts.totalCalls++;counts[isKnownResultCipher(args[0],known)?'resultDecryptCalls':'otherDecryptCalls']++
    // Exactly one original call, same receiver/arguments, untouched return/error.
    return Reflect.apply(original,this,args)
  }}
}

export function assertConsumerPhaseBounds(mode,{t0,releaseAt,serverNowBefore,serverNowAfter}){
  assert.ok(['closed','open'].includes(mode))
  const times=[t0,releaseAt,serverNowBefore,serverNowAfter].map(value=>{
    assert.equal(typeof value,'string');const n=Date.parse(value);assert.ok(Number.isFinite(n));return n
  })
  const [start,release,before,after]=times
  assert.equal(release-start,300000,'The original T0 + 300 seconds must not change')
  assert.ok(before>=start&&after>=before,'PostgreSQL clock observations are missing or reversed')
  if(mode==='closed')for(const time of [before,after]){
    assert.ok(time<start+240000,'Closed consumer missed T0 + 240 seconds')
    assert.ok(time<release,'Closed consumer crossed the frozen release boundary')
  }
  else for(const time of [before,after])assert.ok(time>=release,'Open consumer precedes actual PostgreSQL release boundary')
  return {t0,releaseAt,serverNowBefore,serverNowAfter}
}

/** Schedule progress, credentials, HTTP receipts and the whole mutable fixture
 * hash are excluded. A/B/C/D IDs, frozen context and child identities are not. */
export function immutableFixtureIdentity(f){
  assert.equal(f?.schemaVersion,1);assert.equal(f.scope,consumerQualification.scope)
  const cases={}
  for(const name of ['A','B','C','D']){
    const c=f.cases?.[name];assert.equal(c?.name,name)
    cases[name]={name,mode:c.mode,participant:c.participant,compositeId:nonempty(c.compositeId),
      attemptId:nonempty(c.attemptId),attemptEpoch:c.attemptEpoch,courseId:nonempty(c.courseId),
      accessTokenId:c.accessTokenId,roundId:c.roundId,contextSnapshotHash:c.contextSnapshotHash,
      children:copy(c.children),slotsSha256:digest(c.slots)}
    assert.ok(Number.isSafeInteger(c.attemptEpoch)&&c.attemptEpoch>0);hash(c.contextSnapshotHash)
  }
  assert.equal(new Set(Object.values(cases).map(c=>c.attemptId)).size,4)
  assert.equal(cases.A.mode,'IMMEDIATE');assert.equal(cases.B.participant,'AUTHENTICATED')
  assert.equal(cases.C.participant,'ANONYMOUS');assert.equal(cases.D.participant,'ANONYMOUS')
  assert.equal(cases.B.accessTokenId,null);assert.equal(cases.B.roundId,null);assert.ok(cases.C.roundId);assert.equal(cases.D.roundId,null)
  for(const name of ['B','C','D'])assert.equal(cases[name].mode,'SCHEDULED')
  nonempty(cases.B.children.cognitiveSessionId)
  return {scope:f.scope,courseId:nonempty(f.courseId),studentId:nonempty(f.actors?.student?.id),
    products:{A:nonempty(f.products?.A?.id),scheduled:nonempty(f.products?.scheduled?.id)},
    schedule:{t0:nonempty(f.schedule?.t0),releaseAt:nonempty(f.schedule?.releaseAt)},cases}
}

function databaseCaseBinding(rows,identity){
  assert.equal(rows.length,4)
  return Object.fromEntries(['A','B','C','D'].map(name=>{
    const expected=identity.cases[name],row=rows.find(r=>r.id===expected.attemptId);assert.ok(row)
    assert.equal(row.compositeAssessmentId,expected.compositeId);assert.equal(row.attemptEpoch,expected.attemptEpoch)
    assert.equal(row.deliveryCourseId,expected.courseId);assert.equal(row.accessTokenId,expected.accessTokenId)
    assert.equal(row.trainingFeedbackSnapshot.roundId,expected.roundId);assert.equal(row.contextSnapshotHash,expected.contextSnapshotHash)
    assert.equal(row.userId,['A','B'].includes(name)?identity.studentId:null)
    assert.equal(row.status,name==='D'?'IN_PROGRESS':'COMPLETED')
    const p=row.compositeAssessment
    for(const field of ['trainingFeedbackSnapshotHash','trainingPersistenceSnapshotHash','frozenActiveSlotSetHash','contextSnapshotHash'])hash(row[field])
    hash(p.trainingFeedbackPolicyHash);hash(p.trainingPersistencePolicyHash)
    assert.equal(digest(row.trainingFeedbackSnapshot),row.trainingFeedbackSnapshotHash)
    assert.equal(digest(row.trainingPersistenceSnapshot),row.trainingPersistenceSnapshotHash)
    assert.equal(digest(p.trainingFeedbackPolicy),p.trainingFeedbackPolicyHash)
    assert.equal(digest(p.trainingPersistencePolicy),p.trainingPersistencePolicyHash)
    assert.equal(row.trainingFeedbackSnapshot.policyHash,p.trainingFeedbackPolicyHash)
    assert.equal(row.trainingFeedbackSnapshot.policy.mode,expected.mode)
    if(name!=='A')assert.equal(row.trainingFeedbackSnapshot.policy.releaseAt,identity.schedule.releaseAt)
    const children={scaleIds:row.scaleAssessments.map(r=>r.id).sort(),cognitiveSessionIds:row.cognitiveSessions.map(r=>r.id).sort(),
      situationalAttempts:row.situationalAttempts.map(r=>({id:r.id,compositeItemId:r.compositeItemId})).sort((a,b)=>a.id.localeCompare(b.id)),
      formSectionAttempts:row.formSectionAttempts.map(r=>({id:r.id,sectionId:r.sectionId})).sort((a,b)=>a.id.localeCompare(b.id))}
    for(const [field,values] of [['scaleId',children.scaleIds],['cognitiveSessionId',children.cognitiveSessionIds],['situationalAttemptId',children.situationalAttempts.map(r=>r.id)]]){
      if(expected.children[field]!=null)assert.ok(values.includes(expected.children[field]))
    }
    if(expected.children.situationalItemId!=null)assert.ok(children.situationalAttempts.some(r=>r.compositeItemId===expected.children.situationalItemId))
    return [name,{attemptId:row.id,attemptEpoch:row.attemptEpoch,userId:row.userId,compositeId:p.id,
      status:row.status,asyncReportEpoch:row.asyncReportEpoch,aggregateInputHash:row.aggregateInputHash,
      contextSnapshotHash:row.contextSnapshotHash,frozenActiveSlotSetHash:row.frozenActiveSlotSetHash,
      feedbackSnapshotHash:row.trainingFeedbackSnapshotHash,persistenceSnapshotHash:row.trainingPersistenceSnapshotHash,
      feedbackSnapshotBytesSha256:digest(row.trainingFeedbackSnapshot),persistenceSnapshotBytesSha256:digest(row.trainingPersistenceSnapshot),
      feedbackPolicyHash:p.trainingFeedbackPolicyHash,persistencePolicyHash:p.trainingPersistencePolicyHash,
      publicationAt:new Date(p.publishedAt).toISOString(),children}]
  }))
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
  const dbBinding=databaseCaseBinding(byName('case-bindings').value,identity),b=identity.cases.B
  assert.equal(dbBinding.B.asyncReportEpoch,b.attemptEpoch)
  const knownRows=byName('known-result-row').value;assert.equal(knownRows.length,1,'B must have exactly one actual completed Cognitive row')
  const known=knownRows[0];assert.equal(known.id,b.children.cognitiveSessionId);assert.equal(known.userId,identity.studentId)
  assert.equal(known.compositeAttemptId,b.attemptId);assert.equal(known.status,'COMPLETED');knownResultCiphertexts(known)
  const resultCipherSha256=Object.fromEntries(resultFields.map(k=>[k,known[k]==null?null:sha(known[k])]))
  const context=byName('compact-context');assert.equal(context.sql.length,1);assert.equal(context.middleware.length,1)
  assert.equal(context.middleware[0].params.action,'queryRaw');assert.equal(payload(context.sql[0].query),false)
  assert.ok(sqlJob(context.sql[0].query));assert.match(context.sql[0].query,/JOIN\s+composite_assessments\b/i)
  assert.match(context.sql[0].query,/FROM\s+composite_assessment_attempts\b/i)
  assert.doesNotMatch(context.sql[0].query,/(?:\b\w+\.)?\*/)
  assert.equal(context.value.parent.id,b.attemptId);assert.equal(context.value.parent.status,'COMPLETED');assert.equal(context.value.job.status,'READY')
  assert.equal(context.value.parent.trainingFeedbackSnapshotHash,dbBinding.B.feedbackSnapshotHash)
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
export function aggregateConsumerEvidence({closedBytes,openBytes,scheduled,inputBinding,fixtureIdentity,privateFiles}){
  assert.equal(scheduled?.passed,true);assert.equal(scheduled.phase,'scheduled')
  assert.equal(scheduled.qualification?.scope,consumerQualification.scope)
  assert.deepEqual({t0:scheduled.schedule?.t0,releaseAt:scheduled.schedule?.releaseAt},fixtureIdentity.schedule)
  const phases={}
  for(const [mode,bytes] of [['closed',closedBytes],['open',openBytes]]){
    assert.ok(Buffer.isBuffer(bytes)||typeof bytes==='string','Required consumer result is missing')
    const reference=scheduled.consumerEvidence?.[mode]
    assert.equal(reference?.path,`c25-consumer-${mode}-result.json`);assert.equal(reference.sha256,sha(bytes),'Scheduled child-result hash mismatch')
    const result=JSON.parse(bytes.toString());assert.equal(result.schemaVersion,1);assert.equal(result.passed,true);assert.equal(result.mode,mode)
    assert.deepEqual(result.qualification,consumerQualification);assert.deepEqual(result.inputBinding,inputBinding)
    assert.deepEqual(result.fixtureIdentity,fixtureIdentity);hash(result.fixtureSha256)
    for(const [kind,expectedFile] of [['fixture',`c25-consumer-${mode}-fixture-private.json`],['observations',`c25-consumer-${mode}-observations-private.json`]]){
      const artifact=result.artifacts?.[kind];assert.equal(artifact?.file,expectedFile)
      assert.ok(Object.hasOwn(privateFiles,expectedFile),'Required private consumer evidence is missing')
      assert.equal(sha(privateFiles[expectedFile]),artifact.sha256,'Private consumer evidence changed')
    }
    const fixture=JSON.parse(privateFiles[result.artifacts.fixture.file].toString())
    assert.equal(result.fixtureSha256,result.artifacts.fixture.sha256);assert.deepEqual(immutableFixtureIdentity(fixture),fixtureIdentity)
    const observation=JSON.parse(privateFiles[result.artifacts.observations.file].toString())
    assert.equal(observation.mode,mode);assert.deepEqual(observation.inputBinding,inputBinding);assert.deepEqual(observation.fixtureIdentity,fixtureIdentity)
    assert.deepEqual(analyzeConsumerRecords(mode,observation.records,fixtureIdentity),result.proof)
    assert.ok(Number.isSafeInteger(result.process.pid)&&result.process.pid>0)
    assert.ok(Number.isSafeInteger(result.process.liveApiPid)&&result.process.liveApiPid>0);assert.notEqual(result.process.pid,result.process.liveApiPid)
    phases[mode]=result
  }
  assert.deepEqual(phases.closed.proof.dbBinding,phases.open.proof.dbBinding,'Frozen A/B/C/D database identity changed')
  assert.deepEqual(phases.closed.proof.resultCipherSha256,phases.open.proof.resultCipherSha256,'B result ciphertext changed')
  assert.equal(phases.closed.process.liveApiPid,phases.open.process.liveApiPid)
  assert.notEqual(phases.closed.process.pid,phases.open.process.pid,'Closed/open require separate child processes')
  return {schemaVersion:1,passed:true,phase:'consumers',qualification:consumerQualification,inputBinding,fixtureIdentity,
    dbBinding:phases.closed.proof.dbBinding,resultCipherSha256:phases.closed.proof.resultCipherSha256,
    evidence:{closed:{...scheduled.consumerEvidence.closed,fixtureSha256:phases.closed.fixtureSha256},open:{...scheduled.consumerEvidence.open,fixtureSha256:phases.open.fixtureSha256}},
    observations:{closed:phases.closed.proof.observations,open:phases.open.proof.observations},
    bounds:{closed:phases.closed.proof.bounds,open:phases.open.proof.bounds},probesRerun:false}
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
  for(const name of ['c25-consumers.mjs','c21-error-redaction.mjs','runtime-fingerprint.cjs','loopback-only.cjs']){
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
  const resultFile=path.join(state,`c25-consumer-${mode}-result.json`),fd=fs.openSync(resultFile,'wx',0o600)
  try{
    result.artifacts.fixture=writePrivate(state,`c25-consumer-${mode}-fixture-private.json`,fixtureBytes)
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
    await capture('case-bindings',()=>prisma.compositeAssessmentAttempt.findMany({where:{id:{in:Object.values(identity.cases).map(c=>c.attemptId)}},orderBy:{id:'asc'},select:{
      id:true,userId:true,status:true,attemptEpoch:true,asyncReportEpoch:true,compositeAssessmentId:true,deliveryCourseId:true,accessTokenId:true,
      contextSnapshotHash:true,frozenActiveSlotSetHash:true,aggregateInputHash:true,trainingFeedbackSnapshot:true,trainingFeedbackSnapshotHash:true,
      trainingPersistenceSnapshot:true,trainingPersistenceSnapshotHash:true,compositeAssessment:{select:{id:true,publishedAt:true,trainingFeedbackPolicy:true,trainingFeedbackPolicyHash:true,trainingPersistencePolicy:true,trainingPersistencePolicyHash:true}},
      scaleAssessments:{select:{id:true}},cognitiveSessions:{select:{id:true}},situationalAttempts:{select:{id:true,compositeItemId:true}},formSectionAttempts:{select:{id:true,sectionId:true}},
    }}))
    const knownRows=await capture('known-result-row',()=>prisma.cognitiveSession.findMany({where:{userId:identity.studentId,status:'COMPLETED'},select:{
      id:true,userId:true,status:true,compositeAttemptId:true,resultSnapshotEncrypted:true,scoreEncrypted:true,qualityFlagsEncrypted:true,
    }}));assert.equal(knownRows.length,1)
    assert.equal(knownRows[0].id,identity.cases.B.children.cognitiveSessionId)
    assert.equal(require.cache[securityFile],undefined);security=require(securityFile);original=security.decryptCognitivePayload
    observer=observeResultDecrypt(original,knownResultCiphertexts(knownRows[0]));security.decryptCognitivePayload=observer.wrapped
    assert.equal(security.decryptCognitivePayload,observer.wrapped)
    const feedback=require(path.join(backend,'dist/modules/assessment-policy/participant-feedback.js'))
    const context=await capture('compact-context',()=>feedback.readCompositeParticipantFeedbackContext(identity.cases.B.attemptId))
    // Original returned parent, no joined job argument: exercise its actual lookup.
    await capture('loaded-parent',()=>feedback.isLoadedCompositeParticipantFeedbackDeferred(context.parent))
    assert.equal(require.cache[historyFile],undefined,'History was loaded before its explicit instrumented require')
    const {listMyHistory}=require(historyFile)
    await capture('history',()=>listMyHistory(identity.studentId,{page:1,pageSize:100,skip:0,take:100}))
    await capture('clock-after',clock)
    result.proof=analyzeConsumerRecords(mode,records,identity)
    assert.deepEqual(currentInputs(state,require),inputBinding,'Consumer input bytes changed during observation')
    assert.deepEqual(immutableFixtureIdentity(JSON.parse(readPrivate(state,'c25-fixture-private.json'))),identity)
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
    try{result.artifacts.observations=writePrivate(state,`c25-consumer-${mode}-observations-private.json`,{schemaVersion:1,mode,inputBinding,fixtureIdentity:identity,records})}
    catch(e){error??=e;result.passed=false;result.error=publicFailure(e)}
    if(error)writePrivate(state,`c25-consumer-${mode}-error-private.log`,Buffer.from(String(error.stack??error)))
    fs.writeFileSync(fd,JSON.stringify(result,null,2));fs.closeSync(fd)
  }
  if(error)throw error
  console.log('PASS C25 '+mode+' real compiled consumer observations; single-row query-shape proof only')
}

async function main(){
  process.umask(0o077)
  const [stateArg,flag,mode,...extra]=process.argv.slice(2)
  assert.equal(flag,'--mode');assert.ok(['closed','open','finalize'].includes(mode));assert.equal(extra.length,0)
  const state=path.resolve(nonempty(stateArg)),require=createRequire(path.join(backend,'package.json'))
  const inputBinding=currentInputs(state,require),fixtureBytes=readPrivate(state,'c25-fixture-private.json'),identity=immutableFixtureIdentity(JSON.parse(fixtureBytes))
  if(mode==='finalize'){
    const privateFiles=Object.fromEntries(['closed','open'].flatMap(phase=>['fixture','observations'].map(kind=>{
      const name=`c25-consumer-${phase}-${kind}-private.json`;return [name,readPrivate(state,name)]
    })))
    const scheduledBytes=readPrivate(state,'c25-scheduled-result.json')
    const result=aggregateConsumerEvidence({closedBytes:readPrivate(state,'c25-consumer-closed-result.json'),openBytes:readPrivate(state,'c25-consumer-open-result.json'),
      scheduled:JSON.parse(scheduledBytes),inputBinding,fixtureIdentity:identity,privateFiles})
    result.scheduledResultSha256=sha(scheduledBytes)
    assert.deepEqual(currentInputs(state,require),inputBinding)
    writePrivate(state,'c25-consumers-result.json',result)
    console.log('PASS C25 accepted original closed/open consumer evidence without rerunning probes');return
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
  console.error(JSON.stringify(publicFailure(error)));process.exitCode=1
})
