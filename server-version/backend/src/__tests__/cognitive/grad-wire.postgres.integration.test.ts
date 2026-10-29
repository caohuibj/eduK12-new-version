import {describe,it,expect,vi} from 'vitest'
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {randomUUID,createHash} from 'node:crypto'
import type {Prisma} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {canonicalHash,canonicalJsonBytes} from '../../modules/assessment-runtime/canonical'
import {decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {nativeCognitiveConfigSeeds} from '../../modules/cognitive/content-candidates/native-registry/config-seeds'
import {completionFromNativeClaim} from '../../modules/cognitive/native-completion'
import {gradEnvelope} from '../../modules/cognitive/content-candidates/gradcpt/scorer'
import {decodeGradSubmission} from '../../modules/cognitive/content-candidates/gradcpt/wire'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
const url=integrationDatabaseUrl('COGNITIVE_INTEGRATION_DB_URL'),suite=url?describe:describe.skip
const docs=resolve(__dirname,'../../../../../docs/cognitive-library/onboarding-content-20261028/parallel-review')
suite('Grad lossless wire real isolated consumer',()=>{
 it('commits one formerly oversized research record and archives the identical original without changing limits',async()=>{
  requireIsolatedReleaseDatabase(url!);Object.assign(process.env,{COGNITIVE_MODULE_ENABLED:'true',DATA_ENCRYPTION_KEY:'a'.repeat(64),DATA_PSEUDONYM_KEY:'b'.repeat(64)})
  const db=(await import('../../config/database')).prisma
  const assignment=await import('../../modules/cognitive/assignment.service'),sessions=await import('../../modules/cognitive/session.service'),release=await import('../../modules/cognitive/release.service'),final=await import('../../modules/cognitive/final-submit.service'),archive=await import('../../modules/cognitive/raw-archive.service'),security=await import('../../modules/cognitive/cognitive.security')
  const prefix='grad-wire-'+randomUUID(),actors=[]
  try{
   for(const role of ['TEACHER','STUDENT','ADMIN'] as const)actors.push(await db.user.create({data:{username:prefix+'-'+role,passwordHash:'synthetic-no-login',role,platformRole:role==='ADMIN'?'SYSTEM_ADMIN':'STANDARD',isActive:true}}))
   const [teacher,student,publisher]=actors,course=await db.course.create({data:{title:prefix,courseCode:randomUUID(),creatorId:teacher.id}})
   await db.courseStudent.create({data:{courseId:course.id,studentId:student.id,status:'ACTIVE'}})
   const seed=nativeCognitiveConfigSeeds.find(s=>s.testType==='gradcpt')!
   const config=await db.cognitiveTestConfig.findUnique({where:{testType_configVersion:{testType:seed.testType,configVersion:seed.configVersion}}}) ?? await db.cognitiveTestConfig.create({data:{...seed,config:seed.config as Prisma.InputJsonValue}})
   if(config.status==='DRAFT')await release.publishCognitiveConfig(config.id,publisher.id)
   const a=await assignment.createAssignment(teacher.id,'TEACHER',{courseId:course.id,configId:config.id,title:prefix,profile:'research',required:true,maxAttempts:1})
   await assignment.publishAssignment(teacher.id,'TEACHER',a.id)
   const session=await sessions.createSession(student.id,a.id),s=session.sessionSnapshot!
   const fixturePath=resolve(docs,'grad-transport/raw/research-240-archive.json.gz'),detail=JSON.parse(gunzipSync(readFileSync(fixturePath)).toString('utf8'))
   expect(s.configHash).toBe(detail.context.snapshot.configHash)
   await db.cognitiveSession.update({where:{id:session.sessionId},data:{randomSeed:detail.context.randomSeed}})
   const contextKey=JSON.stringify([session.sessionId,session.attemptEpoch,s.configHash])
   detail.context.contextKey=contextKey;detail.context.snapshot={schemaVersion:1,testType:s.testType,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,configVersion:s.configVersion,config:s.config,protocol:s.protocol,configHash:s.configHash,protocolSignature:s.protocolSignature,frozenAt:s.frozenAt}
   detail.records=detail.records.map((r:any)=>{const {recordDigest:old,...body}=r,next={...body,contextKey};return {...next,recordDigest:canonicalHash(next)}})
   const {finalPayloadDigest:oldClaim,...oldBody}=detail.claim,body={...oldBody,contextKey,recordDigests:detail.records.map((r:any)=>r.recordDigest)}
   detail.claim={...body,finalPayloadDigest:canonicalHash(body)}
   const raw=detail.records.find((r:any)=>r.phase==='test').raw,rawHash=canonicalHash(raw),nativeCompletion=completionFromNativeClaim(detail.claim)
   const base={sessionId:session.sessionId,submissionId:prefix+'-final',attemptEpoch:session.attemptEpoch,definitionHash:s.configHash,contextSnapshotHash:session.contextSnapshotHash,nativeCompletion}
   const oldTrials=[gradEnvelope(raw)],oldBytes=canonicalJsonBytes({trials:oldTrials,nativeCompletion}).byteLength
   expect(oldBytes).toBeGreaterThan(1536*1024)
   await expect(final.submitCognitiveSessionFinal(student.id,{...base,trials:oldTrials})).rejects.toMatchObject({code:'SUBMISSION_PAYLOAD_TOO_LARGE',statusCode:413})
   const envelope=JSON.parse(gunzipSync(readFileSync(resolve(docs,'grad-transport/browser-wire-envelope.json.gz'))).toString('utf8')),trials=[envelope],wireBytes=canonicalJsonBytes({trials,nativeCompletion}).byteLength
   expect(wireBytes).toBeLessThan(1536*1024);expect(canonicalHash(decodeGradSubmission(envelope.payload))).toBe(rawHash)
   const saved=await final.submitCognitiveSessionFinal(student.id,{...base,trials}),row=await db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})
   const coreRow=await db.cognitiveRawSubmission.findUniqueOrThrow({where:{sessionId_attemptEpoch:{sessionId:session.sessionId,attemptEpoch:session.attemptEpoch}}}),core=decryptUnifiedRuntimePayload<any>(coreRow.payloadEncrypted)
   expect(core.trials[0].payload).toEqual(envelope.payload);expect(canonicalHash(decodeGradSubmission(core.trials[0].payload))).toBe(rawHash)
   const result=(await sessions.getSession(student.id,session.sessionId) as {result:any}).result
   expect(result.quality.state).toBe('interpretable');expect(result.metrics.presentedImageCount).toBe(300);expect(result.report.nativeReport.state).toBe(result.quality.state)
   const exported=await (await import('../../modules/cognitive/export.service')).getCognitiveExportData(a.id,{detail:'full',anonymize:true})
   expect(exported.fields.some(field=>field.name==='T001_frames')).toBe(true)
   expect(canonicalHash(JSON.parse(String(exported.rows[0].T001_frames)))).toBe(canonicalHash(raw.frames))
   expect(exported.fields.some(field=>field.name==='T001_data')).toBe(false)
   let archivedBytes=0
   const deps={db,storeAsset:vi.fn(async(value:any)=>{
    const plaintext=security.decryptCognitivePayload<any>(value.buffer.toString());archivedBytes=canonicalJsonBytes(plaintext).byteLength
    expect(canonicalHash(plaintext.detail.records.find((r:any)=>r.phase==='test').raw)).toBe(rawHash)
    expect(plaintext.authority.resultSnapshot.report.nativeReport).toEqual(result.report.nativeReport)
    return db.storedAsset.create({data:{id:randomUUID(),objectKey:'assets/'+randomUUID()+'.enc',provider:'cos',accessScope:'PRIVATE',ownerId:student.id,scopeId:value.scopeId,mimeType:value.mimeType,originalName:value.originalName,sizeBytes:value.buffer.length,sha256:createHash('sha256').update(value.buffer).digest('hex'),references:{create:value.initialReference}}})
   }),discardUnreferencedAsset:vi.fn()}
   const identity={sessionId:session.sessionId,attemptEpoch:session.attemptEpoch,submissionId:base.submissionId,definitionHash:s.configHash}
   const uploaded=await archive.archiveCognitiveRawSubmission(identity,{userId:student.id},{rawPayload:detail,rawSha256:canonicalHash(detail),expectedCoreHash:saved.payloadHash},deps)
   expect(uploaded.archiveConfirmed).toBe(true);expect(deps.storeAsset).toHaveBeenCalledTimes(1)
   expect((await db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})).resultSnapshotEncrypted).toBe(row.resultSnapshotEncrypted)
   writeFileSync(resolve(docs,'grad-transport/real-wire-result.json'),JSON.stringify({synthetic:true,fixture:'raw/research-240-archive.json.gz',fixtureSha256:createHash('sha256').update(readFileSync(fixturePath)).digest('hex'),rawHash,frameCount:raw.frames.length,oldBytes,wireBytes,archivedBytes,coreHash:saved.payloadHash,nativeCompletion:core.nativeCompletion,quality:result.quality,metrics:result.metrics,publicReport:result.report.nativeReport,scope:'one new affected wire FINAL/DB/private-store consumer; no original task replay, physical timing claim or COS re-score'},null,2)+'\n')
  }finally{await db.$disconnect()}
 },60000)
})
