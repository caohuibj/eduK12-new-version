import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash,retainImmutableCanonicalValue} from '../assessment-runtime/canonical'
import {AdminPermissionError} from '../admin-permissions/service'
import {ContentReleaseError,prepareRelease} from '../measurement-content/release'
import {readCurrentStandardCombination} from '../measurement-content/standard-combination-source'
import {standardAxisHashes,standardCombinationHash} from '../measurement-content/standard-combination'
import {assertTrainingStandardUse,standardCombinationPointerSchema,trainingStandardUseAuthoritySchema} from '../measurement-content/standard-combination-use'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import {frozenDatabaseScaleDefinition} from '../scale/scale-workflow.service'
import {resolveFrozenScaleInstructionForScale} from '../scale/onboarding/instrument-registry'
import {scaleMeasurementRelease} from '../measurement-content/scale'
import {assertCurrentTrainingContentOwner} from './training-report-selection'
import {resolveScaleStartDeployment} from '../scale/deployment/service'
import {lockInstrumentSourceIdentity} from '../assessment-authorization/source-identity-lock'
import {freezeScaleRuntimeAtAttemptStart} from '../assessment-runtime/runtime-snapshot'
import {referenceSetHash,freezeExactReferenceBindings} from '../assessment-runtime/reference-binding'

const uuid=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().min(1).max(240)
export const trainingStandardSourceInput=z.object({itemId:uuid,combination:standardCombinationPointerSchema,useGrantId:uuid.optional()}).strict()
const axis=z.object({version:text,axisHash:hash,sourceVersion:text}).strict()
export const trainingStandardReferenceSchema=z.object({schemaVersion:z.literal(1),compositeId:uuid,itemId:uuid,ownerId:text,scaleId:uuid,
 combination:standardCombinationPointerSchema.extend({toolKey:text,instrumentVersion:text,axes:z.object({CONTENT:axis,PARAMETERS:axis,REPORT:axis}).strict()}).strict(),
 measurement:z.object({releaseId:uuid,contentHash:hash,measurementHash:hash}).strict(),
 authority:trainingStandardUseAuthoritySchema,reportDisclosure:z.literal('EXISTING_TRAINING_POLICY'),
}).strict()
export const trainingStandardItemSourceSchema=z.object({reference:trainingStandardReferenceSchema,referenceHash:hash}).strict()
export type TrainingStandardReference=z.infer<typeof trainingStandardReferenceSchema>
export type TrainingStandardItemSource=z.infer<typeof trainingStandardItemSourceSchema>
export class TrainingStandardSourceError extends ContentReleaseError {readonly statusCode=409}
function fail(code:string):never{throw new TrainingStandardSourceError('CONTENT_TRAINING_STANDARD_'+code)}
type Purpose='NEW_REFERENCE'|'COLLECTION'

/** Course ownership is a business boundary, not another use-grant scope. Only
 * server-loaded composites/items may reach this helper. New and frozen use both
 * resolve the user's one exact MaterialGrant, never legacy canUseScale as well. */
