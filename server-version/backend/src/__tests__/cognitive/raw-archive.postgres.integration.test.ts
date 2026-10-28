import { afterAll,beforeAll,describe,it,expect,vi } from 'vitest'
import { randomUUID,createHash } from 'node:crypto'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from '../integration/integration-env'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
const url=integrationDatabaseUrl('COGNITIVE_ARCHIVE_DB_URL'),suite=url?describe:describe.skip
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
suite('MOT archive real PostgreSQL identity/reference/idempotency with fake COS bytes',()=>{
 let db:(typeof import('../../config/database'))['prisma'],service:typeof import('../../modules/cognitive/raw-archive.service')
 let proto:typeof import('../../modules/cognitive/content-candidates/mot/protocol'),security:typeof import('../../modules/cognitive/cognitive.security')
 let canonical:typeof import('../../modules/assessment-runtime/canonical'),assets:typeof import('../../services/assetStorage')
 let assignments:typeof import('../../modules/cognitive/assignment.service'),sessions:typeof import('../../modules/cognitive/session.service'),final:typeof import('../../modules/cognitive/final-submit.service')
 let teacher:string,student:string,publisher:string,outsider:string,courseId:string,configId:string
 const assignmentIds:string[]=[],assetIds:string[]=[],releaseIds:string[]=[],buffers=new Map<string,Buffer>(),uploadInputs:unknown[]=[],prefix='archive-pg-'+randomUUID()
 let beforeStore:((input:any)=>Promise<void>)|null=null,afterStore:((asset:any)=>Promise<void>)|null=null,wrongProvider=false
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  expect(new URL(url!).searchParams.get('schema')).toBe('cognitive_archive_20261026')
  process.env.COGNITIVE_MODULE_ENABLED='true';process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  db=(await import('../../config/database')).prisma
  expect((await db.$queryRaw<Array<{schema:string}>>`SELECT current_schema() AS schema`)[0].schema).toBe('cognitive_archive_20261026')
  service=await import('../../modules/cognitive/raw-archive.service');proto=await import('../../modules/cognitive/content-candidates/mot/protocol')
  security=await import('../../modules/cognitive/cognitive.security');canonical=await import('../../modules/assessment-runtime/canonical');assets=await import('../../services/assetStorage')
  const cos=await import('../../utils/cos')
  vi.spyOn(cos.cos,'deleteObject').mockImplementation(((_p:any,callback:any)=>{callback(null,{});return {}}) as any)
  vi.spyOn(cos.cos,'putObject').mockImplementation((()=>{throw Error('External COS must not be contacted')}) as any)
  vi.spyOn(cos.cos,'headObject').mockImplementation((()=>{throw Error('External COS must not be contacted')}) as any)
  assignments=await import('../../modules/cognitive/assignment.service');sessions=await import('../../modules/cognitive/session.service');final=await import('../../modules/cognitive/final-submit.service')
  for(const role of ['TEACHER','STUDENT','ADMIN','STUDENT'] as const){
   const user=await db.user.create({data:{username:prefix+'-'+randomUUID(),passwordHash:'synthetic-not-for-login',role,platformRole:role==='ADMIN'?'SYSTEM_ADMIN':'STANDARD',isActive:true}})
   if(role==='TEACHER')teacher=user.id;else if(role==='ADMIN')publisher=user.id;else if(!student)student=user.id;else outsider=user.id
  }
  courseId=(await db.course.create({data:{title:prefix,courseCode:randomUUID(),creatorId:teacher}})).id
  await db.courseStudent.create({data:{courseId,studentId:student,status:'ACTIVE'}})
  const seeded=await(await import('../../../prisma/seeds/native-cognitive')).seedNativeMotConfig(db)
  expect(seeded.created).toBe(true);configId=seeded.config.id
  await(await import('../../modules/cognitive/release.service')).publishCognitiveConfig(configId,publisher)
 })
 afterAll(async()=>{
  beforeStore=null;afterStore=null
  if(!db)return
  if(assetIds.length){await db.assetReference.deleteMany({where:{assetId:{in:assetIds}}});await db.storedAsset.deleteMany({where:{id:{in:assetIds}}})}
  if(assignmentIds.length){await db.cognitiveSession.deleteMany({where:{assignmentId:{in:assignmentIds}}});const rows=await db.cognitiveAssignment.findMany({where:{id:{in:assignmentIds}},select:{measurementReleaseId:true}})
   releaseIds.push(...rows.flatMap(r=>r.measurementReleaseId?[r.measurementReleaseId]:[]));await db.cognitiveAssignment.deleteMany({where:{id:{in:assignmentIds}}})}
  if(configId){const c=await db.cognitiveTestConfig.findUnique({where:{id:configId},select:{measurementReleaseId:true}});if(c?.measurementReleaseId)releaseIds.push(c.measurementReleaseId);await db.cognitiveTestConfig.deleteMany({where:{id:configId}})}
  if(releaseIds.length)await db.$executeRawUnsafe('DELETE FROM measurement_content_releases WHERE id = ANY($1::text[])',releaseIds)
  if(courseId){await db.courseStudent.deleteMany({where:{courseId}});await db.course.deleteMany({where:{id:courseId}})}
  await db.user.deleteMany({where:{id:{in:[teacher,student,publisher,outsider].filter(Boolean)}}});vi.restoreAllMocks();await db.$disconnect()
 })
 const fakeStore=async(input:Parameters<(typeof import('../../services/assetStorage'))['storeAsset']>[0])=>{
  uploadInputs.push(input);expect(input.provider).toBe('cos');expect(input.accessScope).toBe('PRIVATE')
  expect(input.mimeType).toBe('application/octet-stream');expect(input.initialReference?.entityType).toBe(service.COGNITIVE_RAW_ARCHIVE_PENDING_TYPE)
  if(beforeStore)await beforeStore(input)
  const id=randomUUID(),objectKey='assets/'+id+'.enc',sha256=createHash('sha256').update(input.buffer).digest('hex')
  const asset=await db.storedAsset.create({data:{id,objectKey,provider:wrongProvider?'local':'cos',mimeType:input.mimeType,sizeBytes:input.buffer.length,sha256,
   ownerId:input.ownerId,accessScope:input.accessScope,scopeId:input.scopeId,originalName:input.originalName,
   references:{create:input.initialReference!}}})
  assetIds.push(asset.id);buffers.set(asset.id,Buffer.from(input.buffer));if(afterStore)await afterStore(asset)
  return asset
 }
 const deps=()=>({db,storeAsset:fakeStore,discardUnreferencedAsset:assets.discardUnreferencedAsset})
 async function completed(complete=true){
  const assignment=await assignments.createAssignment(teacher,'TEACHER',{courseId,configId,title:prefix+'-'+randomUUID(),profile:'experience',required:true,maxAttempts:1})
  assignmentIds.push(assignment.id);await assignments.publishAssignment(teacher,'TEACHER',assignment.id)
  const session=await sessions.createSession(student,assignment.id),config=proto.motConfig('experience')
  const trials=Array.from({length:9},(_,index)=>{
   const plan=proto.motTrialPlan(config,session.randomSeed,index),start=index*12000,frameTimes=Array.from({length:481},(_,f)=>f*8000/480)
   const core={recordOrigin:'live' as const,phase:'test' as const,trialIndex:index,blockIndex:plan.blockIndex,speed:plan.speed,targetIds:plan.targetIds,initialObjects:plan.objects,
    startedAtPerfMs:start,cueStartedAtPerfMs:start+500,motionStartedAtPerfMs:start+1500,motionEndedAtPerfMs:start+9500,responseStartedAtPerfMs:start+10000,
    endedAtPerfMs:start+10500,completionTimeMs:10500,frameTiming:proto.summarizeMotFrames(frameTimes),
    calibration:{version:1 as const,method:'ruler_and_distance_self_reported' as const,referenceMm:50 as const,referenceCssPx:200,viewingDistanceMm:350,viewportWidthCssPx:800,viewportHeightCssPx:900,devicePixelRatio:2,visualViewportScale:1,language:'zh' as const},
    responses:plan.targetIds.map((id,i)=>({objectId:id,...proto.motPosition(plan.objects[id],8000,config),atPerfMs:start+10100+i*100,input:'keyboard' as const})),
    prematureInputs:0,missedInputs:0,ambiguousInputs:0,interactionEvents:[],interactionOverflow:false,interruptions:[],timedOut:false}
   return {core,raw:{schemaVersion:1 as const,trialIndex:index,motionFrameTimesMs:frameTimes}}
  })
  const identity={sessionId:session.sessionId,attemptEpoch:session.attemptEpoch,submissionId:prefix+'-'+randomUUID(),definitionHash:session.definitionHash!}
  const envelopes=trials.map(record=>({schemaVersion:1 as const,trialIndex:record.core.trialIndex,phase:'test' as const,startedAtPerfMs:record.core.startedAtPerfMs,endedAtPerfMs:record.core.endedAtPerfMs,durationMs:record.core.completionTimeMs,flags:{timeout:false,premature:false},qualityEvents:[],payload:record.core}))
  if(complete)await final.submitCognitiveSessionFinal(student,{...identity,contextSnapshotHash:session.contextSnapshotHash,trials:envelopes})
  const practice=structuredClone(trials.slice(0,1));practice.push({...structuredClone(trials[0]),core:{...structuredClone(trials[0].core),interruptions:['window_blur'] as any}})
  const rawPayload={schemaVersion:1 as const,formal:trials,practice},upload={rawPayload,rawSha256:canonical.canonicalHash(rawPayload)}
  return {identity,upload,actor:{userId:student},before:await db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})}
 }
 it('archives the real saved FINAL core/result plus every existing practice record, privately encrypted, then replays the stable receipt',async()=>{
  const f=await completed(),before=uploadInputs.length
  expect(await service.getCognitiveRawArchiveStatus(f.identity,f.actor,deps())).toMatchObject({coreSaved:true,archiveState:'pending',archiveConfirmed:false})
  const receipt=await service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps())
  expect(receipt).toMatchObject({coreSaved:true,archiveConfirmed:true,rawSha256:f.upload.rawSha256})
  const full=security.decryptCognitivePayload<any>(buffers.get(receipt.assetId!)!.toString('utf8'))
  expect(full.authority.resultSnapshot).toEqual(security.decryptCognitivePayload(f.before.resultSnapshotEncrypted!))
  expect(full.detail.practice).toEqual(f.upload.rawPayload.practice);expect(full.detail.practice).toHaveLength(2)
  expect(full.authority.rawSubmission.id).toBe(receipt.rawSubmissionId)
  expect(canonical.canonicalHash(full)).toBe(receipt.logicalHash)
  expect(full.authority.rawSubmission.payload.trials.map((t:any)=>t.payload)).toEqual(f.upload.rawPayload.formal.map(r=>r.core))
  expect(await service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps())).toEqual(receipt)
  expect(await service.getCognitiveRawArchiveStatus(f.identity,f.actor,deps())).toEqual(receipt)
  expect(uploadInputs.length-before).toBe(1)
  expect((await db.cognitiveSession.findUniqueOrThrow({where:{id:f.identity.sessionId}})).resultSnapshotEncrypted).toBe(f.before.resultSnapshotEncrypted)
 })
 it('rejects foreign owners, stale epoch/hash, client reports, mismatched formal core and changed sidecar without extra uploads',async()=>{
  const f=await completed(),before=uploadInputs.length
  await expect(service.archiveCognitiveRawSubmission(f.identity,{userId:outsider},f.upload,deps())).rejects.toMatchObject({code:'ARCHIVE_FORBIDDEN'})
  await expect(service.archiveCognitiveRawSubmission({...f.identity,attemptEpoch:2},f.actor,f.upload,deps())).rejects.toMatchObject({code:'ARCHIVE_IDENTITY_CONFLICT'})
  await expect(service.archiveCognitiveRawSubmission({...f.identity,definitionHash:'0'.repeat(64)},f.actor,f.upload,deps())).rejects.toMatchObject({code:'ARCHIVE_IDENTITY_CONFLICT'})
  await expect(service.archiveCognitiveRawSubmission(f.identity,f.actor,{...f.upload,report:{score:100}} as any,deps())).rejects.toMatchObject({code:'INVALID_ARCHIVE_PAYLOAD'})
  const changed=structuredClone(f.upload.rawPayload);changed.formal[0].core.missedInputs++
  await expect(service.archiveCognitiveRawSubmission(f.identity,f.actor,{rawPayload:changed,rawSha256:canonical.canonicalHash(changed)},deps())).rejects.toMatchObject({code:'ARCHIVE_IDENTITY_CONFLICT'})
  expect(uploadInputs.length).toBe(before)
  await service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps())
  const sidecar=structuredClone(f.upload.rawPayload);sidecar.formal[0].raw.motionFrameTimesMs[1]+=0.01
  await expect(service.archiveCognitiveRawSubmission(f.identity,f.actor,{rawPayload:sidecar,rawSha256:canonical.canonicalHash(sidecar)},deps())).rejects.toMatchObject({code:'ARCHIVE_CONFLICT'})
  expect(uploadInputs.length).toBe(before+1)
 })
 it('does not hold session/raw locks over upload and gives concurrent identical uploads one final business slot',async()=>{
  const f=await completed(),barrier=deferred<void>();let entering=0,probed=false
  const {PrismaClient}=await import('@prisma/client'),probe=new PrismaClient({datasources:{db:{url:url!}}})
  beforeStore=async()=>{
   if(!probed){probed=true;await probe.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM cognitive_sessions WHERE id=${f.identity.sessionId} FOR UPDATE NOWAIT`
    await tx.$queryRaw`SELECT id FROM cognitive_raw_submissions WHERE session_id=${f.identity.sessionId} FOR UPDATE NOWAIT`
   })}
   if(++entering===2)barrier.resolve();await barrier.promise
  }
  try{
   const result=await Promise.all([service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps()),service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps())])
   expect(result[0]).toEqual(result[1]);expect(entering).toBe(2);expect(probed).toBe(true)
   const rawId=result[0].rawSubmissionId
   expect(await db.assetReference.count({where:{entityType:service.COGNITIVE_RAW_ARCHIVE_FINAL_TYPE,entityId:rawId}})).toBe(1)
   expect(await db.assetReference.count({where:{entityType:service.COGNITIVE_RAW_ARCHIVE_PENDING_TYPE,entityId:rawId}})).toBe(0)
   expect(await db.storedAsset.count({where:{scopeId:rawId}})).toBe(1)
  }finally{beforeStore=null;await probe.$disconnect()}
 })
 it('concurrent different sidecars keep one winner and discard only the unreferenced loser',async()=>{
  const f=await completed(),different=structuredClone(f.upload.rawPayload);different.formal[0].raw.motionFrameTimesMs[2]+=0.02
  const barrier=deferred<void>();let n=0;beforeStore=async()=>{if(++n===2)barrier.resolve();await barrier.promise}
  try{
   const results=await Promise.allSettled([service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps()),
    service.archiveCognitiveRawSubmission(f.identity,f.actor,{rawPayload:different,rawSha256:canonical.canonicalHash(different)},deps())])
   expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
   expect((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason).toMatchObject({code:'ARCHIVE_CONFLICT'})
   const winner=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value
   expect(await db.storedAsset.count({where:{scopeId:winner.rawSubmissionId}})).toBe(1)
   expect(await db.assetReference.count({where:{entityType:service.COGNITIVE_RAW_ARCHIVE_FINAL_TYPE,entityId:winner.rawSubmissionId}})).toBe(1)
  }finally{beforeStore=null}
 })
 it('retains pending upload registration after a simulated process cut and adopts it on retry without uploading twice',async()=>{
  const f=await completed(),before=uploadInputs.length;afterStore=async()=>{throw Error('synthetic crash after durable upload registration')}
  await expect(service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps())).rejects.toMatchObject({code:'ARCHIVE_STORAGE_UNCONFIRMED'})
  afterStore=null
  expect(await service.getCognitiveRawArchiveStatus(f.identity,f.actor,deps())).toMatchObject({archiveConfirmed:false,archiveState:'pending'})
  const done=await service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps())
  expect(done.archiveConfirmed).toBe(true);expect(uploadInputs.length-before).toBe(1)
 })
 it('rechecks the frozen authority after upload and rejects an in-flight change without changing the saved report',async()=>{
  const f=await completed(),shared=await import('../../modules/assessment-runtime/shared-cognitive-runtime')
  afterStore=async()=>{
   const loaded=await shared.loadSharedCognitiveRuntime(f.before.configSnapshotEncrypted,db)
   await db.cognitiveSession.update({where:{id:f.identity.sessionId},data:{configSnapshotEncrypted:security.encryptCognitivePayload({...loaded.snapshot!,frozenAt:'2001-01-01T00:00:00.000Z'})}})
  }
  try{
   await expect(service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps())).rejects.toMatchObject({code:'ARCHIVE_IDENTITY_CONFLICT'})
   expect((await db.cognitiveSession.findUniqueOrThrow({where:{id:f.identity.sessionId}})).resultSnapshotEncrypted).toBe(f.before.resultSnapshotEncrypted)
   const raw=await db.cognitiveRawSubmission.findUniqueOrThrow({where:{sessionId_attemptEpoch:{sessionId:f.identity.sessionId,attemptEpoch:1}}})
   expect(await db.assetReference.count({where:{entityType:service.COGNITIVE_RAW_ARCHIVE_FINAL_TYPE,entityId:raw.id}})).toBe(0)
   expect(await db.storedAsset.count({where:{scopeId:raw.id}})).toBe(0)
  }finally{afterStore=null}
 })
 it('never deletes another retention reference and restores a pending cleanup trace for a retained concurrent loser',async()=>{
  const f=await completed(),barrier=deferred<void>();let n=0
  beforeStore=async()=>{if(++n===2)barrier.resolve();await barrier.promise}
  afterStore=async asset=>{await db.assetReference.create({data:{assetId:asset.id,entityType:'ArchiveTestOtherRetention',entityId:f.identity.sessionId,field:'owned-synthetic-fixture'}})}
  try{
   const results=await Promise.all([service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps()),service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps())])
   expect(results[0]).toEqual(results[1]);const rawId=results[0].rawSubmissionId
   expect(await db.assetReference.count({where:{entityType:'ArchiveTestOtherRetention',entityId:f.identity.sessionId}})).toBe(2)
   expect(await db.assetReference.count({where:{entityType:service.COGNITIVE_RAW_ARCHIVE_FINAL_TYPE,entityId:rawId}})).toBe(1)
   expect(await db.assetReference.count({where:{entityType:service.COGNITIVE_RAW_ARCHIVE_PENDING_TYPE,entityId:rawId}})).toBe(1)
   expect(await db.storedAsset.count({where:{scopeId:rawId}})).toBe(2)
  }finally{beforeStore=null;afterStore=null}
 })
 it('core/result stays saved on storage failure; unfinished core and a local-provider lie never return COS confirmation',async()=>{
  const unfinished=await completed(false)
  await expect(service.archiveCognitiveRawSubmission(unfinished.identity,unfinished.actor,unfinished.upload,deps())).rejects.toMatchObject({code:'CORE_NOT_COMMITTED'})
  const f=await completed();beforeStore=async()=>{throw Error('synthetic COS unavailable')}
  await expect(service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps())).rejects.toMatchObject({code:'ARCHIVE_STORAGE_UNCONFIRMED'})
  beforeStore=null
  expect((await db.cognitiveSession.findUniqueOrThrow({where:{id:f.identity.sessionId}})).resultSnapshotEncrypted).toBe(f.before.resultSnapshotEncrypted)
  expect(await service.getCognitiveRawArchiveStatus(f.identity,f.actor,deps())).toMatchObject({coreSaved:true,archiveConfirmed:false})
  wrongProvider=true
  try{await expect(service.archiveCognitiveRawSubmission(f.identity,f.actor,f.upload,deps())).rejects.toMatchObject({code:'ARCHIVE_STORAGE_UNCONFIRMED'})}finally{wrongProvider=false}
  expect(await service.getCognitiveRawArchiveStatus(f.identity,f.actor,deps())).toMatchObject({archiveConfirmed:false})
 })
})
