/** Synthetic evidence tests cover only the new E/distinct-scope contracts.
 * They never instantiate Prisma, import installed products or connect services. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {consumerQualification,immutableProbeIdentity,verifyProbeSource,analyzeConsumerRecords,aggregateConsumerEvidence,verifyOriginalOpenEvidence} from './c25-missing-consumers.mjs'
const sha=value=>createHash('sha256').update(value).digest('hex')
const digest=value=>sha(JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v))
const bytes=value=>Buffer.from(JSON.stringify(value)),h='a'.repeat(64),t0='2026-10-19T12:00:00.000Z',releaseAt='2026-10-19T12:05:00.000Z'
const select=keys=>Object.fromEntries(keys.map(key=>[key,true])),header=['aggregateInputHash','attemptEpoch','contextHash','slotSetHash','status']
const schedule=()=>({t0,releaseAt,submittedAt:'2026-10-19T12:02:00.000Z',closedStartedAt:'2026-10-19T12:02:01.000Z',closedFinishedAt:'2026-10-19T12:02:03.000Z',observedOpenAt:'2026-10-19T12:05:00.000Z'})
function fixture(){
 const c={name:'E',mode:'SCHEDULED',participant:'AUTHENTICATED',compositeId:'publication-E',attemptId:'attempt-E',attemptEpoch:1,courseId:'course',accessTokenId:null,roundId:null,contextSnapshotHash:null,children:{cognitiveSessionId:'cognitive-E'},slots:[{unitType:'COGNITIVE',slotKey:'COGNITIVE:E'}],steps:[]}
 return {schemaVersion:1,scope:consumerQualification.scope,name:'E',originalFixtureSha256:h,courseId:'course',teacherId:'teacher',cognitiveAssignmentId:'assignment',inheritedStudentId:'old-student',actors:{student:{id:'new-student',username:'private-name',password:'private-secret',role:'STUDENT'}},product:{id:'publication-E'},case:c,schedule:schedule(),restoreCases:[{name:'E',mode:'SCHEDULED',participant:'AUTHENTICATED',compositeId:c.compositeId,attemptId:c.attemptId,courseId:c.courseId,accessTokenId:null,roundId:null}],checkpointCases:[{name:'E',attemptId:c.attemptId,state:'TOMBSTONE'}]}
}
function original(){return {schemaVersion:1,scope:'NEW_SYNTHETIC_C25_ONLY',courseId:'course',actors:{teacher:{id:'teacher'},student:{id:'old-student'},admin:{id:'old-admin'}},resources:{cognitive:'assignment'},cases:Object.fromEntries(['A','B','C','D'].map(name=>[name,{attemptId:name,compositeId:'old-product',children:{cognitiveSessionId:'old-cognitive-'+name}}]))}}
function dbRow(f){
 const c=f.case,feedbackPolicy={schemaVersion:1,mode:'SCHEDULED',releaseAt},persistencePolicy={schemaVersion:1,checkpoint:{enabled:true,ttlHours:1},localCognitive:{enabled:true,ttlHours:1}},common={schemaVersion:1,attemptId:c.attemptId,attemptEpoch:1,compositeId:c.compositeId,courseId:c.courseId,roundId:null}
 const feedback={...common,accessTokenId:null,policy:feedbackPolicy,policyHash:digest(feedbackPolicy)},persistence={...common,policy:persistencePolicy,policyHash:digest(persistencePolicy)}
 return {id:c.attemptId,userId:'new-student',status:'COMPLETED',attemptEpoch:1,asyncReportEpoch:1,compositeAssessmentId:c.compositeId,deliveryCourseId:'course',accessTokenId:null,contextSnapshotHash:c.contextSnapshotHash,frozenActiveSlotSetHash:h,aggregateInputHash:h,
  trainingFeedbackSnapshot:feedback,trainingFeedbackSnapshotHash:digest(feedback),trainingPersistenceSnapshot:persistence,trainingPersistenceSnapshotHash:digest(persistence),compositeAssessment:{id:c.compositeId,publishedAt:t0,trainingFeedbackPolicy:feedbackPolicy,trainingFeedbackPolicyHash:digest(feedbackPolicy),trainingPersistencePolicy:persistencePolicy,trainingPersistencePolicyHash:digest(persistencePolicy)},scaleAssessments:[],cognitiveSessions:[{id:c.children.cognitiveSessionId}],situationalAttempts:[],formSectionAttempts:[]}
}
function records(mode,f){
 const row=dbRow(f),c=f.case,job={status:'READY',attemptEpoch:1,slotSetHash:h,contextHash:c.contextSnapshotHash,aggregateInputHash:h},known={id:c.children.cognitiveSessionId,userId:'new-student',status:'COMPLETED',compositeAttemptId:c.attemptId,resultSnapshotEncrypted:'exact-E-cipher',scoreEncrypted:null,qualityFlagsEncrypted:null}
 const event=query=>({query,params:'[]',duration:1}),call=(model,action,args,result)=>({params:{model,action,args},result,error:null}),record=(name,value,sql=[],middleware=[])=>({name,value,sql,middleware,decrypt:{totalCalls:0,resultDecryptCalls:0,otherDecryptCalls:0},observerError:null})
 const clock=(name,now)=>record(name,[{now}],[event('SELECT clock_timestamp() AS now')],[call(undefined,'queryRaw',{},[{now}])])
 const context={parent:row,job},contextSql="SELECT jsonb_build_object('id',p.id) AS parent,j.status FROM composite_assessment_attempts p JOIN composite_assessments c ON c.id=p.composite_assessment_id LEFT JOIN composite_report_jobs j ON j.attempt_id=p.id WHERE p.id=$1"
 const sessionSelect={...select(['id','scoreEncrypted','qualityFlagsEncrypted','resultSnapshotEncrypted']),compositeAttempt:{select:{trainingFeedbackSnapshot:true}}}
 const history=record('history',{total:1,list:[{sessionId:known.id,source:'composition',score:null,qualityState:mode==='closed'?null:'interpretable',...(mode==='closed'?{feedbackDeferred:true}:{})}]},[event('SELECT result_snapshot_encrypted FROM cognitive_sessions')],[call('CognitiveSession','findMany',{where:{userId:'new-student',status:'COMPLETED'},select:sessionSelect},[{...known,compositeAttempt:row}])])
 const loaded=record('loaded-parent',mode==='closed')
 if(mode==='open'){
  loaded.sql.push(event('SELECT status,attempt_epoch,slot_set_hash,context_hash,aggregate_input_hash FROM composite_report_jobs'))
  loaded.middleware.push(call('CompositeReportJob','findUnique',{where:{attemptId_attemptEpoch:{attemptId:c.attemptId,attemptEpoch:1}},select:select(header)},job))
  history.sql.push(event('SELECT attempt_id,status,attempt_epoch,slot_set_hash,context_hash,aggregate_input_hash FROM "public"."composite_report_jobs" WHERE attempt_id=$1'))
  history.middleware.push(call('CompositeReportJob','findMany',{where:{OR:[{attemptId:c.attemptId,attemptEpoch:1}]},select:select([...header,'attemptId'])},[{...job,attemptId:c.attemptId}]))
  history.decrypt={totalCalls:3,resultDecryptCalls:1,otherDecryptCalls:2}
 }
 return [clock('clock-before',mode==='closed'?'2026-10-19T12:02:01.500Z':releaseAt),record('case-bindings',[row]),record('known-result-row',[known],[event('SELECT result_snapshot_encrypted FROM cognitive_sessions')],[call('CognitiveSession','findMany',{where:{userId:'new-student',status:'COMPLETED'}},[known])]),record('compact-context',context,[event(contextSql)],[call(undefined,'queryRaw',{},[context])]),loaded,history,clock('clock-after',mode==='closed'?'2026-10-19T12:02:02.500Z':'2026-10-19T12:05:01.000Z')]
}
function accepted(){
 const f=fixture(),fixtureIdentity=immutableProbeIdentity(f),inputBinding={sourceHead:'b'.repeat(40),frozenInputsSha256:h,sourceSha256:{source:h},runtimeFingerprint:{schemaVersion:1},runtimeFingerprintSha256:h},privateFiles={},phases={}
 const probePhase={schemaVersion:1,passed:true,phase:'missing-probe',qualification:{scope:consumerQualification.scope},fixtureIdentity,inheritedRowsUnchanged:true,schedule:schedule(),consumerEvidence:{}}
 for(const mode of ['closed','open']){
  const observation={schemaVersion:1,mode,inputBinding,fixtureIdentity,records:records(mode,f)},artifacts={}
  for(const [kind,value] of [['fixture',f],['observations',observation]]){const file=`c25-missing-consumer-${mode}-${kind}-private.json`;privateFiles[file]=bytes(value);artifacts[kind]={file,sha256:sha(privateFiles[file])}}
  phases[mode]={schemaVersion:1,passed:true,mode,qualification:consumerQualification,inputBinding,fixtureIdentity,fixtureSha256:artifacts.fixture.sha256,process:{pid:mode==='closed'?200:201,liveApiPid:100},artifacts,proof:analyzeConsumerRecords(mode,observation.records,fixtureIdentity)}
  probePhase.consumerEvidence[mode]={path:`c25-missing-consumer-${mode}-result.json`,sha256:sha(bytes(phases[mode]))}
 }
 return {closedBytes:bytes(phases.closed),openBytes:bytes(phases.open),probePhase,inputBinding,fixtureIdentity,privateFiles}
}
function mutatePhase(value,mode,mutate){const result=JSON.parse(value[mode+'Bytes']);mutate(result);value[mode+'Bytes']=bytes(result);value.probePhase.consumerEvidence[mode].sha256=sha(value[mode+'Bytes'])}
function mutateObservation(value,mode,mutate){const file=`c25-missing-consumer-${mode}-observations-private.json`,observation=JSON.parse(value.privateFiles[file]);mutate(observation);value.privateFiles[file]=bytes(observation);mutatePhase(value,mode,result=>{result.artifacts.observations.sha256=sha(value.privateFiles[file])})}

test('E consumer import is pure and preserves separate qualification scope',()=>{
 const require=createRequire(import.meta.url);assert.ok(!Object.keys(require.cache).some(p=>p.includes('/backend/dist/')));assert.equal(consumerQualification.scope,'NEW_SYNTHETIC_C25_PROBE_E_ONLY');assert.equal(consumerQualification.case,'E')
})
test('E identity accepts exact null context and strips progress/passwords without accepting missing or malformed hashes',()=>{
 const f=fixture(),first=immutableProbeIdentity(f);f.schedule.closedFinishedAt='mutable-progress';f.case.steps.push({submissionId:'private-final'});f.actors.student.password='another';assert.deepEqual(immutableProbeIdentity(f),first)
 assert.doesNotMatch(JSON.stringify(first),/private-secret|private-name|another|mutable-progress|private-final/)
 for(const value of [undefined,'','x','g'.repeat(64),'a'.repeat(63)]){const bad=fixture();bad.case.contextSnapshotHash=value;assert.throws(()=>immutableProbeIdentity(bad))}
 const valid=fixture();valid.case.contextSnapshotHash=h;immutableProbeIdentity(valid)
})
test('E schema cannot add another modality or relabel inherited student attempt publication or session',()=>{
 verifyProbeSource(fixture(),original())
 for(const mutate of [f=>{f.case.children.scaleId='scale'},f=>{f.case.slots.push({unitType:'SCALE',slotKey:'scale'})},f=>{f.case.name='B'},f=>{f.cases={B:{}}},f=>{f.actors.student.id='old-student'},f=>{f.restoreCases[0].name='B'}]){const f=fixture();mutate(f);assert.throws(()=>immutableProbeIdentity(f))}
 for(const mutate of [f=>{f.actors.student.id='old-admin'},f=>{f.case.attemptId='B';f.restoreCases[0].attemptId='B'},f=>{f.product.id=f.case.compositeId=f.restoreCases[0].compositeId='old-product'},f=>{f.case.children.cognitiveSessionId='old-cognitive-B'},f=>{f.cognitiveAssignmentId='unrelated-assignment'}]){const f=fixture();mutate(f);assert.throws(()=>verifyProbeSource(f,original()))}
})
test('E-specific actual observation accepts compact 1, loaded 0/1 and history 0/1 with sensitive open decrypt',()=>{
 for(const mode of ['closed','open']){const f=fixture(),proof=analyzeConsumerRecords(mode,records(mode,f),immutableProbeIdentity(f));assert.equal(proof.observations.compactContext.sqlQueries,1);assert.equal(proof.observations.loadedParent.jobHeaderQueries,mode==='closed'?0:1);assert.equal(proof.observations.history.jobHeaderQueries,mode==='closed'?0:1);assert.equal(proof.observations.history.resultDecryptCalls,mode==='closed'?0:1);assert.equal(proof.dbBinding.E.userId,'new-student')}
})
test('E unfiltered completed history rejects old-student substitution a second result or narrowing to the target ID',()=>{
 const mutations=[r=>{r[2].value.push({...r[2].value[0],id:'another'})},r=>{r[2].middleware[0].params.args.where.id='cognitive-E'},r=>{r[2].value[0].userId='old-student'},r=>{r[5].middleware[0].params.args.where.id='cognitive-E'},r=>{r[5].middleware[0].params.args.where.compositeAttemptId='attempt-E'},r=>{r[5].middleware[0].params.args.take=1},r=>{r[5].middleware[0].result.push({...r[5].middleware[0].result[0],id:'other'})}]
 for(const mutate of mutations){const f=fixture(),r=records('open',f);mutate(r);assert.throws(()=>analyzeConsumerRecords('open',r,immutableProbeIdentity(f)))}
})
test('E observations fail on result decrypt while closed insensitive open payload job SQL and extra job projections',()=>{
 for(const [mode,mutate] of [['closed',r=>{r[5].decrypt.resultDecryptCalls=1}],['open',r=>{r[5].decrypt.resultDecryptCalls=0}],['closed',r=>{r[3].sql[0].query+=' FOR UPDATE'}],['open',r=>{r[4].middleware[0].params.args.select.resultSnapshotEncrypted=true}],['open',r=>{r[5].sql[1].query='SELECT payload FROM composite_report_jobs'}],['open',r=>{r[1].value[0].contextSnapshotHash=h}],['open',r=>{r[3].value.job.contextHash=h}]]){const f=fixture(),r=records(mode,f);mutate(r);assert.throws(()=>analyzeConsumerRecords(mode,r,immutableProbeIdentity(f)))}
})
test('E paired finalizer accepts hash-bound separate-process evidence without a scheduled pass or rerun',()=>{
 const result=aggregateConsumerEvidence(accepted());assert.equal(result.phase,'missing-consumers');assert.equal(result.passed,true);assert.equal(result.probesRerun,false);assert.equal(result.process.liveApiPid,100)
})
test('E paired finalizer rejects changed raw evidence identity clock lineage and a reused consumer process',()=>{
 const mutations=[v=>{v.probePhase.passed=false},v=>{v.probePhase.phase='scheduled'},v=>{delete v.probePhase.schedule.closedFinishedAt},v=>{v.probePhase.inheritedRowsUnchanged=false},v=>{v.privateFiles['c25-missing-consumer-closed-observations-private.json']=Buffer.from('{}')},v=>mutatePhase(v,'open',r=>{r.fixtureIdentity.case.attemptId='B'}),v=>mutatePhase(v,'open',r=>{r.process.pid=200}),v=>mutatePhase(v,'open',r=>{r.process.liveApiPid=101}),v=>mutateObservation(v,'closed',r=>{r.records[5].decrypt.resultDecryptCalls=1}),v=>mutateObservation(v,'open',r=>{r.records[2].value[0].resultSnapshotEncrypted='different-E-cipher'})]
 for(const mutate of mutations){const v=accepted();mutate(v);assert.throws(()=>aggregateConsumerEvidence(v))}
})
test('original OPEN-only verification cannot accept E scope or a false/missing missing-open phase',()=>{
 for(const missingOpen of [{schemaVersion:1,passed:false,phase:'missing-open'},{schemaVersion:1,passed:true,phase:'scheduled'},{schemaVersion:1,passed:true,phase:'missing-open',acceptedRowsUnchanged:false}])assert.throws(()=>verifyOriginalOpenEvidence({missingOpen}))
 const source=fs.readFileSync(new URL('./c25-missing-consumers.mjs',import.meta.url),'utf8');assert.match(source,/analyzeOriginalRecords\('open'/);assert.match(source,/ORIGINAL_FOUR_CASE_OPEN_ONLY/);assert.match(source,/NEW_E_CLOSED_AND_OPEN/);assert.doesNotMatch(source,/c25-scheduled-result\.json/)
})
