import {beforeEach,describe,expect,it,vi} from 'vitest'
const db=vi.hoisted(()=>({compositeAssessmentAttempt:{findUnique:vi.fn(),updateMany:vi.fn()},assessmentUnitSnapshot:{findMany:vi.fn()},$transaction:vi.fn(),$queryRaw:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:db}))
import {compileWeightedVariants,createWeightedVariantAllocation} from '../../modules/assessment-core/weighted-variants'
import {buildTrainingVariantUnion,applyTrainingAttemptScope} from '../../modules/composite/training-variant-scope'
import {mapCompositeSection} from '../../modules/assessment-runtime/form-section-definition'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {buildAggregateInputHash} from '../../modules/assessment-runtime/unified-aggregate'
import {finalizeCompositeAttemptUnifiedIfReady} from '../../modules/assessment-runtime/unified-aggregate-finalizer.service'

beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','e'.repeat(64));vi.stubEnv('ASSESSMENT_REPORT_SNAPSHOT_BATCH_ENABLED','true')
 db.compositeAssessmentAttempt.updateMany.mockResolvedValue({count:1});db.$transaction.mockImplementation(async operation=>operation(db))
})
function fixture(){
 const items=[0,1].map(index=>({id:`item-${index}`,type:'FORM',position:index,formSectionPosition:0,formType:'number',formLabel:`Question ${index}`,required:true,formOptions:null,
   formDefinition:{itemKey:`item_${index}`,type:'NUMBER',prompt:`Question ${index}`,required:true,options:[],rows:[]},formPolicy:{version:3,requiredRefusal:'ALLOW_SUBMIT',hiddenRequired:'EXEMPT'}}))
 const sections=items.map((item,index)=>({id:`section-${index}`,title:`Section ${index}`,description:null,position:index,contextSection:false,items:[item]}))
 const composite:any={id:'composite',productKind:'QUESTIONNAIRE',trainingVariantDraft:null,publishedAt:new Date('2026-10-18T00:00:00Z'),items,formSections:sections}
 const compiled=compileWeightedVariants({schemaVersion:1,groups:sections.map((section,index)=>({variantKey:`group_${index}`,label:`Group ${index}`,weight:1,units:[{type:'FORM_SECTION',id:section.id}]}))},buildTrainingVariantUnion(composite))
 composite.trainingVariantFrozen=compiled;composite.trainingVariantDigest=compiled.configDigest
 const allocation=createWeightedVariantAllocation(compiled,{compositeId:composite.id,attemptId:'parent',participantKey:'user',attemptEpoch:1,publishedAt:composite.publishedAt.toISOString()},{randomInt:()=>0,assignedAt:'2026-10-18T00:00:01Z'})
 const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{slotKey:'form-section:section-0',unitType:'FORM_SECTION',required:true,sourceDefinitionIdentity:{key:'section-0',version:'FORM_SECTION_V3',hash:canonicalHash(mapCompositeSection(sections[0]))},sourceBinding:{sectionId:'section-0'}}]})
 const parent:any={id:'parent',status:'IN_PROGRESS',runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',attemptEpoch:1,participantKey:'user',startedAt:new Date('2026-10-18T00:00:00Z'),completedAt:null,progress:0,completedItems:0,
   contextSnapshotEncrypted:null,contextSnapshotHash:null,compiledBundleRuntimeHash:null,aggregateInputHash:null,trainingVariantAllocationEncrypted:encryptUnifiedRuntimePayload(allocation),trainingVariantAllocationHash:allocation.allocationHash,
   frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(slots),frozenActiveSlotSetHash:slots.snapshotHash,compositeAssessment:composite,
   formSectionAttempts:[{sectionId:'section-0',attemptEpoch:1,status:'COMPLETED',taskSatisfaction:'SATISFIED'}]}
 const facts={schemaVersion:3,sectionKey:'section-0',items:[{key:'item-0',label:'Question 0',value:0,state:'ANSWERED'}]}
 const row:any={id:'snapshot',compositeAttemptId:parent.id,attemptEpoch:1,slotKey:'form-section:section-0',unitType:'FORM_SECTION',terminalState:'COMPLETED',payloadKind:'COLLECTION_FACTS',sourceType:'COMPOSITE_FORM_SECTION',sourceAttemptId:'section-attempt',sourceSubmissionId:'submission',sourceDefinitionHash:canonicalHash(mapCompositeSection(sections[0])),compiledRuntimeHash:null,completedAt:new Date('2026-10-18T00:01:00Z'),canonicalResultEncrypted:null,collectionFactsEncrypted:encryptUnifiedRuntimePayload(facts)}
 db.compositeAssessmentAttempt.findUnique.mockResolvedValue(parent);db.assessmentUnitSnapshot.findMany.mockResolvedValue([row])
 const reportJob={attemptEpoch:1,slotSetHash:slots.snapshotHash,contextHash:null}
 return {parent,row,facts,reportJob,expectedHash:buildAggregateInputHash({attemptEpoch:1,contextHash:null,compiledBundleRuntimeHash:null,entries:[{slotKey:row.slotKey,terminalState:'COMPLETED',payloadKind:'COLLECTION_FACTS',collectionFactsHash:canonicalHash(facts),collectionIdentity:{sectionKey:'section-0',itemKeys:['item-0']}}]})}
}
describe('selected variant aggregate finalization',()=>{
 it('finalizes only selected accepted Form V3 facts and qualification with their unchanged aggregate identity',async()=>{
  const f=fixture(),acceptedCipher=f.row.collectionFactsEncrypted
  const result=await finalizeCompositeAttemptUnifiedIfReady(f.parent.id,f.parent,f.reportJob)
  expect(result).toMatchObject({status:'COMPLETED',progress:100,taskSatisfaction:'SATISFIED',aggregateInputHash:f.expectedHash})
  expect(db.compositeAssessmentAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({completedItems:1,taskSatisfaction:'SATISFIED',aggregateInputHash:f.expectedHash})}))
  expect(f.parent.compositeAssessment.formSections).toHaveLength(2);expect(f.row.collectionFactsEncrypted).toBe(acceptedCipher)
  expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
  const select=db.compositeAssessmentAttempt.findUnique.mock.calls[0][0].select
  expect(select).toMatchObject({participantKey:true,trainingVariantAllocationEncrypted:true,trainingVariantAllocationHash:true,compositeAssessment:{select:{publishedAt:true,trainingVariantFrozen:true,trainingVariantDigest:true,items:{select:{scaleId:true,cognitiveAssignmentId:true,situationalInstrumentKey:true,formDefinition:true}}}}})
 })
 it('reuses an already verified committed selected graph without a second union load',async()=>{
  const f=fixture(),projected=await applyTrainingAttemptScope(f.parent)
  const result=await finalizeCompositeAttemptUnifiedIfReady(f.parent.id,f.parent,f.reportJob,projected)
  expect(result).toMatchObject({status:'COMPLETED',aggregateInputHash:f.expectedHash});expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
 })
 it('keeps ordinary null configuration and accepted aggregate hashes unchanged',async()=>{
  const f=fixture();f.parent.trainingVariantAllocationEncrypted=null;f.parent.trainingVariantAllocationHash=null
  f.parent.compositeAssessment.trainingVariantFrozen=null;f.parent.compositeAssessment.trainingVariantDigest=null
  f.parent.compositeAssessment.items=f.parent.compositeAssessment.items.slice(0,1);f.parent.compositeAssessment.formSections=f.parent.compositeAssessment.formSections.slice(0,1)
  const result=await finalizeCompositeAttemptUnifiedIfReady(f.parent.id,f.parent,f.reportJob)
  expect(result).toMatchObject({status:'COMPLETED',aggregateInputHash:f.expectedHash,taskSatisfaction:'SATISFIED'})
 })
 it('accepts a copied committed graph only when it retains the authoritative publication union',async()=>{
  const f=fixture();const selected=await applyTrainingAttemptScope(f.parent)
  const {copyWholeCommittedReportParent}=await import('../../modules/composite/whole-questionnaire.service')
  const committed=copyWholeCommittedReportParent(f.parent,[])
  expect(selected.compositeAssessment.formSections).toHaveLength(1);expect(committed.compositeAssessment.formSections).toHaveLength(2)
  const result=await finalizeCompositeAttemptUnifiedIfReady(f.parent.id,f.parent,f.reportJob,committed)
  expect(result).toMatchObject({status:'COMPLETED',aggregateInputHash:f.expectedHash});expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  const workerCopy={...committed,status:'COMPLETED',aggregateInputHash:result!.aggregateInputHash}
  const reportCopy=await applyTrainingAttemptScope(workerCopy)
  expect(reportCopy.compositeAssessment.formSections).toHaveLength(1);expect(reportCopy.compositeAssessment.items.map((item:any)=>item.id)).toEqual(['item-0'])
  expect(committed.compositeAssessment.formSections).toHaveLength(2)
 })
 it.each(['allocation','publication','selected-definition','foreign-snapshot','missing-config'])('rejects %s drift without accepting or rewriting facts',async mode=>{
  const f=fixture()
  if(mode==='allocation')f.parent.trainingVariantAllocationHash='f'.repeat(64)
  if(mode==='missing-config'){delete f.parent.compositeAssessment.trainingVariantFrozen;delete f.parent.compositeAssessment.trainingVariantDigest}
  if(mode==='publication')f.parent.compositeAssessment.publishedAt=new Date('2026-10-19T00:00:00Z')
  if(mode==='selected-definition')f.parent.compositeAssessment.items[0].formDefinition.prompt='Changed'
  if(mode==='foreign-snapshot')db.assessmentUnitSnapshot.findMany.mockResolvedValue([f.row,{...f.row,id:'other',slotKey:'form-section:section-1'}])
  await expect(finalizeCompositeAttemptUnifiedIfReady(f.parent.id,f.parent,f.reportJob)).rejects.toMatchObject({code:'DEFINITION_MISMATCH'})
  expect(db.compositeAssessmentAttempt.updateMany).not.toHaveBeenCalled();expect(db.$transaction).not.toHaveBeenCalled()
 })
})
