import {cleanup,fireEvent,render,screen,waitFor,act} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import type {FinalCompositeAssessmentProps} from '../components/FinalCompositeAssessment'
import {HuiteacherFieldQuestionnaire,type FieldQuestionnaireTask} from './HuiteacherFieldQuestionnaire'
import {HuiteacherFieldManager} from './HuiteacherFieldManager'
import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'
const m=vi.hoisted(()=>({props:null as FinalCompositeAssessmentProps|null,accepted:vi.fn(),failed:vi.fn()}))
const payload={submissionId:'11111111-1111-4111-8111-111111111111',attemptEpoch:1,definitionHash:'a'.repeat(64),answers:[{itemCode:'q',responseValue:0}]}
vi.mock('../components/FinalCompositeAssessment',()=>({default:(props:FinalCompositeAssessmentProps)=>{
 m.props=props
 const submit=async()=>{
  const item=props.state.currentItem!
  const result=item.type==='SCALE'?await props.submitScale(props.state.id,item.id,payload):await props.submitFormSection(props.state.id,item.formSectionId!,{...payload,answers:[{formItemId:'form-q',value:'Expert observation'}]})
  m.accepted(result);await props.onReload()
 }
 return <div><p>Native {props.state.currentItem?.type}</p><button onClick={()=>void submit().catch(m.failed)}>提交原生单元</button><button onClick={props.onExit}>退出原生问卷</button></div>
}}))
vi.mock('../components/education-tools/EducationPrivateVersionChooser',()=>({EducationPrivateVersionChooser:({onSelect}:{onSelect:(v:unknown)=>void})=><div>
 <button onClick={()=>onSelect({id:'fixed-self',contentHash:'d'.repeat(64),administration:{population:'TEACHER',responseMode:'SELF'}})}>选择旧自评版本</button>
 <button onClick={()=>onSelect({id:'fixed-expert',title:'Expert fixed',sourceRevision:2,contentHash:'e'.repeat(64),administration:{population:'TEACHER',responseMode:'EXPERT_REPORT',targetKind:'PERSON'}})}>选择专家版本</button></div>}))
