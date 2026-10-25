import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash,retainImmutableCanonicalValue} from '../assessment-runtime/canonical'
import {assertEntryAdmin,AdminPermissionError} from '../admin-permissions/service'
import {assertContentAuthority} from '../measurement-content/content-authority.repository'
import {ContentReleaseError} from '../measurement-content/release'
import {readCurrentStandardCombination} from '../measurement-content/standard-combination-source'
import {standardAxisHashes,standardCombinationHash} from '../measurement-content/standard-combination'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import {canUseScale} from '../../services/materialGrant'
import {frozenDatabaseScaleDefinition} from '../scale/scale-workflow.service'
import {scaleMeasurementRelease} from '../measurement-content/scale'
import {prepareRelease} from '../measurement-content/release'
import {assertCurrentTrainingContentOwner} from './training-report-selection'
import {resolveScaleStartDeployment} from '../scale/deployment/service'
import {lockInstrumentSourceIdentity} from '../assessment-authorization/source-identity-lock'

const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().min(1).max(240)
const exact=z.object({releaseId:id,combinationHash:hash}).strict()
export const trainingStandardSourceInput=z.object({itemId:id,courseId:id,combination:exact,useGrantId:id}).strict()
const axis=z.object({version:text,axisHash:hash,sourceVersion:text}).strict()
export const trainingStandardReferenceSchema=z.object({schemaVersion:z.literal(1),
  compositeId:id,itemId:id,courseId:id,ownerId:text,scaleId:id,
  combination:exact.extend({toolKey:text,instrumentVersion:text,axes:z.object({CONTENT:axis,PARAMETERS:axis,REPORT:axis}).strict()}).strict(),
  measurement:z.object({releaseId:id,contentHash:hash,measurementHash:hash}).strict(),
  authority:z.object({useGrantId:id,useGrantVersion:z.number().int().positive(),issuerId:text}).strict(),
  reportDisclosure:z.literal('EXISTING_TRAINING_POLICY'),
}).strict()
export type TrainingStandardReference=z.infer<typeof trainingStandardReferenceSchema>
export class TrainingStandardSourceError extends ContentReleaseError {readonly statusCode=409}
function fail(code:string):never{throw new TrainingStandardSourceError('CONTENT_TRAINING_STANDARD_'+code)}
export const trainingStandardResourceKey=(pointer:{releaseId:string;combinationHash:string})=>
  'standard-combination:'+pointer.releaseId+':'+pointer.combinationHash

/** Prepare an exact, lightweight reference. Current course/Scale rights, a
 * real exact TRAINING material.use grant and its current entry-admin issuer are
 * independent of ONLINE. No implicit grant, PUBLIC visibility or publication. */
