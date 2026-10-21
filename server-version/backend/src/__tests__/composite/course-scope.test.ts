import {beforeEach,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({course:vi.fn(),assessment:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{course:{findUnique:mocks.course},compositeAssessment:{findFirst:mocks.assessment}}}))
import {assertCompositeCourseScope} from '../../modules/composite/composite-course-scope'
beforeEach(()=>{vi.clearAllMocks();mocks.course.mockResolvedValue({id:'course-a',title:'课程A',creatorId:'owner',courseType:'TRAINING_COURSE',isLibrary:false});mocks.assessment.mockResolvedValue({id:'assessment'})})
it('requires exact Training course ownership and assessment binding',async()=>{
 expect(await assertCompositeCourseScope('owner','TEACHER','assessment','course-a')).toEqual({id:'course-a',title:'课程A'})
 expect(mocks.assessment).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'assessment',OR:expect.arrayContaining([expect.objectContaining({questionnaireCourses:{some:{courseId:'course-a'}}})])})}))
})
it('rejects shared teachers before querying measurements',async()=>{
 await expect(assertCompositeCourseScope('shared','TEACHER','assessment','course-a')).rejects.toMatchObject({statusCode:403})
 expect(mocks.assessment).not.toHaveBeenCalled()
})
it('rejects libraries, other product courses and an unbound assessment',async()=>{
 mocks.course.mockResolvedValueOnce({id:'course-a',creatorId:'owner',courseType:'TRAINING_COURSE',isLibrary:true})
 await expect(assertCompositeCourseScope('owner','TEACHER','assessment','course-a')).rejects.toMatchObject({statusCode:403})
 mocks.assessment.mockResolvedValueOnce(null)
 await expect(assertCompositeCourseScope('owner','TEACHER','assessment','course-a')).rejects.toMatchObject({statusCode:403})
})
