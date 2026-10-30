import {readApprovedCognitiveProfileArtifact} from '../assessment-authorization/cognitive-profile-approved-source'
import {cognitiveProfileAssignmentFreeze} from '../assessment-authorization/cognitive-profile-assignment'
import {cognitiveProfileAssignmentMeasurement} from '../assessment-authorization/cognitive-profile-source'
import type {CognitiveProfileArtifact} from '../assessment-authorization/cognitive-profile-artifact'
import {Prisma,type CognitiveTestConfig} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {requireCognitiveRegistryEntry} from '../cognitive/cognitive.registry'
import {freezeAssignmentProfile,freezeDataForWrite,readFrozenReport} from '../cognitive/profile-freeze'
import {cognitiveMeasurementRelease} from '../measurement-content/cognitive'
import {getContentReleaseBatch,publishContentRelease,type StoredRelease} from '../measurement-content/repository'
import {prepareRelease} from '../measurement-content/release'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {educationCognitiveSourceSchema,educationNativeDescriptorSchema} from './native-source.contracts'
import type {z} from 'zod'
import {readVerifiedCompositionAttempt,type VerifiedEducationAttempt} from '../assessment-run/education-start-context'

type Input=z.infer<typeof educationCognitiveSourceSchema>
export type EducationCognitiveLeaf={config:CognitiveTestConfig;measurement:Extract<StoredRelease,{layer:'MEASUREMENT'}>;
 artifact?:CognitiveProfileArtifact;freeze:ReturnType<typeof freezeAssignmentProfile>;descriptor:Extract<z.infer<typeof educationNativeDescriptorSchema>,{provider:'COGNITIVE_CONFIG'}>}
export const educationCognitiveLeafKey=(source:{versionId:string;profile:string})=>source.versionId+':'+source.profile+('artifactHash'in source&&source.artifactHash?':'+source.artifactHash:'')
export async function assertEducationCognitiveOriginalUse(tx:Prisma.TransactionClient,c:PrivateToolContext,ids:readonly string[],lock=false){
 const exact=[...new Set(ids)];if(!exact.length)return
 const configs=await tx.$queryRaw<Array<{id:string;accessPolicy:string}>>(Prisma.sql`SELECT id,access_policy::text AS "accessPolicy" FROM cognitive_test_configs WHERE id=ANY(${exact}::text[]) ORDER BY id ${lock?Prisma.sql`FOR SHARE`:Prisma.empty}`)
 const rows=configs.filter(row=>row.accessPolicy==='GRANT')
 if(!rows.length)return
 const grants=await tx.$queryRaw<Array<{resource_id:string}>>(Prisma.sql`SELECT resource_id FROM material_grants WHERE teacher_id=${c.principal.userId}
  AND resource_type='COGNITIVE_CONFIG' AND resource_id=ANY(${rows.map(row=>row.id)}::text[]) ORDER BY resource_id ${lock?Prisma.sql`FOR SHARE`:Prisma.empty}`)
 if(rows.some(row=>!grants.some(grant=>grant.resource_id===row.id)))privateToolFail('EDUCATION_COGNITIVE_ORIGINAL_AUTHORITY_REQUIRED',403)
}

/** Called after current author + exact config U. One bounded native-source
 * batch, no Training assignment/course permission and no default profile. */