async function resolveTrainingStandardReference(tx:Prisma.TransactionClient,actorId:string,compositeId:string,raw:unknown,purpose:'NEW_REFERENCE'|'COLLECTION'){
  const input=trainingStandardSourceInput.parse(raw)
  // Follow the authorization writer's source -> user/grant -> release order.
  // This preliminary owned lookup is not authority; re-read after the lock.
  const [identity]=await tx.$queryRaw<Array<{code:string;instrument_version:string}>>(Prisma.sql`
    SELECT s.code,s.instrument_version FROM composite_assessment_items i JOIN scales s ON s.id=i.scale_id
    JOIN composite_assessments c ON c.id=i.composite_assessment_id
    WHERE i.id=${input.itemId} AND c.id=${compositeId} AND c.created_by=${actorId}`)
  if(!identity)throw new AdminPermissionError(404,'测量实例或工具来源不存在')
  await lockInstrumentSourceIdentity(tx,{instrumentKey:identity.code,instrumentVersion:identity.instrument_version},'READ')
  await tx.$queryRaw(Prisma.sql`SELECT id FROM composite_assessments WHERE id=${compositeId} FOR SHARE`)
  const composite=await tx.compositeAssessment.findUnique({where:{id:compositeId},include:{questionnaireCourses:true,items:{include:{scale:true}}}})
  if(!composite||composite.productKind!=='QUESTIONNAIRE'||composite.questionnaireType!=='COURSE'
    ||purpose==='NEW_REFERENCE'&&!['DRAFT','PUBLISHED'].includes(composite.status))fail('COMPOSITE_UNAVAILABLE')
  const expiry=await assertCurrentTrainingContentOwner(tx,{userId:actorId},composite)
  const courses=composite.productKind==='QUESTIONNAIRE'?composite.questionnaireCourses.map(c=>c.courseId):[composite.courseId]
  if(!courses.includes(input.courseId))fail('COURSE_MISMATCH')
  const item=composite.items.find(i=>i.id===input.itemId)
  if(!item||item.type!=='SCALE'||!item.scaleId)fail('SCALE_SOURCE_REQUIRED')
  await tx.$queryRaw(Prisma.sql`SELECT id FROM scales WHERE id=${item.scaleId} FOR SHARE`)
  const scale=await tx.scale.findUnique({where:{id:item.scaleId}})
  if(!scale||purpose==='NEW_REFERENCE'&&scale.status!=='PUBLISHED'||scale.instrumentClass!=='STANDARD'||scale.libraryEntryId)fail('SCALE_SOURCE_REQUIRED')
  if(scale.code!==identity.code||scale.instrumentVersion!==identity.instrument_version)fail('SCALE_SOURCE_CHANGED')
  if(scale.creatorId!==actorId)await tx.$queryRaw(Prisma.sql`SELECT id FROM material_grants WHERE teacher_id=${actorId} AND resource_type='SCALE' AND resource_id=${scale.id} FOR SHARE`)
  if(purpose==='NEW_REFERENCE'&&!await canUseScale(actorId,'TEACHER',scale,tx))fail('SCALE_USE_DENIED')
  const authority=await assertContentAuthority(tx,{actorId,grantId:input.useGrantId,capability:'material.use',
    scope:{product:'TRAINING',scopeKind:'COURSE',scopeId:input.courseId,resourceKind:'material',resourceKeys:[trainingStandardResourceKey(input.combination)]}})
  const [grant]=await tx.$queryRaw<Array<{issuer_id:string}>>(Prisma.sql`SELECT issuer_id FROM content_capability_grants WHERE id=${authority.grantId} AND subject_id=${actorId} FOR SHARE`)
  if(!grant)fail('USE_AUTHORITY_MISSING')
  await assertEntryAdmin(tx,grant.issuer_id,'TRAINING')
  if(purpose==='NEW_REFERENCE'){
    await tx.$queryRaw(Prisma.sql`SELECT id FROM scale_deployment_policies WHERE scale_id=${scale.id} AND status='ACTIVE' FOR SHARE`)
    const [before]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
    if(!before)fail('CLOCK_UNAVAILABLE')
    const deployment=await resolveScaleStartDeployment({db:tx,scale,requestedMode:'COMPOSITE',now:before.now})
    if(!deployment.allowNewStarts)fail('DEPLOYMENT_OR_RIGHTS_UNAVAILABLE:'+deployment.reasons.join(','))
  }
  const resolved=await readCurrentStandardCombination(tx,input.combination,purpose),t=resolved.row.snapshot
  if(scale.code!==t.toolKey||scale.instrumentVersion!==t.instrumentVersion)fail('TOOL_VERSION_MISMATCH')
  // The installed resource remains the current authorized C source. Selecting
  // a P/R combo cannot substitute another C or silently alter its scorer.
  if(purpose==='NEW_REFERENCE'){
    const installed=prepareRelease(scaleMeasurementRelease({localId:scale.code,version:resolved.measurement.version,
      instrumentVersion:scale.instrumentVersion,definition:frozenDatabaseScaleDefinition(scale),instrumentClass:'STANDARD',scope:resolved.measurement.scope}))
    if(installed.contentHash!==resolved.measurement.contentHash)fail('INSTALLED_CONTENT_MISMATCH')
  }
  await assertScaleLibraryCollectionAllowed(tx,[resolved.measurement.releaseId],purpose==='NEW_REFERENCE'?[scale.id]:[])
  if(purpose==='COLLECTION'){
    const stops=await tx.$queryRaw<Array<{target_id:string}>>(Prisma.sql`SELECT target_id FROM scale_library_emergency_stops WHERE target_kind='TRAINING_SCALE' AND target_id=${scale.id}`)
    if(stops.length)fail('SCALE_EMERGENCY_STOPPED')
  }
  const axes=Object.fromEntries(Object.entries(t.parts).map(([a,p])=>[a,{version:p.version,axisHash:p.hash,sourceVersion:p.sourceVersion}]))
  const reference=trainingStandardReferenceSchema.parse({schemaVersion:1,compositeId,itemId:item.id,courseId:input.courseId,ownerId:actorId,scaleId:scale.id,
    combination:{...input.combination,toolKey:t.toolKey,instrumentVersion:t.instrumentVersion,axes},
    measurement:{releaseId:resolved.measurement.releaseId,contentHash:resolved.measurement.contentHash,measurementHash:resolved.measurement.content.measurementHash},
    authority:{useGrantId:authority.grantId,useGrantVersion:authority.version,issuerId:grant.issuer_id},reportDisclosure:'EXISTING_TRAINING_POLICY'})
  // Source/stop locks may wait past a grant/account expiry. Recheck current
  // authority after those waits, while every identity lock is still held.
  const finalAuthority=await assertContentAuthority(tx,{actorId,grantId:input.useGrantId,capability:'material.use',
    scope:{product:'TRAINING',scopeKind:'COURSE',scopeId:input.courseId,resourceKind:'material',resourceKeys:[trainingStandardResourceKey(input.combination)]}})
  if(finalAuthority.version!==authority.version||purpose==='NEW_REFERENCE'&&!await canUseScale(actorId,'TEACHER',scale,tx))fail('USE_AUTHORITY_CHANGED')
  await assertEntryAdmin(tx,grant.issuer_id,'TRAINING')
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if(!clock||expiry&&expiry<=clock.now)fail('OWNER_EXPIRED')
  if(purpose==='NEW_REFERENCE'){
    const finalDeployment=await resolveScaleStartDeployment({db:tx,scale,requestedMode:'COMPOSITE',now:clock.now})
    if(!finalDeployment.allowNewStarts)fail('DEPLOYMENT_OR_RIGHTS_UNAVAILABLE:'+finalDeployment.reasons.join(','))
  }
  return {reference:retainImmutableCanonicalValue(reference),referenceHash:canonicalHash(reference)}
}

