import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {HuiteacherStudentEvaluationManager} from './HuiteacherStudentEvaluationManager'
import {HuiteacherStudentTasks} from './HuiteacherStudentTasks'
import {HuiteacherStudentFeedbackView,type StudentFeedbackReport} from './HuiteacherStudentFeedbackView'
import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'
import type {CompositeAttemptState} from '../modules/composite/types'
import {EducationCompositionStudio} from '../components/education-tools/EducationCompositionStudio'

// Exercise the real host, consent, task scope and transports. Native scientific
// rendering/scoring is separately covered; a child hint cannot complete a parent.
vi.mock('./TeacherAssessmentPage',()=>({TeacherAssessmentPage:({children}:{children:React.ReactNode})=><>{children}</>}))
vi.mock('../components/FinalCompositeAssessment',()=>({default:(props:{state:CompositeAttemptState;onReload:()=>Promise<void>;
 submitScale:(id:string,itemId:string,payload:unknown)=>Promise<unknown>;submitFormSection:(id:string,sectionId:string,payload:unknown)=>Promise<unknown>})=><div>
 <p>当前单元 {props.state.currentItem?.type}</p>
 <button onClick={()=>void props.submitScale(props.state.id,'scale',{submissionId:'fixed-scale-final'}).then(props.onReload)}>固定量表 FINAL</button>
 <button onClick={()=>void props.submitFormSection(props.state.id,'form-section',{submissionId:'fixed-form-final'}).then(props.onReload)}>固定表单 FINAL</button>
 </div>}))
