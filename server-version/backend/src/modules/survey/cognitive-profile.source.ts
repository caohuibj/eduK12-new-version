import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {loadCognitiveProfileArtifact} from '../assessment-authorization/cognitive-profile-artifact'
import {readApprovedCognitiveProfileArtifact} from '../assessment-authorization/cognitive-profile-approved-source'
import {cognitiveProfilePolicyIdentity} from '../assessment-authorization/cognitive-profile-source'
import {getContentRelease} from '../measurement-content/repository'
import {compileSurveyCognitiveProfile,surveyCognitiveProfilePointer,surveyCognitiveProfilePointerSchema,surveyCognitiveProfileDraftSchema,assertSurveyCognitiveProfileExecutable} from './cognitive-profile.definition'
import type {CatalogSourceRef,CatalogSourceSnapshot} from './catalog.sources'
const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/),profile=z.enum(['experience','standard','research'])
export const SURVEY_PROFILE_ADAPTER='survey-cognitive-profile-v1' as const
export function isSurveyCognitiveProfileRef(ref:CatalogSourceRef){return ref.kind==='COGNITIVE'&&ref.sourceId.startsWith('cognitive-profile:')}
export function parseSurveyCognitiveProfileRef(ref:CatalogSourceRef){
 const [prefix,configId,selected,...extra]=ref.sourceId.split(':')
 if(ref.kind!=='COGNITIVE'||prefix!=='cognitive-profile'||extra.length||ref.organizationId)throw Error('Survey 精确 profile 来源身份不合法')
 return {configId:id.parse(configId),profile:profile.parse(selected),artifactHash:hash.parse(ref.sourceVersion)}
}
export async function readSurveyCognitiveProfileSource(tx:Prisma.TransactionClient,ref:CatalogSourceRef):Promise<CatalogSourceSnapshot>{
 const source=parseSurveyCognitiveProfileRef(ref),{artifact}=await readApprovedCognitiveProfileArtifact(tx,source.configId,source.profile,source.artifactHash,'SURVEY')
 assertSurveyCognitiveProfileExecutable(artifact)
 const measurement=await getContentRelease(tx,artifact.identity.measurement.releaseId,true)
 if(!measurement||measurement.layer!=='MEASUREMENT')throw Error('原精确测量来源不可用')
 const compiled=compileSurveyCognitiveProfile(artifact,measurement),pointer=surveyCognitiveProfilePointer(compiled)
 const config=await tx.cognitiveTestConfig.findUniqueOrThrow({where:{id:source.configId},select:{name:true,instruction:true}})
 return {ref,title:config.name,adapterVersion:SURVEY_PROFILE_ADAPTER,
  displayDefinition:surveyCognitiveProfileDraftSchema.parse({schemaVersion:2,templateKey:pointer.templateKey,artifactHash:pointer.artifactHash}),
  compiledDefinition:pointer,definitionDigest:source.artifactHash,scoringDigest:compiled.measurementDigest,...(config.instruction?{instruction:config.instruction}:{}),
  provenance:{cognitiveProfile:{artifactHash:source.artifactHash,configuration:artifact.identity},sourceMeasurementRelease:artifact.identity.measurement,reportConfigured:true}}
}
/** Grant snapshots remain light. Hydration for publication is exact and
 * immutable; current grant/source authority is checked by the calling adapter. */
export async function hydrateSurveyCognitiveProfileSource(tx:Prisma.TransactionClient,snapshot:CatalogSourceSnapshot):Promise<CatalogSourceSnapshot>{
 if(!isSurveyCognitiveProfileRef(snapshot.ref))return snapshot
 const source=parseSurveyCognitiveProfileRef(snapshot.ref),pointer=surveyCognitiveProfilePointerSchema.parse(snapshot.compiledDefinition)
 const p=snapshot.provenance.cognitiveProfile as {artifactHash?:string;configuration?:unknown}|undefined
 if(!p||p.artifactHash!==source.artifactHash||snapshot.definitionDigest!==source.artifactHash||pointer.artifactHash!==source.artifactHash
  ||canonicalHash(p.configuration)!==pointer.configurationHash)throw Error('原认知配置来源摘要不一致')
 const artifact=await loadCognitiveProfileArtifact(source.artifactHash,undefined)
 if(artifact.identity.configId!==source.configId||artifact.identity.profile!==source.profile||canonicalHash(artifact.identity)!==pointer.configurationHash)throw Error('原认知配置身份不一致')
 const measurement=await getContentRelease(tx,artifact.identity.measurement.releaseId,true)
 if(!measurement||measurement.layer!=='MEASUREMENT')throw Error('原测量内容缺失')
 const compiled=compileSurveyCognitiveProfile(artifact,measurement)
 if(canonicalHash(surveyCognitiveProfilePointer(compiled))!==canonicalHash(pointer)||snapshot.scoringDigest!==compiled.measurementDigest)throw Error('原认知计分闭包不一致')
 return {...snapshot,compiledDefinition:compiled}
}
export function surveyCognitiveProfilePolicy(snapshot:Pick<CatalogSourceSnapshot,'ref'>){
 const source=parseSurveyCognitiveProfileRef(snapshot.ref)
 return cognitiveProfilePolicyIdentity(source.configId,source.profile,source.artifactHash)
}
/** New START header check, with no registry/profile/report resolution. */
export async function assertSurveyCognitiveProfileSourceCurrent(tx:Prisma.TransactionClient,snapshot:Pick<CatalogSourceSnapshot,'ref'|'provenance'>){
 const source=parseSurveyCognitiveProfileRef(snapshot.ref),p=snapshot.provenance.cognitiveProfile as {configuration?:unknown}|undefined
 const identity=(await import('../assessment-authorization/cognitive-profile-approval')).cognitiveProfileApprovalReceipt.shape.configuration.parse(p?.configuration)
 if(identity.configId!==source.configId||identity.profile!==source.profile)throw Error('研究认知原配置身份不一致')
 const [row]=await tx.$queryRaw<Array<{id:string}>>`SELECT c.id FROM cognitive_test_configs c JOIN measurement_content_releases m ON m.id=c.measurement_release_id
  WHERE c.id=${identity.configId} AND c.status='PUBLISHED' AND c.test_type=${identity.testType} AND c.config_version=${identity.configVersion}
   AND c.engine_version=${identity.engineVersion} AND c.scoring_version=${identity.scoringVersion}
   AND m.id=${identity.measurement.releaseId} AND m.content_hash=${identity.measurement.contentHash} AND m.status='PUBLISHED' AND m.family='COGNITIVE' AND m.layer='MEASUREMENT'
  FOR SHARE OF c,m`
 if(!row)throw Error('原认知配置或测量来源已停止新入场')
}
