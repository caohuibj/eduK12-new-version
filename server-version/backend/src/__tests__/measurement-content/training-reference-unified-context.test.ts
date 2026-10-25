import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({transaction:vi.fn(),get:vi.fn(),parent:vi.fn(),admission:vi.fn(),section:vi.fn(),persist:vi.fn(),snapshot:vi.fn(),study:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction,$queryRaw:mocks.study}}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
vi.mock('../../modules/composite/training-variant-child-scope',async importOriginal=>({...await importOriginal<any>(),
 loadTrainingChildParent:mocks.parent,assertTrainingFormFinalPrincipal:vi.fn(),assertTrainingSectionSelected:mocks.parent,
 lockTrainingFlowFinalAdmission:async()=>()=>undefined,
}))
vi.mock('../../modules/assessment-runtime/form-admission.service',async importOriginal=>({...await importOriginal<any>(),
 ensureCompositeSectionAttempt:async()=>({id:'section-attempt'}),activateStoredOrCatalogCompositeFormAdmission:mocks.admission,
 loadCompositeFormDefinition:mocks.section,
}))
vi.mock('../../modules/composite/final-submit.service',async importOriginal=>({...await importOriginal<any>(),
 normalizeCompositeSectionAnswers:(section:any,answers:any)=>({normalized:section.items.map((item:any)=>({item,normalizedValue:answers[0]?.value??null,storedValue:answers[0]?.value??null})),payloadAnswers:answers}),
 persistCompositeFormSection:mocks.persist,
}))
vi.mock('../../modules/assessment-runtime/persistence',async importOriginal=>({...await importOriginal<any>(),insertCompletedUnitSnapshot:mocks.snapshot}))
import {submitUnifiedCompositeFormSectionFinal} from '../../modules/assessment-runtime/unified-form-section-final-submit.service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64)
function fixture(){
 const entry:any={scoreKey:'total',referenceKind:'descriptive_sample',instrumentVersion:'1',scoringVersion:'1',population:{description:'Grade one',match:{gradeLevels:['1']}}}
 const reference:any={releaseId:id(2),contentHash:hash,layer:'REFERENCE',family:'SCALE',status:'PUBLISHED',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'teacher',resourceId:'composite'},
  content:{measurement:{releaseId:id(1),contentHash:hash},entries:[{metricKey:'total',referenceKind:'descriptive_sample',definition:entry}]}}
 const binding={schemaVersion:1,compositeId:'composite',attemptId:'attempt',epoch:1,publicationHash:hash,units:[{itemId:'item',family:'SCALE',source:{kind:'SCALE',id:'scale',ownerId:'teacher'},
  measurement:{releaseId:id(1),contentHash:hash,measurementHash:hash},referencePolicy:{policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:id(1),
   choices:[{releaseId:id(2),contentHash:hash,entryKey:referenceEntryKey(entry),metricKey:'total',referenceKind:'descriptive_sample',priority:0}]}}]}
 let parent:any={id:'attempt',attemptEpoch:1,compositeAssessmentId:'composite',compositeAssessment:{createdBy:'teacher',productKind:'QUESTIONNAIRE'},trainingContentBinding:binding,trainingContentBindingHash:canonicalHash(binding),
  trainingReferenceBinding:null,trainingReferenceBindingHash:null,contextSnapshotEncrypted:null,contextSnapshotHash:null}
 let section:any={id:'section-attempt',attemptEpoch:1,status:'IN_PROGRESS',submissionId:null,submissionPayloadHash:null,frozenAdmissionSnapshotHash:hash}
 const events:string[]=[],control={contextCount:1}
 const db={$queryRaw:vi.fn(async()=>[]),compositeAssessmentAttempt:{findUnique:vi.fn(async()=>structuredClone(parent)),updateMany:vi.fn(async({data})=>{
  if(data.contextSnapshotHash){events.push('context');if(control.contextCount!==1)return {count:control.contextCount}}
  else events.push('reference')
  Object.assign(parent,data);return {count:1}
 })},compositeFormSectionAttempt:{findUnique:vi.fn(async()=>structuredClone(section)),updateMany:vi.fn(async({data})=>{events.push('section');Object.assign(section,data);return {count:1}})}}
 mocks.parent.mockImplementation(async()=>parent);mocks.get.mockResolvedValue(reference)
 mocks.section.mockReturnValue({id:'section',contextSection:true,items:[{id:'grade',formType:'single_choice',formLabel:'Grade',required:true,contextKey:'gradeLevel',formOptions:[{value:'1',label:'One'}]}]})
 mocks.admission.mockImplementation(async()=>({attemptEpoch:1,snapshotHash:hash,contextSnapshotHash:null,governance:{status:'READY'},principal:{userId:'user'},
  parent:{kind:'composite',parentId:'attempt',slotKey:'form-section:section',sourceDefinitionHash:hash},formSection:{kind:'composite',id:'section',identityHash:hash}}))
 mocks.persist.mockImplementation(async tx=>{expect(tx).toBe(db);events.push('answers')})
 mocks.snapshot.mockImplementation(async tx=>{expect(tx).toBe(db);events.push('snapshot')})
 // The real transaction callback is exercised; this rollback double is not a
 // substitute for PostgreSQL rollback in the connected acceptance.
 mocks.transaction.mockImplementation(async cb=>{const oldParent=structuredClone(parent),oldSection=structuredClone(section)
  try{return await cb(db)}catch(error){parent=oldParent;section=oldSection;throw error}})
 const body:any={attemptId:'attempt',sectionId:'section',attemptEpoch:1,submissionId:id(7),definitionHash:hash,userId:'user',answers:[{itemId:'grade',value:'1'}]}
 return {run:()=>submitUnifiedCompositeFormSectionFinal(body),read:()=>parent,section:()=>section,reference,db,body,events,control}
}
beforeEach(()=>{vi.resetAllMocks();mocks.study.mockResolvedValue([]);vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));vi.stubEnv('DATA_PSEUDONYM_KEY','b'.repeat(64))})
afterEach(()=>vi.unstubAllEnvs())
describe('actual UNIFIED composite context FINAL freezes references inside its transaction',()=>{
 it('writes authentic context and selected binding before section completion/snapshot or next-runner delivery',async()=>{
  const f=fixture(),result=await f.run()
  expect(f.events).toEqual(['answers','context','reference','section','snapshot'])
  expect(f.read().trainingReferenceBinding).toMatchObject({contextHash:result.contextSnapshotHash,units:[{references:[{status:'SELECTED'}]}]})
  expect(mocks.get.mock.calls[0][0]).toBe(f.db)
 })
 it('rolls back fresh private reuse when completed-unit writes cross the owner expiry',async()=>{
  const f=fixture();f.reference.scope.resourceId='producer';f.reference.provenance={candidateId:'candidate',reviewId:'review'}
  let now=new Date('2026-10-20T00:00:00Z')
  Object.assign(f.db,{$queryRaw:vi.fn(async(sql:any)=>{
   const q=(sql.strings??sql).join('')
   if(q.includes('FROM anonymous_study_attempts'))return []
   if(q.includes('FROM training_reference_requests'))return [{course_id:'course',composite_id:'producer'}]
   if(q.includes('FROM composite_assessments'))return ['producer','composite'].map(id=>({id,created_by:'teacher',status:'PUBLISHED',product_kind:'QUESTIONNAIRE',questionnaire_type:'COURSE',public_enabled:false,published_at:now}))
   if(q.includes('FROM questionnaire_course_deliveries'))return ['producer','composite'].map(composite_id=>({composite_id,course_id:'course'}))
   if(q.includes('FROM courses'))return [{creator_id:'teacher',course_type:'TRAINING_COURSE',is_library:false}]
   if(q.includes('FROM users'))return [{role:'TEACHER',account_domain:'TRAINING',teacher_approved:true,is_active:true,is_frozen:false,must_change_password:false,expires_at:new Date('2026-10-20T01:00:00Z')}]
   if(q.includes('clock_timestamp')){f.events.push('clock');return [{now}]}
   throw new Error('Unexpected reference query')
  })})
  mocks.snapshot.mockImplementation(async()=>{f.events.push('snapshot');now=new Date('2026-10-20T01:00:00Z')})
  await expect(f.run()).rejects.toThrow('CONTENT_TRAINING_REFERENCE_SCOPE_DENIED')
  expect(f.events).toEqual(['answers','context','clock','reference','section','snapshot','clock'])
  expect(f.read().contextSnapshotHash).toBeNull();expect(f.read().trainingReferenceBindingHash).toBeNull()
  expect(f.section().status).toBe('IN_PROGRESS');expect(f.section().submissionId).toBeNull()
 })
 it('replays accepted context without reading candidates or selecting again',async()=>{
  const f=fixture();await f.run();const binding=structuredClone(f.read().trainingReferenceBinding)
  f.reference.status='REVOKED';mocks.get.mockClear();f.events.length=0
  expect((await f.run()).replayed).toBe(true)
  expect(f.read().trainingReferenceBinding).toEqual(binding);expect(f.events).toEqual([]);expect(mocks.get).not.toHaveBeenCalled()
 })
 it('rolls back context and section when exact reference identity fails',async()=>{
  const f=fixture();f.reference.contentHash='b'.repeat(64)
  await expect(f.run()).rejects.toThrow('UNAVAILABLE')
  expect(f.read().contextSnapshotHash).toBeNull();expect(f.read().trainingReferenceBindingHash).toBeNull()
  expect(f.section().status).toBe('IN_PROGRESS');expect(mocks.snapshot).not.toHaveBeenCalled()
 })
 it('rejects a lost context CAS before reference selection or accepted facts',async()=>{
  const f=fixture();f.control.contextCount=0
  await expect(f.run()).rejects.toMatchObject({statusCode:409})
  expect(mocks.get).not.toHaveBeenCalled();expect(f.read().trainingReferenceBinding).toBeNull();expect(mocks.snapshot).not.toHaveBeenCalled()
 })
 it('rejects missing required demographics before opening the write transaction',async()=>{
  const f=fixture();f.body.answers=[]
  await expect(f.run()).rejects.toMatchObject({statusCode:400})
  expect(mocks.transaction).not.toHaveBeenCalled();expect(f.events).toEqual([])
 })
})
