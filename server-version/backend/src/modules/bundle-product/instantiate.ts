import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {encryptCognitivePayload} from '../cognitive/cognitive.security'
import {ensureCompositeFormSections} from '../composite/final-submit.service'
import {compositeBadRequest} from '../composite/composite.errors'
import type {EffectiveScaleDisclosureSnapshot} from '../scale/projection/types'
import {freezeBundleProductionDefinition,type BundleDefinitionEntry} from './definition-provider'
import type {BundleSlotDefinitionV1} from '../assessment-bundle/types'

export type BundleBindings={schemaVersion:1;
 slots:Array<{slotKey:string;itemId:string;unitType:string;scaleDisclosure?:EffectiveScaleDisclosureSnapshot}>;
 context:Array<{contextKey:string;itemId:string;valueType:string}>}
export type BundleSlotResource=
 |{type:'SCALE';scaleId:string;scaleDisclosure:EffectiveScaleDisclosureSnapshot}
 |{type:'COGNITIVE';cognitiveAssignmentId:string}
 |{type:'SITUATIONAL';situationalInstrumentKey:string;situationalInstrumentVersion:string}
type Header=Pick<Prisma.CompositeAssessmentUncheckedCreateInput,'code'|'name'|'courseId'|'publicEnabled'|'expiresAt'|'createdBy'|'creationKey'|'creationHash'>

/** Complete native package materialization, with no Training/education actor,
 * course, grant or publication policy. Its caller authorizes an exact source
 * and resolves every declared native slot in the same transaction. It cannot
 * append, remove or reorder slots, alter a definition, or invent a profile.
 */
export async function instantiateBundleStructure(tx:Prisma.TransactionClient,input:{entry:BundleDefinitionEntry;header:Header;sourceReference:string;
 resolveSlot:(slot:BundleSlotDefinitionV1,composite:Awaited<ReturnType<typeof tx.compositeAssessment.create>>)=>Promise<BundleSlotResource>}){
 const {entry}=input,definition=entry.definition
 const frozen=freezeBundleProductionDefinition(entry,{frozenAt:new Date().toISOString(),sourceReference:input.sourceReference})
 const slots=definition.slots.filter(slot=>slot.unitType!=='FORM').sort((a,b)=>a.position-b.position)
 if(definition.slots.some(slot=>slot.unitType==='FORM')&&!entry.contextDefinition)throw compositeBadRequest('FORM slot 缺少声明的上下文定义')
 if(slots.some(slot=>!slot.required))throw compositeBadRequest('当前 Bundle 投放仅支持必填测评槽位')
 const row=await tx.compositeAssessment.create({data:{...input.header,productKind:'ASSESSMENT_BUNDLE'}})
 const bindings:BundleBindings={schemaVersion:1,slots:[],context:[]}
 let position=0
 for(const field of entry.contextDefinition?.fields??[]){
  const choices=field.valueType==='boolean'?['true','false']:field.enumValues
  const item=await tx.compositeAssessmentItem.create({data:{compositeAssessmentId:row.id,type:'FORM',required:field.required,position:position++,
   formType:choices?'single_choice':'text_input',formLabel:field.contextKey==='subject_age_years'?'年龄（周岁）':field.contextKey,
   formOptions:choices?choices.map(value=>({label:value,value})):Prisma.JsonNull}})
  bindings.context.push({contextKey:field.contextKey,valueType:field.valueType,itemId:item.id})
 }
 await ensureCompositeFormSections(row.id,tx)
 for(const slot of slots){
  const resource=await input.resolveSlot(slot,row)
  if(resource.type!==slot.unitType)throw compositeBadRequest('Bundle 槽位原生类型不匹配')
  if(resource.type==='SCALE'&&!resource.scaleId||resource.type==='COGNITIVE'&&!resource.cognitiveAssignmentId
   ||resource.type==='SITUATIONAL'&&(resource.situationalInstrumentKey!==slot.instrumentKey||resource.situationalInstrumentVersion!==slot.instrumentVersion))
   throw compositeBadRequest('Bundle 槽位精确版本不匹配')
  // Persist only native resource columns, never arbitrary fields from a resolver.
  const source=resource.type==='SCALE'?{scaleId:resource.scaleId}:resource.type==='COGNITIVE'?{cognitiveAssignmentId:resource.cognitiveAssignmentId}:
   {situationalInstrumentKey:resource.situationalInstrumentKey,situationalInstrumentVersion:resource.situationalInstrumentVersion}
  const item=await tx.compositeAssessmentItem.create({data:{...source,compositeAssessmentId:row.id,type:slot.unitType,required:true,position:position++}})
  bindings.slots.push({slotKey:slot.slotKey,itemId:item.id,unitType:slot.unitType,...(resource.type==='SCALE'?{scaleDisclosure:resource.scaleDisclosure}:{})})
 }
 await tx.bundleInstance.create({data:{compositeId:row.id,bundleKey:definition.bundleKey,bundleVersion:definition.bundleVersion,
  definitionHash:frozen.contentHash,definitionEncrypted:encryptCognitivePayload(frozen),
  bindingsHash:canonicalHash(bindings),bindingsEncrypted:encryptCognitivePayload(bindings)}})
 return row
}