export async function freezeTrainingStandardReference(tx:Prisma.TransactionClient,actorId:string,compositeId:string,raw:unknown){
  return resolveTrainingStandardReference(tx,actorId,compositeId,raw,'NEW_REFERENCE')
}

/** Current collection verification; never used to impose a new policy on old
 * report reads. Re-read the same ids/grants, not a newer combo or renewed grant. */
export async function verifyTrainingStandardReference(tx:Prisma.TransactionClient,raw:unknown,referenceHash:string){
  const reference=trainingStandardReferenceSchema.parse(raw)
  if(canonicalHash(reference)!==referenceHash)fail('REFERENCE_HASH_MISMATCH')
  const hashes=Object.fromEntries(Object.entries(reference.combination.axes).map(([a,p])=>[a,p.axisHash])) as ReturnType<typeof standardAxisHashes>
  if(standardCombinationHash(reference.combination.toolKey,hashes)!==reference.combination.combinationHash)fail('COMBINATION_HASH_MISMATCH')
  const current=await resolveTrainingStandardReference(tx,reference.ownerId,reference.compositeId,{itemId:reference.itemId,courseId:reference.courseId,
    combination:{releaseId:reference.combination.releaseId,combinationHash:reference.combination.combinationHash},useGrantId:reference.authority.useGrantId},'COLLECTION')
  if(current.referenceHash!==referenceHash)fail('FROZEN_IDENTITY_CHANGED')
  return current
}

/** Lightweight container binding. These hashes are integrity identities, never
 * authorization receipts; every collection verifier repeats current authority. */
export const trainingStandardFrozenBindingSchema=z.object({schemaVersion:z.literal(1),
  attemptId:id,epoch:z.number().int().positive(),publicationHash:hash,
  reference:trainingStandardReferenceSchema,referenceHash:hash,
}).strict()
type BindingContext={actorId:string;compositeId:string;courseId:string;attemptId:string;epoch:number;publicationHash:string}
export async function freezeTrainingStandardBinding(tx:Prisma.TransactionClient,context:BindingContext,selection:unknown){
  const input=trainingStandardSourceInput.parse(selection)
  if(input.courseId!==context.courseId)fail('COURSE_MISMATCH')
  const source=await freezeTrainingStandardReference(tx,context.actorId,context.compositeId,input)
  const binding=trainingStandardFrozenBindingSchema.parse({schemaVersion:1,attemptId:context.attemptId,epoch:context.epoch,
    publicationHash:context.publicationHash,...source})
  return {binding:retainImmutableCanonicalValue(binding),bindingHash:canonicalHash(binding)}
}
export async function verifyTrainingStandardBinding(tx:Prisma.TransactionClient,context:BindingContext,raw:unknown,bindingHash:string){
  const binding=trainingStandardFrozenBindingSchema.parse(raw)
  if(canonicalHash(binding)!==bindingHash||binding.attemptId!==context.attemptId||binding.epoch!==context.epoch
    ||binding.publicationHash!==context.publicationHash||binding.reference.compositeId!==context.compositeId
    ||binding.reference.ownerId!==context.actorId||binding.reference.courseId!==context.courseId)fail('BINDING_IDENTITY_MISMATCH')
  await verifyTrainingStandardReference(tx,binding.reference,binding.referenceHash)
  return binding
}