export async function readEducationCognitiveSources(tx:Prisma.TransactionClient,c:PrivateToolContext,sources:readonly Input[]){
 const ids=[...new Set(sources.map(source=>source.versionId))],result=new Map<string,EducationCognitiveLeaf>()
 if(!ids.length)return result
 await tx.$queryRaw(Prisma.sql`SELECT id FROM cognitive_test_configs WHERE id=ANY(${ids}::text[]) ORDER BY id FOR SHARE`)
 const rows=await tx.cognitiveTestConfig.findMany({where:{id:{in:ids}}})
 const releases=await getContentReleaseBatch(tx,rows.flatMap(row=>row.measurementReleaseId?[row.measurementReleaseId]:[]),true)
 const restricted=rows.filter(row=>row.accessPolicy==='GRANT').map(row=>row.id)
 const grants=restricted.length?await tx.$queryRaw<Array<{resource_id:string}>>(Prisma.sql`SELECT resource_id FROM material_grants
  WHERE teacher_id=${c.principal.userId} AND resource_type='COGNITIVE_CONFIG' AND resource_id=ANY(${restricted}::text[]) ORDER BY resource_id FOR SHARE`):[]
 for(const raw of sources){
  const source=educationCognitiveSourceSchema.parse(raw),key=educationCognitiveLeafKey(source)
  if(result.has(key)){if(result.get(key)!.descriptor.contentHash!==source.contentHash)privateToolFail('EDUCATION_COGNITIVE_SOURCE_CONFLICT',409);continue}
  const config=rows.find(row=>row.id===source.versionId),measurement=config?.measurementReleaseId?releases.get(config.measurementReleaseId):null
  if(!config||config.status!=='PUBLISHED'||!measurement||measurement.layer!=='MEASUREMENT'||measurement.family!=='COGNITIVE'
   ||measurement.status!=='PUBLISHED'||measurement.scope.kind!=='PLATFORM'||measurement.contentHash!==source.contentHash)privateToolFail('EDUCATION_COGNITIVE_SOURCE_UNAVAILABLE',404)
  if(source.artifactHash){
   const {artifact}=await readApprovedCognitiveProfileArtifact(tx,config.id,source.profile,source.artifactHash,c.entry)
   if(artifact.identity.measurement.contentHash!==source.contentHash||canonicalHash(artifact.identity)!==source.selectedBinding!.configurationHash)privateToolFail('EDUCATION_COGNITIVE_PROFILE_IDENTITY',409)
   const freeze={...cognitiveProfileAssignmentFreeze(artifact),resolvedConfig:artifact.resolvedConfig}
   const descriptor=educationNativeDescriptorSchema.parse({provider:'COGNITIVE_CONFIG',sourceId:config.id,contentHash:source.contentHash,sourceMeasurementReleaseId:measurement.releaseId,
    profile:artifact.identity.profile,profileDefinitionVersion:artifact.identity.profileDefinitionVersion,resolvedConfigHash:artifact.identity.resolvedConfigHash,reportHash:artifact.identity.reportHash,artifactHash:source.artifactHash,selectedBinding:source.selectedBinding})
   if(descriptor.provider!=='COGNITIVE_CONFIG')privateToolFail('EDUCATION_COGNITIVE_PROFILE_IDENTITY',409)
   result.set(key,{config,measurement,artifact,freeze,descriptor});continue
  }
  if(config.accessPolicy==='GRANT'&&!grants.some(grant=>grant.resource_id===config.id))privateToolFail('EDUCATION_COGNITIVE_ORIGINAL_AUTHORITY_REQUIRED',403)
  const entry=requireCognitiveRegistryEntry(config.testType,config.engineVersion,config.scoringVersion)
  const original=prepareRelease(cognitiveMeasurementRelease({localId:config.testType,version:measurement.version,testType:config.testType,
   configVersion:config.configVersion,engineVersion:config.engineVersion,scoringVersion:config.scoringVersion,config:config.config,scope:measurement.scope}))
  if(original.contentHash!==measurement.contentHash)privateToolFail('EDUCATION_COGNITIVE_NATIVE_MISMATCH',409)
  const freeze=freezeAssignmentProfile({entry,baseConfig:entry.configSchema.parse(config.config),profile:source.profile})
  const report=readFrozenReport(freeze.resolvedReportSnapshotEncrypted)
  if(!report||report.profile!==source.profile||!report.profileDefinitionVersion)privateToolFail('EDUCATION_COGNITIVE_PROFILE_REQUIRED',409)
  const descriptor=educationNativeDescriptorSchema.parse({provider:'COGNITIVE_CONFIG',sourceId:config.id,contentHash:source.contentHash,sourceMeasurementReleaseId:measurement.releaseId,
   profile:freeze.profile,profileDefinitionVersion:freeze.profileDefinitionVersion,resolvedConfigHash:freeze.resolvedConfigHash,reportHash:canonicalHash(report)})
  if(descriptor.provider!=='COGNITIVE_CONFIG')privateToolFail('EDUCATION_COGNITIVE_PROFILE_REQUIRED',409)
  result.set(key,{config,measurement,freeze,descriptor})
 }
 return result
}

/** Internal native child, produced in the same root-freeze transaction. It has
 * no Training course, listing, independent grant or standalone launch route. */
