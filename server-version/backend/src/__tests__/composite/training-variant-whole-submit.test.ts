import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({db:{$queryRaw:vi.fn(),compositeAssessmentAttempt:{findUnique:vi.fn()}},register:vi.fn(),runtime:vi.fn(),storage:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:mocks.db}))
vi.mock('../../modules/assessment-runtime/report-outbox.service',async importOriginal=>({...(await importOriginal<any>()),registerWholeQuestionnaireReceipt:mocks.register}))
vi.mock('../../modules/scale/scale-admission.service',async importOriginal=>({...(await importOriginal<any>()),loadScaleAdmissionRuntime:mocks.runtime}))
vi.mock('../../modules/assessment-runtime/whole-receipt-storage',()=>({admitWholeReceiptStorage:mocks.storage,detachedWholeReceiptsEnabled:()=>false,recordWholeReceiptStored:vi.fn()}))
import {compileWeightedVariants,createWeightedVariantAllocation} from '../../modules/assessment-core/weighted-variants'
import {buildTrainingVariantUnion} from '../../modules/composite/training-variant-scope'
import {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {prepareCanonicalSubmission} from '../../services/instrumentFinalSubmit'
import {clearWholeValidationRulesForTest,submitWholeQuestionnaire} from '../../modules/composite/whole-questionnaire.service'

const variantMarkerFields=['trainingVariantAllocationEncrypted','trainingVariantAllocationHash','trainingVariantDraft','trainingVariantFrozen','trainingVariantDigest'] as const
const flowMarkerFields=['trainingFlowSnapshotEncrypted','trainingFlowSnapshotHash','trainingFlowPathEncrypted','trainingFlowPathHash','trainingFlowDraft','trainingFlowFrozen','trainingFlowDigest'] as const
const markerFields=[...flowMarkerFields,...variantMarkerFields] as const
const markerOwner=(parent:any,field:typeof markerFields[number])=>field.startsWith('trainingVariantAllocation')||field.startsWith('trainingFlowSnapshot')||field.startsWith('trainingFlowPath')?parent:parent.compositeAssessment
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','e'.repeat(64));vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED','true');vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED','true');vi.stubEnv('ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED','false')
 clearWholeValidationRulesForTest();mocks.register.mockImplementation(async(_parent,input)=>({acceptedAt:input.acceptedAt,replayed:false,queueDepth:0}));mocks.storage.mockResolvedValue(undefined)
})
function fixture(variant=false){
 const rules=[{itemCode:'q1',required:true,values:[1,2]}],definitionHash='d'.repeat(64),sourceHash='e'.repeat(64),compiledHash='c'.repeat(64)
 const items=[0,1].map(index=>({id:`item-${index}`,type:'SCALE',position:index,required:true,scaleId:`scale-${index}`}))
 const composite:any={id:'composite',productKind:'QUESTIONNAIRE',reportPackageKey:null,analysisProtocolKey:null,publishedAt:new Date('2026-10-18T00:00:00Z'),items,formSections:[],trainingFlowDraft:null,trainingFlowFrozen:null,trainingFlowDigest:null,trainingVariantDraft:null,trainingVariantFrozen:null,trainingVariantDigest:null}
 const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{slotKey:'scale:item-0',unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:'scale-key',version:'1',hash:sourceHash},sourceBinding:{compositeItemId:'item-0',compiledRuntimeHash:compiledHash}}]})
 const parent:any={id:'parent',status:'IN_PROGRESS',runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',attemptEpoch:1,asyncReportEpoch:1,participantKey:'user',userId:'user',recoveryTokenHash:null,contextSnapshotHash:null,trainingTimingSnapshot:null,
  trainingFlowSnapshotEncrypted:null,trainingFlowSnapshotHash:null,trainingFlowPathEncrypted:null,trainingFlowPathHash:null,
  trainingVariantAllocationEncrypted:null,trainingVariantAllocationHash:null,frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(slots),frozenActiveSlotSetHash:slots.snapshotHash,compositeAssessment:composite,
  scaleAssessments:[{id:'scale-child',compositeAttemptId:'parent',compositeItemId:'item-0',attemptEpoch:1,runtimeGeneration:'UNIFIED_V1'}]}
 if(variant){
  const draft={schemaVersion:1,groups:items.map((item,index)=>({variantKey:`group_${index}`,label:`Group ${index}`,weight:1,units:[{type:'ITEM',id:item.id}]}))}
  const compiled=compileWeightedVariants(draft,buildTrainingVariantUnion(composite));composite.trainingVariantDraft=draft;composite.trainingVariantFrozen=compiled;composite.trainingVariantDigest=compiled.configDigest
  const allocation=createWeightedVariantAllocation(compiled,{compositeId:composite.id,attemptId:parent.id,participantKey:parent.participantKey,attemptEpoch:1,publishedAt:composite.publishedAt.toISOString()},{randomInt:()=>0,assignedAt:'2026-10-18T00:00:01Z'})
  parent.trainingVariantAllocationEncrypted=encryptUnifiedRuntimePayload(allocation);parent.trainingVariantAllocationHash=allocation.allocationHash
 }
 const manifest:any={schemaVersion:1,binding:{attemptId:'parent',attemptEpoch:1,slotSetHash:slots.snapshotHash,contextHash:null,userId:'user',recoveryTokenHash:null},requiredFormSlots:[],units:[{itemId:'item-0',assessmentId:'scale-child',definitionHash,admissionHash:'a'.repeat(64),deadlineMs:null,items:rules}]}
 const input:any={submissionId:'whole-test-submission',attemptEpoch:1,slotSetHash:slots.snapshotHash,contextSnapshotHash:null,units:[{itemId:'item-0',definitionHash,answers:[{itemCode:'q1',responseValue:1}]}]}
 const header:any={...parent,...composite,id:parent.id,jobId:'job',jobStatus:'PENDING',leaseToken:null,wholeSubmissionId:null,wholePayloadHash:null,wholeAcceptedAt:null}
 delete header.compositeAssessment
 const bind=()=>{header.wholeValidationEncrypted=encryptUnifiedRuntimePayload(manifest);header.wholeValidationHash=prepareCanonicalSubmission(manifest).hash;mocks.db.$queryRaw.mockResolvedValue([header]);mocks.db.compositeAssessmentAttempt.findUnique.mockResolvedValue(parent)}
 const compact=()=>{manifest.schemaVersion=2;delete manifest.units[0].items;manifest.units[0].rulesHash=prepareCanonicalSubmission({definitionHash,items:rules}).hash;bind()}
 mocks.runtime.mockResolvedValue({sourceDefinitionHash:sourceHash,instrumentKey:'scale-key',instrumentVersion:'1',legacyDefinitionHash:definitionHash,compiledRuntime:{compiledRuntimeHash:compiledHash,runtimeCapabilities:{aggregateEligible:true}},definition:{items:[{itemCode:'q1',required:true,responseSetKey:'r'}],responseSets:[{key:'r',options:[{value:1},{value:2}]}]}})
 bind();return {parent,header,input,manifest,bind,compact}
}
const submit=(f:ReturnType<typeof fixture>)=>submitWholeQuestionnaire('parent',f.input,{userId:'user'})
describe('whole receipt variant authorization before cached rules and replay',()=>{
 it('retains one-header legacy V1 and cached V2 submission paths with all twelve explicit nulls',async()=>{
  const f=fixture();await expect(submit(f)).resolves.toMatchObject({status:'ACCEPTED'});f.compact();await expect(submit(f)).resolves.toMatchObject({status:'ACCEPTED'})
  expect(mocks.db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled();expect(mocks.register).toHaveBeenCalledTimes(2)
  const sql=mocks.db.$queryRaw.mock.calls[0][0].join('');for(const field of ['training_flow_snapshot_encrypted','training_flow_snapshot_hash','training_flow_path_encrypted','training_flow_path_hash','training_flow_draft','training_flow_frozen','training_flow_digest','training_variant_allocation_encrypted','training_variant_allocation_hash','training_variant_draft','training_variant_frozen','training_variant_digest'])expect(sql).toContain(field)
 })
 it('validates selected allocation once and reuses that graph to reconstruct a cold V2 rule cache',async()=>{
  const f=fixture(true);f.compact();await expect(submit(f)).resolves.toMatchObject({status:'ACCEPTED'})
  expect(mocks.db.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1);expect(mocks.runtime).toHaveBeenCalledTimes(1);expect(mocks.register).toHaveBeenCalledTimes(1)
  expect(f.parent.compositeAssessment.items).toHaveLength(2)
 })
 it('rejects a corrupt allocation even when V2 scientific validation rules are warm',async()=>{
  await submit(fixture());mocks.register.mockClear();mocks.storage.mockClear()
  const f=fixture(true);f.compact();f.parent.trainingVariantAllocationHash=f.header.trainingVariantAllocationHash='f'.repeat(64)
  await expect(submit(f)).rejects.toMatchObject({statusCode:403});expect(mocks.register).not.toHaveBeenCalled();expect(mocks.storage).not.toHaveBeenCalled()
 })
 it.each(variantMarkerFields)('rejects partial %s before accepting inline V1 answers or writing a receipt',async field=>{
  const f=fixture();f.header[field]='present';markerOwner(f.parent,field)[field]='present'
  await expect(submit(f)).rejects.toMatchObject({statusCode:403});expect(mocks.db.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1);expect(mocks.register).not.toHaveBeenCalled();expect(mocks.storage).not.toHaveBeenCalled()
 })
 it('refuses a replay ACK when the frozen allocation disappeared after its prior receipt',async()=>{
  const f=fixture(true);f.header.wholeSubmissionId=f.input.submissionId;f.header.wholeAcceptedAt=new Date();f.header.wholePayloadHash=prepareCanonicalSubmission({attemptId:'parent',attemptEpoch:1,slotSetHash:f.input.slotSetHash,contextSnapshotHash:null,units:f.input.units}).hash
  f.parent.trainingVariantAllocationEncrypted=f.header.trainingVariantAllocationEncrypted=null
  await expect(submit(f)).rejects.toMatchObject({statusCode:403});expect(mocks.register).not.toHaveBeenCalled()
 })
 it('does not interpret an all-undefined header/full graph as a legacy questionnaire',async()=>{
  const f=fixture();for(const field of markerFields){delete f.header[field];delete markerOwner(f.parent,field)[field]}
  await expect(submit(f)).rejects.toMatchObject({statusCode:403});expect(mocks.db.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1);expect(mocks.register).not.toHaveBeenCalled()
 })
})
