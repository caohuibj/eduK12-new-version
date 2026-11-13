import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({db:{$queryRaw:vi.fn(),compositeAssessmentAttempt:{findUnique:vi.fn()}},register:vi.fn(),runtime:vi.fn(),storage:vi.fn(),admission:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:mocks.db}))
vi.mock('../../modules/assessment-runtime/report-outbox.service',async importOriginal=>({...(await importOriginal<any>()),registerWholeQuestionnaireReceipt:mocks.register}))
vi.mock('../../modules/scale/scale-admission.service',async importOriginal=>({...(await importOriginal<any>()),loadScaleAdmissionRuntime:mocks.runtime}))
vi.mock('../../modules/assessment-runtime/whole-receipt-storage',()=>({admitWholeReceiptStorage:mocks.storage,detachedWholeReceiptsEnabled:()=>false,recordWholeReceiptStored:vi.fn()}))
vi.mock('../../services/wholeSubmitAdmission',async importOriginal=>{
  const actual=await importOriginal<typeof import('../../services/wholeSubmitAdmission')>()
  mocks.admission.mockImplementation((operation:()=>Promise<unknown>)=>actual.withWholeSubmitAdmission(operation))
  return {...actual,withWholeSubmitAdmission:mocks.admission}
})
import {compileWeightedVariants,createWeightedVariantAllocation} from '../../modules/assessment-core/weighted-variants'
import {buildTrainingVariantUnion} from '../../modules/composite/training-variant-scope'
import {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {prepareCanonicalSubmission} from '../../services/instrumentFinalSubmit'
import {clearWholeValidationRulesForTest,submitWholeQuestionnaire} from '../../modules/composite/whole-questionnaire.service'

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
 mocks.runtime.mockResolvedValue({sourceDefinitionHash:sourceHash,instrumentKey:'scale-key',instrumentVersion:'1',legacyDefinitionHash:definitionHash,compiledRuntime:{compiledRuntimeHash:compiledHash,runtimeCapabilities:{aggregateEligible:true}},definition:{items:[{itemCode:'q1',required:true,responseSetKey:'r'}],responseSets:[{key:'r',options:[{value:1},{value:2}]}]}})
 bind();return {parent,header,input,manifest,bind}
}
const payloadHash=(input:any)=>prepareCanonicalSubmission({attemptId:'parent',attemptEpoch:input.attemptEpoch,slotSetHash:input.slotSetHash,contextSnapshotHash:input.contextSnapshotHash,units:input.units}).hash
const seal=(f:ReturnType<typeof fixture>)=>{f.header.wholeSubmissionId=f.input.submissionId;f.header.wholeAcceptedAt=new Date('2026-10-18T00:00:02Z');f.header.wholePayloadHash=payloadHash(f.input);return f}
const submit=(f:ReturnType<typeof fixture>,principal:{userId?:string;recoveryTokenHash?:string}={userId:'user'})=>submitWholeQuestionnaire('parent',f.input,principal)

describe('sealed whole receipt replays before whole_submit admission',()=>{
 it('returns the accepted receipt without the gate or a new registration',async()=>{
  const f=seal(fixture())
  await expect(submit(f)).resolves.toMatchObject({replayed:true,status:'ACCEPTED',payloadHash:f.header.wholePayloadHash})
  expect(mocks.admission).not.toHaveBeenCalled();expect(mocks.register).not.toHaveBeenCalled()
 })
 it('rejects a different sealed payload before the gate',async()=>{
  const f=seal(fixture());f.input.units[0].answers[0].responseValue=2
  await expect(submit(f)).rejects.toMatchObject({code:'SUBMISSION_PAYLOAD_CONFLICT',statusCode:409})
  expect(mocks.admission).not.toHaveBeenCalled();expect(mocks.register).not.toHaveBeenCalled()
 })
 it('falls through to the gate when the sealed attempt is not owned',async()=>{
  const f=seal(fixture())
  await expect(submit(f,{userId:'other'})).rejects.toMatchObject({statusCode:403})
  expect(mocks.admission).toHaveBeenCalled();expect(mocks.register).not.toHaveBeenCalled()
 })
 it('falls through to the gate for a sealed variant attempt',async()=>{
  const f=seal(fixture(true))
  await expect(submit(f)).resolves.toMatchObject({replayed:true,status:'ACCEPTED',payloadHash:f.header.wholePayloadHash})
  expect(mocks.admission).toHaveBeenCalled();expect(mocks.register).not.toHaveBeenCalled()
 })
 it('keeps an unsealed submit on the gate and registers once',async()=>{
  const f=fixture()
  await expect(submit(f)).resolves.toMatchObject({status:'ACCEPTED',replayed:false})
  expect(mocks.admission).toHaveBeenCalledTimes(1);expect(mocks.register).toHaveBeenCalledTimes(1)
 })
})