export async function materializeEducationCognitive(tx:Prisma.TransactionClient,c:PrivateToolContext,leaf:EducationCognitiveLeaf){
 const assignment=await tx.cognitiveAssignment.create({data:{configId:leaf.config.id,createdBy:c.principal.userId,title:leaf.config.name,
  instruction:leaf.config.instruction,status:'PUBLISHED',publishedAt:new Date(),listedStandalone:false,required:true,maxAttempts:1,
  ...freezeDataForWrite(leaf.freeze),...(leaf.artifact?{courseSnapshot:{selectedEducationCognitiveProfile:{schemaVersion:1,product:c.entry,organizationId:c.organizationId,configId:leaf.config.id,artifactHash:leaf.descriptor.artifactHash,selectedBinding:leaf.descriptor.selectedBinding}}}:{})}})
 const input=leaf.artifact?await cognitiveProfileAssignmentMeasurement(tx,leaf.artifact,c.principal.userId,assignment.id,c.entry):cognitiveMeasurementRelease({localId:leaf.config.testType,version:'education-profile-v1:'+leaf.freeze.resolvedConfigHash,
  testType:leaf.config.testType,configVersion:leaf.config.configVersion,engineVersion:leaf.config.engineVersion,scoringVersion:leaf.config.scoringVersion,
  config:leaf.freeze.resolvedConfig,scope:{kind:'PRIVATE',product:c.entry,ownerId:c.principal.userId,resourceId:assignment.id}})
 input.provenance={educationNative:leaf.descriptor,configId:leaf.config.id,assignmentId:assignment.id}
 const measurement=await publishContentRelease(tx,input,c.principal.userId)
 if(measurement.layer!=='MEASUREMENT'||measurement.family!=='COGNITIVE'||measurement.status!=='PUBLISHED')privateToolFail('EDUCATION_COGNITIVE_BINDING_INVALID',409)
 await tx.cognitiveAssignment.update({where:{id:assignment.id},data:{measurementReleaseId:measurement.releaseId}})
 return {assignment,measurement,source:{kind:'COGNITIVE_CONFIG' as const,id:leaf.config.id,ownerId:c.principal.userId,assignmentId:assignment.id,educationNative:leaf.descriptor}}
}

/** A fixed source can be assigned in several legitimate Runs. The real parent
 * assignment admits one native child per slot/epoch; it does not spend a global
 * Training wrapper quota. Only the same-transaction START nonce can select this
 * scope. A source marker or a copied object cannot grant it. */
export async function admitEducationNativeCognitive(tx:Prisma.TransactionClient,input:{proof:VerifiedEducationAttempt|undefined;
 parent:{id:string;compositeAssessmentId:string;attemptEpoch:number;userId:string|null;subjectUserId:string|null;respondentUserId:string|null;assignmentRef:string|null;trainingContentBinding:unknown};
 actorUserId:string;itemId:string;assignmentId:string;configId:string}){
 const {parent}=input,policy=readVerifiedCompositionAttempt(input.proof,tx,parent.id,input.actorUserId,{compositeId:parent.compositeAssessmentId,assignmentRef:parent.assignmentRef??''})
 const binding=parent.trainingContentBinding as {educationComposition?:unknown;units?:Array<{itemId:string;family:string;source:{kind:string;id:string;assignmentId?:string;educationNative?:unknown}}>}
 const unit=binding?.units?.find(unit=>unit.itemId===input.itemId),descriptor=educationNativeDescriptorSchema.safeParse(unit?.source.educationNative)
 if(!policy||!['STUDENT:SELF','TEACHER:SELF'].includes(policy.origin.variantKey)||!parent.assignmentRef
  ||parent.userId!==input.actorUserId||parent.subjectUserId!==input.actorUserId||parent.respondentUserId!==input.actorUserId
  ||!Number.isSafeInteger(parent.attemptEpoch)||parent.attemptEpoch<1
  ||canonicalHash(binding?.educationComposition??null)!==canonicalHash({origin:policy.origin,manifestHash:policy.manifestHash})
  ||!descriptor.success||descriptor.data.provider!=='COGNITIVE_CONFIG'||unit?.family!=='COGNITIVE'||unit.source.kind!=='COGNITIVE_CONFIG'
  ||unit.source.assignmentId!==input.assignmentId||unit.source.id!==input.configId||descriptor.data.sourceId!==input.configId)
  privateToolFail('EDUCATION_COGNITIVE_START_CONTEXT_REQUIRED',403)
 const key=JSON.stringify(['education-cognitive-slot-v1',parent.id,input.itemId,parent.attemptEpoch])
 await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key},0))`)
 if(await tx.cognitiveSession.count({where:{userId:input.actorUserId,compositeAttemptId:parent.id,compositeItemId:input.itemId,attemptNo:parent.attemptEpoch}}))
  privateToolFail('EDUCATION_COGNITIVE_SLOT_ALREADY_ENTERED',409)
}
