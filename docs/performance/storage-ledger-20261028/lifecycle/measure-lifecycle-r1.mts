import {createRequire} from 'node:module'
import {randomUUID,createHash} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const root=process.env.PROBE_BACKEND_ROOT!,req=createRequire(root+'/package.json'),out=process.env.LEDGER_OUTPUT!,mode=process.env.LEDGER_MODE!
assert(['legacy','shared-compact'].includes(mode));const {prisma:db}=req(root+'/src/config/database.ts')
const {setupEducationLibraryRuntimeFixture}=req(root+'/src/__tests__/integration/educationLibraryRuntimeFixture.ts')
const events=req(root+'/src/modules/huiteacher/evaluation.service.ts'),runs=req(root+'/src/modules/assessment-run/repository.ts'),publisher=req(root+'/src/modules/assessment-run/publish.ts')
const {startAssessmentRunExecution}=req(root+'/src/modules/assessment-run/startExecution.ts')
const {submitScaleAssessmentFinal}=req(root+'/src/modules/scale/scale-final-submit.service.ts')
const {loadFrozenScaleRuntimeSnapshot}=req(root+'/src/modules/assessment-runtime/runtime-snapshot.ts')
const {finalizeCompositeAttemptIfReady}=req(root+'/src/modules/composite/composite.service.ts')
const {readEducationRespondentScaleReport}=req(root+'/src/modules/reporting/education-scale-personal-report.service.ts')
let sqlCount=0,sqlMs=0;db.$on('query',(e:any)=>{sqlCount++;sqlMs+=e.duration})
const evidence:any={schemaVersion:1,mode,scope:'Owned synthetic actual Teacher SELF START/FINAL/report; one-item scale; sequential storage lifecycle, not concurrency or HTTP/browser qualification',flags:Object.fromEntries(['ASSESSMENT_COMPACT_FACTS_ENABLED','ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED','ASSESSMENT_SHARED_CONTROL_ENABLED'].map(k=>[k,process.env[k]])),stages:[],records:[],snapshots:[],completed:false}
const save=()=>writeFileSync(out,JSON.stringify(evidence,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n')
async function phase(name:string,fn:()=>Promise<any>){const start=performance.now(),cpu=process.cpuUsage(),heap=process.memoryUsage().heapUsed,n=sqlCount,d=sqlMs;try{const value=await fn();evidence.stages.push({name,status:'PASS',ms:performance.now()-start,cpuMicros:process.cpuUsage(cpu),heapDelta:process.memoryUsage().heapUsed-heap,sqlCount:sqlCount-n,sqlMs:sqlMs-d});save();return value}catch(e:any){evidence.stages.push({name,status:'FAIL',ms:performance.now()-start,code:e.code,message:e.message});save();throw e}}
const tables=['assessments','assessment_result_facts','assessment_unit_snapshots','assessment_runtime_artifacts','assessment_public_templates','assessment_frozen_bindings','composite_assessment_attempts','composite_assessments','composite_assessment_items','composite_report_jobs','assessment_run_executions','assessment_run_tracks','assessment_run_actor_snapshots','relational_assessment_assignments','assessment_attempt_consents','scales','measurement_content_releases','scale_library_entries']
async function snapshot(label:string){const values=[];for(const table of tables){const found=await db.$queryRawUnsafe(`SELECT to_regclass('public.${table}')::text AS name`);if(!found[0].name)continue;const row=await db.$queryRawUnsafe(`SELECT count(*)::int AS rows,pg_total_relation_size('${table}') AS "relationBytes",pg_table_size('${table}') AS "tableBytes",pg_indexes_size('${table}') AS "indexesBytes" FROM "${table}"`);const columns=await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND (column_name LIKE '%encrypted%' OR column_name LIKE '%cipher%' OR column_name IN ('result','answers')) ORDER BY ordinal_position`);const fields=[];for(const {column_name:c}of columns){const [v]=await db.$queryRawUnsafe(`SELECT count("${c}")::int AS "nonNull",coalesce(sum(octet_length("${c}"::text)),0)::bigint AS "textBytes" FROM "${table}"`);fields.push({column:c,...v})}values.push({table,...row[0],fields})}const [lsn]=await db.$queryRawUnsafe('SELECT pg_current_wal_insert_lsn()::text AS lsn');evidence.snapshots.push({label,lsn:lsn.lsn,tables:values});save()}
try{
 const [identity]=await db.$queryRawUnsafe('SELECT current_database() AS name');assert(identity.name.startsWith('storage_lifecycle_')&&identity.name.endsWith('_test'))
 assert.equal(await db.assessment.count(),0)
 const f=await phase('source-and-approval-setup',()=>setupEducationLibraryRuntimeFixture({db,product:'TEACHER',publish:false}))
 const people=[{userId:f.participantUserId,membershipId:f.participantMembershipId}]
 for(let i=1;i<30;i++){const u=await db.user.create({data:{username:'ledger_'+randomUUID(),passwordHash:'synthetic-nonlogin',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}});const m=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:u.id}});await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:m.id,persona:'TEACHER',grantedByUserId:f.managerUserId}});people.push({userId:u.id,membershipId:m.id})}
 const scope={organizationId:f.organizationId,actorUserId:f.managerUserId}
 const target=await events.createHuiteacherTarget({...scope,kind:'ORGANIZATION',name:'合成存储观测'})
 const event=await events.createHuiteacherEvent({...scope,targetId:target.id,kind:'ASSESSMENT',title:'三十位合成本人测评'})
 const run=await events.createHuiteacherEventRunDraft({...scope,eventId:event.id,name:'真实存储观测'})
 const membershipIds=people.map(p=>p.membershipId)
 await runs.addAssessmentRunTrackDraft({...scope,runId:run.runId,resource:f.resource,subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds},requestedPolicy:f.requestedPolicy})
 await events.transitionHuiteacherEvent({...scope,eventId:event.id,action:'OPEN',expectedVersion:1})
 const [v]=await db.$queryRaw`SELECT version FROM assessment_runs WHERE id=${run.runId}`
 await phase('real-run-publication',()=>publisher.publishAssessmentRun({...scope,runId:run.runId,expectedVersion:v.version}))
 const executions=await db.$queryRaw`SELECT e.id,r.user_id AS "userId" FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id WHERE e.run_id=${run.runId} ORDER BY e.id`
 assert.equal(executions.length,30);await snapshot('published-before-start')
 for(let index=0;index<executions.length;index++){
  const e=executions[index],label=String(index+1)
  const started=await phase(label+':START',()=>startAssessmentRunExecution({executionId:e.id,actorUserId:e.userId}));assert.equal(started.state,'STARTED');assert.equal(started.runtimeBindingKind,'COMPOSITE')
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:started.runtimeBindingRef}}),child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:parent.id}}),frozen=await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted,db)
  if(index===0)await snapshot('first-real-start')
  const submissionId=randomUUID()
  await phase(label+':FINAL',()=>submitScaleAssessmentFinal({assessmentId:child.id,submissionId,attemptEpoch:child.attemptEpoch,definitionHash:frozen.legacyDefinitionHash,contextSnapshotHash:parent.contextSnapshotHash,userId:e.userId,compositeAttemptId:parent.id,answers:f.answers}))
  await phase(label+':parent-completion',()=>finalizeCompositeAttemptIfReady(parent.id))
  if(index===0)await snapshot('first-accepted-final')
  const report=await phase(label+':authorized-report',()=>readEducationRespondentScaleReport({actorUserId:e.userId,executionId:e.id,product:'TEACHER'}))
  assert.equal(report?.state,'READY');const scale=report.unitReports.find((r:any)=>r.type==='SCALE');assert(scale);const score=scale.scores.find((s:any)=>s.key==='support');assert.equal(score.value,3)
  const normalized={scores:scale.scores,rawScoreFeedback:scale.rawScoreFeedback,interpretations:scale.interpretations};const semanticHash=createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
  const persisted=await db.assessment.findUniqueOrThrow({where:{id:child.id}});assert.equal(persisted.status,'COMPLETED');assert.equal(await db.assessmentUnitSnapshot.count({where:{sourceAttemptId:child.id,payloadKind:'UNIT_RESULT',terminalState:'COMPLETED'}}),1)
  evidence.records.push({index:index+1,score:score.value,semanticHash,reportBytes:Buffer.byteLength(JSON.stringify(report)),status:persisted.status});save()
  if([1,10,30].includes(index+1))await snapshot('readable-report-'+(index+1))
 }
 assert.equal(new Set(evidence.records.map((r:any)=>r.semanticHash)).size,1);evidence.completed=true;save()
}finally{await db.$disconnect()}
