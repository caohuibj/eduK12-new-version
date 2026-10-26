import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {UserRole} from '@prisma/client'
const mocks=vi.hoisted(()=>{
 process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
 const db={compositeAssessment:{findUnique:vi.fn(),update:vi.fn()},compositeAssessmentAttempt:{findFirst:vi.fn(),create:vi.fn(),update:vi.fn()},
  compositeAssessmentItem:{create:vi.fn()},assessment:{create:vi.fn()},course:{findUnique:vi.fn()},scale:{findUnique:vi.fn(),findMany:vi.fn()},materialGrant:{findUnique:vi.fn()},$queryRaw:vi.fn(),$queryRawUnsafe:vi.fn(),$transaction:vi.fn()}
 return {db,publication:vi.fn(),binding:vi.fn(),freezeScale:vi.fn(),persistScale:vi.fn(),persistSlots:vi.fn(),retain:vi.fn(),recheckPublication:vi.fn(),recheckBinding:vi.fn()}
})
vi.mock('../../config/database',()=>({prisma:mocks.db}))
vi.mock('../../modules/composite/training-content-binding',async original=>({...await original<object>(),prepareTrainingContentSnapshot:mocks.publication,prepareTrainingContentAttemptBinding:mocks.binding}))
vi.mock('../../modules/assessment-runtime/runtime-snapshot',async original=>({...await original<object>(),freezeScaleRuntimeAtAttemptStart:mocks.freezeScale,persistFrozenScaleRuntimeSnapshot:mocks.persistScale}))
vi.mock('../../modules/assessment-runtime/slot-set',async original=>({...await original<object>(),storeFrozenActiveSlotSet:mocks.persistSlots}))
vi.mock('../../modules/scale/scale-image.adapter',async original=>({...await original<object>(),retainFrozenScaleAssessmentImages:mocks.retain}))
vi.mock('../../modules/scale/scale-workflow.service',async original=>({...await original<object>(),frozenDatabaseScaleDefinition:()=>({})}))
import {addItem,prepareCompositePublication,startRelationalCompositeAttemptInTransaction} from '../../modules/composite/composite.service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {config} from '../../config'
const unit={itemId:'item',family:'SCALE',source:{kind:'SCALE',id:'scale',ownerId:'source-owner'},measurement:{releaseId:'11111111-1111-4111-8111-111111111111',contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}}
const snapshot={schemaVersion:1,compositeId:'composite',units:[unit]},snapshotHash=canonicalHash(snapshot)
const fixture=(status='DRAFT')=>({id:'composite',name:'Training',createdBy:'teacher',creator:{id:'teacher',role:'TEACHER'},status,
 productKind:'LEGACY_COMPOSITE',deliveryMode:'FINAL_ONLY',courseId:null,course:null,publicEnabled:false,expiresAt:null,
 trainingContentSnapshot:snapshot,trainingContentSnapshotHash:snapshotHash,formSections:[],items:[{id:'item',type:'SCALE',scaleId:'scale',required:true,position:0,
 scale:{id:'scale',creatorId:'source-owner',status:'PUBLISHED',code:'local',instrumentVersion:'1',instrumentClass:'CUSTOM_DESCRIPTIVE',definition:null}}]})