export async function prepareTrainingStandardItemSource(tx:Prisma.TransactionClient,actorId:string,composite:any,
 item:{id:string;scaleId:string},selection:{releaseId:string;combinationHash:string},purpose:Purpose='NEW_REFERENCE',useGrantId?:string,useGrantVersion?:number){
 const pointer=standardCombinationPointerSchema.parse({releaseId:selection.releaseId,combinationHash:selection.combinationHash})
 if(composite.productKind!=='QUESTIONNAIRE'||composite.questionnaireType!=='COURSE'
  ||purpose==='NEW_REFERENCE'&&!['DRAFT','PUBLISHED'].includes(composite.status))fail('COMPOSITE_UNAVAILABLE')
 const [header]=await tx.$queryRaw<Array<{tool_key:string;instrument_version:string;measurement_release:{releaseId:string}|null}>>(Prisma.sql`
  SELECT tool_key,snapshot->>'instrumentVersion' AS instrument_version,measurement_release FROM survey_standard_releases WHERE id=${pointer.releaseId}`)
 if(!header?.measurement_release)fail('MEASUREMENT_REQUIRED')
 await lockInstrumentSourceIdentity(tx,{instrumentKey:header.tool_key,instrumentVersion:header.instrument_version},'READ')
 const expiry=await assertCurrentTrainingContentOwner(tx,{userId:actorId},composite)
 await tx.$queryRaw(Prisma.sql`SELECT id FROM scales WHERE id=${item.scaleId} FOR SHARE`)
 const scale=await tx.scale.findUnique({where:{id:item.scaleId}})
 if(!scale||purpose==='NEW_REFERENCE'&&(scale.instrumentClass!=='STANDARD'||scale.libraryEntryId||scale.status!=='PUBLISHED'))fail('SCALE_SOURCE_REQUIRED')
 if(purpose==='NEW_REFERENCE'&&(scale.code!==header.tool_key||scale.instrumentVersion!==header.instrument_version))fail('SCALE_SOURCE_CHANGED')
 const authority=await assertTrainingStandardUse(tx,{userId:actorId,combination:pointer,measurementReleaseId:header.measurement_release.releaseId,useGrantId,useGrantVersion})
 if(purpose==='NEW_REFERENCE')await tx.$queryRaw(Prisma.sql`SELECT id FROM scale_deployment_policies WHERE scale_id=${scale.id} AND status='ACTIVE' FOR SHARE`)
 const resolved=await readCurrentStandardCombination(tx,pointer,purpose),t=resolved.row.snapshot
 if(resolved.measurement.releaseId!==header.measurement_release.releaseId||header.tool_key!==t.toolKey||header.instrument_version!==t.instrumentVersion)fail('TOOL_VERSION_MISMATCH')
 if(purpose==='NEW_REFERENCE'){
  const installed=prepareRelease(scaleMeasurementRelease({localId:scale.code,version:resolved.measurement.version,instrumentVersion:scale.instrumentVersion,
   definition:frozenDatabaseScaleDefinition(scale),instrumentClass:'STANDARD',scope:resolved.measurement.scope}))
  if(installed.contentHash!==resolved.measurement.contentHash)fail('INSTALLED_CONTENT_MISMATCH')
  const bindings=await freezeExactReferenceBindings(tx,{instrumentType:'SCALE',instrumentKey:t.toolKey,
   selections:t.definition.referencePolicy.type==='declared'?t.definition.referencePolicy.selections:[]})
  assertNativeParameters(t.references,bindings)
 }
 await assertScaleLibraryCollectionAllowed(tx,[resolved.measurement.releaseId])
 const stops=await tx.$queryRaw<Array<{target_id:string}>>(Prisma.sql`SELECT target_id FROM scale_library_emergency_stops WHERE target_kind='TRAINING_SCALE' AND target_id=${scale.id}`)
 if(stops.length)fail('SCALE_EMERGENCY_STOPPED')
 const reference=trainingStandardReferenceSchema.parse({schemaVersion:1,compositeId:composite.id,itemId:item.id,ownerId:actorId,scaleId:scale.id,
  combination:{...pointer,toolKey:t.toolKey,instrumentVersion:t.instrumentVersion,
   axes:Object.fromEntries(Object.entries(t.parts).map(([a,p])=>[a,{version:p.version,axisHash:p.hash,sourceVersion:p.sourceVersion}]))},
  measurement:{releaseId:resolved.measurement.releaseId,contentHash:resolved.measurement.contentHash,measurementHash:resolved.measurement.content.measurementHash},
  authority,reportDisclosure:'EXISTING_TRAINING_POLICY'})
 const current=await assertTrainingStandardUse(tx,{userId:actorId,combination:pointer,measurementReleaseId:resolved.measurement.releaseId,
  useGrantId:authority.useGrantId,useGrantVersion:authority.useGrantVersion})
 if(canonicalHash(current)!==canonicalHash(authority))fail('USE_AUTHORITY_CHANGED')
 const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
 if(!clock||expiry&&expiry<=clock.now)fail('OWNER_EXPIRED')
 if(purpose==='NEW_REFERENCE'){
  const deployment=await resolveScaleStartDeployment({db:tx,scale,requestedMode:'COMPOSITE',now:clock.now})
  if(!deployment.allowNewStarts)fail('DEPLOYMENT_OR_RIGHTS_UNAVAILABLE:'+deployment.reasons.join(','))
 }
 return {reference:retainImmutableCanonicalValue(reference),referenceHash:canonicalHash(reference),resolved}
}

