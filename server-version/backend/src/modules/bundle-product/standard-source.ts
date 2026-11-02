import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readCurrentStandardCombination} from '../measurement-content/standard-combination-source'
import {assertTrainingStandardUse,trainingStandardUseAuthoritySchema} from '../measurement-content/standard-combination-use'
import {lockInstrumentSourceIdentity} from '../assessment-authorization/source-identity-lock'
import {assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {databaseContentSource,matchesStandardNativeScale} from '../scale/component-import/native-source'
import {frozenDatabaseScaleDefinition} from '../scale/scale-workflow.service'
import {prepareRelease} from '../measurement-content/release'
import {scaleMeasurementRelease} from '../measurement-content/scale'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import {resolveScaleStartDeployment} from '../scale/deployment/service'
import {assertCurrentTrainingContentOwner} from '../composite/training-report-selection'
import {compileScalePolicy} from '../scale/policy/compile'
import {scaleProjectionPolicyFromCompiled} from '../scale/projection/policy-resolver'
import {readInstance} from './instance'
import {getExecutableScalePackage} from '../scale/onboarding/executable-registry'
import type {DeclarativePackage} from '../assessment-bundle/onboarding/contract'
import type {ScalePackageV2} from '../scale/onboarding/types'
import {parseScaleInstrumentSourceSchema} from '../scale/onboarding/schema'
import {assertStandardCombinationDerivedRelease} from '../measurement-content/standard-combination-content'
import type {StoredRelease} from '../measurement-content/repository'

const uuid=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
export const bundleScaleSourceSchema=z.object({schemaVersion:z.literal(1),compositeId:uuid,itemId:uuid,slotKey:z.string().min(1),ownerId:uuid,scaleId:uuid,
 releaseId:uuid,combinationHash:hash,measurement:z.object({releaseId:uuid,contentHash:hash}).strict(),authority:trainingStandardUseAuthoritySchema}).strict()
export type BundleScaleSource=z.infer<typeof bundleScaleSourceSchema>
export class BundleScaleSourceError extends Error {readonly statusCode=409}
function fail(code:string):never{throw new BundleScaleSourceError('BUNDLE_SCALE_SOURCE_'+code)}
type Purpose='NEW_REFERENCE'|'COLLECTION'
async function lockBundleUse(tx:Prisma.TransactionClient,pack:DeclarativePackage,ownerId:string){
 const resourceId=pack.manifest.definition.bundleKey+'@'+pack.manifest.definition.bundleVersion
 const locked=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM material_grants WHERE teacher_id=${ownerId} AND resource_type='ASSESSMENT_BUNDLE' AND resource_id=${resourceId} FOR SHARE`)
 if(locked.length!==1)fail('BUNDLE_USE_UNAVAILABLE')
 const grant=await tx.materialGrant.findUnique({where:{teacherId_resourceType_resourceId:{teacherId:ownerId,resourceType:'ASSESSMENT_BUNDLE',resourceId}}})
 if(!grant||grant.id!==locked[0].id||grant.revokedAt)fail('BUNDLE_USE_UNAVAILABLE')
}

/** Immutable source facts only. The package signature binds the exact C/P/R
 * pointer and full source contract; this helper never supplies a use grant. */
export async function resolveBundleScaleDependencies(tx:Prisma.TransactionClient,pack:DeclarativePackage,purpose:Purpose|'HISTORY'='NEW_REFERENCE'){
 const result=new Map<string,Awaited<ReturnType<typeof readCurrentStandardCombination>>>()
 for(const pin of [...(pack.manifest.scaleDependencies??[])].sort((a,b)=>a.releaseId.localeCompare(b.releaseId))){
  await lockInstrumentSourceIdentity(tx,pin.source.identity,'READ')
  const resolved=await readCurrentStandardCombination(tx,pin,purpose),t=resolved.row.snapshot
  const slot=pack.manifest.definition.slots.find(s=>s.slotKey===pin.slotKey),pointer=databaseContentSource(t.parts.CONTENT)
  if(!slot||!pointer||t.toolKey!==slot.instrumentKey||t.instrumentVersion!==slot.instrumentVersion
   ||canonicalHash(t.definition)!==canonicalHash(pin.source.executable!.definition)
   ||canonicalHash(t.references)!==canonicalHash(pin.source.executable!.references))fail('FROZEN_CONTRACT_MISMATCH')
  const metadata=Object.fromEntries(Object.entries(pin.source).filter(([key])=>['instruction','applicability','disclosure','catalog','localization','usageRequirements','educationApplicability','educationExpertApplicability','educationalFeedback'].includes(key)))
  const {identity:_,originalProvenance:__,originalLicense:___,databaseSource:____,...actual}=t.parts.CONTENT.reference.metadata
  if(canonicalHash(actual)!==canonicalHash({title:pin.source.catalog.identity.canonicalName,...metadata}))fail('POLICY_CONTRACT_MISMATCH')
  result.set(pin.slotKey,resolved)
 }
 return result
}
export function bundleScaleDependencyLookup(pack:DeclarativePackage,resolved:Map<string,Awaited<ReturnType<typeof readCurrentStandardCombination>>>):typeof getExecutableScalePackage{
 return (key,version)=>{
  const pin=pack.manifest.scaleDependencies?.find(p=>p.source.identity.instrumentKey===key&&p.source.identity.instrumentVersion===version)
  if(!pin)return getExecutableScalePackage(key,version)
  const actual=resolved.get(pin.slotKey)
  if(!actual)return undefined
  return {key,instrumentVersion:version,releaseStatus:'PUBLISHED',definition:actual.row.snapshot.definition,references:actual.row.snapshot.references,goldenCases:pin.source.executable!.goldenCases} satisfies ScalePackageV2
 }
}

/** Dedicated Bundle adapter; the Training QUESTIONNAIRE gate is unchanged. */
export async function prepareBundleScaleSource(tx:Prisma.TransactionClient,input:{pack:DeclarativePackage;slotKey:string;composite:any;itemId:string;scaleId:string;stored?:BundleScaleSource;useGrantId?:string},purpose:Purpose='NEW_REFERENCE'){
 const {pack,slotKey,composite,itemId,scaleId,stored}=input
 if(composite.productKind!=='ASSESSMENT_BUNDLE'||!composite.courseId||!composite.createdBy
  ||!['DRAFT','PUBLISHED'].includes(composite.status))fail('COMPOSITE_UNAVAILABLE')
 const pin=pack.manifest.scaleDependencies?.find(p=>p.slotKey===slotKey)
 if(!pin)fail('EXACT_DEPENDENCY_REQUIRED')
 await lockBundleUse(tx,pack,composite.createdBy)
 if(stored&&(stored.compositeId!==composite.id||stored.itemId!==itemId||stored.slotKey!==slotKey||stored.ownerId!==composite.createdBy
  ||stored.scaleId!==scaleId||stored.releaseId!==pin.releaseId||stored.combinationHash!==pin.combinationHash))fail('BINDING_MISMATCH')
 const expiry=await assertCurrentTrainingContentOwner(tx,{userId:composite.createdBy},composite)
 await tx.$queryRaw(Prisma.sql`SELECT id FROM courses WHERE id=${composite.courseId} FOR SHARE`)
 const course=await tx.course.findUnique({where:{id:composite.courseId}})
 if(!course||course.creatorId!==composite.createdBy||course.courseType!=='TRAINING_COURSE'||course.isLibrary)fail('COURSE_UNAVAILABLE')
 const resolved=(await resolveBundleScaleDependencies(tx,pack,purpose)).get(slotKey)!,t=resolved.row.snapshot
 const authority=await assertTrainingStandardUse(tx,{userId:composite.createdBy,combination:pin,measurementReleaseId:resolved.measurement.releaseId,
  useGrantId:stored?.authority.useGrantId??input.useGrantId,useGrantVersion:stored?.authority.useGrantVersion})
 if(stored&&canonicalHash(authority)!==canonicalHash(stored.authority))fail('USE_AUTHORITY_CHANGED')
 await assertToolEntryPolicy(tx,{resourceKey:'standard-release:'+pin.releaseId,fingerprint:pin.combinationHash},'TRAINING')
 await tx.$queryRaw(Prisma.sql`SELECT id FROM scales WHERE id=${scaleId} FOR SHARE`)
 const scale=await tx.scale.findUnique({where:{id:scaleId}})
 if(!scale||scale.status!=='PUBLISHED'||scale.instrumentClass!=='STANDARD'||scale.libraryEntryId||!matchesStandardNativeScale(scale,t))fail('NATIVE_VERSION_UNAVAILABLE')
 const installed=prepareRelease(scaleMeasurementRelease({localId:scale.code,version:resolved.measurement.version,instrumentVersion:scale.instrumentVersion,
  definition:frozenDatabaseScaleDefinition(scale),instrumentClass:'STANDARD',scope:resolved.measurement.scope}))
 if(installed.contentHash!==resolved.measurement.contentHash)fail('NATIVE_CONTENT_MISMATCH')
 await assertScaleLibraryCollectionAllowed(tx,[resolved.measurement.releaseId],[scale.id])
 const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
 if(!clock||expiry&&expiry<=clock.now)fail('OWNER_EXPIRED')
 const deployment=await resolveScaleStartDeployment({db:tx,scale,requestedMode:'COMPOSITE',now:clock.now})
 if(!deployment.allowNewStarts)fail('DEPLOYMENT_UNAVAILABLE')
 const current=await assertTrainingStandardUse(tx,{userId:composite.createdBy,combination:pin,measurementReleaseId:resolved.measurement.releaseId,useGrantId:authority.useGrantId,useGrantVersion:authority.useGrantVersion})
 if(canonicalHash(current)!==canonicalHash(authority))fail('USE_AUTHORITY_CHANGED')
 const [finalClock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
 if(!finalClock||expiry&&expiry<=finalClock.now)fail('OWNER_EXPIRED')
 const source=bundleScaleSourceSchema.parse({schemaVersion:1,compositeId:composite.id,itemId,slotKey,ownerId:composite.createdBy,scaleId,
  releaseId:pin.releaseId,combinationHash:pin.combinationHash,measurement:{releaseId:resolved.measurement.releaseId,contentHash:resolved.measurement.contentHash},authority})
 if(stored&&canonicalHash(stored)!==canonicalHash(source))fail('SOURCE_CHANGED')
 return {source,resolved,scale,disclosure:scaleProjectionPolicyFromCompiled(compileScalePolicy(parseScaleInstrumentSourceSchema(pin.source)))}
}

/** Only encrypted server-owned Bundle bindings are read. Missing or extra
 * markers fail closed; an item sharing a Scale cannot borrow this authority. */
export async function readBundleScaleSources(tx:Prisma.TransactionClient,composite:any,items:readonly any[],purpose:Purpose='NEW_REFERENCE'){
 const result=new Map<string,Awaited<ReturnType<typeof prepareBundleScaleSource>>>()
 if(composite.productKind!=='ASSESSMENT_BUNDLE')return result
 const instance=composite.bundleInstance??await tx.bundleInstance.findUnique({where:{compositeId:composite.id}})
 if(!instance)fail('INSTANCE_REQUIRED')
 const {frozen,bindings}=readInstance(instance),pack=frozen.declarativePackage
 if(!pack?.manifest.scaleDependencies)return result
 await (await import('./package-release')).assertPackageAdmission(tx,pack)
 await lockBundleUse(tx,pack,composite.createdBy)
 for(const binding of bindings.slots){
  const pin=pack.manifest.scaleDependencies?.find(p=>p.slotKey===binding.slotKey)
  if(!pin){if(binding.standardSource)fail('UNDECLARED_SOURCE');continue}
  const item=items.find(i=>i.id===binding.itemId)
  if(!item||item.type!=='SCALE'||!item.scaleId||!binding.standardSource)fail('BOUND_ITEM_REQUIRED')
  result.set(item.id,await prepareBundleScaleSource(tx,{pack,slotKey:binding.slotKey,composite,itemId:item.id,scaleId:item.scaleId,stored:bundleScaleSourceSchema.parse(binding.standardSource)},purpose))
 }
 if(result.size!==(pack.manifest.scaleDependencies?.length??0))fail('DEPENDENCY_BINDING_REQUIRED')
 return result
}

/** Recheck the actual parent/item/epoch immediately before child collection.
 * No caller-supplied skip flag, raw Scale ID exemption or persistent proof cache. */
export async function assertBundleScaleChildSource(tx:Prisma.TransactionClient,attempt:{id:string;attemptEpoch:number;compositeAssessmentId:string;userId:string|null},itemId:string){
 const parent=await tx.compositeAssessmentAttempt.findUnique({where:{id:attempt.id},include:{compositeAssessment:{include:{items:{include:{scale:true}}}}}})
 if(!parent||parent.attemptEpoch!==attempt.attemptEpoch||parent.compositeAssessmentId!==attempt.compositeAssessmentId||parent.userId!==attempt.userId
  ||parent.status!=='IN_PROGRESS'||parent.compositeAssessment.status!=='PUBLISHED')fail('PARENT_MISMATCH')
 return (await readBundleScaleSources(tx,parent.compositeAssessment,parent.compositeAssessment.items,'COLLECTION')).get(itemId)
}

/** Immutable content identity behind the caller's existing report/data ACL.
 * Historical reading is not a new-use decision and does not reissue authority. */
export async function readBundleScaleContentIdentity(tx:Prisma.TransactionClient,seal:BundleScaleSource,context:{compositeId:string;itemId:string;ownerId:string}){
 const stored=bundleScaleSourceSchema.parse(seal)
 if(stored.compositeId!==context.compositeId||stored.itemId!==context.itemId||stored.ownerId!==context.ownerId)fail('HISTORY_CONTEXT_MISMATCH')
 const composite=await tx.compositeAssessment.findUnique({where:{id:context.compositeId},include:{bundleInstance:true}})
 if(!composite||composite.productKind!=='ASSESSMENT_BUNDLE'||composite.createdBy!==context.ownerId||!composite.bundleInstance)fail('HISTORY_CONTEXT_MISMATCH')
 const {frozen,bindings}=readInstance(composite.bundleInstance),original=bindings.slots.find(s=>s.itemId===context.itemId)
 if(!frozen.declarativePackage||!original?.standardSource||canonicalHash(original.standardSource)!==canonicalHash(stored))fail('HISTORY_BINDING_MISMATCH')
 const source=(await resolveBundleScaleDependencies(tx,frozen.declarativePackage,'HISTORY')).get(stored.slotKey)
 if(!source||source.measurement.releaseId!==stored.measurement.releaseId||source.measurement.contentHash!==stored.measurement.contentHash)fail('HISTORY_MEASUREMENT_MISMATCH')
 return source
}

/** A persisted current-epoch child has already entered. Verify its actual
 * frozen parent/item/source and emergency stops without requiring a new U. */
export async function readEnteredBundleScaleChild(tx:Prisma.TransactionClient,assessmentId:string){
 const child=await tx.assessment.findUnique({where:{id:assessmentId},include:{scale:true,compositeAttempt:{include:{compositeAssessment:{include:{bundleInstance:true}}}}}})
 const parent=child?.compositeAttempt,composite=parent?.compositeAssessment
 if(!child||!parent||!composite||composite.productKind!=='ASSESSMENT_BUNDLE'||!composite.bundleInstance
  ||child.attemptEpoch!==parent.attemptEpoch||child.userId!==parent.userId||child.subjectUserId!==parent.subjectUserId
  ||child.respondentUserId!==parent.respondentUserId||child.respondentType!==parent.respondentType||!child.compositeItemId)fail('CURRENT_CHILD_MISMATCH')
 const {bindings}=readInstance(composite.bundleInstance),seal=bindings.slots.find(s=>s.itemId===child.compositeItemId)?.standardSource
 if(!seal||seal.scaleId!==child.scaleId)fail('ENTERED_SOURCE_REQUIRED')
 const releases=await bundleScaleCollectionReleases(tx,parent.id,[child.scaleId],[child.compositeItemId])
 if(!releases.includes(seal.measurement.releaseId))fail('ENTERED_BINDING_REQUIRED')
 await assertScaleLibraryCollectionAllowed(tx,releases,[child.scaleId])
 const exact=await readBundleScaleContentIdentity(tx,seal,{compositeId:composite.id,itemId:child.compositeItemId,ownerId:composite.createdBy!})
 if(!matchesStandardNativeScale(child.scale,exact.row.snapshot))fail('ENTERED_NATIVE_MISMATCH')
 return exact
}

export async function validateBundleScaleDerivedContent(tx:Prisma.TransactionClient,unit:{itemId:string;source:{bundleStandard?:BundleScaleSource};measurement:{releaseId:string;contentHash:string}},release:StoredRelease,context:{compositeId:string;ownerId:string}){
 if(!unit.source.bundleStandard)fail('EXACT_SOURCE_REQUIRED')
 const exact=await readBundleScaleContentIdentity(tx,unit.source.bundleStandard,{...context,itemId:unit.itemId})
 if(unit.measurement.releaseId!==exact.measurement.releaseId||unit.measurement.contentHash!==exact.measurement.contentHash)fail('DERIVED_MEASUREMENT_MISMATCH')
 return assertStandardCombinationDerivedRelease(exact.row,exact.measurement,release)
}

/** Existing current-epoch children retain the normal frozen completion policy.
 * This resolves emergency-stop identities only, never new-entry authority. */
export async function bundleScaleCollectionReleases(tx:Prisma.TransactionClient,parentId:string,scaleIds:readonly string[],itemIds?:readonly string[]){
 const parent=await tx.compositeAssessmentAttempt.findUnique({where:{id:parentId},include:{compositeAssessment:true}})
 if(!parent||parent.compositeAssessment.productKind!=='ASSESSMENT_BUNDLE')return []
 const instance=await tx.bundleInstance.findUnique({where:{compositeId:parent.compositeAssessmentId}})
 if(!instance)fail('INSTANCE_REQUIRED')
 const {bindings,frozen}=readInstance(instance)
 if(!frozen.declarativePackage?.manifest.scaleDependencies)return []
 const {trainingContentAttemptBindingSchema}=await import('../composite/training-content-binding')
 const binding=trainingContentAttemptBindingSchema.parse(parent.trainingContentBinding)
 if(canonicalHash(binding)!==parent.trainingContentBindingHash||binding.attemptId!==parent.id||binding.epoch!==parent.attemptEpoch||binding.compositeId!==parent.compositeAssessmentId)fail('PARENT_BINDING_MISMATCH')
 const releases:string[]=[]
 for(const unit of binding.units){
  if(!unit.source.bundleStandard||!scaleIds.includes(unit.source.id)||itemIds&&!itemIds.includes(unit.itemId))continue
  const original=bindings.slots.find(s=>s.itemId===unit.itemId)?.standardSource
  if(!original||canonicalHash(original)!==canonicalHash(unit.source.bundleStandard)||unit.measurement.releaseId!==original.measurement.releaseId||unit.measurement.contentHash!==original.measurement.contentHash)fail('COLLECTION_BINDING_MISMATCH')
  const children=await tx.assessment.findMany({where:{compositeAttemptId:parent.id,compositeItemId:unit.itemId,attemptEpoch:parent.attemptEpoch,scaleId:original.scaleId},select:{id:true}})
  if(!children.length)fail('CURRENT_CHILD_REQUIRED')
  releases.push(original.measurement.releaseId)
 }
 return releases
}
