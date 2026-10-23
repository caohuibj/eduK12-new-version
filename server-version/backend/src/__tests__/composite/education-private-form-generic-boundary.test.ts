import {beforeEach,describe,expect,it,vi} from 'vitest'
import {UserRole} from '@prisma/client'
const {db}=vi.hoisted(()=>({db:{$transaction:vi.fn(),compositeAssessment:{findUnique:vi.fn(),create:vi.fn()},
 compositeAssessmentAccessToken:{findUnique:vi.fn()},compositeAssessmentAttempt:{create:vi.fn()},courseStudent:{findUnique:vi.fn()}}}))
vi.mock('../../config/database',()=>({prisma:db}))
import {copyComposite,startUserAttempt,getPublicCompositeInfo} from '../../modules/composite/composite.service'
const parent={id:'parent',creationKey:'private-form:SCHOOL:00000000-0000-4000-8000-000000000001:STUDENT:SELF',createdBy:'owner',
 productKind:'ORGANIZATION_RESOURCE',status:'PUBLISHED',publicEnabled:true,courseId:'course',course:{isLibrary:false},items:[],formSections:[]}
const denied={statusCode:403,message:'组织资源仅可通过对应的组织任务访问'}
beforeEach(()=>{vi.clearAllMocks();db.compositeAssessment.findUnique.mockResolvedValue(parent);db.compositeAssessmentAccessToken.findUnique.mockResolvedValue({compositeAssessment:parent})})
describe('Private FORM fixed source does not become a generic Training template',()=>{
 it.each(['FORM','SCALE'])('blocks %s owner copy before any draft or child writes',async(kind)=>{
  if(kind==='SCALE')db.compositeAssessment.findUnique.mockResolvedValue({...parent,creationKey:null,code:'org-private-resource-synthetic'})
  await expect(copyComposite('owner',UserRole.TEACHER,'parent',{courseId:'course'})).rejects.toMatchObject(denied)
  expect(db.$transaction).not.toHaveBeenCalled();expect(db.compositeAssessment.create).not.toHaveBeenCalled()
 })
 it('blocks ordinary authenticated starts even if an unrelated course exists',async()=>{
  await expect(startUserAttempt('student','parent')).rejects.toMatchObject(denied)
  expect(db.courseStudent.findUnique).not.toHaveBeenCalled();expect(db.$transaction).not.toHaveBeenCalled();expect(db.compositeAssessmentAttempt.create).not.toHaveBeenCalled()
 })
 it('blocks a generic public-token source before loading the form graph, independent of publicEnabled',async()=>{
  await expect(getPublicCompositeInfo('synthetic-token')).rejects.toMatchObject(denied)
  expect(db.compositeAssessment.findUnique).not.toHaveBeenCalled();expect(db.$transaction).not.toHaveBeenCalled();expect(db.compositeAssessmentAttempt.create).not.toHaveBeenCalled()
 })
})
