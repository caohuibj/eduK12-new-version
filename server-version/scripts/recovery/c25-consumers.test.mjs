/** Pure synthetic records test acceptance mechanics only. These tests never
 * load compiled products, instantiate Prisma, connect DB, or qualify C25. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {knownResultCiphertexts,isKnownResultCipher,observeResultDecrypt,assertConsumerPhaseBounds,
  immutableFixtureIdentity,analyzeConsumerRecords,aggregateConsumerEvidence,consumerQualification} from './c25-consumers.mjs'

const sha=value=>createHash('sha256').update(value).digest('hex')
const digest=value=>sha(JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v))
const bytes=value=>Buffer.from(JSON.stringify(value))
const copy=value=>structuredClone(value)
const t0='2026-10-19T08:00:00.000Z',releaseAt='2026-10-19T08:05:00.000Z',h='a'.repeat(64)
const header=['aggregateInputHash','attemptEpoch','contextHash','slotSetHash','status']
const select=keys=>Object.fromEntries(keys.map(key=>[key,true]))
const zero=()=>({totalCalls:0,resultDecryptCalls:0,otherDecryptCalls:0})

function fixture(){
  return {schemaVersion:1,scope:consumerQualification.scope,courseId:'course',actors:{student:{id:'student',password:'not-in-public-proof'}},
    products:{A:{id:'immediate'},scheduled:{id:'scheduled'}},schedule:{t0,releaseAt},cases:Object.fromEntries(['A','B','C','D'].map(name=>[name,{
      name,mode:name==='A'?'IMMEDIATE':'SCHEDULED',participant:['A','B'].includes(name)?'AUTHENTICATED':'ANONYMOUS',
      compositeId:name==='A'?'immediate':'scheduled',attemptId:name,attemptEpoch:1,courseId:'course',contextSnapshotHash:h,
      accessTokenId:['A','B'].includes(name)?null:'token-'+name,roundId:name==='C'?'round-C':null,
      children:{scaleId:'scale-'+name,cognitiveSessionId:name==='A'?null:'cognitive-'+name,situationalAttemptId:name==='A'?null:'sjt-'+name,situationalItemId:name==='A'?null:'item-'+name},
      slots:[{slotKey:name+'-slot'}],steps:[],recoveryToken:'private-'+name,
    }]))}
}
function dbRows(f){
  return Object.values(f.cases).map(c=>{
    const feedbackPolicy=c.name==='A'?{schemaVersion:1,mode:'IMMEDIATE'}:{schemaVersion:1,mode:'SCHEDULED',releaseAt}
    const persistencePolicy={schemaVersion:1,checkpoint:{enabled:true,ttlHours:1},localCognitive:c.name==='A'?null:{enabled:true,ttlHours:1}}
    const feedback={attemptId:c.attemptId,attemptEpoch:1,roundId:c.roundId,policy:feedbackPolicy,policyHash:digest(feedbackPolicy)}
    const persistence={attemptId:c.attemptId,attemptEpoch:1,roundId:c.roundId,policy:persistencePolicy}
    return {id:c.attemptId,userId:['A','B'].includes(c.name)?'student':null,status:c.name==='D'?'IN_PROGRESS':'COMPLETED',attemptEpoch:1,asyncReportEpoch:c.name==='D'?null:1,
      compositeAssessmentId:c.compositeId,deliveryCourseId:'course',accessTokenId:c.accessTokenId,contextSnapshotHash:c.contextSnapshotHash,frozenActiveSlotSetHash:h,aggregateInputHash:c.name==='D'?null:h,
      trainingFeedbackSnapshot:feedback,trainingFeedbackSnapshotHash:digest(feedback),trainingPersistenceSnapshot:persistence,trainingPersistenceSnapshotHash:digest(persistence),
      compositeAssessment:{id:c.compositeId,publishedAt:t0,trainingFeedbackPolicy:feedbackPolicy,trainingFeedbackPolicyHash:digest(feedbackPolicy),trainingPersistencePolicy:persistencePolicy,trainingPersistencePolicyHash:digest(persistencePolicy)},
      scaleAssessments:[{id:c.children.scaleId}],cognitiveSessions:c.children.cognitiveSessionId?[{id:c.children.cognitiveSessionId}]:[],
      situationalAttempts:c.children.situationalAttemptId?[{id:c.children.situationalAttemptId,compositeItemId:c.children.situationalItemId}]:[],
      formSectionAttempts:c.name==='A'?[]:[{id:'form-'+c.name,sectionId:'section'}]}
  })
}
function records(mode,f){
  const rows=dbRows(f),parent=rows.find(r=>r.id==='B'),job={status:'READY',attemptEpoch:1,slotSetHash:h,contextHash:parent.contextSnapshotHash,aggregateInputHash:h}
  const known={id:'cognitive-B',userId:'student',status:'COMPLETED',compositeAttemptId:'B',resultSnapshotEncrypted:'exact-result-cipher',scoreEncrypted:null,qualityFlagsEncrypted:null}
  const event=(query,params='[]')=>({query,params,duration:1})
  const call=(model,action,args,result)=>({params:{model,action,args},result,error:null})
  const record=(name,value,sql=[],middleware=[])=>({name,value,sql,middleware,decrypt:zero(),observerError:null})
  const before=mode==='closed'?'2026-10-19T08:03:00.000Z':releaseAt,after=mode==='closed'?'2026-10-19T08:03:01.000Z':'2026-10-19T08:05:01.000Z'
  const clock=(name,now)=>record(name,[{now}],[event('SELECT clock_timestamp() AS now')],[call(undefined,'queryRaw',{},[{now}])])
  const context={parent,job},contextSql='SELECT jsonb_build_object(\'id\',p.id) AS parent, j.status FROM composite_assessment_attempts p JOIN composite_assessments c ON c.id=p.composite_assessment_id LEFT JOIN composite_report_jobs j ON j.attempt_id=p.id WHERE p.id=$1'
  const projected={...known,compositeAttempt:parent},sessionSelect={...select(['id','scoreEncrypted','qualityFlagsEncrypted','resultSnapshotEncrypted']),compositeAttempt:{select:{trainingFeedbackSnapshot:true}}}
  const historyValue={total:1,list:[{sessionId:known.id,source:'composition',score:null,qualityState:mode==='closed'?null:'interpretable',...(mode==='closed'?{feedbackDeferred:true}:{})}]}
  const history=record('history',historyValue,[event('SELECT result_snapshot_encrypted FROM cognitive_sessions')],
    [call('CognitiveSession','findMany',{where:{userId:'student',status:'COMPLETED'},select:sessionSelect},[projected])])
  const loaded=record('loaded-parent',mode==='closed')
  if(mode==='open'){
    loaded.sql.push(event('SELECT status, attempt_epoch, slot_set_hash, context_hash, aggregate_input_hash FROM composite_report_jobs'))
    loaded.middleware.push(call('CompositeReportJob','findUnique',{where:{attemptId_attemptEpoch:{attemptId:'B',attemptEpoch:1}},select:select(header)},job))
    history.sql.push(event('SELECT attempt_id, status, attempt_epoch, slot_set_hash, context_hash, aggregate_input_hash FROM "public"."composite_report_jobs" WHERE attempt_id=$1'))
    history.middleware.push(call('CompositeReportJob','findMany',{where:{OR:[{attemptId:'B',attemptEpoch:1}]},select:select([...header,'attemptId'])},[{...job,attemptId:'B'}]))
    history.decrypt={totalCalls:3,resultDecryptCalls:1,otherDecryptCalls:2}
  }
  return [clock('clock-before',before),record('case-bindings',rows),record('known-result-row',[known]),
    record('compact-context',context,[event(contextSql)],[call(undefined,'queryRaw',{},[context])]),loaded,history,clock('clock-after',after)]
}
function accepted(){
  const f=fixture(),fixtureIdentity=immutableFixtureIdentity(f),inputBinding={sourceHead:'b'.repeat(40),frozenInputsSha256:h,sourceSha256:{consumer:h},runtimeFingerprint:{schemaVersion:1},runtimeFingerprintSha256:h}
  const privateFiles={},scheduled={passed:true,phase:'scheduled',qualification:{scope:consumerQualification.scope},schedule:{t0,releaseAt},consumerEvidence:{}}
  const phases={}
  for(const mode of ['closed','open']){
    const phaseFixture=copy(f);phaseFixture.schedule[mode==='closed'?'closedStartedAt':'observedOpenAt']=mode==='closed'?'2026-10-19T08:03:00.000Z':releaseAt
    const observations={schemaVersion:1,mode,inputBinding,fixtureIdentity,records:records(mode,f)},artifacts={}
    for(const [kind,value] of [['fixture',phaseFixture],['observations',observations]]){
      const file=`c25-consumer-${mode}-${kind}-private.json`;privateFiles[file]=bytes(value);artifacts[kind]={file,sha256:sha(privateFiles[file])}
    }
    phases[mode]={schemaVersion:1,passed:true,mode,qualification:consumerQualification,inputBinding,fixtureIdentity,fixtureSha256:artifacts.fixture.sha256,
      process:{pid:mode==='closed'?200:201,liveApiPid:100},artifacts,proof:analyzeConsumerRecords(mode,observations.records,fixtureIdentity)}
    scheduled.consumerEvidence[mode]={path:`c25-consumer-${mode}-result.json`,sha256:sha(bytes(phases[mode]))}
  }
  return {closedBytes:bytes(phases.closed),openBytes:bytes(phases.open),scheduled,inputBinding,fixtureIdentity,privateFiles}
}
function mutatePhase(value,mode,mutate,{rebind=true}={}){
  const key=mode+'Bytes',result=JSON.parse(value[key]);mutate(result);value[key]=bytes(result)
  if(rebind)value.scheduled.consumerEvidence[mode].sha256=sha(value[key])
}
function mutateObservation(value,mode,mutate){
  const file=`c25-consumer-${mode}-observations-private.json`,observation=JSON.parse(value.privateFiles[file]);mutate(observation)
  value.privateFiles[file]=bytes(observation)
  mutatePhase(value,mode,result=>{result.artifacts.observations.sha256=sha(value.privateFiles[file])})
}

test('module import remains pure and never loads any compiled production module',()=>{
  const require=createRequire(import.meta.url)
  assert.ok(!Object.keys(require.cache).some(p=>p.includes('/backend/dist/')))
})
test('result counter discriminates exact known result fields from legitimate runtime/config/context decrypts',()=>{
  const row={resultSnapshotEncrypted:'result',scoreEncrypted:'score',qualityFlagsEncrypted:'quality',metricsEncrypted:'metrics',configSnapshotEncrypted:'config'}
  const known=knownResultCiphertexts(row)
  for(const value of ['result','score','quality'])assert.equal(isKnownResultCipher(value,known),true)
  for(const value of ['metrics','config','context','prefix-result','result-suffix','',null,undefined,{},Buffer.from('result')])assert.equal(isKnownResultCipher(value,known),false)
  assert.throws(()=>knownResultCiphertexts({scoreEncrypted:null,qualityFlagsEncrypted:''}))
})
test('transparent wrapper calls original once with the same receiver and arguments and preserves return identity',()=>{
  const receiver={},argument={},returned={},calls=[]
  const observer=observeResultDecrypt(function(...args){calls.push({receiver:this,args});return returned},new Set(['result']))
  assert.equal(observer.wrapped.call(receiver,'result',argument),returned)
  assert.equal(calls.length,1);assert.equal(calls[0].receiver,receiver);assert.equal(calls[0].args[1],argument)
  assert.deepEqual(calls[0].args,['result',argument]);assert.deepEqual(observer.counts,{totalCalls:1,resultDecryptCalls:1,otherDecryptCalls:0})
  observer.wrapped.call(receiver,'context');assert.equal(calls.length,2);assert.equal(observer.counts.otherDecryptCalls,1)
})
test('transparent wrapper preserves the exact thrown error and promise without retry or substitution',async()=>{
  const error=new Error('original'),known=new Set(['result']);let calls=0
  const throwing=observeResultDecrypt(()=>{calls++;throw error},known)
  assert.throws(()=>throwing.wrapped('result'),e=>e===error);assert.equal(calls,1)
  const promise=Promise.resolve({actual:true}),asyncObserver=observeResultDecrypt(()=>promise,known)
  assert.equal(asyncObserver.wrapped('result'),promise);await promise
})
test('closed clocks must both precede T0+240 and the immutable release; open clocks must both follow release',()=>{
  const closed={t0,releaseAt,serverNowBefore:'2026-10-19T08:03:00.000Z',serverNowAfter:'2026-10-19T08:03:59.999Z'}
  assertConsumerPhaseBounds('closed',closed)
  assertConsumerPhaseBounds('open',{...closed,serverNowBefore:releaseAt,serverNowAfter:'2026-10-19T08:05:01.000Z'})
  for(const patch of [{releaseAt:'2026-10-19T08:06:00.000Z'},{serverNowBefore:'invalid'},{serverNowAfter:'2026-10-19T08:04:00.000Z'},{serverNowBefore:'2026-10-19T07:59:59.999Z'},{serverNowAfter:'2026-10-19T08:02:59.999Z'}])assert.throws(()=>assertConsumerPhaseBounds('closed',{...closed,...patch}))
  for(const patch of [{serverNowBefore:'2026-10-19T08:04:59.999Z',serverNowAfter:releaseAt},{serverNowBefore:releaseAt,serverNowAfter:'2026-10-19T08:04:59.999Z'}])assert.throws(()=>assertConsumerPhaseBounds('open',{t0,releaseAt,...patch}))
})
test('fixture identity excludes mutable progress and secrets but preserves all four cases and child bindings',()=>{
  const f=fixture(),first=immutableFixtureIdentity(f);f.schedule.closedFinishedAt='later';f.cases.B.steps.push({submissionId:'accepted'});f.actors.student.password='new';f.cases.C.recoveryToken='changed'
  assert.deepEqual(immutableFixtureIdentity(f),first);assert.ok(!JSON.stringify(first).includes('private-'));assert.ok(!JSON.stringify(first).includes('password'))
  f.cases.B.children.cognitiveSessionId='different';assert.notDeepEqual(immutableFixtureIdentity(f),first)
  delete f.cases.D;assert.throws(()=>immutableFixtureIdentity(f))
})
test('nullable context matches the real fixture contract and exact database binding without accepting missing or malformed values',()=>{
  // Real A/B/C/D recorded explicit null. The prior all-hash fixture missed it.
  for(const value of [null,h]){
    const f=fixture();for(const c of Object.values(f.cases))c.contextSnapshotHash=value
    const identity=immutableFixtureIdentity(f)
    for(const mode of ['closed','open']){
      const proof=analyzeConsumerRecords(mode,records(mode,f),identity)
      for(const name of ['A','B','C','D'])assert.equal(proof.dbBinding[name].contextSnapshotHash,value)
      const drift=records(mode,f);drift[1].value[1].contextSnapshotHash=value===null?h:null
      assert.throws(()=>analyzeConsumerRecords(mode,drift,identity),'DB and fixture must retain exact null/string equality')
      for(const bad of [undefined,'','x','g'.repeat(64),'a'.repeat(63)]){
        const altered=records(mode,f);altered[1].value[1].contextSnapshotHash=bad
        const expected=copy(identity);expected.cases.B.contextSnapshotHash=bad
        assert.throws(()=>analyzeConsumerRecords(mode,altered,expected),'DB nullable hash guard remains strict even when both sides match')
      }
    }
  }
  for(const bad of [undefined,'','x','g'.repeat(64),'a'.repeat(63)]){
    const f=fixture();f.cases.B.contextSnapshotHash=bad;assert.throws(()=>immutableFixtureIdentity(f))
  }
  const missing=fixture();delete missing.cases.B.contextSnapshotHash;assert.throws(()=>immutableFixtureIdentity(missing))
})
test('pre-probe CLI rejection retains a private original stack and redacts public output without loading products',()=>{
  const directory=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(directory,'../../..')
  const state=path.join(path.dirname(repo),'eduk12_c25_continuation_99')
  assert.equal(fs.existsSync(state),false,'Dedicated pure fault state must not already exist')
  fs.mkdirSync(state,{mode:0o700})
  try{
    fs.writeFileSync(path.join(state,'frozen-inputs.json'),JSON.stringify({head:'0'.repeat(40)}),{mode:0o600,flag:'wx'})
    const child=spawnSync(process.execPath,[path.join(directory,'c25-consumers.mjs'),state,'--mode','closed'],{encoding:'utf8',timeout:15000})
    assert.equal(child.status,1);assert.equal(child.signal,null)
    const file=path.join(state,'c25-consumer-closed-entry-error-private.log'),info=fs.lstatSync(file),raw=fs.readFileSync(file,'utf8')
    assert.equal(info.mode&0o777,0o600);assert.equal(info.nlink,1)
    assert.match(raw,/AssertionError/);assert.match(raw,/currentInputs/)
    assert.doesNotMatch(child.stdout+child.stderr,/currentInputs|0000000000000000000000000000000000000000/)
    assert.equal(fs.existsSync(path.join(state,'c25-consumer-closed-result.json')),false)
    assert.deepEqual(fs.readdirSync(state).sort(),['c25-consumer-closed-entry-error-private.log','frozen-inputs.json'])
  }finally{
    // Only these three test-created paths are removed, never a runtime state.
    for(const name of ['c25-consumer-closed-entry-error-private.log','frozen-inputs.json']){
      const file=path.join(state,name);if(fs.existsSync(file))fs.unlinkSync(file)
    }
    fs.rmdirSync(state)
  }
})
test('single-row observations expose actual counts and explicitly make no N+1, performance or capacity claim',()=>{
  const f=fixture(),identity=immutableFixtureIdentity(f)
  const closed=analyzeConsumerRecords('closed',records('closed',f),identity),open=analyzeConsumerRecords('open',records('open',f),identity)
  assert.equal(closed.observations.compactContext.sqlQueries,1);assert.equal(closed.observations.loadedParent.jobHeaderQueries,0)
  assert.equal(closed.observations.history.resultDecryptCalls,0);assert.equal(open.observations.history.jobHeaderQueries,1)
  assert.equal(open.observations.history.resultDecryptCalls,1);assert.equal(open.observations.history.otherDecryptCalls,2)
  assert.equal(open.observations.history.completedRows,1);assert.equal(consumerQualification.nPlusOne,false);assert.equal(consumerQualification.capacity,false)
})
test('actual observation validation rejects locks, broad headers, extra history rows, wrong batch identity and insensitive decrypt',()=>{
  const f=fixture(),identity=immutableFixtureIdentity(f)
  const mutations=[
    r=>r[3].sql[0].query+=' FOR UPDATE',r=>r[3].sql[0].query=r[3].sql[0].query.replace('j.status','j.result_snapshot_encrypted'),
    r=>r[4].middleware[0].params.args.select.payloadEncrypted=true,r=>r[5].middleware[0].result.push(copy(r[5].middleware[0].result[0])),
    r=>r[5].middleware[1].params.args.where.OR[0].attemptId='other',r=>r[5].decrypt.resultDecryptCalls=0,
    r=>r[2].value.push(copy(r[2].value[0])),r=>r[5].sql.push(copy(r[5].sql[1])),r=>r[3].observerError='capture failed',
  ]
  for(const mutate of mutations){const r=records('open',f);mutate(r);assert.throws(()=>analyzeConsumerRecords('open',r,identity))}
  const closed=records('closed',f);closed[5].decrypt.resultDecryptCalls=1;assert.throws(()=>analyzeConsumerRecords('closed',closed,identity))
})
test('history permits only exact transaction controls, counts them separately, and still rejects DML/DDL/locks',()=>{
  const f=fixture(),identity=immutableFixtureIdentity(f),r=records('open',f)
  r[5].sql.unshift({query:'BEGIN'});r[5].sql.push({query:'COMMIT;'})
  const proof=analyzeConsumerRecords('open',r,identity)
  assert.equal(proof.observations.history.sqlQueries,2);assert.equal(proof.observations.history.transactionControlEvents,2)
  for(const query of ['BEGIN; DELETE FROM cognitive_sessions','UPDATE cognitive_sessions SET status=\'COMPLETED\'','ALTER TABLE cognitive_sessions ADD COLUMN extra text','SELECT id FROM cognitive_sessions FOR SHARE','SET TRANSACTION READ WRITE']){
    const bad=records('open',f);bad[5].sql.push({query});assert.throws(()=>analyzeConsumerRecords('open',bad,identity))
  }
  r[3].sql.unshift({query:'BEGIN'});assert.throws(()=>analyzeConsumerRecords('open',r,identity),'compact lookup still requires exactly one SELECT event')
})
test('finalize accepts two original hash-bound phases while honestly retaining distinct mutable fixture hashes',()=>{
  const value=accepted(),result=aggregateConsumerEvidence(value)
  assert.equal(result.passed,true);assert.equal(result.probesRerun,false);assert.notEqual(result.evidence.closed.fixtureSha256,result.evidence.open.fixtureSha256)
  assert.deepEqual(result.fixtureIdentity.cases,value.fixtureIdentity.cases);assert.equal(result.observations.open.history.resultDecryptCalls,1)
})
test('finalize rejects missing, failed, changed-scope, foreign-input and tampered phase files',()=>{
  const mutations=[v=>delete v.closedBytes,v=>delete v.scheduled.consumerEvidence.open,v=>v.scheduled.passed=false,
    v=>{v.closedBytes=Buffer.concat([v.closedBytes,Buffer.from(' ')])},
    v=>mutatePhase(v,'closed',r=>{r.passed=false}),v=>mutatePhase(v,'open',r=>{r.qualification.capacity=true}),
    v=>mutatePhase(v,'open',r=>{r.inputBinding.frozenInputsSha256='b'.repeat(64)}),
    v=>mutatePhase(v,'open',r=>{r.fixtureIdentity.cases.B.attemptId='foreign'}),
    v=>mutatePhase(v,'open',r=>{r.process.pid=r.process.liveApiPid}),
    v=>delete v.privateFiles['c25-consumer-open-observations-private.json'],
    v=>{v.privateFiles['c25-consumer-open-fixture-private.json']=Buffer.from('{}')},
  ]
  for(const mutate of mutations){const v=accepted();mutate(v);assert.throws(()=>aggregateConsumerEvidence(v))}
})
test('finalize independently rechecks observations and both immutable DB/result-cipher bindings',()=>{
  const mutations=[
    v=>mutateObservation(v,'open',o=>{o.records[5].decrypt.resultDecryptCalls=0}),
    v=>mutateObservation(v,'closed',o=>{o.records[6].value[0].now='2026-10-19T08:04:00.000Z'}),
    v=>mutateObservation(v,'open',o=>{o.records[1].value[0].trainingPersistenceSnapshotHash='b'.repeat(64)}),
    v=>mutatePhase(v,'open',r=>{r.proof.resultCipherSha256.resultSnapshotEncrypted='b'.repeat(64)}),
  ]
  for(const mutate of mutations){const v=accepted();mutate(v);assert.throws(()=>aggregateConsumerEvidence(v))}
  const v=accepted(),file='c25-consumer-open-observations-private.json',o=JSON.parse(v.privateFiles[file])
  o.records[2].value[0].resultSnapshotEncrypted='different-result';o.records[5].middleware[0].result[0].resultSnapshotEncrypted='different-result'
  v.privateFiles[file]=bytes(o);mutatePhase(v,'open',r=>{r.artifacts.observations.sha256=sha(v.privateFiles[file]);r.proof=analyzeConsumerRecords('open',o.records,v.fixtureIdentity)})
  assert.throws(()=>aggregateConsumerEvidence(v),/B result ciphertext changed/)
})
test('CLI source keeps finalized aggregation before runtime connection and uses the actual exported singleton',()=>{
  const source=fs.readFileSync(new URL('./c25-consumers.mjs',import.meta.url),'utf8')
  assert.ok(source.includes('prisma.$on(\'query\''));assert.ok(source.includes('prisma.$use(async(params,next)'))
  assert.ok(source.includes('value=await next(params);return value'));assert.ok(source.includes('({prisma}=require(databaseFile))'))
  assert.ok(!source.includes('new PrismaClient'));assert.ok(!source.includes('cleanupExpiredTrainingCheckpoints'))
  assert.ok(!source.includes('c20-materials-client'));assert.ok(source.includes('if(mode===\'finalize\')'))
  assert.ok(source.indexOf("if(mode==='finalize')")<source.lastIndexOf('await probe('))
})