const root='00000000-0000-4000-8000-000000000001',fixed='00000000-0000-4000-8000-000000000002',hash='a'.repeat(64)
const props={organizationId:'org',eventId:'event',eventStatus:'DRAFT',eventVersion:1,teacherName:'被评教师',forms:[]}
const base='/organizations/org/evaluation-events/event/student-evaluation'
const missing=()=>Object.assign(new Error('Not found'),{status:404})
describe('Teacher ordinary student questionnaires: source, respondent and disclosure boundaries',()=>{
 it('authors and freezes a student observer version while clearing incompatible SELF background fields only after confirmation',async()=>{
  const tools='/organizations/org/private-tools',formVersion='00000000-0000-4000-8000-000000000005'
  let draft={id:root,kind:'COMPOSITION',title:'学生观察问卷',revision:1,contentHash:hash,definition:{schemaVersion:1,adapterVersion:'1.0.0',
   administration:{population:'TEACHER',responseMode:'SELF'},contextFields:[{contextKey:'birthYearMonth',formType:'year_month',formLabel:'出生年月',formOptions:[]}],instruction:'',blocks:[]}}
  const api=vi.fn(async(path:string,method='GET',body?:any)=>{
   if(path===tools+'?kind=COMPOSITION')return {list:[draft],nextCursor:null}
   if(path===tools+'/'+root&&method==='GET')return draft
   if(path===tools)return {list:[{id:'form',kind:'FORM',title:'课堂观察表单',revision:2}],nextCursor:null}
   if(path===tools+'/form/versions')return {list:[{id:formVersion,title:'固定课堂表单',sourceRevision:2,contentHash:hash}],nextCursor:null}
   if(path===tools+'/'+root&&method==='PUT'){draft={...draft,...body,revision:2};return draft}
   if(path===tools+'/'+root+'/versions')return {list:[],nextCursor:null}
   if(path===tools+'/'+root+'/freeze')return {id:fixed,title:draft.title,sourceRevision:2,contentHash:hash}
   throw Error('Unexpected '+method+' '+path)
  })
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  try{
   render(<EducationCompositionStudio entry="TEACHER" organizationId="org" actorId="manager" api={api as EducationReportApi}/>)
   fireEvent.click(await screen.findByRole('button',{name:'编辑 学生观察问卷'}))
   const mode=await screen.findByLabelText('问卷作答方式')
   fireEvent.change(mode,{target:{value:'STUDENT_REPORT'}});expect(mode).toHaveValue('SELF')
   fireEvent.change(mode,{target:{value:'STUDENT_REPORT'}});expect(mode).toHaveValue('STUDENT_REPORT')
   expect(screen.getByRole('group',{name:'背景信息区段'})).toBeDisabled()
   fireEvent.click(await screen.findByRole('button',{name:'选择固定版本 · 课堂观察表单'}))
   fireEvent.click(await screen.findByRole('button',{name:'加入问卷 · 修订 2'}))
   fireEvent.click(screen.getByRole('button',{name:'保存问卷草稿'}));await screen.findByText('问卷草稿已保存。')
   expect(draft.definition.administration).toEqual({population:'TEACHER',responseMode:'STUDENT_REPORT'})
   expect(draft.definition).not.toHaveProperty('contextFields')
   expect(draft.definition.blocks).toEqual([{blockId:expect.any(String),instruction:'',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:formVersion,contentHash:hash}}])
   fireEvent.click(screen.getByRole('button',{name:'固定问卷版本'}));await screen.findByText(/问卷版本已固定/)
   expect(api).toHaveBeenCalledWith(tools+'/'+root+'/freeze','POST',{expectedRevision:2,expectedContentHash:hash})
  }finally{confirm.mockRestore()}
 })
 it('selects a fixed STUDENT_REPORT version and posts only its exact identity with the verified staff/class',async()=>{
  let configured=false
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path===base&&method==='GET'){if(!configured)throw missing();return {id:'cfg',classUnitId:'class',staffAssignmentId:'staff',privateComposition:{versionId:fixed,contentHash:hash}}}
   if(path===base+'/candidates')return {list:[{staffAssignmentId:'staff',classUnitId:'class',className:'已核验班级',staffRole:'TEACHING'}]}
   if(path==='/organizations/org/private-tools?kind=COMPOSITION')return {list:[{id:root,kind:'COMPOSITION',title:'固定评教问卷',revision:8}],nextCursor:null}
   if(path===`/organizations/org/private-tools/${root}/versions`)return {list:[
    {id:'old-self',title:'教师自评版本',sourceRevision:1,contentHash:hash,administration:{population:'TEACHER',responseMode:'SELF'}},
    {id:fixed,title:'学生评教版本',sourceRevision:3,contentHash:hash,administration:{population:'TEACHER',responseMode:'STUDENT_REPORT'}},
   ],nextCursor:null}
   if(path===base&&method==='POST'){configured=true;return {id:'cfg',classUnitId:'class',staffAssignmentId:'staff',privateComposition:{versionId:fixed,contentHash:hash}}}
   if(path===base+'/run'&&method==='POST')return {runId:'run',status:'DRAFT',version:2}
   if(path===base+'/eligibility')return {teacherAssigned:true,eligibleStudentCount:10,privacyFloor:10}
   throw Error('Unexpected '+method+' '+path)
  })
  render(<HuiteacherStudentEvaluationManager {...props} api={api as EducationReportApi}/>)
  fireEvent.click(await screen.findByRole('button',{name:'选择学校核验的任教关系'}))
  fireEvent.change(await screen.findByLabelText('本教师合法任教的班级'),{target:{value:'staff'}})
  await waitFor(()=>expect(screen.getByLabelText('评价问卷来源')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('评价问卷来源'),{target:{value:'COMPOSITION'}})
  fireEvent.click(await screen.findByRole('button',{name:'选择固定版本 · 固定评教问卷'}))
  fireEvent.click(await screen.findByRole('button',{name:'用于学生评教 · 修订 1'}))
  expect(screen.getByRole('status')).toHaveTextContent('不能把教师自评版本改为学生代答')
  expect(screen.getByRole('button',{name:'准备评价草稿'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'用于学生评教 · 修订 3'}))
  fireEvent.click(screen.getByRole('button',{name:'准备评价草稿'}))
  await screen.findByText('评价与任务草稿已准备好。核对参与资格后即可直接发布。')
  expect(api).toHaveBeenCalledWith(base,'POST',{staffAssignmentId:'staff',classUnitId:'class',privateComposition:{versionId:fixed,contentHash:hash}})
  expect(api.mock.calls.filter(([,method])=>method==='POST').map(([path])=>path)).toEqual([base,base+'/run'])
  expect(screen.getByText(fixed)).toBeInTheDocument()
 })
 it('uses the student scope for consent, START/resume and Scale/Form FINAL and only reads completion feedback',async()=>{
  const task={executionId:'execution',organizationId:'org',runId:'run',eventId:'event',eventTitle:'学校评教',title:'固定课堂反馈',teacherName:'核验教师姓名',
   family:'BUNDLE',mode:'COMPOSITION',status:'ASSIGNED',runStatus:'PUBLISHED',runtimeBindingRef:null,consentRequired:true,consentPurpose:'改善教学',consentVisibility:'本人完成确认与受保护群体反馈'}
  let stage=0
  const api=vi.fn(async(path:string,..._rest:unknown[])=>{
   if(path==='/my-student-evaluations')return {list:[]}
   if(path==='/student-assessments/my-assessment-tasks')return {list:[task],nextCursor:null}
   if(path==='/student-assessments/run-executions/execution/assessment-consent/accept')return {accepted:true}
   if(path==='/student-assessments/run-executions/execution/start-assessment')return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'parent'}
   if(path==='/student-assessments/assessment-composite-attempts/parent?view=current-unit')return {
    id:'parent',deliveryMode:'FINAL_ONLY',status:stage===2?'COMPLETED':'IN_PROGRESS',currentItem:stage===2?null:{id:stage?'form':'scale',type:stage?'FORM_SECTION':'SCALE',formSectionId:'form-section'},items:[],
   }
   if(path==='/student-assessments/assessment-composite-attempts/parent/items/scale/scale/submit?response=receipt'){stage=1;return {completed:true}}
   if(path==='/student-assessments/assessment-composite-attempts/parent/form-sections/form-section/submit'){stage=2;return {completed:true}}
   if(path==='/student-assessments/run-executions/execution/feedback')return {state:'COMPLETION_ONLY',executionId:'execution',title:'固定课堂反馈',kind:'COMPOSITION',units:[]}
   throw Error('Unexpected '+path)
  })
  render(<HuiteacherStudentTasks actorKey="student" api={api as EducationReportApi}/>)
  expect(await screen.findByText('被评价教师：核验教师姓名')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'开始评价'}))
  const launch=screen.getByRole('button',{name:'开始或继续评价'})
  expect(launch).toBeDisabled();expect(api.mock.calls.some(([path])=>path.includes('start-assessment'))).toBe(false)
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(launch)
  await screen.findByText('当前单元 SCALE')
  fireEvent.click(screen.getByRole('button',{name:'固定量表 FINAL'}));await screen.findByText('当前单元 FORM_SECTION')
  expect(screen.queryByText('本次评价已完成')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'固定表单 FINAL'}));await screen.findByText('本次评价已完成')
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/student-assessments/run-executions/execution/feedback',undefined,undefined,undefined))
  expect(api).toHaveBeenCalledWith('/student-assessments/assessment-composite-attempts/parent/items/scale/scale/submit?response=receipt','POST',{submissionId:'fixed-scale-final'},undefined)
  expect(api.mock.calls.filter(([path])=>path!=='/my-student-evaluations').every(([path])=>path.startsWith('/student-assessments/'))).toBe(true)
  expect(JSON.stringify(api.mock.calls)).not.toMatch(/teacherUserId|respondentUserId|subjectUserId|personal-report|training/)
 })
 it('drops the previous student tasks immediately even when the host API object stays stable',async()=>{
  let finish!:(value:unknown)=>void
  const pending=new Promise(resolve=>{finish=resolve});let reads=0
  const api=vi.fn(async(path:string,_method='GET')=>path==='/my-student-evaluations'?{list:[]}:++reads===1?pending:{list:[],nextCursor:null})
  const view=render(<HuiteacherStudentTasks actorKey="old-student" api={api as EducationReportApi}/>)
  await waitFor(()=>expect(reads).toBe(1))
  view.rerender(<HuiteacherStudentTasks actorKey="new-student" api={api as EducationReportApi}/>)
  await screen.findByText('暂无分配给你的学生评教任务。')
  await act(async()=>{finish({list:[{executionId:'old',title:'前一学生可操作任务',status:'ASSIGNED'}],nextCursor:null});await pending})
  expect(screen.queryByText('前一学生可操作任务')).not.toBeInTheDocument()
  expect(api.mock.calls.every(([,method])=>!method||method==='GET')).toBe(true)
 })
 it('renders separately scoped zero-valued Scale aggregates, withheld statistics and unscored Form cells',()=>{
  const report:StudentFeedbackReport={source:'VERIFIED_HUITEACHER_STUDENT_COMPOSITION_FINAL',eventId:'event',teacherName:'核验教师',formTitle:'群体反馈',definitionDigest:hash,
   frozenPopulation:10,independentRespondents:10,participationRate:1,minimumRespondents:10,releasedAt:'2026-10-29T00:00:00Z',distributions:[],withheldFreeText:true,reportMode:'COMPOSITION_DESCRIPTIVE_AGGREGATE',note:'固定群体快照',units:[
    {blockId:'first',kind:'SCALE',title:'第一工具',versionId:'v1',contentHash:hash,metrics:[{key:'total',label:'观察总分',status:'READY',mean:0,validN:10,missingN:0}]},
    {blockId:'second',kind:'SCALE',title:'第二工具',versionId:'v2',contentHash:hash,metrics:[{key:'total',label:'观察总分',status:'WITHHELD',mean:null}]},
    {blockId:'form',kind:'FORM',title:'课堂表单',versionId:'v3',contentHash:hash,distributions:[{itemKey:'q',prompt:'清晰度',type:'SINGLE',status:'READY',cells:[{key:'yes',label:'清晰',count:10}]},{itemKey:'comment',prompt:'开放意见',type:'LONG_TEXT',status:'WITHHELD',reason:'PRIVATE_FREE_TEXT'}]},
   ]}
  render(<HuiteacherStudentFeedbackView report={report}/>)
  expect(within(screen.getByRole('region',{name:'第一工具群体反馈'})).getByText(/群体均值 0（有效 10，缺失 0）/)).toBeInTheDocument()
  expect(within(screen.getByRole('region',{name:'第二工具群体反馈'})).getByText(/统计结果受限/)).toBeInTheDocument()
  expect(screen.getByText('表单不计算量表分数。')).toBeInTheDocument()
  expect(screen.getByText('清晰：10')).toBeInTheDocument();expect(screen.getByText(/开放意见默认不披露/)).toBeInTheDocument()
 })
})
