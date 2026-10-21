import {beforeEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({findMany:vi.fn(),count:vi.fn(),updateMany:vi.fn(),query:vi.fn(),transaction:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{assignment:m,checkin:m,questionnaire:m,compositeAssessment:m,scale:m,cognitiveAssignment:m,$queryRawUnsafe:m.query,$transaction:m.transaction}}))
import {managementTaskList} from '../../modules/training-catalog/tasks'
import {courseCatalogPage} from '../../modules/training-catalog/course'
import {updateCatalogTags} from '../../modules/training-catalog/tags'
import {parseCatalogFilters} from '../../modules/training-catalog/filters'
const response=()=>{const r:any={};r.status=vi.fn(()=>r);r.json=vi.fn(value=>{r.body=value;return r});return r}
beforeEach(()=>{vi.clearAllMocks();m.findMany.mockResolvedValue([]);m.count.mockResolvedValue(123);m.updateMany.mockResolvedValue({count:1});m.query.mockResolvedValue([]);m.transaction.mockResolvedValue([[],[{total:0n}]])})
it.each(['assignment','checkin'] as const)('bounds %s metadata queries and retains exact course/creator restrictions',async kind=>{
 const res=response()
 await managementTaskList({user:{role:'TEACHER',userId:'teacher'},query:{courseId:'course',search:'第二期',tags:'前测,重点',dateField:'deadline',from:'2026-10-01T00:00:00.000Z',to:'2026-11-01T00:00:00.000Z',page:'2',pageSize:'10'}} as any,res,kind)
 expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{title:{contains:'第二期',mode:'insensitive'},tags:{hasEvery:['前测','重点']},[kind==='assignment'?'deadline':'endTime']:{gte:new Date('2026-10-01Z'),lt:new Date('2026-11-01Z')},courseId:'course',course:{creatorId:'teacher',courseType:{not:'CAMPUS_ACTIVITY'}}},skip:10,take:10,orderBy:[{createdAt:'desc'},{id:'desc'}]}))
 const select=m.findMany.mock.calls[0][0].select
 expect(select.content).toBeUndefined();expect(select.questions).toBeUndefined();expect(select.videos).toBeUndefined()
 expect(res.body.data).toMatchObject({list:[],total:123,page:2,pageSize:10})
})
it.each([{pageSize:'51'},{page:'501'},{from:'bad'},{tags:['forged']},{from:'2026-11-01T00:00:00Z',to:'2026-10-01T00:00:00Z'}])('rejects unsafe or ambiguous filter input %j before DB reads',async query=>{
 const res=response();await managementTaskList({user:{role:'TEACHER',userId:'t'},query} as any,res,'assignment');expect(res.status).toHaveBeenCalledWith(400);expect(m.findMany).not.toHaveBeenCalled()
})
it('rejects student management summaries without changing participant contracts',async()=>{const res=response();await managementTaskList({user:{role:'STUDENT'},query:{}}as any,res,'assignment');expect(res.status).toHaveBeenCalledWith(403);expect(m.findMany).not.toHaveBeenCalled()})
it('keeps wildcard text parameterized and applies identical filters to count and bounded course rows',async()=>{
 await courseCatalogPage('course',{userId:'teacher',role:'TEACHER'},{search:"%' OR 1=1 --",tags:'前测',page:2,pageSize:20,includeManaged:'true'})
 const [rows,count]=m.query.mock.calls
 expect(rows[0]).not.toContain("%' OR 1=1 --");expect(rows[0]).toContain('LIMIT $9 OFFSET $10');expect(rows.slice(1,9)).toEqual(count.slice(1));expect(rows[5]).toBe("%\\%' or 1=1 --%");expect(rows.slice(-2)).toEqual([20,20]);expect(rows[0]).toContain('d.course_id=$1');expect(rows[0]).toContain('c.created_by=$2')
})
it('updates only owned management tags with compare-and-set, without touching publication revision',async()=>{
 expect(await updateCatalogTags({userId:'teacher',role:'TEACHER'},'id',{kind:'COLLECTION',expectedTags:['旧'],tags:['前测','前测']})).toEqual({tags:['前测']})
 expect(m.updateMany).toHaveBeenCalledWith({where:{id:'id',createdBy:'teacher',tags:{equals:['旧']},productKind:'QUESTIONNAIRE'},data:{tags:['前测']}})
 m.updateMany.mockResolvedValue({count:0});await expect(updateCatalogTags({userId:'teacher',role:'TEACHER'},'id',{kind:'COLLECTION',expectedTags:[],tags:[]})).rejects.toMatchObject({statusCode:409})
})
it('rejects invalid tags and page sizes at the common boundary',()=>{expect(()=>parseCatalogFilters({pageSize:100})).toThrow();expect(()=>parseCatalogFilters({tags:'x'.repeat(21)})).toThrow()})
