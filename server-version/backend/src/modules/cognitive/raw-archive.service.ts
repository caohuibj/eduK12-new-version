import {getNativeContentDefinition} from './content-candidates/native-registry/definitions'
import {nativeContentArchiveSchema,validateNativeContentArchive} from './content-candidates/native-registry/archive-detail'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { storeAsset,discardUnreferencedAsset,attachAssetReference,lockStoredAssetRows } from '../../services/assetStorage'
import { assetStorageKey } from '../../services/assetStorageKey'
import { canonicalHash,canonicalJsonBytes } from '../assessment-runtime/canonical'
import { loadSharedCognitiveRuntime } from '../assessment-runtime/shared-cognitive-runtime'
import { loadStoredUnitAdmission } from '../assessment-runtime/unit-admission'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { encryptCognitivePayload,decryptCognitivePayload } from './cognitive.security'
import { parseCognitiveResultSnapshot } from './v2/result-snapshot'
import { motTrialSchema } from './content-candidates/mot/schema'
import {ENUMERATION_RECIPE_IDENTITY} from './content-candidates/enumeration/protocol'
import {cognitiveEnumerationArchiveDetailSchema,type CognitiveEnumerationArchiveDetail} from './content-candidates/enumeration/archive-schema'

export const COGNITIVE_RAW_ARCHIVE_PENDING_TYPE='CognitiveRawArchivePending'
export const COGNITIVE_RAW_ARCHIVE_FINAL_TYPE='CognitiveRawArchive'
export const COGNITIVE_RAW_ARCHIVE_MAX_DETAIL_BYTES=8*1024*1024
export const COGNITIVE_RAW_ARCHIVE_MAX_PACKAGE_BYTES=12*1024*1024
const PREFIX='full-v1:'
const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(512)
const identitySchema=z.object({sessionId:id,attemptEpoch:z.number().int().positive(),submissionId:id,definitionHash:hash}).strict()
export type CognitiveRawArchiveIdentity=z.infer<typeof identitySchema>
export interface CognitiveRawArchiveActor { userId:string }
const rawFrames=z.object({schemaVersion:z.literal(1),trialIndex:z.number().int().min(0).max(44),
  motionFrameTimesMs:z.array(z.number().finite().nonnegative()).max(3000)}).strict()
const record=z.object({core:motTrialSchema,raw:rawFrames}).strict().superRefine((v,ctx)=>{
  if(v.core.trialIndex!==v.raw.trialIndex)ctx.addIssue({code:'custom',message:'Raw/core trial identity mismatch'})
})
export const cognitiveMotArchiveDetailSchema=z.object({schemaVersion:z.literal(1),formal:z.array(record).min(1).max(45),
  practice:z.array(record).max(100)}).strict()
export type CognitiveMotArchiveDetail=z.infer<typeof cognitiveMotArchiveDetailSchema>
const uploadSchema=z.object({rawPayload:cognitiveMotArchiveDetailSchema,rawSha256:hash,expectedCoreHash:hash.optional()}).strict()
const originalUploadSchema=z.object({rawPayload:z.unknown(),rawSha256:hash,expectedCoreHash:hash.optional()}).strict()
export interface CognitiveRawArchiveUpload {rawPayload:unknown;rawSha256:string;expectedCoreHash?:string}
export type CognitiveRawArchiveErrorCode='INVALID_ARCHIVE_PAYLOAD'|'HASH_MISMATCH'|'ARCHIVE_FORBIDDEN'|'CORE_NOT_COMMITTED'
 |'ARCHIVE_IDENTITY_CONFLICT'|'ARCHIVE_CONFLICT'|'UNSUPPORTED_ARCHIVE_SCOPE'|'ARCHIVE_STORAGE_UNCONFIRMED'
