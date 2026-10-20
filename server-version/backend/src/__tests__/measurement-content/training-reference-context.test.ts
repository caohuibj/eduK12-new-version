import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
vi.mock('../../modules/composite/training-variant-child-scope',()=>({loadTrainingChildParent:async(_id:string,parent:any)=>parent}))
vi.mock('../../modules/composite/training-variant-scope',()=>({resolveTrainingAttemptScope:async(parent:any)=>({items:parent.compositeAssessment.items,itemIds:new Set(parent.compositeAssessment.items.map((i:any)=>i.id))})}))
import {writeContextFormAnswer} from '../../modules/assessment-context'
import {freezeCompositeAttemptContext} from '../../services/assessmentContextService'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64)
function fixture(){
 const entry:any={scoreKey:'total',referenceKind:'descriptive_sample',instrumentVersion:'1',scoringVersion:'1',population:{description:'Grade one',match:{gradeLevels:['1']}}}
 const reference={releaseId:id(2),contentHash:hash,layer:'REFERENCE',family:'SCALE',status:'PUBLISHED',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'teacher',resourceId:'composite'},
  content:{measurement:{releaseId:id(1),contentHash:hash},entries:[{metricKey:'total',referenceKind:'descriptive_sample',definition:entry}]}}
 const unit={itemId:'item',family:'SCALE',source:{kind:'SCALE',id:'scale',ownerId:'teacher'},measurement:{releaseId:id(1),contentHash:hash,measurementHash:hash},
  referencePolicy:{policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:id(1),choices:[{releaseId:id(2),contentHash:hash,entryKey:referenceEntryKey(entry),metricKey:'total',referenceKind:'descriptive_sample',priority:0}]}}
 const binding={schemaVersion:1,compositeId:'composite',attemptId:'attempt',epoch:1,publicationHash:hash,units:[unit]}
 let stored:any={id:'attempt',compositeAssessmentId:'composite',attemptEpoch:1,status:'IN_PROGRESS',trainingContentBinding:binding,trainingContentBindingHash:canonicalHash(binding),
  contextSnapshotEncrypted:null,contextSnapshotHash:null,trainingReferenceBinding:null,trainingReferenceBindingHash:null,
  compositeAssessment:{id:'composite',createdBy:'teacher',items:[{id:'grade',type:'FORM',formType:'single_choice',formLabel:'Grade',required:true,position:0,contextKey:'gradeLevel',formOptions:[{value:'1',label:'One'}]}]},formAnswers:[{itemId:'grade',value:writeContextFormAnswer('gradeLevel','1')}]}
 const writes:any[]=[],db={$queryRaw:vi.fn().mockResolvedValue([{id:'attempt'}]),compositeAssessmentAttempt:{findUnique:vi.fn().mockImplementation(async()=>structuredClone(stored)),updateMany:vi.fn().mockImplementation(async({data})=>{writes.push(data);Object.assign(stored,data);return {count:1}})}}
 mocks.get.mockResolvedValue(reference)
 return {db,reference,writes,read:()=>stored,replace:(value:any)=>{stored=value}}
}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));vi.stubEnv('DATA_PSEUDONYM_KEY','b'.repeat(64))})
afterEach(()=>vi.unstubAllEnvs())
describe('context-section transaction integration, no runner delivery or first-answer selection',()=>{
 it('persists authentic context then references on the same transaction, and a repeat never selects again',async()=>{
  const f=fixture(),first=await freezeCompositeAttemptContext(f.db as never,'attempt',new Date('2026-10-20T00:00:00Z'))
  expect(first.context.values.gradeLevel).toBe('1');expect(f.writes).toHaveLength(2)
  expect(f.writes[0]).toHaveProperty('contextSnapshotHash');expect(f.writes[1]).toHaveProperty('trainingReferenceBinding')
  expect(f.read().trainingReferenceBinding).toMatchObject({contextHash:first.hash,units:[{references:[{status:'SELECTED'}]}]})
  const binding=structuredClone(f.read().trainingReferenceBinding);mocks.get.mockClear();f.db.compositeAssessmentAttempt.updateMany.mockClear();f.reference.status='REVOKED'
  const again=await freezeCompositeAttemptContext(f.db as never,'attempt')
  expect(again.alreadyFrozen).toBe(true);expect(f.read().trainingReferenceBinding).toEqual(binding)
  expect(mocks.get).not.toHaveBeenCalled();expect(f.db.compositeAssessmentAttempt.updateMany).not.toHaveBeenCalled()
 })
 it('does not persist anything for invalid/missing required context',async()=>{
  const f=fixture();f.read().formAnswers=[]
  await expect(freezeCompositeAttemptContext(f.db as never,'attempt')).rejects.toThrow()
  expect(f.writes).toEqual([]);expect(mocks.get).not.toHaveBeenCalled()
 })
 it('propagates reference failure to caller transaction so context and reference changes roll back together',async()=>{
  const f=fixture(),before=structuredClone(f.read());f.reference.contentHash='b'.repeat(64)
  // Structural transaction double: proves rejection reaches the transaction
  // boundary, not PostgreSQL rollback itself (covered by connected acceptance).
  const transaction=async()=>{try{return await freezeCompositeAttemptContext(f.db as never,'attempt')}catch(error){f.replace(before);throw error}}
  await expect(transaction()).rejects.toThrow('UNAVAILABLE');expect(f.read()).toEqual(before)
  expect(f.read().trainingReferenceBinding).toBeNull();expect(f.read().contextSnapshotHash).toBeNull()
 })
})
