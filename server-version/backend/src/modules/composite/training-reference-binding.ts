import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {assessmentContextHashMatches,decryptAssessmentContext,type AssessmentContextV1} from '../assessment-context'
import type {ReferenceContext} from '../assessment-reference/reference'
import {selectFrozenReferencePolicy,type VerifiedReferenceForSelection} from '../measurement-content/reference-policy'
import type {StoredRelease} from '../measurement-content/repository'
import {trainingContentSnapshotSchema} from './training-content-binding'
import {trainingReferenceKindSchema,trainingReferenceFail,validateTrainingReferenceRelease} from './training-reference-selection'
const text=z.string().min(1).max(240),hash=z.string().regex(/^[a-f0-9]{64}$/)
const slotBase={metricKey:text,referenceKind:trainingReferenceKindSchema}
export const trainingSelectedReferenceSchema=z.discriminatedUnion('status',[
 z.object({...slotBase,status:z.literal('SELECTED'),releaseId:z.string().uuid(),contentHash:hash,entryKey:hash}).strict(),
 z.object({...slotBase,status:z.literal('UNAVAILABLE'),reason:z.enum(['REVOKED','RETIRED','MISSING_CONTEXT','NO_MATCH','AMBIGUOUS'])}).strict(),
])
export const trainingReferenceBindingSchema=z.object({schemaVersion:z.literal(1),attemptId:text,epoch:z.number().int().positive(),
 contentBindingHash:hash,contextHash:hash.nullable(),units:z.array(z.object({itemId:text,references:z.array(trainingSelectedReferenceSchema).max(100)}).strict()).max(1000)}).strict()
const contentBindingSchema=trainingContentSnapshotSchema.extend({attemptId:text,epoch:z.number().int().positive(),publicationHash:hash}).strict()
export type TrainingReferenceBinding=z.infer<typeof trainingReferenceBindingSchema>
export type TrainingReferenceParent={id:string;attemptEpoch:number;compositeAssessmentId:string;trainingContentBinding:unknown;trainingContentBindingHash:string|null;
 trainingReferenceBinding?:unknown;trainingReferenceBindingHash?:string|null;contextSnapshotEncrypted?:string|null;contextSnapshotHash?:string|null}
export function trainingBoundContent(parent:TrainingReferenceParent){
 if(parent.trainingContentBinding==null&&parent.trainingContentBindingHash==null)return null
 const parsed=contentBindingSchema.safeParse(parent.trainingContentBinding)
 if(!parsed.success||!parent.trainingContentBindingHash||canonicalHash(parsed.data)!==parent.trainingContentBindingHash
  ||parsed.data.attemptId!==parent.id||parsed.data.compositeId!==parent.compositeAssessmentId||parsed.data.epoch!==parent.attemptEpoch
  ||new Set(parsed.data.units.map(u=>u.itemId)).size!==parsed.data.units.length
  ||parsed.data.units.reduce((n,u)=>n+(u.referencePolicy?.choices.length??0),0)>1000)trainingReferenceFail('BINDING_IDENTITY')
 return parsed.data
}
/** Historical decoder adds no default fields to old objects: previous canonical
 * binding and receipt hashes remain byte-for-byte meaningful. Never reselect. */
