import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
import {randomUUID,createHash} from 'node:crypto'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {nativeAntFixture} from './native-ant-fixtures.test-support'
import {nativeContentCases} from './native-content-fixtures.test-support'
import {nativeCognitiveConfigSeeds} from '../../modules/cognitive/content-candidates/native-registry/config-seeds'
import {withNativeCoreReceipt} from '../../modules/cognitive/native-final-receipt'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
const url=integrationDatabaseUrl('COGNITIVE_INTEGRATION_DB_URL'),suite=url?describe:describe.skip
suite('selected native content real isolated START / FINAL / private archive',()=>{
 let db:any,assignment:any,sessions:any,release:any,final:any,archive:any,security:any,teacher:string,student:string,outsider:string,publisher:string,courseId:string
 const prefix='native-content-'+randomUUID(),buffers=new Map<string,Buffer>(),assets:string[]=[],assignments:string[]=[],configs:string[]=[],releases:string[]=[]
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);Object.assign(process.env,{COGNITIVE_MODULE_ENABLED:'true',DATA_ENCRYPTION_KEY:'a'.repeat(64),DATA_PSEUDONYM_KEY:'b'.repeat(64)})
  db=(await import('../../config/database')).prisma
  assignment=await import('../../modules/cognitive/assignment.service');sessions=await import('../../modules/cognitive/session.service')
  release=await import('../../modules/cognitive/release.service');final=await import('../../modules/cognitive/final-submit.service')
  archive=await import('../../modules/cognitive/raw-archive.service');security=await import('../../modules/cognitive/cognitive.security')
  const actors=[]
  for(const role of ['TEACHER','STUDENT','STUDENT','ADMIN'])actors.push(await db.user.create({data:{username:prefix+'-'+randomUUID(),passwordHash:'synthetic-no-login',role,platformRole:role==='ADMIN'?'SYSTEM_ADMIN':'STANDARD',isActive:true}}))
  ;[teacher,student,outsider,publisher]=actors.map(a=>a.id)
  courseId=(await db.course.create({data:{title:prefix,courseCode:randomUUID(),creatorId:teacher}})).id
  await db.courseStudent.create({data:{courseId,studentId:student,status:'ACTIVE'}})
 },60000)
 afterAll(async()=>{
  if(!db)return
  await db.assetReference.deleteMany({where:{assetId:{in:assets}}});await db.storedAsset.deleteMany({where:{id:{in:assets}}})
  await db.cognitiveSession.deleteMany({where:{assignmentId:{in:assignments}}})
  for(const row of await db.cognitiveAssignment.findMany({where:{id:{in:assignments}}}))if(row.measurementReleaseId)releases.push(row.measurementReleaseId)
  await db.cognitiveAssignment.deleteMany({where:{id:{in:assignments}}})
  for(const row of await db.cognitiveTestConfig.findMany({where:{id:{in:configs}}}))if(row.measurementReleaseId)releases.push(row.measurementReleaseId)
  await db.cognitiveTestConfig.deleteMany({where:{id:{in:configs}}})
  // Published audit releases are immutable. Their synthetic actors remain until the disposable DB is destroyed.
  if(courseId){await db.courseStudent.deleteMany({where:{courseId}});await db.course.delete({where:{id:courseId}})}
  await db.$disconnect()
 },30000)
 it.each([...nativeContentCases,nativeAntFixture()])('$name freezes its exact profile, commits a partial result and archives identical encrypted originals',async f=>{
  const seed=nativeCognitiveConfigSeeds.find(s=>s.testType===f.name)!
  const config=await db.cognitiveTestConfig.create({data:seed});configs.push(config.id)
  await release.publishCognitiveConfig(config.id,publisher)
  const a=await assignment.createAssignment(teacher,'TEACHER',{courseId,configId:config.id,title:prefix,profile:'experience',required:true,maxAttempts:1});assignments.push(a.id)
  await assignment.publishAssignment(teacher,'TEACHER',a.id)
  const session=await sessions.createSession(student,a.id),s=session.sessionSnapshot
  // Retained synthetic raw has a fixed seed. Bind it in this disposable fixture before any trial is submitted.
  await db.cognitiveSession.update({where:{id:session.sessionId},data:{randomSeed:f.input.randomSeed}});session.randomSeed=f.input.randomSeed
  expect(session).toMatchObject({nativeTask:true,deliveryMode:'FINAL_ONLY',attemptEpoch:1})
  expect(s.configHash).toBe(f.authority.configHash)
  const manifest=f.adapter.manifest(s.config,session.randomSeed) as any,raw=structuredClone(f.name==='ant'?f.record.raw:f.input.trials[0].payload) as any
  if(f.name==='ant')raw.contextId=JSON.stringify([session.sessionId,1,s.configHash])
  else raw.plan=Array.isArray(manifest)?manifest.find((p:any)=>p.phase==='test'&&p.index===0):Array.isArray(raw.plan)?manifest.formal:manifest.formal[0]
  const trials=[f.adapter.envelope(raw)],input={sessionId:session.sessionId,submissionId:prefix+'-'+randomUUID(),attemptEpoch:1,definitionHash:s.configHash,contextSnapshotHash:session.contextSnapshotHash,trials}
  await expect(final.submitCognitiveSessionFinal(outsider,input)).rejects.toThrow(/权限|范围/)
  const committed=await final.submitCognitiveSessionFinalWithContext(student,input),receipt=withNativeCoreReceipt(committed.data,committed.internalContext,input);expect(receipt).toMatchObject({coreSaved:true,replayed:false,submissionId:input.submissionId})
  const row=await db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}}),read=await sessions.getSession(student,session.sessionId)
  const saved=read.result.report.nativeReport
  expect(saved).toMatchObject({testType:f.name,configHash:s.configHash,profile:'experience',state:read.result.quality.state,reportDefinitionVersion:f.definition.report.version})
  expect(read.result.report.qualityState).toBe(saved.state);expect(read.result).not.toHaveProperty('score')
  const again=await final.submitCognitiveSessionFinal(student,input);expect(again.replayed).toBe(true)
  expect((await sessions.getSession(student,session.sessionId)).result).toEqual(read.result)
  const context={...f.context,contextKey:JSON.stringify([session.sessionId,1,s.configHash]),randomSeed:session.randomSeed,snapshot:{schemaVersion:1,testType:s.testType,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,configVersion:s.configVersion,config:s.config,protocol:s.protocol,configHash:s.configHash,protocolSignature:s.protocolSignature,frozenAt:s.frozenAt},manifestHash:f.adapter.manifestHash(s.config,session.randomSeed),...(f.name==='ant'?{administration:(f.context as any).administration}:{})}
  const {recordDigest:_old,...recordBody}=f.record,body={...recordBody,contextKey:context.contextKey,manifestHash:context.manifestHash,raw},record={...body,recordDigest:canonicalHash(body)}
  const {finalPayloadDigest:_oldClaim,...claimBody}=f.claim,cb={...claimBody,contextKey:context.contextKey,manifestHash:context.manifestHash,recordDigests:[record.recordDigest],...(f.name==='gradcpt'?{presented:read.result.metrics.presentedImageCount}:{})}
  const detail={...f.detail,context,manifest,records:[record],claim:{...cb,finalPayloadDigest:canonicalHash(cb)}}
  const identity={sessionId:session.sessionId,attemptEpoch:1,submissionId:input.submissionId,definitionHash:s.configHash},actor={userId:student},upload={rawPayload:detail,rawSha256:canonicalHash(detail),expectedCoreHash:receipt.payloadHash}
  let fail=true,calls=0
  const store=async(value:any)=>{calls++;if(fail){fail=false;throw Error('synthetic storage failure')}
   expect(value).toMatchObject({provider:'cos',accessScope:'PRIVATE',ownerId:student})
   const asset=await db.storedAsset.create({data:{id:randomUUID(),objectKey:'assets/'+randomUUID()+'.enc',provider:'cos',accessScope:'PRIVATE',ownerId:value.ownerId,scopeId:value.scopeId,mimeType:value.mimeType,originalName:value.originalName,sizeBytes:value.buffer.length,sha256:createHash('sha256').update(value.buffer).digest('hex'),references:{create:value.initialReference}}})
   assets.push(asset.id);buffers.set(asset.id,Buffer.from(value.buffer));return asset}
  const deps={db,storeAsset:store,discardUnreferencedAsset:vi.fn()}
  await expect(archive.archiveCognitiveRawSubmission(identity,{userId:outsider},upload,deps)).rejects.toMatchObject({code:'ARCHIVE_FORBIDDEN'})
  await expect(archive.archiveCognitiveRawSubmission(identity,actor,upload,deps)).rejects.toMatchObject({code:'ARCHIVE_STORAGE_UNCONFIRMED'})
  expect((await archive.getCognitiveRawArchiveStatus(identity,actor,deps)).archiveConfirmed).toBe(false)
  const archived=await archive.archiveCognitiveRawSubmission(identity,actor,upload,deps)
  expect(archived).toMatchObject({archiveConfirmed:true,rawSha256:upload.rawSha256,coreHash:receipt.payloadHash})
  expect(await archive.archiveCognitiveRawSubmission(identity,actor,upload,deps)).toEqual(archived);expect(calls).toBe(2)
  const plaintext=security.decryptCognitivePayload(buffers.get(archived.assetId)!.toString())
  expect(plaintext.detail).toEqual(detail);expect(plaintext.authority.resultSnapshot.report.nativeReport).toEqual(saved)
  expect((await db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})).resultSnapshotEncrypted).toBe(row.resultSnapshotEncrypted)
 },30000)
})
