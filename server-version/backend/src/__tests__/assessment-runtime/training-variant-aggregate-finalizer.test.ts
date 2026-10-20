import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const db=vi.hoisted(()=>({compositeAssessmentAttempt:{findUnique:vi.fn(),updateMany:vi.fn(),update:vi.fn()},assessmentUnitSnapshot:{findMany:vi.fn()},$transaction:vi.fn(),$queryRaw:vi.fn()}))
const getRelease=vi.hoisted(()=>vi.fn())
vi.mock('../../config/database',()=>({prisma:db}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:getRelease}))
import {compileWeightedVariants,createWeightedVariantAllocation} from '../../modules/assessment-core/weighted-variants'
import {buildTrainingVariantUnion,applyTrainingAttemptScope} from '../../modules/composite/training-variant-scope'
import {mapCompositeSection} from '../../modules/assessment-runtime/form-section-definition'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {buildAggregateInputHash} from '../../modules/assessment-runtime/unified-aggregate'
import {createCanonicalUnitResultEnvelope,projectScaleCanonicalUnitResult} from '../../modules/assessment-runtime/unit-result'
import {finalizeCompositeAttemptUnifiedIfReady} from '../../modules/assessment-runtime/unified-aggregate-finalizer.service'

beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','e'.repeat(64));vi.stubEnv('ASSESSMENT_REPORT_SNAPSHOT_BATCH_ENABLED','true')
 getRelease.mockReset();db.compositeAssessmentAttempt.update.mockReset()
 db.compositeAssessmentAttempt.updateMany.mockResolvedValue({count:1});db.$transaction.mockImplementation(async operation=>operation(db))
})
afterEach(()=>vi.unstubAllEnvs())
function fixture(){
 const items=[0,1].map(index=>({id:`item-${index}`,type:'FORM',position:index,formSectionPosition:0,formType:'number',formLabel:`Question ${index}`,required:true,formOptions:null,
   formDefinition:{itemKey:`item_${index}`,type:'NUMBER',prompt:`Question ${index}`,required:true,options:[],rows:[]},formPolicy:{version:3,requiredRefusal:'ALLOW_SUBMIT',hiddenRequired:'EXEMPT'}}))
 const sections=items.map((item,index)=>({id:`section-${index}`,title:`Section ${index}`,description:null,position:index,contextSection:false,items:[item]}))
 const composite:any={id:'composite',createdBy:'owner',productKind:'QUESTIONNAIRE',trainingVariantDraft:null,trainingFlowDraft:null,trainingFlowFrozen:null,trainingFlowDigest:null,publishedAt:new Date('2026-10-18T00:00:00Z'),items,formSections:sections}
 const compiled=compileWeightedVariants({schemaVersion:1,groups:sections.map((section,index)=>({variantKey:`group_${index}`,label:`Group ${index}`,weight:1,units:[{type:'FORM_SECTION',id:section.id}]}))},buildTrainingVariantUnion(composite))
 composite.trainingVariantFrozen=compiled;composite.trainingVariantDigest=compiled.configDigest
 const allocation=createWeightedVariantAllocation(compiled,{compositeId:composite.id,attemptId:'parent',participantKey:'user',attemptEpoch:1,publishedAt:composite.publishedAt.toISOString()},{randomInt:()=>0,assignedAt:'2026-10-18T00:00:01Z'})
 const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{slotKey:'form-section:section-0',unitType:'FORM_SECTION',required:true,sourceDefinitionIdentity:{key:'section-0',version:'FORM_SECTION_V3',hash:canonicalHash(mapCompositeSection(sections[0]))},sourceBinding:{sectionId:'section-0'}}]})
 const parent:any={id:'parent',compositeAssessmentId:'composite',trainingContentBinding:null,trainingContentBindingHash:null,status:'IN_PROGRESS',runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',attemptEpoch:1,participantKey:'user',startedAt:new Date('2026-10-18T00:00:00Z'),completedAt:null,progress:0,completedItems:0,
   contextSnapshotEncrypted:null,contextSnapshotHash:null,compiledBundleRuntimeHash:null,aggregateInputHash:null,trainingVariantAllocationEncrypted:encryptUnifiedRuntimePayload(allocation),trainingVariantAllocationHash:allocation.allocationHash,
   trainingFlowSnapshotEncrypted:null,trainingFlowSnapshotHash:null,trainingFlowPathEncrypted:null,trainingFlowPathHash:null,
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
 it.each(['trainingContentBinding','trainingContentBindingHash','compositeAssessmentId','createdBy'])('reloads an older committed graph missing %s rather than treating it as legacy content',async field=>{
  const f=fixture(),preloaded={...f.parent,compositeAssessment:{...f.parent.compositeAssessment}}
  if(field==='createdBy')delete preloaded.compositeAssessment.createdBy
  else delete preloaded[field]
  const result=await finalizeCompositeAttemptUnifiedIfReady(f.parent.id,f.parent,f.reportJob,preloaded)
  expect(result).toMatchObject({status:'COMPLETED',aggregateInputHash:f.expectedHash})
  expect(db.compositeAssessmentAttempt.findUnique).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
   where:{id:f.parent.id},select:expect.objectContaining({compositeAssessmentId:true,trainingContentBinding:true,trainingContentBindingHash:true,
    compositeAssessment:expect.objectContaining({select:expect.objectContaining({createdBy:true})})})}))
  expect(getRelease).not.toHaveBeenCalled();expect(db.compositeAssessmentAttempt.update).not.toHaveBeenCalled()
 })
 it('loads all receipt identities in the worker-only committed graph and preserves explicit nulls',async()=>{
  const {wholeReportParentSelect,copyWholeCommittedReportParent}=await import('../../modules/composite/whole-questionnaire.service')
  expect(wholeReportParentSelect).toMatchObject({compositeAssessmentId:true,trainingContentBinding:true,trainingContentBindingHash:true,
   trainingContentInterpretationEncrypted:true,trainingContentInterpretationHash:true,compositeAssessment:{select:{id:true,createdBy:true}}})
  const f=fixture(),copied=copyWholeCommittedReportParent(f.parent,[])
  expect(copied).toMatchObject({compositeAssessmentId:'composite',trainingContentBinding:null,trainingContentBindingHash:null,
   compositeAssessment:{id:'composite',createdBy:'owner'}})
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

// Real canonical decoding and receipt generation; only durable reads/writes are mocked.
function boundScaleFixture(){
 const f=fixture(),hash='a'.repeat(64),measurementId='11111111-1111-4111-8111-111111111111',reportId='22222222-2222-4222-8222-222222222222'
 const runtime:any={schemaVersion:1,compilerVersion:'fixture',instrumentType:'SCALE',instrumentKey:'scale-key',instrumentVersion:'1',
  sourceDefinitionHash:hash,compiledRuntimeHash:hash,scorerKey:'scale',scorerVersion:'1',metricDefinitions:{total:{unit:'score'}},
  aggregateProjection:{allowedMetricKeys:['total'],allowedFactKeys:[],allowedReferenceClassifications:[]}}
 const core=projectScaleCanonicalUnitResult({runtime,contextHash:null,result:{quality:{status:'interpretable',flags:[]},
  scores:[{key:'total',value:12,status:'calculated'}],references:[]} as any})
 const envelope=createCanonicalUnitResultEnvelope({core,completedAt:'2026-10-18T00:01:00.000Z',
  persistenceProvenance:{sourceType:'ASSESSMENT',sourceAttemptId:'scale-child',sourceSubmissionId:'scale-submission'}})
 const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{
  slotKey:'scale:scale-item',unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:'scale-key',version:'1',hash},
  sourceBinding:{compositeItemId:'scale-item',compiledRuntimeHash:hash}}]})
 Object.assign(f.parent,{trainingVariantAllocationEncrypted:null,trainingVariantAllocationHash:null,
  frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(slots),frozenActiveSlotSetHash:slots.snapshotHash,
  formSectionAttempts:[],scaleAssessments:[],trainingContentInterpretationEncrypted:null,trainingContentInterpretationHash:null})
 Object.assign(f.parent.compositeAssessment,{trainingVariantFrozen:null,trainingVariantDigest:null,
  items:[{id:'scale-item',type:'SCALE',scaleId:'source',position:0,required:true}],formSections:[]})
 f.parent.trainingContentBinding={schemaVersion:1,compositeId:'composite',attemptId:f.parent.id,epoch:1,publicationHash:hash,
  units:[{itemId:'scale-item',family:'SCALE',source:{kind:'SCALE',id:'source',ownerId:'owner'},
   measurement:{releaseId:measurementId,contentHash:hash,measurementHash:hash},report:{releaseId:reportId,contentHash:hash}}]}
 f.parent.trainingContentBindingHash=canonicalHash(f.parent.trainingContentBinding)
 const row:any={id:'scale-snapshot',compositeAttemptId:f.parent.id,attemptEpoch:1,slotKey:'scale:scale-item',unitType:'SCALE',
  terminalState:'COMPLETED',payloadKind:'UNIT_RESULT',sourceType:'ASSESSMENT',sourceAttemptId:'scale-child',sourceSubmissionId:'scale-submission',
  sourceDefinitionHash:hash,compiledRuntimeHash:hash,completedAt:new Date(envelope.completedAt),
  canonicalResultEncrypted:encryptUnifiedRuntimePayload(envelope),collectionFactsEncrypted:null}
 db.assessmentUnitSnapshot.findMany.mockResolvedValue([row])
 getRelease.mockImplementation(async(_tx,id)=>id===measurementId?{releaseId:id,contentHash:hash,layer:'MEASUREMENT',family:'SCALE',status:'PUBLISHED',
  scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'owner',resourceId:'source'},content:{measurementHash:hash}}:
 {releaseId:id,contentHash:hash,layer:'REPORT',family:'SCALE',status:'PUBLISHED',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'owner',resourceId:'composite'},
  content:{generatorVersion:'DECLARATIVE_REPORT_V1',measurements:[{releaseId:measurementId,contentHash:hash}]}})
 return {parent:f.parent,row,envelope,reportJob:{attemptEpoch:1,slotSetHash:slots.snapshotHash,contextHash:null}}
}
describe('committed aggregate graph to Training FINAL receipt',()=>{
 it('persists a nonempty bound receipt after completion CAS in the same transaction without reloading the graph',async()=>{
  const f=boundScaleFixture(),before=JSON.stringify(f.row)
  const result=await finalizeCompositeAttemptUnifiedIfReady(f.parent.id,f.parent,f.reportJob,f.parent)
  expect(result).toMatchObject({status:'COMPLETED'})
  expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1);expect(db.$transaction).toHaveBeenCalledTimes(1)
  expect(db.compositeAssessmentAttempt.updateMany).toHaveBeenCalledTimes(1)
  expect(db.compositeAssessmentAttempt.update).toHaveBeenCalledExactlyOnceWith({where:{id:f.parent.id},data:{
   trainingContentInterpretationEncrypted:expect.any(String),trainingContentInterpretationHash:expect.any(String)}})
  const stored=db.compositeAssessmentAttempt.update.mock.calls[0][0].data
  const receipt:any=decryptUnifiedRuntimePayload(stored.trainingContentInterpretationEncrypted)
  expect(receipt).toMatchObject({attemptId:f.parent.id,epoch:1,aggregateInputHash:result!.aggregateInputHash,
   contentBindingHash:f.parent.trainingContentBindingHash,sources:[{itemId:'scale-item',resultHash:f.envelope.resultHash}],
   interpretation:{units:[{instrumentKey:'scale-item',report:{status:'READY'}}]}})
  expect(canonicalHash(receipt)).toBe(stored.trainingContentInterpretationHash)
  expect(getRelease.mock.calls.every(call=>call[0]===db&&call[2]===true)).toBe(true)
  expect(db.compositeAssessmentAttempt.updateMany.mock.invocationCallOrder[0]).toBeLessThan(getRelease.mock.invocationCallOrder[0])
  expect(getRelease.mock.invocationCallOrder.at(-1)!).toBeLessThan(db.compositeAssessmentAttempt.update.mock.invocationCallOrder[0])
  expect(JSON.stringify(f.row)).toBe(before)
 })
 it('propagates a receipt-write failure out of the completion transaction rather than accepting a receiptless success',async()=>{
  const f=boundScaleFixture(),failure=new Error('receipt persistence failed')
  db.compositeAssessmentAttempt.update.mockRejectedValue(failure)
  await expect(finalizeCompositeAttemptUnifiedIfReady(f.parent.id,f.parent,f.reportJob,f.parent)).rejects.toMatchObject({
   code:'DEFINITION_MISMATCH',statusCode:409,message:'统一聚合输入无效：receipt persistence failed'})
  expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  expect(db.$transaction).toHaveBeenCalledTimes(1);expect(db.compositeAssessmentAttempt.updateMany).toHaveBeenCalledTimes(1)
  // Mocked I/O proves shared transaction/error propagation, not PostgreSQL rollback.
 })
})