export function decodeTrainingReferenceBinding(parent:TrainingReferenceParent):TrainingReferenceBinding|null{
 const content=trainingBoundContent(parent),required=content?.units.some(u=>u.referencePolicy!==undefined)??false
 if(parent.trainingReferenceBinding==null&&parent.trainingReferenceBindingHash==null){if(required)trainingReferenceFail('BINDING_REQUIRED');return null}
 const parsed=trainingReferenceBindingSchema.safeParse(parent.trainingReferenceBinding)
 if(!parsed.success||!content||!parent.trainingReferenceBindingHash||canonicalHash(parsed.data)!==parent.trainingReferenceBindingHash)trainingReferenceFail('BINDING_IDENTITY')
 const binding=parsed.data
 if(binding.attemptId!==parent.id||binding.epoch!==parent.attemptEpoch||binding.contentBindingHash!==parent.trainingContentBindingHash
  ||binding.contextHash!==(parent.contextSnapshotHash??null)||binding.units.length!==content.units.length)trainingReferenceFail('BINDING_IDENTITY')
 for(const [index,unit] of content.units.entries()){
  const selected=binding.units[index],choices=unit.referencePolicy?.choices??[]
  if(selected.itemId!==unit.itemId||unit.referencePolicy&&unit.referencePolicy.measurementReleaseId!==unit.measurement.releaseId)trainingReferenceFail('BINDING_IDENTITY')
  const slots=new Set(choices.map(c=>JSON.stringify([c.metricKey,c.referenceKind])))
  if(selected.references.length!==slots.size||new Set(selected.references.map(c=>JSON.stringify([c.metricKey,c.referenceKind]))).size!==slots.size)trainingReferenceFail('BINDING_IDENTITY')
  for(const slot of selected.references){
   if(!slots.has(JSON.stringify([slot.metricKey,slot.referenceKind])))trainingReferenceFail('BINDING_IDENTITY')
   if(slot.status==='SELECTED'&&!choices.some(c=>c.releaseId===slot.releaseId&&c.contentHash===slot.contentHash&&c.entryKey===slot.entryKey&&c.metricKey===slot.metricKey&&c.referenceKind===slot.referenceKind))trainingReferenceFail('BINDING_IDENTITY')
  }
 }
 return binding
}
export function readTrainingReferenceContext(parent:TrainingReferenceParent):ReferenceContext{
 if(parent.contextSnapshotEncrypted==null&&parent.contextSnapshotHash==null)return {}
 if(!parent.contextSnapshotEncrypted||!parent.contextSnapshotHash)trainingReferenceFail('CONTEXT_IDENTITY')
 const context=decryptAssessmentContext(parent.contextSnapshotEncrypted)
 if(!assessmentContextHashMatches(context,parent.contextSnapshotHash))trainingReferenceFail('CONTEXT_IDENTITY')
 return context.values
}
/** Called under the parent transaction lock, before any runner delivery: either
 * creation without a context section, or the successful context-section submit.
 * Existing bindings are read-only; retries never consult lifecycle or new refs. */
export async function freezeTrainingReferenceBinding(tx:Prisma.TransactionClient,parent:TrainingReferenceParent&{compositeAssessment:{createdBy:string|null}},
 frozenContext?:{context:AssessmentContextV1;hash:string}){
 const content=trainingBoundContent(parent)
 if(!content?.units.some(u=>u.referencePolicy!==undefined))return decodeTrainingReferenceBinding(parent)
 const current={...parent,...(frozenContext?{contextSnapshotHash:frozenContext.hash}:{})}
 if(parent.trainingReferenceBinding!=null||parent.trainingReferenceBindingHash!=null)return decodeTrainingReferenceBinding(current)
 const context=frozenContext?frozenContext.context.values:readTrainingReferenceContext(parent)
 if(frozenContext&&!assessmentContextHashMatches(frozenContext.context,frozenContext.hash))trainingReferenceFail('CONTEXT_IDENTITY')
 const releases=new Map<string,StoredRelease>(),verified=new Map<string,VerifiedReferenceForSelection>()
 const units:TrainingReferenceBinding['units']=[]
 for(const unit of content.units){
  const policy=unit.referencePolicy
  if(!policy){units.push({itemId:unit.itemId,references:[]});continue}
  if(policy.measurementReleaseId!==unit.measurement.releaseId)trainingReferenceFail('BINDING_IDENTITY')
  if(policy.choices.length&&!parent.compositeAssessment.createdBy)trainingReferenceFail('SCOPE_DENIED')
  for(const choice of policy.choices){
   if(!verified.has(choice.releaseId))verified.set(choice.releaseId,await validateTrainingReferenceRelease(tx,{unit,ownerId:parent.compositeAssessment.createdBy!,
    compositeId:content.compositeId,releaseId:choice.releaseId,contentHash:choice.contentHash,purpose:'HISTORY',admission:true,releases}))
  }
  units.push({itemId:unit.itemId,references:selectFrozenReferencePolicy(policy,[...new Set(policy.choices.map(c=>c.releaseId))].map(id=>verified.get(id)!),context)})
 }
 const binding=trainingReferenceBindingSchema.parse({schemaVersion:1,attemptId:parent.id,epoch:parent.attemptEpoch,
  contentBindingHash:parent.trainingContentBindingHash,contextHash:frozenContext?.hash??parent.contextSnapshotHash??null,units})
 const bindingHash=canonicalHash(binding)
 decodeTrainingReferenceBinding({...current,trainingReferenceBinding:binding,trainingReferenceBindingHash:bindingHash})
 const changed=await tx.compositeAssessmentAttempt.updateMany({where:{id:parent.id,attemptEpoch:parent.attemptEpoch,status:'IN_PROGRESS',trainingReferenceBindingHash:null},
  data:{trainingReferenceBinding:binding as Prisma.InputJsonValue,trainingReferenceBindingHash:bindingHash}})
 if(changed.count!==1)trainingReferenceFail('BINDING_CONFLICT')
 return binding
}
