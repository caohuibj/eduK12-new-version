import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
const { db, scope, slots, provenance } = vi.hoisted(() => ({ db: {
  course: { findFirst: vi.fn() }, compositeAssessment: { findMany: vi.fn(), count: vi.fn() },
  compositeAssessmentAttempt: { groupBy: vi.fn() }, cognitiveSession: { findMany: vi.fn() },
  $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
}, scope:vi.fn(),slots:vi.fn(),provenance:vi.fn() }))
vi.mock('../../config/database',()=>({prisma:db}))
vi.mock('../../modules/questionnaire-product/service',()=>({}))
vi.mock('../../modules/composite/training-variant-scope',()=>({resolveTrainingAttemptScope:scope}))
vi.mock('../../modules/composite/training-variant-export',()=>({trainingVariantProvenance:provenance}))
vi.mock('../../modules/composite/situational-canonical-export',()=>({loadSituationalExportSlotSets:slots}))
import { courseOverview } from '../../modules/questionnaire-product/workbench'
const actor={userId:'teacher',role:UserRole.TEACHER}
const definition={id:'q',trainingVariantFrozen:{groups:[]},items:[{id:'selected',type:'COGNITIVE'}],formSections:[]}
const parent=()=>({id:'attempt',compositeAssessmentId:'q',status:'COMPLETED',attemptEpoch:2,runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',participantKey:'private-key',trainingVariantAllocationEncrypted:'private-cipher',compositeAssessment:{id:'q',trainingVariantFrozen:{}}})
const session=(id:string,extra:any={})=>({id,status:'COMPLETED',finishedAt:null,resultSnapshotEncrypted:null,assignment:{id:'assignment',title:'Task'},user:{nickname:'Student'},compositeAttemptId:'attempt',compositeItemId:'selected',attemptNo:2,compositeAttempt:parent(),...extra})
beforeEach(()=>{
  vi.resetAllMocks();db.course.findFirst.mockResolvedValue({id:'course',title:'Training'});db.compositeAssessment.count.mockResolvedValue(1);db.compositeAssessmentAttempt.groupBy.mockResolvedValue([])
  db.compositeAssessment.findMany.mockImplementation((input:any)=>Promise.resolve(input.include?[definition]:[{id:'q',name:'Questionnaire',status:'PUBLISHED',productKind:'QUESTIONNAIRE'}]))
  slots.mockResolvedValue(new Map([['attempt',{attemptEpoch:2}]]));scope.mockResolvedValue({itemIds:new Set(['selected']),sectionIds:new Set(),items:definition.items,formSections:[],variant:{variantKey:'a'}});provenance.mockReturnValue({variantKey:'a',configDigest:'digest'})
})
describe('Training weighted course workbench',()=>{
  it('batch-loads variant definitions/plans once and filters wrong groups and prior epochs',async()=>{
    db.cognitiveSession.findMany.mockResolvedValue([session('valid'),session('wrong-group',{compositeItemId:'excluded'}),session('old-epoch',{attemptNo:1}),session('valid-2')])
    const result=await courseOverview(actor,'course',{})
    expect(result.quality.map(row=>row.id)).toEqual(['valid','valid-2'])
    expect(result.quality[0]).toMatchObject({trainingVariant:{variantKey:'a',configDigest:'digest'},qualityState:'unavailable'})
    expect(JSON.stringify(result)).not.toContain('private-')
    expect(scope).toHaveBeenCalledTimes(1);expect(slots).toHaveBeenCalledTimes(1);expect(slots.mock.calls[0][0]).toHaveLength(1)
    expect(db.compositeAssessment.findMany).toHaveBeenCalledTimes(2)
    const query=db.cognitiveSession.findMany.mock.calls[0][0]
    expect(query.where).toMatchObject({userId:{not:null},assignment:{createdBy:'teacher'},OR:expect.arrayContaining([expect.objectContaining({compositeAttempt:expect.objectContaining({assignmentRef:null,deliveryCourseId:'course'})})])})
  })
  it('keeps historical null sessions without new scope work or response fields',async()=>{
    db.cognitiveSession.findMany.mockResolvedValue([session('legacy',{compositeAttempt:{id:'attempt',compositeAssessmentId:'q',status:'COMPLETED',compositeAssessment:{trainingVariantFrozen:null}}}),session('standalone',{compositeAttempt:null,compositeAttemptId:null})])
    const result=await courseOverview(actor,'course',{})
    expect(result.quality.map(row=>row.id)).toEqual(['legacy','standalone']);expect(result.quality.every(row=>!('trainingVariant' in row))).toBe(true)
    expect(scope).not.toHaveBeenCalled();expect(slots).not.toHaveBeenCalled();expect(db.compositeAssessment.findMany).toHaveBeenCalledTimes(1)
  })
  it('fails closed when frozen scope is corrupt, never reclassifies as ordinary',async()=>{
    db.cognitiveSession.findMany.mockResolvedValue([session('bad')]);scope.mockRejectedValue(new Error('corrupt allocation'))
    await expect(courseOverview(actor,'course',{})).rejects.toThrow('corrupt allocation')
  })
})
