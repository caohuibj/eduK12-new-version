import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
const suite=process.env.PR356_ORDINARY_RECEIPT_ISOLATED==='1'?describe:describe.skip
suite('ordinary durable whole receipt collection boundary',()=>{
 let db:any,whole:typeof import('../../modules/composite/whole-questionnaire.service'),outbox:typeof import('../../modules/assessment-runtime/report-outbox.service'),systemId:string,ledger:string
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!)
  if(process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='55439'||!/^\/pr356_ordinary_receipt_test_[a-f0-9]{10}$/.test(url.pathname))throw new Error('Dedicated ordinary receipt synthetic DB required')
  if(process.env.PR356_ORDINARY_RECEIPT_OUT!=='/workspace/scratch/pr356-review-followup')throw new Error('Explicit synthetic fixture evidence directory required')
  for(const [key,value]of Object.entries({ASSESSMENT_REPORT_ASYNC_ENABLED:'true',ASSESSMENT_WHOLE_SUBMIT_ENABLED:'true',ASSESSMENT_REPORT_MAX_ATTEMPTS:'1',ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED:'true',ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED:'true',ASSESSMENT_REPORT_ASYNC_COURSE_IDS:''}))vi.stubEnv(key,value)
  db=(await import('../../config/database')).prisma;whole=await import('../../modules/composite/whole-questionnaire.service');outbox=await import('../../modules/assessment-runtime/report-outbox.service')
  const name=url.pathname.slice(1)+'-system';systemId=(await db.user.upsert({where:{username:name},update:{},create:{username:name,passwordHash:'SYNTHETIC NONLOGIN',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN'}})).id
  ledger=join(process.env.PR356_ORDINARY_RECEIPT_OUT!,url.pathname.slice(1)+'.fixture.json')
 },120000)
 afterAll(async()=>{vi.unstubAllEnvs();if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 const stop=async(scaleIds:string[])=>db.$transaction(async(tx:any)=>{for(const id of scaleIds)await(await import('../../modules/scale-library-governance/service')).stopCollection(tx,systemId,'TRAINING_SCALE',id,'Synthetic ordinary ACK phase boundary')})
 async function fresh(){return(await import('../integration/report-outbox-fixture')).createReportOutboxFixture(db,2)}
 async function payload(f:any){
  const definition=await whole.getWholeQuestionnaireDefinition(f.parent.id,{userId:f.participant.id})
  return {submissionId:randomUUID(),attemptEpoch:definition.attemptEpoch,slotSetHash:definition.slotSetHash!,contextSnapshotHash:definition.contextSnapshotHash,units:definition.units.map(u=>({itemId:u.itemId,definitionHash:u.definitionHash,answers:f.inputs.find((i:any)=>i.assessmentId===u.scaleAssessmentId)!.answers}))}
 }
 it.each(['single','batch']as const)('processes accepted %s units after emergency stop while retaining receipt and lease identity',async mode=>{
  vi.stubEnv('ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED',mode==='batch'?'true':'false')
  let saved:any
  if(existsSync(ledger))saved=JSON.parse(readFileSync(ledger,'utf8'))
  else{
   const f=await fresh(),input=await payload(f)
   // A detached durable ACK must not wait for the unrelated legacy counter.
   let unlock!:()=>void,locked!:()=>void;const ready=new Promise<void>(r=>{locked=r}),release=new Promise<void>(r=>{unlock=r})
   const holding=db.$transaction(async(tx:any)=>{await tx.$queryRaw`SELECT id FROM composite_report_queue_budget WHERE id='reports' FOR UPDATE`;locked();await release},{timeout:10000})
   await ready;let timer:ReturnType<typeof setTimeout>|undefined
   try{await expect(Promise.race([whole.submitWholeQuestionnaire(f.parent.id,input,{userId:f.participant.id}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Detached receipt waited for legacy queue budget')),3000)})])).resolves.toMatchObject({status:'ACCEPTED'})}
   finally{if(timer)clearTimeout(timer);unlock();await holding}
   const receipt=await db.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:f.parent.id,attemptEpoch:input.attemptEpoch}}})
   expect(receipt.budgetHeld).toBe(false)
   saved={parentId:f.parent.id,participantId:f.participant.id,scaleIds:f.scaleIds,input,wholePayloadHash:receipt.wholePayloadHash,wholeAnswersEncrypted:receipt.wholeAnswersEncrypted}
   writeFileSync(ledger,JSON.stringify(saved,null,2)+'\n',{flag:'wx'})
   await stop(f.scaleIds)
  }
  const prior=await db.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:saved.parentId,attemptEpoch:saved.input.attemptEpoch}}})
  expect(prior.status,'Settled READY fixtures are never rerun').not.toBe('READY')
  if(prior.status==='FAILED')await outbox.retryCompositeReport(await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:saved.parentId}}))
  vi.stubEnv('ASSESSMENT_REPORT_LEASE_MS','1');const expired=await outbox.claimCompositeReportJob();expect(expired?.id).toBe(prior.id)
  await db.$queryRaw`SELECT 1 AS tick FROM pg_sleep(0.01)`
  vi.stubEnv('ASSESSMENT_REPORT_LEASE_MS','60000');const job=await outbox.claimCompositeReportJob();expect(job?.id).toBe(prior.id);expect(job!.leaseToken).not.toBe(expired!.leaseToken)
  const guard=(await import('../../modules/scale/scale-collection-guard')).assertTrainingScaleCollectionAllowed
  const receipt={submissionId:job!.wholeSubmissionId!,payloadHash:job!.wholePayloadHash!,acceptedAtMs:job!.wholeAcceptedAt!.getTime(),leaseToken:job!.leaseToken!}
  const scope={compositeAttemptId:saved.parentId,compositeAttemptEpoch:job!.attemptEpoch,compositeItemIds:saved.input.units.map((u:any)=>u.itemId),acceptedReceipt:receipt}
  for(const bad of [{...scope,acceptedReceipt:{...receipt,leaseToken:expired!.leaseToken!}},{...scope,acceptedReceipt:{...receipt,payloadHash:'f'.repeat(64)}},{...scope,acceptedReceipt:{...receipt,acceptedAtMs:receipt.acceptedAtMs+1}},{...scope,compositeAttemptEpoch:job!.attemptEpoch+1},{...scope,compositeItemIds:['foreign-item']}]){
   await expect.soft(db.$transaction((tx:any)=>guard(tx,saved.scaleIds,bad))).rejects.toThrow('REPORT_PROCESSING_LEASE_LOST')
  }
  await expect.soft(db.$transaction((tx:any)=>guard(tx,saved.scaleIds,scope))).resolves.toBeUndefined()
  await(await import('../../workers/compositeReportWorker')).processCompositeReportJob(job!)
  const done=await db.compositeReportJob.findUniqueOrThrow({where:{id:prior.id}})
  expect(done.status).toBe('READY');expect(done.wholePayloadHash).toBe(saved.wholePayloadHash);expect(done.wholeAnswersEncrypted).toBe(saved.wholeAnswersEncrypted);expect(done.reportEncrypted).toBeTruthy()
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:saved.parentId}});expect(parent.status).toBe('COMPLETED')
  expect(await db.assessment.count({where:{compositeAttemptId:parent.id,status:'COMPLETED'}})).toBe(2)
  const snapshots=await db.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id,unitType:'SCALE',terminalState:'COMPLETED'}});expect(snapshots).toHaveLength(2)
  expect(await whole.submitWholeQuestionnaire(parent.id,saved.input,{userId:saved.participantId})).toMatchObject({replayed:true,payloadHash:saved.wholePayloadHash})
  expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:parent.id,unitType:'SCALE'}})).toBe(2)
 },120000)
 it('rechecks wall-clock lease after a real job-lock wait rather than transaction start',async()=>{
  const f=await fresh(),input=await payload(f);await whole.submitWholeQuestionnaire(f.parent.id,input,{userId:f.participant.id})
  vi.stubEnv('ASSESSMENT_REPORT_LEASE_MS','500');const job=await outbox.claimCompositeReportJob();expect(job?.attemptId).toBe(f.parent.id)
  let unlock!:()=>void,locked!:()=>void;const ready=new Promise<void>(r=>{locked=r}),release=new Promise<void>(r=>{unlock=r})
  const holding=db.$transaction(async(tx:any)=>{await tx.$queryRaw`SELECT id FROM composite_report_jobs WHERE id=${job!.id} FOR UPDATE`;locked();await release},{timeout:5000})
  await ready
  const pending=db.$transaction((tx:any)=>outbox.enqueueCompositeReportForUnit(tx,{compositeAttemptId:f.parent.id,attemptEpoch:job!.attemptEpoch,wholeReceipt:{submissionId:job!.wholeSubmissionId!,payloadHash:job!.wholePayloadHash!,acceptedAtMs:job!.wholeAcceptedAt!.getTime(),leaseToken:job!.leaseToken!}})).then(()=>({error:null}),error=>({error}))
  try{
   let waiting=false
   for(let i=0;i<40;i++){
    const rows=await db.$queryRaw`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%composite_report_jobs%' AND pid<>pg_backend_pid()`
    if(rows.length){waiting=true;break}
    await new Promise(resolve=>setTimeout(resolve,5))
   }
   expect(waiting,'The receipt fence must actually wait on the held job lock').toBe(true)
   const [remaining]=await db.$queryRaw`SELECT lease_expires_at>(clock_timestamp() AT TIME ZONE 'UTC') AS valid FROM composite_report_jobs WHERE id=${job!.id}`
   expect(remaining.valid,'The lease was current when the fence began waiting').toBe(true)
   await db.$queryRaw`SELECT 1 AS tick FROM pg_sleep(0.55)`
  }finally{unlock();await holding}
  expect((await pending).error).toMatchObject({message:'REPORT_PROCESSING_LEASE_LOST'})
  expect(await db.assessment.count({where:{compositeAttemptId:f.parent.id,status:'COMPLETED'}})).toBe(0)
 },15000)
 it('rejects a new ordinary whole submission stopped before durable ACK in the receipt transaction',async()=>{
  const f=await fresh(),input=await payload(f);await stop(f.scaleIds)
  await expect(whole.submitWholeQuestionnaire(f.parent.id,input,{userId:f.participant.id})).rejects.toThrow('紧急停用')
  const job=await db.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:f.parent.id,attemptEpoch:input.attemptEpoch}}})
  expect(job.wholeSubmissionId).toBeNull();expect(job.wholeAnswersEncrypted).toBeNull();expect(job.status).toBe('WAITING')
  expect(await db.assessment.count({where:{compositeAttemptId:f.parent.id,status:'COMPLETED'}})).toBe(0)
 },120000)
})
