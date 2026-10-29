import {decodeTrainingReferenceBinding,readTrainingReferenceContext,type TrainingReferenceParent} from './training-reference-binding'
import {validateTrainingReferenceRelease} from './training-reference-selection'
import type {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {compositeItemSlotKey} from '../assessment-runtime/slot-set'
import type {CanonicalUnitResultEnvelopeV1} from '../assessment-runtime/unit-result'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {ContentReleaseError} from '../measurement-content/release'
import {interpretContentBinding,FinalInterpretationIdentityError,type FinalInterpretation} from '../measurement-content/final-interpretation'
import {trainingContentAttemptBindingSchema,trainingMeasurementSourceScopeMatchesForConsumer} from './training-content-binding'
import {assertSealedCompositionAnchor} from '../assessment-run/educationCompositionExecution'
import {validateTrainingReportPointer} from './training-report-selection'

const text=z.string().min(1).max(240),hash=z.string().regex(/^[a-f0-9]{64}$/)
const bindingSchema=trainingContentAttemptBindingSchema
const numeric=z.number().finite().nullable()
const referenceSchema=z.object({metricKey:text,referenceKind:z.enum(['normative_distribution','criterion_threshold','descriptive_sample','theoretical_range']),
  status:z.enum(['AVAILABLE','UNAVAILABLE','REVOKED']),reason:text.optional(),values:z.object({z:numeric,t:numeric,meanDifference:numeric,
    percentile:z.object({value:z.number().finite(),estimated:z.boolean()}).strict().nullable(),bandKey:text.nullable()}).strict().optional()}).strict()
const interpretationSchema=z.object({schemaVersion:z.literal(1),contentBindingHash:hash,units:z.array(z.object({instrumentKey:text,
  status:z.enum(['INTERPRETED','UNAVAILABLE','REVOKED','NOT_SELECTED']),reason:text.optional(),references:z.array(referenceSchema).max(100),
  report:z.object({status:z.enum(['READY','REVOKED','NOT_SELECTED','UNAVAILABLE']),generatorVersion:text.optional()}).strict()}).strict()).max(1000)}).strict()
const receiptBaseSchema=z.object({schemaVersion:z.literal(1),attemptId:text,epoch:z.number().int().positive(),aggregateInputHash:hash,
  contentBindingHash:hash,generatedAt:z.string().datetime(),sources:z.array(z.object({itemId:text,resultHash:hash}).strict()).max(1000),interpretation:interpretationSchema}).strict()
// V1 remains exact for saved history; new references use a distinct receipt
// version rather than changing what an old hashed receipt decodes to.
const receiptV1Schema=receiptBaseSchema.extend({interpretation:interpretationSchema.extend({units:z.array(interpretationSchema.shape.units.element.extend({references:z.array(referenceSchema).max(0)})).max(1000)})})
const receiptV2Schema=receiptBaseSchema.extend({schemaVersion:z.literal(2),referenceBindingHash:hash})
const receiptSchema=z.discriminatedUnion('schemaVersion',[receiptV1Schema,receiptV2Schema])
export type TrainingFinalReceipt=z.infer<typeof receiptSchema>
type Parent=TrainingReferenceParent
class TrainingFinalContentError extends ContentReleaseError {readonly statusCode=409}
function fail():never{throw new TrainingFinalContentError('CONTENT_TRAINING_FINAL_IDENTITY_MISMATCH')}
function decodeBinding(parent:Parent){
  if(parent.trainingContentBinding==null&&parent.trainingContentBindingHash==null)return null
  const parsed=bindingSchema.safeParse(parent.trainingContentBinding)
  if(!parsed.success||!parent.trainingContentBindingHash)fail()
  const binding=parsed.data
  if(canonicalHash(binding)!==parent.trainingContentBindingHash||binding.attemptId!==parent.id||binding.epoch!==parent.attemptEpoch
    ||binding.compositeId!==parent.compositeAssessmentId||new Set(binding.units.map(u=>u.itemId)).size!==binding.units.length)fail()
  return binding
}
/** Only the authoritative aggregate finalizer may supply verified payloads, after
 * frozen-slot/context validation. Does not score, select, or disclose feedback. */
export async function prepareTrainingFinalReceipt(tx:Prisma.TransactionClient,input:{
  parent:Parent&{compositeAssessment:{id:string;createdBy:string}};aggregateInputHash:string;completedAt:string|Date;
  verifiedPayloads:Array<{header:{slotKey:string};envelope?:CanonicalUnitResultEnvelopeV1}>
}):Promise<{receipt:TrainingFinalReceipt;encrypted:string;hash:string}|null>{
  const {parent}=input,binding=decodeBinding(parent)
  if(!binding)return null
  const referenceBinding=decodeTrainingReferenceBinding(parent),populationContext=referenceBinding?readTrainingReferenceContext(parent):{}
  if(parent.compositeAssessment.id!==binding.compositeId)fail()
  const educationComposition=binding.educationComposition?await assertSealedCompositionAnchor(tx,binding.educationComposition,
    binding.compositeId,parent.compositeAssessment.createdBy):undefined
  const bySlot=new Map(input.verifiedPayloads.map(p=>[p.header.slotKey,p]))
  if(bySlot.size!==input.verifiedPayloads.length)fail()
  // Index frozen bindings only. Authority validation still runs on every read,
  // in binding order, including every unit sharing a release.
  const referenceUnitsByItemId=new Map(referenceBinding?.units.map(unit=>[unit.itemId,unit]))
  const measurementUnitsByReleaseId=new Map<string,typeof binding.units>()
  const selectedReferenceUnitsByReleaseId=new Map<string,typeof binding.units>()
  for(const unit of binding.units){
    const measurementUnits=measurementUnitsByReleaseId.get(unit.measurement.releaseId)
    if(measurementUnits)measurementUnits.push(unit)
    else measurementUnitsByReleaseId.set(unit.measurement.releaseId,[unit])
    // Match the former filter/some semantics: multiple slots for the same
    // release contribute this unit once, not once per selected slot.
    const selectedReleaseIds=new Set<string>()
    for(const slot of referenceUnitsByItemId.get(unit.itemId)?.references??[]){
      if(slot.status!=='SELECTED'||selectedReleaseIds.has(slot.releaseId))continue
      selectedReleaseIds.add(slot.releaseId)
      const referenceUnits=selectedReferenceUnitsByReleaseId.get(slot.releaseId)
      if(referenceUnits)referenceUnits.push(unit)
      else selectedReferenceUnitsByReleaseId.set(slot.releaseId,[unit])
    }
  }
  const cache=new Map<string,StoredRelease>(),sources:TrainingFinalReceipt['sources']=[]
  const readRelease=async(id:string,expectedHash:string)=>{
    let release=cache.get(id)
    if(!release){release=(await getContentRelease(tx,id,true))??undefined;if(release)cache.set(id,release)}
    if(!release||release.contentHash!==expectedHash)fail()
    const scope=release.scope
    if(release.layer==='REPORT'){
      const matching=binding.units.filter(unit=>unit.report?.releaseId===id)
      if(!matching.length)fail()
      for(const unit of matching)if(unit.source.standardCombination||scope.kind==='PLATFORM'||scope.kind==='PRIVATE'&&['SCHOOL','TEACHER'].includes(scope.product))await validateTrainingReportPointer(tx,{unit,compositeId:binding.compositeId,ownerId:parent.compositeAssessment.createdBy,
        reportReleaseId:id,contentHash:expectedHash,publication:false,releases:cache})
      else if(scope.kind!=='PRIVATE'||scope.product!=='TRAINING'||scope.ownerId!==parent.compositeAssessment.createdBy||scope.resourceId!==binding.compositeId)fail()
    }else if(release.layer==='MEASUREMENT'){
      const matching=measurementUnitsByReleaseId.get(id)??[]
      if(!matching.length)fail()
      for(const unit of matching)if(release.family!==unit.family||!await trainingMeasurementSourceScopeMatchesForConsumer(tx,release,unit.source,
        {compositeId:binding.compositeId,ownerId:parent.compositeAssessment.createdBy,itemId:unit.itemId,educationComposition}))fail()
    }else if(release.layer==='REFERENCE'){
      const matching=selectedReferenceUnitsByReleaseId.get(id)??[]
      if(!matching.length)fail()
      for(const unit of matching)await validateTrainingReferenceRelease(tx,{unit,ownerId:parent.compositeAssessment.createdBy,compositeId:binding.compositeId,
        releaseId:id,contentHash:expectedHash,purpose:'HISTORY',releases:cache})
    }else fail()
    return release
  }
  const interpretation:FinalInterpretation=await interpretContentBinding({contentBindingHash:parent.trainingContentBindingHash!,
    binding:{populationContext,units:binding.units.map(u=>({...u,instrumentKey:u.itemId,references:referenceUnitsByItemId.get(u.itemId)?.references??[]}))},readRelease,
    readFacts:(unit,measurement)=>{
      const payload=bySlot.get(compositeItemSlotKey(unit.itemId,unit.family==='SJT'?'SITUATIONAL':unit.family))
      const envelope=payload?.envelope
      if(!envelope)return {notExecuted:true,quality:undefined,metrics:[]}
      const core=envelope.core
      if(core.unitType!==(measurement.family==='SJT'?'SITUATIONAL':measurement.family)||!hash.safeParse(envelope.resultHash).success
        ||referenceBinding&&core.contextHash!==referenceBinding.contextHash)fail()
      sources.push({itemId:unit.itemId,resultHash:envelope.resultHash})
      return {notExecuted:false,quality:core.quality.status,metrics:core.metrics.map(m=>({key:m.key,
        value:typeof m.value==='number'&&Number.isFinite(m.value)?m.value:null,
        status:(m.quality===undefined||['calculated','OK','interpretable'].includes(m.quality))?'OK':'UNAVAILABLE'}))}
    }}).catch(error=>{if(error instanceof FinalInterpretationIdentityError)fail();throw error})
  const receipt=receiptSchema.parse({schemaVersion:referenceBinding?2:1,...(referenceBinding?{referenceBindingHash:parent.trainingReferenceBindingHash}:{}),attemptId:parent.id,epoch:parent.attemptEpoch,aggregateInputHash:input.aggregateInputHash,
    contentBindingHash:parent.trainingContentBindingHash,generatedAt:new Date(input.completedAt).toISOString(),sources,interpretation})
  return {receipt,encrypted:encryptUnifiedRuntimePayload(receipt),hash:canonicalHash(receipt)}
}
/** Historical reads validate the stored receipt only. No owner, facts, release
 * resolution or current-version recomputation is required by this decoder. */
export function decodeTrainingFinalReceipt(parent:Parent&{aggregateInputHash:string|null;
  trainingContentInterpretationEncrypted:string|null;trainingContentInterpretationHash:string|null}):TrainingFinalReceipt|null{
  const cipher=parent.trainingContentInterpretationEncrypted,hashValue=parent.trainingContentInterpretationHash
  if(cipher==null&&hashValue==null)return null
  const binding=decodeBinding(parent)
  if(!cipher||!hashValue||!binding)fail()
  const parsed=receiptSchema.safeParse(decryptUnifiedRuntimePayload(cipher))
  if(!parsed.success)fail()
  const receipt=parsed.data
  if(canonicalHash(receipt)!==hashValue||receipt.attemptId!==parent.id||receipt.epoch!==parent.attemptEpoch
    ||receipt.aggregateInputHash!==parent.aggregateInputHash||receipt.contentBindingHash!==parent.trainingContentBindingHash
    ||receipt.interpretation.contentBindingHash!==receipt.contentBindingHash)fail()
  if(receipt.schemaVersion===2){
    const selected=decodeTrainingReferenceBinding(parent)
    if(!selected||receipt.referenceBindingHash!==parent.trainingReferenceBindingHash)fail()
    for(const [i,unit] of receipt.interpretation.units.entries()){
      const references=selected.units[i]?.references
      if(!references||unit.references.length!==references.length||unit.references.some((r,j)=>r.metricKey!==references[j].metricKey||r.referenceKind!==references[j].referenceKind))fail()
    }
  }else if(binding.units.some(u=>u.referencePolicy!==undefined))fail()
  const ids=binding.units.map(u=>u.itemId)
  if(receipt.interpretation.units.length!==ids.length||receipt.interpretation.units.some((u,i)=>u.instrumentKey!==ids[i])
    ||new Set(receipt.sources.map(s=>s.itemId)).size!==receipt.sources.length||receipt.sources.some(s=>!ids.includes(s.itemId)))fail()
  return receipt
}
