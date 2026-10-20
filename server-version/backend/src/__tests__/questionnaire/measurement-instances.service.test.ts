import {beforeEach,describe,expect,it,vi} from 'vitest'
import {UserRole} from '@prisma/client'
const mocks=vi.hoisted(()=>{
 process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
 return {db:{$transaction:vi.fn(),$queryRawUnsafe:vi.fn(),$queryRaw:vi.fn(),
  compositeAssessment:{findUnique:vi.fn(),update:vi.fn()},compositeAssessmentItem:{update:vi.fn()},
  cognitiveAssignment:{create:vi.fn()},assessmentCompositionTemplate:{findUnique:vi.fn()},course:{findMany:vi.fn()},
  questionnaireCourseDelivery:{create:vi.fn(),createMany:vi.fn()},compositeAssessmentAttempt:{create:vi.fn()}},
  snapshot:vi.fn(),writer:vi.fn(),detail:vi.fn(),validItem:vi.fn(),resolve:vi.fn(),publishComposite:vi.fn(),lockAssets:vi.fn()}
})
vi.mock('../../modules/composite/training-content-binding',async importOriginal=>({...await importOriginal<typeof import('../../modules/composite/training-content-binding')>(),prepareTrainingContentSnapshot:mocks.snapshot}))
vi.mock('../../config/database',()=>({prisma:mocks.db}))
vi.mock('../../modules/cognitive/assignment-measurement-release',()=>({publishAssignmentMeasurementRelease:mocks.writer}))
vi.mock('../../modules/composite/composite.service',()=>({getCompositeForTeacher:mocks.detail,assertValidItem:mocks.validItem,
 resolveCompositeSituationalItems:mocks.resolve,compositeSjtGrantScope:(row:unknown)=>row,publishComposite:mocks.publishComposite,lockCompositeAssetReferences:mocks.lockAssets}))
import {publishMeasurementInstances,publish,updateContentReportSelection,updateContentReferenceSelection,contentReferenceChoices} from '../../modules/questionnaire-product/service'
const actor={userId:'teacher',role:UserRole.TEACHER}
const source=()=>({id:'source-assignment',configId:'config',createdBy:'teacher',courseId:'course',title:'Installed Go/NoGo',instruction:'Run instruction',
 status:'PUBLISHED',listedStandalone:true,required:true,profile:'research',profileDefinitionVersion:'1',resolvedConfigSnapshotEncrypted:'frozen-research-config',
 resolvedConfigHash:'research-config-hash',resolvedReportSnapshotEncrypted:'frozen-research-report',quotaSourceAssignmentId:'quota-source',maxAttempts:4,
 config:{id:'config',testType:'gonogo',configVersion:'1.1.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',status:'PUBLISHED',config:{}}})
const base=()=>({id:'questionnaire',createdBy:'teacher',productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',revision:3,status:'DRAFT',publicEnabled:false,
 questionnaireCourses:[{courseId:'course'}],items:[{id:'item',type:'COGNITIVE',required:true,position:0,cognitiveAssignmentId:'source-assignment',cognitiveAssignment:source()}],formSections:[]})