const task:FieldQuestionnaireTask={title:'Fixed expert questionnaire',targetName:'Verified target',assessmentRef:{origin:{versionId:'fixed',contentHash:'c'.repeat(64),targetKind:'PERSON'}},attemptId:null,status:'ASSIGNED',attemptEpoch:null}
const parent='/field-assessments/assessment-composite-attempts/parent'
function fixture(){
 let step=0,fail=false,malformed=false
 const api=vi.fn(async(path:string,method?:string,body?:unknown,_options?:unknown)=>{
  if(path==='/field-assessments/invitations/invitation/start')return {attemptId:'parent'}
  if(path===parent+'?view=current-unit')return {id:'parent',status:step===2?'COMPLETED':'IN_PROGRESS',deliveryMode:'FINAL_ONLY',attemptEpoch:1,currentItem:step===2?null:step===0?{id:'scale',type:'SCALE'}:{id:'form',formSectionId:'section',type:'FORM_SECTION'}}
  if(path.endsWith('/submit?response=receipt')||path.endsWith('/section/submit')){
   if(fail)throw Error('Synthetic network failure')
   if(malformed)return {submissionId:'another-submission',completed:true}
   step++;return {submissionId:(body as typeof payload).submissionId,payloadHash:'f'.repeat(64),replayed:false,...(path.includes('/scale/submit')?{completed:true}:{sectionId:'section'})}
  }
  throw Error('Unexpected '+method+' '+path)
 })
 return {api:api as typeof api&EducationReportApi,setFail:(value:boolean)=>{fail=value},setMalformed:(value:boolean)=>{malformed=value}}
}
afterEach(()=>{cleanup();vi.restoreAllMocks();m.accepted.mockClear();m.failed.mockClear();m.props=null})
describe('Expert task host consumes the existing canonical Scale/Form runner',()=>{
 it('starts only the invitation, forwards unchanged native submissions and records completion after exact receipts',async()=>{
  const {api}=fixture(),progress=vi.fn(),exit=vi.fn();render(<HuiteacherFieldQuestionnaire api={api} invitationId="invitation" task={task} onProgress={progress} onExit={exit}/>)
  fireEvent.click(screen.getByRole('button',{name:'开始或恢复本次观察问卷'}));await screen.findByText('Native SCALE')
  expect(api).toHaveBeenCalledWith('/field-assessments/invitations/invitation/start','POST',{},undefined)
  fireEvent.click(screen.getByRole('button',{name:'提交原生单元'}));await screen.findByText('Native FORM_SECTION')
  expect(api).toHaveBeenCalledWith(parent+'/items/scale/scale/submit?response=receipt','POST',payload,undefined)
  expect(progress).toHaveBeenLastCalledWith({attemptId:'parent',completed:false,writing:false})
  fireEvent.click(screen.getByRole('button',{name:'退出原生问卷'}));expect(exit).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button',{name:'提交原生单元'}));await screen.findByText(/观察问卷已完成/)
  expect(api).toHaveBeenCalledWith(parent+'/form-sections/section/submit','POST',{...payload,answers:[{formItemId:'form-q',value:'Expert observation'}]},undefined)
  expect(progress).toHaveBeenLastCalledWith({attemptId:'parent',completed:true,writing:false})
  expect(m.accepted).toHaveBeenCalledTimes(2)
  expect(api.mock.calls.every(([path])=>!path.includes('/field-notes')&&!path.includes('/run-executions')&&!path.includes('/report'))).toBe(true)
 })
 it('preserves the same native unit and submission on a failed or mismatched confirmation, then permits an explicit retry',async()=>{
  const f=fixture(),progress=vi.fn();render(<HuiteacherFieldQuestionnaire api={f.api} invitationId="invitation" task={task} onProgress={progress} onExit={()=>{}}/>)
  fireEvent.click(screen.getByRole('button',{name:'开始或恢复本次观察问卷'}));await screen.findByText('Native SCALE')
  f.setFail(true);fireEvent.click(screen.getByRole('button',{name:'提交原生单元'}));await screen.findByText('Synthetic network failure')
  expect(screen.getByText('Native SCALE')).toBeInTheDocument();expect(m.accepted).not.toHaveBeenCalled()
  f.setFail(false);f.setMalformed(true);fireEvent.click(screen.getByRole('button',{name:'提交原生单元'}));await screen.findByText(/服务器确认与本次提交不匹配/)
  expect(m.accepted).not.toHaveBeenCalled();expect(progress).toHaveBeenLastCalledWith({attemptId:'parent',completed:false,writing:false})
  f.setMalformed(false);fireEvent.click(screen.getByRole('button',{name:'提交原生单元'}));await screen.findByText('Native FORM_SECTION')
  const submissions=f.api.mock.calls.filter(([path])=>path.includes('/scale/submit'))
  expect(submissions).toHaveLength(3);expect(submissions.every(([,method,body])=>method==='POST'&&body===payload)).toBe(true)
 })
 it('resumes the actual parent and rejects another parent or unit before a transport write',async()=>{
  const {api}=fixture();render(<HuiteacherFieldQuestionnaire api={api} invitationId="invitation" task={{...task,attemptId:'parent'}} onProgress={()=>{}} onExit={()=>{}}/>)
  await screen.findByText('Native SCALE')
  expect(api.mock.calls.some(([path])=>path.endsWith('/start'))).toBe(false)
  await expect(m.props!.submitScale('other','scale',payload)).rejects.toThrow('当前观察问卷')
  await expect(m.props!.submitScale('parent','foreign-unit',payload)).rejects.toThrow('不属于当前固定问卷')
  expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
 })
 it('ignores a late prior API/invitation response without blocking the next task or delivering its old parent',async()=>{
  let resolve!:(value:unknown)=>void
  const late=new Promise(done=>{resolve=done}),old=vi.fn(async()=>late),next=fixture(),progress=vi.fn()
  const {rerender}=render(<HuiteacherFieldQuestionnaire api={old as EducationReportApi} invitationId="old-invitation" task={task} onProgress={progress} onExit={()=>{}}/>)
  fireEvent.click(screen.getByRole('button',{name:'开始或恢复本次观察问卷'}))
  rerender(<HuiteacherFieldQuestionnaire api={next.api} invitationId="invitation" task={task} onProgress={progress} onExit={()=>{}}/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'开始或恢复本次观察问卷'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'开始或恢复本次观察问卷'}));await screen.findByText('Native SCALE')
  await act(async()=>resolve({attemptId:'old-parent'}))
  expect(m.props!.state.id).toBe('parent');expect(old).toHaveBeenCalledTimes(1)
  expect(next.api.mock.calls.every(([path])=>!path.includes('old-parent'))).toBe(true)
 })
})
describe('Field manager consumes explicit fixed expert references and submitted evidence',()=>{
 it('binds only the selected expert version/hash and does not fall back to published Form lists or client identity',async()=>{
  const api=vi.fn(async(path:string,method?:string,body?:unknown)=>{
   if(path.endsWith('/field-form')&&!method)return null
   if(path.endsWith('/field-form')&&method==='POST')return {title:'Expert fixed',assessmentRef:{origin:{versionId:'fixed-expert',targetKind:'PERSON',contentHash:'e'.repeat(64)}}}
   throw Error('Unexpected '+JSON.stringify({path,method,body}))
  })
  render(<HuiteacherFieldManager organizationId="school" eventId="event" eventStatus="DRAFT" api={api as EducationReportApi}/>)
  fireEvent.click(screen.getByRole('button',{name:'查看本次固定问卷绑定'}));await screen.findByRole('button',{name:'选择旧自评版本'})
  fireEvent.click(screen.getByRole('button',{name:'选择旧自评版本'}));expect(screen.getByRole('button',{name:'固定本活动的专家观察问卷'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'选择专家版本'}));fireEvent.click(screen.getByRole('button',{name:'固定本活动的专家观察问卷'}))
  await screen.findByText(/本活动已固定专家观察问卷/)
  expect(api).toHaveBeenLastCalledWith('/organizations/school/evaluation-events/event/field-form','POST',{privateComposition:{versionId:'fixed-expert',contentHash:'e'.repeat(64)}})
  expect(api.mock.calls.some(([path])=>path.endsWith('/forms'))).toBe(false)
 })
})