const identity={subjectUserId:'student',respondentUserId:'student',respondentType:'SELF' as const,episodeId:'episode',assignmentRef:'assignment',consentId:null}
const start=()=>startRelationalCompositeAttemptInTransaction(mocks.db as never,{compositeAssessmentId:'composite',respondentUserId:'student',attemptIdentity:identity})
let previousGrants:boolean
beforeEach(()=>{
 vi.clearAllMocks();previousGrants=config.materialGrantsEnabled;config.materialGrantsEnabled=true
 mocks.db.compositeAssessment.findUnique.mockResolvedValue(fixture());mocks.db.materialGrant.findUnique.mockResolvedValue(null)
 mocks.db.scale.findUnique.mockResolvedValue(fixture().items[0].scale);mocks.db.compositeAssessmentAttempt.findFirst.mockResolvedValue(null)
 mocks.db.scale.findMany.mockResolvedValue([{id:'scale',measurementReleaseId:null}]);
 mocks.db.$queryRaw.mockResolvedValue([]);mocks.db.$transaction.mockImplementation(fn=>fn(mocks.db))
 mocks.recheckPublication.mockResolvedValue(undefined);mocks.recheckBinding.mockResolvedValue(undefined)
 mocks.publication.mockResolvedValue({snapshot,snapshotHash,recheckSourceLicenses:mocks.recheckPublication})
 mocks.binding.mockImplementation(async(_db,input)=>{const binding={schemaVersion:1,compositeId:input.compositeId,attemptId:input.attemptId,epoch:input.epoch,publicationHash:input.snapshotHash,units:[unit]};return {binding,bindingHash:canonicalHash(binding),recheckSourceLicenses:mocks.recheckBinding}})
 mocks.db.compositeAssessmentAttempt.create.mockImplementation(async({data})=>data)
 mocks.db.assessment.create.mockResolvedValue({id:'child'});mocks.db.compositeAssessmentAttempt.update.mockResolvedValue({})
 mocks.freezeScale.mockResolvedValue({schemaVersion:1,sourceDefinitionHash:'c'.repeat(64),compiledRuntime:{compiledRuntimeHash:'d'.repeat(64)}})
 mocks.persistScale.mockResolvedValue('frozen-scale');mocks.persistSlots.mockResolvedValue('frozen-slots')
})
afterEach(()=>{config.materialGrantsEnabled=previousGrants})
describe('actual composite service measurement-binding call chain (mock DB and runtime boundaries)',()=>{
 it('keeps revoked material grants blocking new attachment while already attached drafts can prepare publication',async()=>{
  await expect(addItem('teacher',UserRole.TEACHER,'composite',{type:'SCALE',scaleId:'scale',required:true})).rejects.toMatchObject({statusCode:403})
  expect(mocks.db.materialGrant.findUnique).toHaveBeenCalledTimes(1);expect(mocks.db.compositeAssessmentItem.create).not.toHaveBeenCalled()
  mocks.db.materialGrant.findUnique.mockClear()
  const prepared=await prepareCompositePublication('teacher',UserRole.TEACHER,'composite',mocks.db as never,new Map())
  expect(prepared).toMatchObject({trainingContentSnapshot:snapshot,trainingContentSnapshotHash:snapshotHash})
  expect(mocks.recheckPublication).toHaveBeenCalledTimes(1)
  expect(mocks.publication).toHaveBeenCalledExactlyOnceWith(mocks.db,fixture(),new Map(),'NEW_ADMINISTRATION','PREVIEW')
  expect(mocks.db.materialGrant.findUnique).not.toHaveBeenCalled()
 })
 it('passes the locked publication and actual sources through createAttempt and persists the exact attempt-bound hash',async()=>{
  mocks.db.compositeAssessment.findUnique.mockResolvedValue(fixture('PUBLISHED'))
  const attempt=await start()
  const input=mocks.binding.mock.calls[0][1],persisted=mocks.db.compositeAssessmentAttempt.create.mock.calls[0][0].data
  expect(input).toMatchObject({compositeId:'composite',attemptId:attempt.id,epoch:1,snapshot,snapshotHash,composite:fixture('PUBLISHED')})
  expect(input.resolvedSituational).toBeInstanceOf(Map)
  expect(persisted.trainingContentBinding).toEqual({schemaVersion:1,compositeId:'composite',attemptId:attempt.id,epoch:1,publicationHash:snapshotHash,units:[unit]})
  expect(persisted.trainingContentBindingHash).toBe(canonicalHash(persisted.trainingContentBinding))
  expect(persisted).toMatchObject({assignmentRef:'assignment',attemptEpoch:1,runtimeGeneration:'UNIFIED_V1'})
  expect(mocks.binding.mock.invocationCallOrder[0]).toBeLessThan(mocks.db.compositeAssessmentAttempt.create.mock.invocationCallOrder[0])
  expect(mocks.db.assessment.create).toHaveBeenCalledTimes(1)
  expect(mocks.recheckBinding).toHaveBeenCalledTimes(1)
 })
 it('fails new START before attempt/child writes when the frozen measurement is revoked',async()=>{
  mocks.db.compositeAssessment.findUnique.mockResolvedValue(fixture('PUBLISHED'))
  mocks.binding.mockRejectedValueOnce(Object.assign(new Error('CONTENT_TRAINING_BINDING_INVALID'),{statusCode:409}))
  await expect(start()).rejects.toMatchObject({message:'CONTENT_TRAINING_BINDING_INVALID',statusCode:409})
  expect(mocks.db.compositeAssessmentAttempt.create).not.toHaveBeenCalled();expect(mocks.db.assessment.create).not.toHaveBeenCalled()
 })
 it('propagates the final source-license recheck failure rather than publishing a prepared snapshot',async()=>{
  mocks.recheckPublication.mockRejectedValueOnce(new Error('SOURCE_LICENSE_WITHDRAWN'))
  await expect(prepareCompositePublication('teacher',UserRole.TEACHER,'composite',mocks.db as never,new Map())).rejects.toThrow('SOURCE_LICENSE_WITHDRAWN')
  expect(mocks.recheckPublication).toHaveBeenCalledTimes(1)
  expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
 })
 it('returns an existing relational attempt without reselecting or overwriting its binding',async()=>{
  mocks.db.compositeAssessment.findUnique.mockResolvedValue(fixture('PUBLISHED'))
  const existing={id:'existing',userId:'student',compositeAssessmentId:'composite',trainingContentBinding:{original:true}}
  mocks.db.compositeAssessmentAttempt.findFirst.mockResolvedValueOnce(existing)
  expect(await start()).toBe(existing);expect(mocks.binding).not.toHaveBeenCalled();expect(mocks.db.compositeAssessmentAttempt.create).not.toHaveBeenCalled()
 })
})
it('publication attaches a selected owner report to the actual measurement snapshot and rejects changed ownership',async()=>{
 const {prepareRelease}=await import('../../modules/measurement-content/release')
 const itemId='44444444-4444-4444-8444-444444444444',reportId='33333333-3333-4333-8333-333333333333'
 const report={...prepareRelease({layer:'REPORT',family:'SCALE',key:'report',version:'1',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'teacher',resourceId:'composite'},assetRefs:[],sourceReleaseId:null,content:{projectionVersion:1,measurements:[{releaseId:unit.measurement.releaseId,contentHash:unit.measurement.contentHash}],metricKeys:['effort'],audience:'teacher',language:'zh-CN',generatorVersion:'declarative-report-v1',template:{blocks:[{type:'METRIC',metricKey:'effort',display:'RAW'}],limitations:[]}}}),releaseId:reportId,status:'PUBLISHED'}
 const current={...fixture(),trainingReportSelectionDraft:{schemaVersion:1,units:[{itemId,reportReleaseId:reportId}]}}
 current.items[0].id=itemId;mocks.db.compositeAssessment.findUnique.mockResolvedValue(current)
 const measured={...snapshot,units:[{...unit,itemId}]}
 mocks.publication.mockResolvedValue({recheckSourceLicenses:mocks.recheckPublication,snapshot:measured,snapshotHash:canonicalHash(measured),releases:new Map([[unit.measurement.releaseId,{layer:'MEASUREMENT',contentHash:unit.measurement.contentHash,content:{metrics:[{metricKey:'effort'}]}}],[reportId,report]])})
 mocks.db.$queryRaw.mockImplementation(async query=>query.strings.join(' ').includes('FROM users')?[{role:'TEACHER',teacher_approved:true,account_domain:'TRAINING',is_active:true,is_frozen:false,must_change_password:false,expires_at:null}]:[{now:new Date()}])
 const result=await prepareCompositePublication('teacher',UserRole.TEACHER,'composite',mocks.db as never,new Map())
 expect((result.trainingContentSnapshot as any).units[0].report).toEqual({releaseId:reportId,contentHash:report.contentHash})
 expect(result.trainingContentSnapshotHash).toBe(canonicalHash(result.trainingContentSnapshot))
 await expect(prepareCompositePublication('other',UserRole.ADMIN,'composite',mocks.db as never,new Map())).rejects.toMatchObject({statusCode:403})
})