let current:any,principal:any,newWrapper:any,course:any,clockCalls:number
beforeEach(()=>{
 vi.resetAllMocks();current=base();course={id:'course',creator_id:'teacher',course_type:'TRAINING_COURSE',is_library:false};clockCalls=0;principal={role:'TEACHER',account_domain:'TRAINING',teacher_approved:true,is_active:true,is_frozen:false,must_change_password:false,expires_at:null}
 mocks.db.$transaction.mockImplementation(fn=>fn(mocks.db));mocks.db.$queryRaw.mockImplementation(async query=>{
  const sql=query.strings.join(' ');if(sql.includes('FROM users'))return [principal];if(sql.includes('FROM courses'))return [course];if(sql.includes('clock_timestamp()')){clockCalls++;return [{now:new Date('2026-10-20T06:00:00Z')}]};throw Error('Unexpected SQL '+sql)
 })
 mocks.db.compositeAssessment.findUnique.mockImplementation(async()=>current)
 mocks.db.compositeAssessment.update.mockImplementation(async({data})=>{if(data.revision?.increment)current.revision+=data.revision.increment;return current})
 mocks.db.cognitiveAssignment.create.mockImplementation(async({data})=>{newWrapper={...data,id:'owned-wrapper',courseId:null,config:source().config};return newWrapper})
 mocks.db.compositeAssessmentItem.update.mockImplementation(async({data})=>{current.items[0].cognitiveAssignmentId=data.cognitiveAssignmentId;current.items[0].cognitiveAssignment=newWrapper;return current.items[0]})
 mocks.writer.mockResolvedValue({releaseId:'private-measurement'});mocks.resolve.mockResolvedValue(new Map());mocks.validItem.mockResolvedValue(undefined)
 mocks.detail.mockImplementation(async()=>current);mocks.db.assessmentCompositionTemplate.findUnique.mockResolvedValue(null)
 mocks.db.course.findMany.mockResolvedValue([{id:'course',creatorId:'teacher',isLibrary:false}])
})
describe('explicit questionnaire measurement-instance service (mock DB and release-writer boundary)',()=>{
 it('locks the draft and copies the exact frozen profile into an owned wrapper before publishing its real new ID',async()=>{
  await publishMeasurementInstances(actor,current.id,{revision:3})
  expect(mocks.db.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'),'questionnaire')
  expect(mocks.validItem).toHaveBeenCalledWith(expect.objectContaining({id:'item'}),'teacher',UserRole.TEACHER,expect.any(Object),mocks.db,new Map())
  expect(mocks.db.cognitiveAssignment.create).toHaveBeenCalledExactlyOnceWith({data:expect.objectContaining({configId:'config',createdBy:'teacher',status:'PUBLISHED',listedStandalone:false,required:false,
   profile:'research',profileDefinitionVersion:'1',resolvedConfigSnapshotEncrypted:'frozen-research-config',resolvedConfigHash:'research-config-hash',resolvedReportSnapshotEncrypted:'frozen-research-report',quotaSourceAssignmentId:'quota-source',maxAttempts:4})})
  expect(mocks.db.compositeAssessmentItem.update).toHaveBeenCalledWith({where:{id:'item'},data:{cognitiveAssignmentId:'owned-wrapper'}})
  expect(mocks.writer).toHaveBeenCalledExactlyOnceWith(mocks.db,'teacher','owned-wrapper')
  expect(mocks.db.compositeAssessmentItem.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.writer.mock.invocationCallOrder[0])
  expect(current.revision).toBe(4);expect(current.status).toBe('DRAFT')
  expect(mocks.publishComposite).not.toHaveBeenCalled();expect(mocks.db.compositeAssessmentAttempt.create).not.toHaveBeenCalled()
  expect(mocks.db.questionnaireCourseDelivery.create).not.toHaveBeenCalled();expect(mocks.db.questionnaireCourseDelivery.createMany).not.toHaveBeenCalled()
 })
 it('reuses an already owned copied wrapper and its writer pointer instead of creating another assignment',async()=>{
  Object.assign(current.items[0].cognitiveAssignment,{id:'owned-existing',courseId:null,listedStandalone:false,measurementReleaseId:'existing-release'})
  current.items[0].cognitiveAssignmentId='owned-existing'
  await publishMeasurementInstances(actor,current.id,{revision:3})
  expect(mocks.writer).toHaveBeenCalledExactlyOnceWith(mocks.db,'teacher','owned-existing')
  expect(mocks.db.cognitiveAssignment.create).not.toHaveBeenCalled();expect(mocks.db.compositeAssessmentItem.update).not.toHaveBeenCalled()
  expect(current.items[0].cognitiveAssignment.measurementReleaseId).toBe('existing-release')
 })
 it.each([{revision:2},{status:'PUBLISHED'},{createdBy:'another'}])('rejects stale/non-draft/nonowner before copying or writing %j',async change=>{
  Object.assign(current,change)
  await expect(publishMeasurementInstances(actor,current.id,{revision:3})).rejects.toMatchObject({statusCode:change.createdBy?403:409})
  expect(mocks.writer).not.toHaveBeenCalled();expect(mocks.db.cognitiveAssignment.create).not.toHaveBeenCalled();expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
 })
 it.each([{role:'ADMIN'},{teacher_approved:false},{account_domain:'SURVEY'},{expires_at:new Date('2026-10-20T05:59:59Z')}])('rejects current nonteacher or expired authority %j',async change=>{
  Object.assign(principal,change)
  await expect(publishMeasurementInstances(change.role==='ADMIN'?{...actor,role:UserRole.ADMIN}:actor,current.id,{revision:3})).rejects.toMatchObject({statusCode:403})
  expect(mocks.writer).not.toHaveBeenCalled();expect(mocks.db.cognitiveAssignment.create).not.toHaveBeenCalled();expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
 })
 it('preserves the existing material validator and rejects its denial before any measurement write',async()=>{
  mocks.validItem.mockRejectedValueOnce(Object.assign(new Error('SOURCE_DENIED'),{statusCode:403}))
  await expect(publishMeasurementInstances(actor,current.id,{revision:3})).rejects.toThrow('SOURCE_DENIED')
  expect(mocks.writer).not.toHaveBeenCalled();expect(mocks.db.cognitiveAssignment.create).not.toHaveBeenCalled()
 })
 it('actual questionnaire publish reuses the same instance preparation before the publication service',async()=>{
  await publish(actor,current.id,{revision:3})
  expect(mocks.writer).toHaveBeenCalledExactlyOnceWith(mocks.db,'teacher','owned-wrapper')
  expect(mocks.publishComposite).toHaveBeenCalledWith('teacher',UserRole.TEACHER,'questionnaire',mocks.db,new Map())
  expect(mocks.writer.mock.invocationCallOrder[0]).toBeLessThan(mocks.publishComposite.mock.invocationCallOrder[0])
 })
 it.each([{creator_id:'other'},{course_type:'LEGACY_COURSE'},{is_library:true}])('rejects current course outside owned Training scope %j',async change=>{
  Object.assign(course,change)
  await expect(publishMeasurementInstances(actor,current.id,{revision:3})).rejects.toMatchObject({statusCode:403})
  expect(mocks.writer).not.toHaveBeenCalled();expect(mocks.db.cognitiveAssignment.create).not.toHaveBeenCalled()
 })
 it('does not substitute request role for the current business teacher role',async()=>{
  await publishMeasurementInstances({...actor,role:UserRole.ADMIN},current.id,{revision:3})
  expect(mocks.writer).toHaveBeenCalledExactlyOnceWith(mocks.db,'teacher','owned-wrapper')
 })
 it('rechecks account expiry after writer lock waits before advancing the draft revision',async()=>{
  principal.expires_at=new Date('2026-10-20T06:01:00Z')
  mocks.db.$queryRaw.mockImplementation(async query=>{
   const sql=query.strings.join(' ');if(sql.includes('FROM users'))return [principal];if(sql.includes('FROM courses'))return [course]
   if(sql.includes('clock_timestamp()'))return [{now:new Date(++clockCalls===1?'2026-10-20T06:00:00Z':'2026-10-20T06:02:00Z')}]
   throw Error('Unexpected SQL '+sql)
  })
  await expect(publishMeasurementInstances(actor,current.id,{revision:3})).rejects.toMatchObject({statusCode:403})
  expect(mocks.writer).toHaveBeenCalledTimes(1);expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
 })
 it('does not increment draft revision when the release writer fails',async()=>{
  mocks.writer.mockRejectedValueOnce(Object.assign(new Error('CONTENT_ASSIGNMENT_SOURCE_INVALID'),{statusCode:409}))
  await expect(publishMeasurementInstances(actor,current.id,{revision:3})).rejects.toThrow('CONTENT_ASSIGNMENT_SOURCE_INVALID')
  expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
 })
})

describe('questionnaire report selection mutation boundary',()=>{
 it('clears selection through locked revision mutation without publishing an instance',async()=>{
  current.trainingReportSelectionDraft={schemaVersion:1,units:[]}
  await updateContentReportSelection(actor,current.id,{revision:3,selection:null})
  expect(mocks.db.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'),'questionnaire')
  expect(mocks.db.compositeAssessment.update).toHaveBeenCalledWith({where:{id:current.id},data:{trainingReportSelectionDraft:expect.anything()}})
  expect(current.revision).toBe(4);expect(mocks.writer).not.toHaveBeenCalled()
 })
 it('rejects stale revision and true business ADMIN before changing selection',async()=>{
  await expect(updateContentReportSelection(actor,current.id,{revision:2,selection:null})).rejects.toThrow()
  expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
  principal.role='ADMIN'
  await expect(updateContentReportSelection({...actor,role:UserRole.ADMIN},current.id,{revision:3,selection:null})).rejects.toThrow()
  expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
 })
 it('does not allow entry ADMIN to select reports for another owner',async()=>{
  current.createdBy='other'
  await expect(updateContentReportSelection({...actor,role:UserRole.ADMIN},current.id,{revision:3,selection:null})).rejects.toThrow()
  expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
 })
})

it('persists an explicit selection after actual-source preparation, then returns the owner draft DTO',async()=>{
 const selection={schemaVersion:1,units:[]}
 mocks.snapshot.mockResolvedValue({snapshot:{schemaVersion:1,compositeId:current.id,units:[]},releases:new Map()})
 mocks.db.compositeAssessment.update.mockImplementation(async({data})=>{
  if(data.revision?.increment)current.revision+=data.revision.increment
  if(data.trainingReportSelectionDraft)current.trainingReportSelectionDraft=data.trainingReportSelectionDraft
  return current
 })
 const result=await updateContentReportSelection(actor,current.id,{revision:3,selection})
 expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(mocks.db,current,new Map())
 expect(mocks.db.compositeAssessment.update).toHaveBeenCalledWith({where:{id:current.id},data:{trainingReportSelectionDraft:selection}})
 expect(result.trainingReportSelectionDraft).toEqual(selection);expect(current.revision).toBe(4)
})

describe('questionnaire reference selection mutation and discovery boundary',()=>{
 it('uses explicit locked revision CAS and preserves exact selection in owner detail',async()=>{
  const selection={schemaVersion:1,units:[]}
  mocks.snapshot.mockResolvedValue({snapshot:{schemaVersion:1,compositeId:current.id,units:[]},releases:new Map()})
  mocks.db.compositeAssessment.update.mockImplementation(async({data})=>{
   if(data.revision?.increment)current.revision+=data.revision.increment
   if(data.trainingReferenceSelectionDraft)current.trainingReferenceSelectionDraft=data.trainingReferenceSelectionDraft
   return current
  })
  const result=await updateContentReferenceSelection(actor,current.id,{revision:3,selection})
  expect(mocks.db.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'),'questionnaire')
  expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(mocks.db,current,new Map())
  expect(result.trainingReferenceSelectionDraft).toEqual(selection);expect(current.revision).toBe(4)
  expect(mocks.writer).not.toHaveBeenCalled();expect(mocks.publishComposite).not.toHaveBeenCalled()
  await expect(updateContentReferenceSelection(actor,current.id,{revision:3,selection})).rejects.toMatchObject({statusCode:409})
 })
 it.each([{revision:2},{status:'PUBLISHED'},{createdBy:'another'}])('rejects stale/non-draft/nonowner before reference lookup %j',async change=>{
  Object.assign(current,change)
  await expect(updateContentReferenceSelection(actor,current.id,{revision:3,selection:null})).rejects.toThrow()
  expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled();expect(mocks.snapshot).not.toHaveBeenCalled()
 })
 it('discovery intersects real teacher ownership and exact licensed measurement preparation without requiring report authoring',async()=>{
  mocks.snapshot.mockResolvedValue({snapshot:{schemaVersion:1,compositeId:current.id,units:[]},releases:new Map()})
  expect(await contentReferenceChoices(actor,current.id)).toEqual({schemaVersion:1,units:[]})
  expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(mocks.db,current,new Map());expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
  current.createdBy='foreign';await expect(contentReferenceChoices({...actor,role:UserRole.ADMIN},current.id)).rejects.toMatchObject({statusCode:403})
  expect(mocks.snapshot).toHaveBeenCalledTimes(1)
 })
 it('clears explicitly and rejects client scoring/context/hash fields before any transaction',async()=>{
  await updateContentReferenceSelection(actor,current.id,{revision:3,selection:null})
  expect(mocks.db.compositeAssessment.update).toHaveBeenCalledWith({where:{id:current.id},data:{trainingReferenceSelectionDraft:expect.anything()}})
  mocks.db.$transaction.mockClear()
  await expect(updateContentReferenceSelection(actor,current.id,{revision:4,selection:null,populationContext:{gradeLevel:'1'}})).rejects.toThrow()
  expect(mocks.db.$transaction).not.toHaveBeenCalled()
 })
})