export class CognitiveRawArchiveError extends Error {
  constructor(readonly code:CognitiveRawArchiveErrorCode,readonly statusCode:number,message:string){super(message);this.name='CognitiveRawArchiveError'}
}
export interface CognitiveRawArchiveReceipt extends CognitiveRawArchiveIdentity {
  coreSaved:true;archiveState:'pending'|'confirmed';archiveConfirmed:boolean;rawSubmissionId:string;coreHash:string;
  rawSha256?:string;logicalHash?:string;assetId?:string;objectKey?:string;sha256?:string;sizeBytes?:number;
}
export interface CognitiveRawArchiveDependencies {
  db:typeof prisma;storeAsset:typeof storeAsset;discardUnreferencedAsset:typeof discardUnreferencedAsset;
}
const dependencies=(override:Partial<CognitiveRawArchiveDependencies>):CognitiveRawArchiveDependencies=>({db:prisma,storeAsset,discardUnreferencedAsset,...override})
function fail(code:CognitiveRawArchiveErrorCode,status:number,message:string):never{throw new CognitiveRawArchiveError(code,status,message)}
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex')
const parseIdentity=(input:unknown)=>{const result=identitySchema.safeParse(input);if(!result.success)fail('INVALID_ARCHIVE_PAYLOAD',400,'归档身份无效');return result.data!}
type Db=typeof prisma|Prisma.TransactionClient
async function loadAuthority(db:Db,input:CognitiveRawArchiveIdentity,actor:CognitiveRawArchiveActor){
  const session=await db.cognitiveSession.findUnique({where:{id:input.sessionId}})
  if(!session||!actor?.userId||session.userId!==actor.userId)fail('ARCHIVE_FORBIDDEN',403,'无权限归档此记录')
  if(session.compositeAttemptId||session.compositeItemId||session.accessTokenId||!session.userId)
    fail('UNSUPPORTED_ARCHIVE_SCOPE',422,'此入口暂不支持归档')
  if(session.status!=='COMPLETED'||session.runtimeGeneration!=='UNIFIED_V1'||session.deliveryMode!=='FINAL_ONLY'
    ||!session.resultSnapshotEncrypted||!session.submissionId||!hash.safeParse(session.submissionPayloadHash).success||!session.finishedAt)
    fail('CORE_NOT_COMMITTED',409,'请先确认本次作答提交成功')
  if(session.attemptNo!==input.attemptEpoch||session.submissionId!==input.submissionId)
    fail('ARCHIVE_IDENTITY_CONFLICT',409,'归档与已保存作答身份不一致')
  const content=getNativeContentDefinition(session.testType,session.engineVersion,session.scoringVersion)
  if(!(content&&content.configVersion===session.configVersion)&&session.testType!=='mot'&&(session.testType!==ENUMERATION_RECIPE_IDENTITY.testType
    ||session.engineVersion!==ENUMERATION_RECIPE_IDENTITY.engineVersion||session.scoringVersion!==ENUMERATION_RECIPE_IDENTITY.scoringVersion
    ||session.configVersion!==ENUMERATION_RECIPE_IDENTITY.configVersion))fail('UNSUPPORTED_ARCHIVE_SCOPE',422,'此任务暂不支持归档')
  const raw=await db.cognitiveRawSubmission.findUnique({where:{sessionId_attemptEpoch:{sessionId:session.id,attemptEpoch:input.attemptEpoch}}})
  if(!raw||raw.payloadSchemaVersion!==1||raw.encodingVersion!=='CANONICAL_JSON_SHA256_V1')
    fail('CORE_NOT_COMMITTED',409,'已保存原始作答不可用')
  const loaded=await loadSharedCognitiveRuntime(session.configSnapshotEncrypted,db),snapshot=loaded.snapshot
  const result=parseCognitiveResultSnapshot(decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted!))
  const admission=await loadStoredUnitAdmission(session,'归档准入快照不可用',db)
  if(!snapshot||snapshot.runtimeGeneration!=='UNIFIED_V1'||!loaded.compiledRuntime||snapshot.configHash!==input.definitionHash
    ||loaded.compiledRuntime.compiledRuntimeHash!==session.compiledRuntimeHash
    ||snapshot.testType!==session.testType||snapshot.engineVersion!==session.engineVersion||snapshot.scoringVersion!==session.scoringVersion
    ||snapshot.configVersion!==session.configVersion||result.testType!==snapshot.testType||result.engineVersion!==snapshot.engineVersion
    ||result.scoringVersion!==snapshot.scoringVersion||result.configVersion!==snapshot.configVersion||result.protocolSignature!==snapshot.protocolSignature)
    fail('ARCHIVE_IDENTITY_CONFLICT',409,'冻结身份与已保存结果不一致')
  if(!admission||admission.governance.status!=='READY'||admission.attemptEpoch!==input.attemptEpoch||admission.parent!==null
    ||admission.principal.userId!==actor.userId||!admission.cognitive||admission.cognitive.testType!==session.testType
    ||admission.cognitive.engineVersion!==session.engineVersion||admission.cognitive.scoringVersion!==session.scoringVersion
    ||admission.cognitive.configHash!==snapshot.configHash)
    fail('ARCHIVE_IDENTITY_CONFLICT',409,'归档准入身份不一致')
  const core=decryptUnifiedRuntimePayload<{schemaVersion:number;attemptEpoch:number;trials:Array<{trialIndex:number;payload:unknown}>}>(raw.payloadEncrypted)
  if(core.schemaVersion!==1||core.attemptEpoch!==input.attemptEpoch||!Array.isArray(core.trials)||core.trials.length!==raw.trialCount)
    fail('ARCHIVE_IDENTITY_CONFLICT',409,'已保存核心原件不一致')
  const authority={schemaVersion:1,session:{id:session.id,attemptEpoch:session.attemptNo,submissionId:session.submissionId,
    coreHash:session.submissionPayloadHash,testType:session.testType,configVersion:session.configVersion,engineVersion:session.engineVersion,
    scoringVersion:session.scoringVersion,randomSeed:session.randomSeed,completedAt:session.finishedAt!.toISOString(),
    compiledRuntimeHash:session.compiledRuntimeHash,admissionSnapshotHash:admission.snapshotHash},configSnapshot:snapshot,
    rawSubmission:{id:raw.id,payloadSchemaVersion:raw.payloadSchemaVersion,encodingVersion:raw.encodingVersion,
      createdAt:raw.createdAt.toISOString(),payload:core},resultSnapshot:result}
  const guard=canonicalHash({id:session.id,epoch:session.attemptNo,status:session.status,submission:session.submissionId,hash:session.submissionPayloadHash,
    config:session.configSnapshotEncrypted,result:session.resultSnapshotEncrypted,admission:session.frozenAdmissionSnapshotEncrypted,
    admissionHash:session.frozenAdmissionSnapshotHash,rawId:raw.id,raw:raw.payloadEncrypted})
  return {session,raw,core,authority,authorityHash:canonicalHash(authority),guard}
}
type Authority=Awaited<ReturnType<typeof loadAuthority>>
type Asset=Prisma.StoredAssetGetPayload<{}>
type Reference=Prisma.AssetReferenceGetPayload<{}>
const fieldFor=(authorityHash:string,rawSha:string,logicalHash:string)=>`${PREFIX}${authorityHash}:${rawSha}:${logicalHash}`
function fieldParts(field:string){const m=/^full-v1:([a-f0-9]{64}):([a-f0-9]{64}):([a-f0-9]{64})$/.exec(field);return m?{authorityHash:m[1],rawSha256:m[2],logicalHash:m[3]}:null}
function assertAsset(asset:Asset,a:Authority,actor:CognitiveRawArchiveActor){
  if(asset.provider!=='cos'||asset.accessScope!=='PRIVATE'||asset.ownerId!==actor.userId||asset.scopeId!==a.raw.id
    ||asset.deletedAt||!hash.safeParse(asset.sha256).success||asset.sizeBytes<1)
    fail('ARCHIVE_STORAGE_UNCONFIRMED',503,'原件存储尚未确认')
  const key=assetStorageKey(asset)
  if(!/^assets\/[A-Za-z0-9_.-]+$/.test(key))fail('ARCHIVE_STORAGE_UNCONFIRMED',503,'原件存储身份无效')
}
function receipt(a:Authority,input:CognitiveRawArchiveIdentity,ref?:Reference,asset?:Asset):CognitiveRawArchiveReceipt{
  const binding=ref?fieldParts(ref.field):null
  return {...input,coreSaved:true,archiveState:binding&&asset?'confirmed':'pending',archiveConfirmed:!!(binding&&asset),rawSubmissionId:a.raw.id,
    coreHash:a.session.submissionPayloadHash!,...(binding&&asset?{rawSha256:binding.rawSha256,logicalHash:binding.logicalHash,
      assetId:asset.id,objectKey:assetStorageKey(asset),sha256:asset.sha256,sizeBytes:asset.sizeBytes}:{})}
}
async function locked<T>(deps:CognitiveRawArchiveDependencies,input:CognitiveRawArchiveIdentity,actor:CognitiveRawArchiveActor,
  original:Authority,run:(tx:Prisma.TransactionClient,a:Authority)=>Promise<T>):Promise<T>{
  return deps.db.$transaction(async tx=>{
    await tx.$executeRaw(Prisma.sql`SET LOCAL lock_timeout = '2s'`)
    await tx.$queryRaw(Prisma.sql`SELECT id FROM cognitive_sessions WHERE id=${input.sessionId} FOR UPDATE`)
    await tx.$queryRaw(Prisma.sql`SELECT id FROM cognitive_raw_submissions WHERE id=${original.raw.id} FOR UPDATE`)
    const current=await loadAuthority(tx,input,actor)
    if(current.guard!==original.guard)fail('ARCHIVE_IDENTITY_CONFLICT',409,'已保存作答在归档期间发生变化')
    return run(tx,current)
  },{maxWait:3000,timeout:10000})
}
async function existingFinal(tx:Prisma.TransactionClient,a:Authority,input:CognitiveRawArchiveIdentity,actor:CognitiveRawArchiveActor){
  const refs=await tx.assetReference.findMany({where:{entityType:COGNITIVE_RAW_ARCHIVE_FINAL_TYPE,entityId:a.raw.id,field:{startsWith:PREFIX}}})
  if(refs.length>1)fail('ARCHIVE_CONFLICT',409,'存在冲突归档记录')
  if(!refs.length)return null
  const ref=refs[0],binding=fieldParts(ref.field)
  if(!binding||binding.authorityHash!==a.authorityHash)fail('ARCHIVE_IDENTITY_CONFLICT',409,'归档已保存身份不匹配')
  await lockStoredAssetRows(tx,[ref.assetId])
  const asset=await tx.storedAsset.findUnique({where:{id:ref.assetId}})
  if(!asset)fail('ARCHIVE_STORAGE_UNCONFIRMED',503,'原件存储尚未确认')
  assertAsset(asset!,a,actor)
  return {ref,asset:asset!,binding,receipt:receipt(a,input,ref,asset!)}
}
/** Remove only an owned pending pointer. The shared discard helper protects every remaining reference/physical key. */
async function cleanupPending(deps:CognitiveRawArchiveDependencies,ref:Reference,asset:Asset,a:Authority,actor:CognitiveRawArchiveActor){
  let detached=false
  try{
    await deps.db.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT id FROM cognitive_raw_submissions WHERE id=${a.raw.id} FOR UPDATE`)
      await lockStoredAssetRows(tx,[asset.id])
      const stored=await tx.storedAsset.findUnique({where:{id:asset.id}})
      if(!stored)return
      assertAsset(stored,a,actor)
      const removed=await tx.assetReference.deleteMany({where:{id:ref.id,assetId:asset.id,entityType:COGNITIVE_RAW_ARCHIVE_PENDING_TYPE,entityId:a.raw.id,field:ref.field}})
      detached=removed.count===1
    })
    if(!detached)return
    const discarded=await deps.discardUnreferencedAsset(asset)
    if(discarded)return // Existing helper confirms logical deletion only; no physical-delete claim is made here.
    const remaining=await deps.db.storedAsset.findUnique({where:{id:asset.id}})
    if(remaining&&!remaining.deletedAt&&!await deps.db.assetReference.count({where:{assetId:asset.id,entityType:COGNITIVE_RAW_ARCHIVE_FINAL_TYPE}}))
      await attachAssetReference({assetId:asset.id,entityType:COGNITIVE_RAW_ARCHIVE_PENDING_TYPE,entityId:a.raw.id,field:ref.field},deps.db)
  }catch{
    if(detached)try{await attachAssetReference({assetId:asset.id,entityType:COGNITIVE_RAW_ARCHIVE_PENDING_TYPE,entityId:a.raw.id,field:ref.field},deps.db)}catch{/* Retain core/result; never fabricate cleanup success. */}
  }
}
export async function getCognitiveRawArchiveStatus(inputValue:CognitiveRawArchiveIdentity,actor:CognitiveRawArchiveActor,
  override:Partial<CognitiveRawArchiveDependencies>={}):Promise<CognitiveRawArchiveReceipt>{
  const input=parseIdentity(inputValue),deps=dependencies(override),a=await loadAuthority(deps.db,input,actor)
  return locked(deps,input,actor,a,async(tx,current)=>{
    const final=await existingFinal(tx,current,input,actor)
    return final?.receipt??receipt(current,input)
  })
}
export async function archiveCognitiveRawSubmission(inputValue:CognitiveRawArchiveIdentity,actor:CognitiveRawArchiveActor,
  uploadValue:CognitiveRawArchiveUpload,override:Partial<CognitiveRawArchiveDependencies>={}):Promise<CognitiveRawArchiveReceipt>{
  const input=parseIdentity(inputValue),original=originalUploadSchema.safeParse(uploadValue)
  if(!original.success)fail('INVALID_ARCHIVE_PAYLOAD',400,'归档内容无效')
  const isContent=nativeContentArchiveSchema.safeParse(original.data.rawPayload).success
  const isEnumeration=Boolean(original.data.rawPayload&&typeof original.data.rawPayload==='object'&&'artifact' in original.data.rawPayload)
  // Preserve the historical MOT parser. Enumeration validators never replace original nested objects.
  const parsed=isEnumeration||isContent?original:uploadSchema.safeParse(uploadValue)
  if(!parsed.success||(isEnumeration&&!cognitiveEnumerationArchiveDetailSchema.safeParse(original.data.rawPayload).success))
    fail('INVALID_ARCHIVE_PAYLOAD',400,'归档内容无效')
  const upload=parsed.data!,rawBytes=canonicalJsonBytes(upload.rawPayload)
  if(rawBytes.length>COGNITIVE_RAW_ARCHIVE_MAX_DETAIL_BYTES)fail('INVALID_ARCHIVE_PAYLOAD',413,'归档内容超出限制')
  if(digest(rawBytes)!==upload.rawSha256)fail('HASH_MISMATCH',400,'原件校验不一致')
  const deps=dependencies(override),a=await loadAuthority(deps.db,input,actor)
  if(upload.expectedCoreHash&&upload.expectedCoreHash!==a.session.submissionPayloadHash)
    fail('ARCHIVE_IDENTITY_CONFLICT',409,'已提交核心校验不一致')
  if(isContent){
    try{validateNativeContentArchive(upload.rawPayload,{sessionId:a.session.id,attemptEpoch:input.attemptEpoch,randomSeed:a.session.randomSeed,testType:a.session.testType,
      engineVersion:a.session.engineVersion,scoringVersion:a.session.scoringVersion,configVersion:a.session.configVersion,
      config:a.authority.configSnapshot.config,protocol:a.authority.configSnapshot.protocol,configHash:a.authority.configSnapshot.configHash,protocolSignature:a.authority.configSnapshot.protocolSignature,
      trials:a.core.trials,presentedImageCount:a.authority.resultSnapshot.metrics.presentedImageCount})}
    catch{fail('ARCHIVE_IDENTITY_CONFLICT',409,'完整原件与已保存任务记录不一致')}
  }else if(isEnumeration){
    const detail=upload.rawPayload as CognitiveEnumerationArchiveDetail,A=detail.artifact,C=A.context
    if(a.session.testType!==ENUMERATION_RECIPE_IDENTITY.testType||C.attemptId!==JSON.stringify([a.session.id,input.attemptEpoch])
      ||C.randomSeed!==a.session.randomSeed||canonicalHash(C.config)!==canonicalHash(a.authority.configSnapshot.config)
      ||canonicalHash(C.recipe)!==canonicalHash(C.config.stimulusRecipe))
      fail('ARCHIVE_IDENTITY_CONFLICT',409,'完整原件与冻结设置不一致')
    const {artifactHash,...artifactBody}=A
    if(digest(Buffer.from(JSON.stringify(artifactBody),'utf8'))!==artifactHash)
      fail('HASH_MISMATCH',400,'刺激原件校验不一致')
    const seen=new Set<string>()
    for(const saved of [...detail.formal,...detail.practice]){
      const r=saved.record,t=r.core
      if(digest(Buffer.from(JSON.stringify(r),'utf8'))!==saved.recordHash)fail('HASH_MISMATCH',400,'逐轮原件校验不一致')
      if(r.contextId!==C.contextId||r.attemptId!==C.attemptId||r.artifactHash!==A.artifactHash||seen.has(r.exposureId)
        ||t.plan.sequenceSeed!==a.session.randomSeed
        ||(t.calibrationReference!==null&&t.calibrationReference!==C.calibration?.id)
        ||(t.renderedStimulusReference!==null&&t.renderedStimulusReference!==A.artifactHash))
        fail('ARCHIVE_IDENTITY_CONFLICT',409,'逐轮原件引用不一致')
      seen.add(r.exposureId)
    }
    if(detail.formal.length!==a.core.trials.length||detail.formal.some((v,index)=>v.record.core.plan.trialIndex!==index
      ||a.core.trials[index]?.trialIndex!==index||canonicalHash(v.record.core)!==canonicalHash(a.core.trials[index]?.payload)))
      fail('ARCHIVE_IDENTITY_CONFLICT',409,'完整原件与已保存核心作答不一致')
  }else{
    const detail=upload.rawPayload as CognitiveMotArchiveDetail
    if(a.session.testType!=='mot'||detail.formal.length!==a.core.trials.length||detail.formal.some((value,index)=>
      value.core.trialIndex!==index||a.core.trials[index]?.trialIndex!==index||canonicalHash(value.core)!==canonicalHash(a.core.trials[index]?.payload)))
      fail('ARCHIVE_IDENTITY_CONFLICT',409,'完整原件与已保存核心作答不一致')
  }
  const fullPackage={schemaVersion:1,kind:'COGNITIVE_FULL_RAW_ARCHIVE',authority:a.authority,detail:upload.rawPayload}
  const fullBytes=canonicalJsonBytes(fullPackage)
  if(fullBytes.length>COGNITIVE_RAW_ARCHIVE_MAX_PACKAGE_BYTES)fail('INVALID_ARCHIVE_PAYLOAD',413,'完整归档超出限制')
  const logicalHash=digest(fullBytes),field=fieldFor(a.authorityHash,upload.rawSha256,logicalHash)
  const preflight=await locked(deps,input,actor,a,async(tx,current)=>{
    const final=await existingFinal(tx,current,input,actor)
    if(final){if(final.ref.field!==field)fail('ARCHIVE_CONFLICT',409,'本次作答已有不同完整原件');return final.receipt}
    const pending=await tx.assetReference.findFirst({where:{entityType:COGNITIVE_RAW_ARCHIVE_PENDING_TYPE,entityId:a.raw.id,field},orderBy:{createdAt:'asc'}})
    if(!pending)return null
    await lockStoredAssetRows(tx,[pending.assetId]);const asset=await tx.storedAsset.findUnique({where:{id:pending.assetId}})
    if(!asset)fail('ARCHIVE_STORAGE_UNCONFIRMED',503,'待归档原件不可用')
    assertAsset(asset!,current,actor)
    const retained=await attachAssetReference({assetId:asset!.id,entityType:COGNITIVE_RAW_ARCHIVE_FINAL_TYPE,entityId:a.raw.id,field},tx)
    await tx.assetReference.deleteMany({where:{id:pending.id,assetId:asset!.id,entityType:COGNITIVE_RAW_ARCHIVE_PENDING_TYPE,entityId:a.raw.id,field}})
    return receipt(current,input,retained,asset!)
  })
  if(preflight)return preflight
  // Encryption and COS upload occur outside every archive parent transaction.
  const buffer=Buffer.from(encryptCognitivePayload(fullPackage),'utf8'),expectedSha=digest(buffer)
  let asset:Awaited<ReturnType<typeof storeAsset>>
  try{asset=await deps.storeAsset({buffer,originalName:'cognitive-raw-v1.enc',mimeType:'application/octet-stream',ownerId:actor.userId,
    accessScope:'PRIVATE',scopeId:a.raw.id,provider:'cos',initialReference:{entityType:COGNITIVE_RAW_ARCHIVE_PENDING_TYPE,entityId:a.raw.id,field}})}
  catch{fail('ARCHIVE_STORAGE_UNCONFIRMED',503,'原件归档尚未确认，请保留这台设备上的记录并重试')}
  const pending=await deps.db.assetReference.findFirst({where:{assetId:asset!.id,entityType:COGNITIVE_RAW_ARCHIVE_PENDING_TYPE,entityId:a.raw.id,field}})
  if(!pending)fail('ARCHIVE_STORAGE_UNCONFIRMED',503,'待归档保留记录尚未确认')
  try{
    const result=await locked(deps,input,actor,a,async(tx,current)=>{
      const final=await existingFinal(tx,current,input,actor)
      if(final){if(final.ref.field!==field)fail('ARCHIVE_CONFLICT',409,'本次作答已有不同完整原件');return final.receipt}
      await lockStoredAssetRows(tx,[asset!.id]);const stored=await tx.storedAsset.findUnique({where:{id:asset!.id}})
      if(!stored)fail('ARCHIVE_STORAGE_UNCONFIRMED',503,'原件存储尚未确认')
      assertAsset(stored!,current,actor)
      if(stored!.sha256!==expectedSha||stored!.sizeBytes!==buffer.length)fail('ARCHIVE_STORAGE_UNCONFIRMED',503,'归档字节校验不一致')
      const retained=await attachAssetReference({assetId:stored!.id,entityType:COGNITIVE_RAW_ARCHIVE_FINAL_TYPE,entityId:a.raw.id,field},tx)
      await tx.assetReference.deleteMany({where:{id:pending.id,assetId:stored!.id,entityType:COGNITIVE_RAW_ARCHIVE_PENDING_TYPE,entityId:a.raw.id,field}})
      return receipt(current,input,retained,stored!)
    })
    if(result.assetId!==asset!.id)await cleanupPending(deps,pending,asset!,a,actor)
    return result
  }catch(error){await cleanupPending(deps,pending,asset!,a,actor);throw error}
}
