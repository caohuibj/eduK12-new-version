import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest'
import {randomUUID,createHash} from 'node:crypto'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
const url=integrationDatabaseUrl('COGNITIVE_ENUM_ARCHIVE_DB_URL'),suite=url?describe:describe.skip
suite('Enumeration existing v1 originals upload encryption and readback',()=>{
 let db:(typeof import('../../config/database'))['prisma'],teacher:string,student:string,publisher:string,courseId:string,configId:string,assignmentId:string
 const assetIds:string[]=[],releaseIds:string[]=[],prefix='enum-archive-'+randomUUID()
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  if(new URL(url!).searchParams.get('schema')!=='cognitive_enum_archive_20261026')throw Error('Dedicated enumeration archive schema required')
  process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64);process.env.COGNITIVE_MODULE_ENABLED='true'
  db=(await import('../../config/database')).prisma
  expect((await db.$queryRaw<Array<{schema:string}>>`SELECT current_schema() AS schema`)[0].schema).toBe('cognitive_enum_archive_20261026')
  for(const role of ['TEACHER','STUDENT','ADMIN'] as const){const u=await db.user.create({data:{username:prefix+'-'+role,passwordHash:'synthetic-not-login',role,isActive:true,teacherApproved:true,platformRole:role==='ADMIN'?'SYSTEM_ADMIN':'STANDARD'}})
   if(role==='TEACHER')teacher=u.id;else if(role==='STUDENT')student=u.id;else publisher=u.id}
  courseId=(await db.course.create({data:{title:prefix,courseCode:randomUUID(),creatorId:teacher}})).id
  await db.courseStudent.create({data:{courseId,studentId:student,status:'ACTIVE'}})
  const seeded=await(await import('../../../prisma/seeds/native-cognitive')).seedNativeEnumerationConfig(db)
  expect(seeded.created).toBe(true);configId=seeded.config.id
  await(await import('../../modules/cognitive/release.service')).publishCognitiveConfig(configId,publisher)
 },30000)
 afterAll(async()=>{
  if(!db)return
  if(assetIds.length){await db.assetReference.deleteMany({where:{assetId:{in:assetIds}}});await db.storedAsset.deleteMany({where:{id:{in:assetIds}}})}
  if(assignmentId){await db.cognitiveSession.deleteMany({where:{assignmentId}});const a=await db.cognitiveAssignment.findUnique({where:{id:assignmentId}});if(a?.measurementReleaseId)releaseIds.push(a.measurementReleaseId);await db.cognitiveAssignment.deleteMany({where:{id:assignmentId}})}
  if(configId){const c=await db.cognitiveTestConfig.findUnique({where:{id:configId}});if(c?.measurementReleaseId)releaseIds.push(c.measurementReleaseId);await db.cognitiveTestConfig.deleteMany({where:{id:configId}})}
  if(releaseIds.length)await db.$executeRawUnsafe('DELETE FROM measurement_content_releases WHERE id = ANY($1::text[])',releaseIds)
  if(courseId){await db.courseStudent.deleteMany({where:{courseId}});await db.course.deleteMany({where:{id:courseId}})}
  await db.user.deleteMany({where:{id:{in:[teacher,student,publisher].filter(Boolean)}}});await db.$disconnect()
 },30000)
 it('uploads already committed originals without reordering candidate hashes or modifying the saved report',async()=>{
  const protocol=await import('../../modules/cognitive/content-candidates/enumeration/protocol'),envelopes=await import('../../modules/cognitive/content-candidates/enumeration/trial-envelope')
  const assignments=await import('../../modules/cognitive/assignment.service'),sessions=await import('../../modules/cognitive/session.service')
  const archive=await import('../../modules/cognitive/raw-archive.service'),canonical=await import('../../modules/assessment-runtime/canonical'),security=await import('../../modules/cognitive/cognitive.security')
  const {EnumerationCapture}=await import('../../../../frontend/src/modules/cognitive/tasks/enumeration/capture')
  const {enumerationArtifact,enumerationDigest}=await import('../../../../frontend/src/modules/cognitive/tasks/enumeration/display')
  const config=protocol.enumerationRecipeConfig('experience')
  const assignment=await assignments.createAssignment(teacher,'TEACHER',{courseId,configId,title:prefix,profile:'experience',required:true,maxAttempts:1});assignmentId=assignment.id
  await assignments.publishAssignment(teacher,'TEACHER',assignment.id)
  const session=await sessions.createSession(student,assignment.id),attemptId=JSON.stringify([session.sessionId,session.attemptEpoch])
  const context={contextId:prefix,attemptId,usage:'AUTHENTICATED_CONTENT_CANDIDATE' as const,config,randomSeed:session.randomSeed,language:'zh' as const,
   calibration:{id:prefix+'-calibration',source:'self_reported_ruler_and_distance' as const,referenceMm:50,referenceCssPx:200,viewingDistanceMm:350,viewportWidthCssPx:820,viewportHeightCssPx:1180,devicePixelRatio:2,visualViewportScale:1},recipe:config.stimulusRecipe}
  const artifact=enumerationArtifact(context)
  const capture=(index:number,phase:'test'|'practice')=>{
   const plan=protocol.enumerationRecipePlan(config,session.randomSeed,index,phase),c=new EnumerationCapture(context,plan,phase+'-'+index,artifact.artifactHash)
   const start=index*4000;c.frame(start);c.frame(start+1000);c.frame(start+(phase==='test'?1050:2000));c.frame(start+(phase==='test'?2050:3000))
   if(phase==='practice'&&index===2)c.interrupt('window_blur',start+3100)
   else c.confirm('touch',start+(phase==='test'?2200:3200))
   const record=c.record();if(phase==='practice'&&index===2){record.core.calibrationReference=null;record.core.renderedStimulusReference=null}
   return {record,recordHash:enumerationDigest(record)}
  }
  const formal=Array.from({length:25},(_,i)=>capture(i,'test')),practice=Array.from({length:3},(_,i)=>capture(i,'practice'))
  const rawPayload={schemaVersion:1 as const,artifact,formal,practice},originalJson=JSON.stringify(rawPayload)
  const identity={sessionId:session.sessionId,attemptEpoch:session.attemptEpoch,submissionId:prefix+'-'+randomUUID(),definitionHash:session.definitionHash!}
  await(await import('../../modules/cognitive/final-submit.service')).submitCognitiveSessionFinal(student,{...identity,contextSnapshotHash:session.contextSnapshotHash,
   trials:formal.map(r=>envelopes.enumerationTrialEnvelope(r.record.core as any))})
  const before=await db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})
  expect(before.status).toBe('COMPLETED');expect(before.resultSnapshotEncrypted).toBeTruthy()
  let ciphertext:Buffer|undefined,uploadCount=0
  const fakeStore:typeof import('../../services/assetStorage')['storeAsset']=async input=>{
   uploadCount++;expect(input.provider).toBe('cos');expect(input.accessScope).toBe('PRIVATE');expect(input.initialReference?.entityType).toBe('CognitiveRawArchivePending')
   ciphertext=Buffer.from(input.buffer);const id=randomUUID()
   const asset=await db.storedAsset.create({data:{id,objectKey:'assets/'+id+'.enc',provider:'cos',accessScope:'PRIVATE',ownerId:input.ownerId,scopeId:input.scopeId,mimeType:input.mimeType,originalName:input.originalName,
    sizeBytes:input.buffer.length,sha256:createHash('sha256').update(input.buffer).digest('hex'),references:{create:input.initialReference!}}});assetIds.push(id);return asset
  }
  const upload={rawPayload,rawSha256:canonical.canonicalHash(rawPayload)},receipt=await archive.archiveCognitiveRawSubmission(identity,{userId:student},upload,{db,storeAsset:fakeStore})
  expect(receipt).toMatchObject({coreSaved:true,archiveConfirmed:true,rawSha256:upload.rawSha256});expect(uploadCount).toBe(1)
  const full=security.decryptCognitivePayload<any>(ciphertext!.toString('utf8'))
  expect(JSON.stringify(full.detail)).toBe(originalJson)
  const {artifactHash,...body}=full.detail.artifact;expect(enumerationDigest(body)).toBe(artifactHash)
  for(const r of [...full.detail.formal,...full.detail.practice])expect(enumerationDigest(r.record)).toBe(r.recordHash)
  expect(full.detail.practice[2].record.core.calibrationReference).toBeNull();expect(full.detail.practice[2].record.raw.completion).toBe('interrupted')
  expect(full.authority.rawSubmission.payload.trials.map((t:any)=>t.payload)).toEqual(formal.map(r=>r.record.core))
  expect(full.authority.session).toMatchObject({id:session.sessionId,attemptEpoch:session.attemptEpoch,randomSeed:session.randomSeed})
  expect(full.authority.configSnapshot.config).toEqual(config)
  expect(canonical.canonicalHash(full)).toBe(receipt.logicalHash)
  expect(await archive.getCognitiveRawArchiveStatus(identity,{userId:student},{db})).toEqual(receipt)
  expect((await db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})).resultSnapshotEncrypted).toBe(before.resultSnapshotEncrypted)
  expect(JSON.stringify(rawPayload)).toBe(originalJson)
 },30000)
})