export function decodeTrainingStandardItemSource(raw:unknown,context?:{compositeId:string;itemId:string;scaleId:string;ownerId:string}){
 const source=trainingStandardItemSourceSchema.parse(raw),r=source.reference
 if(canonicalHash(r)!==source.referenceHash)fail('REFERENCE_HASH_MISMATCH')
 const hashes=Object.fromEntries(Object.entries(r.combination.axes).map(([a,p])=>[a,p.axisHash])) as ReturnType<typeof standardAxisHashes>
 if(standardCombinationHash(r.combination.toolKey,hashes)!==r.combination.combinationHash)fail('COMBINATION_HASH_MISMATCH')
 if(context&&(r.compositeId!==context.compositeId||r.itemId!==context.itemId||r.scaleId!==context.scaleId||r.ownerId!==context.ownerId))fail('BINDING_IDENTITY_MISMATCH')
 return source
}

export async function verifyStoredTrainingStandardItem(tx:Prisma.TransactionClient,composite:any,item:any,purpose:Purpose='NEW_REFERENCE'){
 const stored=decodeTrainingStandardItemSource(item.standardCombinationSource,{compositeId:composite.id,itemId:item.id,scaleId:item.scaleId,ownerId:composite.createdBy})
 const r=stored.reference,current=await prepareTrainingStandardItemSource(tx,r.ownerId,composite,item,r.combination,purpose,r.authority.useGrantId,r.authority.useGrantVersion)
 if(current.referenceHash!==stored.referenceHash)fail('FROZEN_IDENTITY_CHANGED')
 return current
}

/** Read-only preview; the item writer persists this exact reference separately. */
export async function freezeTrainingStandardReference(tx:Prisma.TransactionClient,actorId:string,compositeId:string,raw:unknown){
 const input=trainingStandardSourceInput.parse(raw)
 await tx.$queryRaw(Prisma.sql`SELECT id FROM composite_assessments WHERE id=${compositeId} AND created_by=${actorId} FOR SHARE`)
 const composite=await tx.compositeAssessment.findUnique({where:{id:compositeId},include:{questionnaireCourses:true,items:true}})
 if(!composite||composite.createdBy!==actorId)throw new AdminPermissionError(404,'测量实例或工具来源不存在')
 const item=composite.items.find(i=>i.id===input.itemId)
 if(!item||item.type!=='SCALE'||!item.scaleId)fail('SCALE_SOURCE_REQUIRED')
 const {reference,referenceHash}=await prepareTrainingStandardItemSource(tx,actorId,composite,{id:item.id,scaleId:item.scaleId},input.combination,'NEW_REFERENCE',input.useGrantId)
 return {reference,referenceHash}
}

/** The approved P/R definition reaches the native runtime. Existing exact native
 * P records must match the immutable approved P, never a latest/default set. */
export async function freezeTrainingStandardScaleRuntime(tx:Prisma.TransactionClient,source:Awaited<ReturnType<typeof verifyStoredTrainingStandardItem>>){
 const t=source.resolved.row.snapshot
 // Standard combinations freeze the versioned source instruction with the
 // exact approved tool version (presentation content, outside the P/R hash).
 const frozen=await freezeScaleRuntimeAtAttemptStart(tx,{instrumentKey:t.toolKey,instrumentVersion:t.instrumentVersion,definition:t.definition,requestedMode:'COMPOSITE',
  instruction:resolveFrozenScaleInstructionForScale({code:t.toolKey,instrumentVersion:t.instrumentVersion,instrumentClass:'STANDARD'})})
 assertNativeParameters(t.references,frozen.referenceBindings)
 return frozen
}
function assertNativeParameters(sets:Parameters<typeof referenceSetHash>[0][],bindings:Array<{referenceVersion:string;referenceHash:string}>){
 for(const binding of bindings){const set=sets.find(r=>r.referenceVersion===binding.referenceVersion)
  if(!set||referenceSetHash(set)!==binding.referenceHash)fail('NATIVE_PARAMETER_BINDING_MISMATCH')}
}
