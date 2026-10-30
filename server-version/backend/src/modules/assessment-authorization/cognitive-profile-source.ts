import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {AdminPermissionError} from '../admin-permissions/service'
import {getContentRelease,requirePublishedContentRelease} from '../measurement-content/repository'
import {cognitiveMeasurementRelease} from '../measurement-content/cognitive'
import {requireCognitiveRegistryEntry} from '../cognitive/cognitive.registry'
import {assertCognitiveProductEligible} from '../cognitive/product-eligibility'
import {canonicalHash} from '../assessment-runtime/canonical'
import {computeProtocolSignature} from '../cognitive/v2/canonical'
import {getCognitiveV2TaskDefinition} from '../cognitive/v2/registry'
import {resolveCognitiveFinalMaxTrials} from '../cognitive/v2/final-submission-budget'
import type {ReleaseInput} from '../measurement-content/release'
import {buildCognitiveProfileArtifact,cognitiveProfileArtifactHash,type CognitiveProfileArtifact} from './cognitive-profile-artifact'
import type {CognitiveProfile} from '../cognitive/cognitive.types'
const id=z.string().guid()
type Tx=Prisma.TransactionClient
type Config={id:string;testType:string;configVersion:string;engineVersion:string;scoringVersion:string;config:unknown;
 status:string;name:string;measurementReleaseId:string|null;accessPolicy:string}
function unavailable(message='认知精确配置来源不可用'):never{throw new AdminPermissionError(409,message)}
export const cognitiveProfilePolicyIdentity=(configId:string,profile:CognitiveProfile,artifactHash:string)=>({resourceKey:`cognitive-profile:${configId}:${profile}`,fingerprint:artifactHash})
async function publishedConfig(tx:Tx,configId:string){
 const [config]=await tx.$queryRaw<Config[]>`SELECT id,test_type AS "testType",config_version AS "configVersion",engine_version AS "engineVersion",
  scoring_version AS "scoringVersion",config,status::text,name,measurement_release_id AS "measurementReleaseId",access_policy::text AS "accessPolicy"
  FROM cognitive_test_configs WHERE id=${id.parse(configId)} FOR SHARE`
 if(!config||config.status!=='PUBLISHED'||!config.measurementReleaseId)unavailable()
 assertCognitiveProductEligible(config.testType)
 return config
}
/** Approval preview only: resolve the existing exact native implementation and
 * prove the normal published M, rather than publishing a missing dependency. */
export async function preparePublishedCognitiveProfile(tx:Tx,configId:string,profile:CognitiveProfile){
 const config=await publishedConfig(tx,configId),entry=requireCognitiveRegistryEntry(config.testType,config.engineVersion,config.scoringVersion)
 const measurement=await requirePublishedContentRelease(tx,cognitiveMeasurementRelease({localId:config.testType,version:config.configVersion,
  testType:config.testType,configVersion:config.configVersion,engineVersion:config.engineVersion,scoringVersion:config.scoringVersion,
  config:config.config,scope:{kind:'PLATFORM'}}))
 if(measurement.releaseId!==config.measurementReleaseId)unavailable('原生配置与已发布测量来源不一致')
 const artifact=buildCognitiveProfileArtifact({config,entry,profile,measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash}})
 return {config,artifact,artifactHash:cognitiveProfileArtifactHash(artifact)}
}
const withoutReport=(raw:unknown)=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return unavailable()
 const {report:_,...value}=raw as Record<string,unknown>;return value
}
/** New-use lifecycle check from a previously approved artifact. No live profile
 * merge, report compilation, latest selection or per-attempt seed generation. */
export async function assertPublishedCognitiveArtifactSource(tx:Tx,artifact:CognitiveProfileArtifact){
 if(artifact.schemaVersion!==2||!artifact.execution)unavailable('该 profile 尚未冻结执行定义，请由系统明确核对新版本')
 const {identity}=artifact,config=await publishedConfig(tx,identity.configId)
 if(config.configVersion!==identity.configVersion||config.testType!==identity.testType||config.engineVersion!==identity.engineVersion
  ||config.scoringVersion!==identity.scoringVersion||config.measurementReleaseId!==identity.measurement.releaseId)unavailable()
 const measurement=await getContentRelease(tx,identity.measurement.releaseId,true)
 if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.family!=='COGNITIVE'||measurement.status!=='PUBLISHED'
  ||measurement.scope.kind!=='PLATFORM'||measurement.contentHash!==identity.measurement.contentHash)unavailable()
 const executable=measurement.content.executable as {config:Record<string,unknown>;profiles:Record<string,Record<string,unknown>>;protocol:Parameters<typeof computeProtocolSignature>[0]}
 const patch=executable.profiles?.[identity.profile]
 if(!patch||canonicalHash(withoutReport(config.config))!==canonicalHash(executable.config)
  ||canonicalHash(withoutReport(artifact.resolvedConfig))!==canonicalHash({...executable.config,...patch})
  ||computeProtocolSignature(executable.protocol)!==identity.protocolSignature)unavailable('冻结 profile 与原测量依赖不一致')
 if(artifact.schemaVersion===2&&canonicalHash(artifact.execution?.presentation??null)!==canonicalHash((measurement.content.executable as Record<string,unknown>).presentation??null))
  unavailable('冻结媒体展示与原测量依赖不一致')
 return {config,measurement}
}
/** Existing per-assignment M projection, from the frozen global scientific M
 * and fixed resolved config. Only the versioned native kernel computes its
 * deterministic FINAL envelope bound; no live profile/report/presentation merge. */
export async function cognitiveProfileAssignmentMeasurement(tx:Tx,artifact:CognitiveProfileArtifact,actorId:string,assignmentId:string):Promise<ReleaseInput>{
 const {measurement}=await assertPublishedCognitiveArtifactSource(tx,artifact)
 if(measurement.layer!=='MEASUREMENT')unavailable()
 const identity=artifact.identity,definition=getCognitiveV2TaskDefinition(identity.testType,identity.engineVersion,identity.scoringVersion)
 if(!definition)unavailable('该精确执行版本尚不可用')
 const executable=JSON.parse(JSON.stringify(measurement.content.executable)) as Record<string,unknown>
 executable.config=withoutReport(artifact.resolvedConfig)
 executable.finalMaxTrials=resolveCognitiveFinalMaxTrials(definition,artifact.resolvedConfig)
 const scope={kind:'PRIVATE' as const,product:'TRAINING' as const,ownerId:actorId,resourceId:assignmentId}
 return {layer:'MEASUREMENT',family:'COGNITIVE',key:`cognitive:${canonicalHash(scope)}:${identity.testType}`,version:'assignment-v1',scope,
  sourceReleaseId:measurement.releaseId,provenance:{testType:identity.testType},assetRefs:measurement.assetRefs,
  content:{...measurement.content,measurementHash:canonicalHash(executable),executable}}
}
