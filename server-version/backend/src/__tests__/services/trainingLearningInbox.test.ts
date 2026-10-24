import {beforeEach,describe,expect,it,vi} from 'vitest'
const {db,feed,cognitive}=vi.hoisted(()=>({
 db:Object.fromEntries(['courseStudent','submission','scale','assessment','questionnaireAssessment','compositeAssessmentAttempt','situationalAttempt','cognitiveSession'].map(name=>[name,{findMany:vi.fn()}])),
 feed:vi.fn(),cognitive:vi.fn(),
}))
vi.mock('../../config/database',()=>({prisma:db}))
vi.mock('../../services/studentTasks',()=>({listStudentTasks:feed}))
vi.mock('../../modules/cognitive/assignment.service',()=>({listStudentAssignments:cognitive}))
import {listTrainingLearningInbox,type LearningQuery} from '../../services/trainingLearningInbox'
import type {StudentTask} from '../../services/studentTasks'
const now=new Date('2026-10-24T10:00:00Z'),c={id:'c',title:'课程一'},d={id:'d',title:'课程二'}
const query:LearningQuery={view:'todo',kind:'ALL',page:1,pageSize:6}
const task=(id:string,kind:StudentTask['kind']='ASSIGNMENT',extra:Partial<StudentTask>={}):StudentTask=>({id,kind,title:id,courses:[c],state:'PENDING',deadline:null,opensAt:null,canStart:true,canContinue:false,href:'/student/assignments/'+id,...extra})
beforeEach(()=>{
 vi.clearAllMocks()
 for(const table of Object.values(db))table.findMany.mockResolvedValue([])
 db.courseStudent.findMany.mockResolvedValue([{course:c},{course:d}])
 feed.mockResolvedValue({list:[]});cognitive.mockResolvedValue([])
})
describe('Training learner overview metadata',()=>{
 it('aggregates all joined courses, deduplicates deliveries and sorts ongoing before deadline',async()=>{
  feed.mockResolvedValue({list:[task('a','ASSIGNMENT',{courses:[d],deadline:'2026-10-25T00:00:00Z'}),task('q','QUESTIONNAIRE',{courses:[c,d],state:'IN_PROGRESS',canStart:false,canContinue:true,href:'/student/questionnaires/q'}),task('q','QUESTIONNAIRE',{courses:[c,d],state:'IN_PROGRESS',canStart:false,canContinue:true,href:'/student/questionnaires/q'}),task('check','CHECKIN',{href:'/student/checkins/check'})]})
  const result=await listTrainingLearningInbox('student',query,now)
  expect(result.summary).toEqual({todo:3,feedback:0})
  expect(result.list.map(r=>r.key)).toEqual(['QUESTIONNAIRE:q','ASSIGNMENT:a','CHECKIN:check'])
  expect(result.list[0].courses).toEqual([c,d])
  expect(result.list[0].href).toBe('/student/questionnaires/q?courseId=c&courseSection=assessments')
 })
 it('uses actual Training memberships and original actionable eligibility, without public discovery',async()=>{
  feed.mockResolvedValue({list:[task('campus','ASSIGNMENT',{courses:[{id:'campus',title:'校园'}]}),task('public','QUESTIONNAIRE',{courses:[]}),task('done','ASSIGNMENT',{state:'COMPLETED',canStart:false}),task('closed','CHECKIN',{state:'EXPIRED',canStart:false,href:null}),task('open')]})
  const result=await listTrainingLearningInbox('student',query,now)
  expect(result.list.map(r=>r.title)).toEqual(['open'])
  expect(db.courseStudent.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{studentId:'student',status:{in:['ACTIVE','APPROVED']},course:{isLibrary:false,courseType:'TRAINING_COURSE'}}}))
  expect(db.scale.findMany.mock.calls[0][0].where).toEqual({status:'PUBLISHED',visibility:{in:['PUBLIC','COURSE']},courseScales:{some:{courseId:{in:['c','d']}}}})
 })
 it('shows only nonempty teacher exercise comments, never check-in feedback or comment contents',async()=>{
  feed.mockResolvedValue({list:[task('a','ASSIGNMENT',{state:'COMPLETED',canStart:false}),task('check','CHECKIN',{state:'COMPLETED',canStart:false})]})
  db.submission.findMany.mockResolvedValue([{id:'r',assignmentId:'a',comment:'私有评语',reviewedAt:now,submittedAt:now},{id:'empty',assignmentId:'a',comment:'  ',reviewedAt:now,submittedAt:now}])
  const result=await listTrainingLearningInbox('student',{...query,view:'feedback'},now)
  expect(result.summary).toEqual({todo:0,feedback:1});expect(result.counts.CHECKIN).toBe(0)
  expect(result.list[0]).toMatchObject({typeLabel:'练习评语',action:'查看评语'})
  expect(JSON.stringify(result)).not.toContain('私有评语')
  expect(db.submission.findMany.mock.calls[0][0].where).toEqual({studentId:'student',assignmentId:{in:['a']},status:'GRADED',comment:{not:null}})
 })
 it('retains old questionnaire/composite results during a new active attempt, without claiming release',async()=>{
  feed.mockResolvedValue({list:[task('q','QUESTIONNAIRE',{state:'IN_PROGRESS',canContinue:true,href:'/student/questionnaires/q'}),task('comp','COMPOSITE',{state:'IN_PROGRESS',canContinue:true,href:'/student/composite/attempts/new'})]})
  db.questionnaireAssessment.findMany.mockResolvedValue([{id:'old-q',questionnaireId:'q',completedAt:now}])
  db.compositeAssessmentAttempt.findMany.mockResolvedValue([{id:'old-c',compositeAssessmentId:'comp',deliveryCourseId:'d',completedAt:now}])
  const result=await listTrainingLearningInbox('student',{...query,view:'feedback'},now)
  expect(result.summary).toEqual({todo:2,feedback:2})
  expect(result.list.every(r=>r.stateLabel==='已交卷 · 按测评规则开放')).toBe(true)
  expect(result.list.find(r=>r.key==='composite-result:old-c')?.href).toBe('/student/composite/attempts/old-c/report?courseId=d&courseSection=assessments')
  expect(db.questionnaireAssessment.findMany.mock.calls[0][0].where.userId).toBe('student')
  expect(db.compositeAssessmentAttempt.findMany.mock.calls[0][0].where.userId).toBe('student')
 })
 it('counts delivered scales once, keeps own personal history, and does not read scores or answers',async()=>{
  db.scale.findMany.mockResolvedValue([{id:'scale',name:'量表',courseScales:[{courseId:'c'},{courseId:'d'}]}])
  const scale={name:'量表',courseScales:[]}
  db.assessment.findMany.mockResolvedValue([{id:'active',scaleId:'scale',status:'IN_PROGRESS',startedAt:now,completedAt:null,scale},{id:'old',scaleId:'scale',status:'COMPLETED',startedAt:now,completedAt:now,scale}])
  db.situationalAttempt.findMany.mockResolvedValue([{id:'sjt',instrumentKey:'instrument',status:'COMPLETED',startedAt:now,completedAt:now}])
  const result=await listTrainingLearningInbox('student',{...query,view:'feedback'},now)
  expect(result.summary).toEqual({todo:1,feedback:2})
  expect(result.list.find(r=>r.key==='situational:sjt')?.title).toBe('情境判断')
  for(const table of ['assessment','situationalAttempt']){
   const args=db[table].findMany.mock.calls[0][0]
   expect(args.where).toMatchObject({userId:'student',compositeAttemptId:null})
   expect(JSON.stringify(args.select)).not.toMatch(/answers|score|trials|reportData/i)
  }
 })
 it('keeps cognitive wrappers and closed/new-admission-paused tasks out, but retains completed results',async()=>{
  const base={courseId:'c',title:'认知',opensAt:null,dueAt:null,admissionPaused:false,continueHref:null}
  cognitive.mockResolvedValue([{...base,id:'new'},{...base,id:'active',continueHref:'/student/cognitive/sessions/live'},{...base,id:'paused',admissionPaused:true},{...base,id:'future',opensAt:new Date(now.getTime()+1000)},{...base,id:'expired',dueAt:new Date(now.getTime()-1)},{...base,id:'done'},{...base,id:'foreign',courseId:'not-joined'}])
  db.cognitiveSession.findMany.mockResolvedValue([{id:'live',assignmentId:'active',status:'IN_PROGRESS',startedAt:now,finishedAt:null},{id:'finished',assignmentId:'done',status:'COMPLETED',startedAt:now,finishedAt:now}])
  const result=await listTrainingLearningInbox('student',query,now)
  expect(result.summary).toEqual({todo:2,feedback:1})
  expect(result.list.map(r=>r.key)).toEqual(['cognitive:active','cognitive:new'])
  expect(db.cognitiveSession.findMany.mock.calls[0][0].where).toMatchObject({userId:'student',compositeAttemptId:null})
  expect(db.cognitiveSession.findMany.mock.calls[0][0].where.assignmentId.in).not.toContain('foreign')
 })
 it('filters and paginates after aggregation with stable global category counts',async()=>{
  feed.mockResolvedValue({list:Array.from({length:9},(_,i)=>task('a'+i)).concat(task('check','CHECKIN'))})
  const result=await listTrainingLearningInbox('student',{...query,kind:'ASSIGNMENT',page:2,pageSize:6},now)
  expect(result.summary.todo).toBe(10);expect(result.total).toBe(9)
  expect(result.counts).toEqual({ALL:10,ASSIGNMENT:9,CHECKIN:1,ASSESSMENT:0})
  expect(result.list.map(r=>r.title)).toEqual(['a6','a7','a8'])
 })
 it('fails closed instead of showing zero when an upstream read fails',async()=>{
  db.assessment.findMany.mockRejectedValue(new Error('unavailable'))
  await expect(listTrainingLearningInbox('student',query,now)).rejects.toThrow('unavailable')
 })
})
