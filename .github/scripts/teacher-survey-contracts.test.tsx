import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import SurveyApp from './survey/SurveyApp'
import {HuiteacherClassRelationships} from './huiteacher/HuiteacherClassRelationships'
import {HuiteacherStudentEvaluationManager} from './huiteacher/HuiteacherStudentEvaluationManager'
vi.mock('./survey/SurveyBuilder',()=>({SurveyBuilder:()=>null}))
vi.mock('./survey/SurveyAnalyticsWorkspace',()=>({SurveyAnalyticsWorkspace:()=>null}))
vi.mock('./survey/SurveyWaveStudio',()=>({SurveyWaveStudio:({projectId,onProjectChanged}:{projectId:string;onProjectChanged:(p:unknown)=>void})=><button onClick={()=>onProjectChanged({id:projectId,status:'ACTIVE',revision:2,collectionMode:'SINGLE_UNLINKED'})}>模拟波次成功开放</button>}))
const response=(data:unknown,ok=true)=>Promise.resolve({ok,json:async()=>({code:ok?0:401,data,message:'请先登录'})} as Response)
beforeEach(()=>{window.history.replaceState(null,'','/');vi.spyOn(window,'confirm').mockReturnValue(true)})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('Frozen Teacher Survey UI boundaries; DTO fixtures do not assert server authority',()=>{
 it('does not override an authenticated password-reset entry',async()=>{
  window.history.replaceState(null,'','/reset-password#token=synthetic-token')
  const fetcher=vi.fn((path:string)=>{if(path.endsWith('/auth/me'))return response({id:'r',username:'ci_owner'});throw Error('unexpected API '+path)})
  vi.stubGlobal('fetch',fetcher);render(<SurveyApp/>);await screen.findByRole('heading',{name:'恢复 Survey 密码'});await waitFor(()=>expect(fetcher).toHaveBeenCalled())
  expect(screen.queryByRole('heading',{name:'我的研究'})).toBeNull();expect(screen.getByLabelText('一次性邀请凭证')).toHaveValue('synthetic-token')
 })
 it('requires MFA completion after login and keeps the workspace inaccessible before it',async()=>{
  window.history.replaceState(null,'','/login');let verified=false
  vi.stubGlobal('fetch',vi.fn((path:string)=>{if(path.endsWith('/csrf'))return response({csrfToken:'synthetic-csrf'});if(path.endsWith('/login'))return response({enrolled:true});if(path.endsWith('/mfa/verify')){verified=true;return response({})}if(path.includes('/projects?'))return response({list:[]});if(path.endsWith('/capabilities'))return response({analytics:false,publication:false});if(path.endsWith('/auth/me'))return verified?response({id:'r',username:'ci_owner'}):response(null,false);throw Error('unexpected '+path)}))
  render(<SurveyApp/>);await screen.findByRole('heading',{name:'Researcher 登录'});fireEvent.change(screen.getByLabelText('研究者登录名'),{target:{value:'ci_owner'}});fireEvent.change(screen.getByLabelText('密码'),{target:{value:'synthetic-password'}});fireEvent.click(screen.getByRole('button',{name:'进入双因素验证'}));await screen.findByRole('heading',{name:'双因素验证'});expect(screen.queryByRole('heading',{name:'我的研究'})).toBeNull();fireEvent.change(screen.getByLabelText('动态验证码／恢复码'),{target:{value:'123456'}});fireEvent.click(screen.getByRole('button',{name:'验证并登录'}));await screen.findByRole('heading',{name:'我的研究'})
 })
 it('locks metadata editing immediately after the child reports publication',async()=>{
  window.history.replaceState(null,'','/workspace');vi.stubGlobal('fetch',vi.fn((path:string)=>{if(path.endsWith('/auth/me'))return response({id:'r',username:'ci_owner'});if(path.endsWith('/capabilities'))return response({analytics:false,publication:true});if(path.includes('/projects?'))return response({list:[{id:'p',title:'Synthetic study',description:'',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1}]});throw Error('unexpected '+path)}));render(<SurveyApp/>);fireEvent.click(await screen.findByRole('button',{name:'查看/编辑'}));expect(screen.getByRole('button',{name:'保存修改'})).not.toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'模拟波次成功开放'}));expect(screen.getByRole('button',{name:'保存修改'})).toBeDisabled();expect(screen.getByText('采集中 · 单次匿名')).toBeInTheDocument()
 })
 it('writes relationship fields through existing endpoints and never rewrites the primary class implicitly',async()=>{
  const calls:{path:string;method:string;data:unknown}[]=[];let rows:unknown[]=[]
  const api=vi.fn(async(path:string,method='GET',data?:unknown)=>{calls.push({path,method,data});if(method==='POST'){rows=[{id:'a',membershipId:'s',classUnitId:'c',isPrimary:false}];return {id:'a'}}return {list:path.includes('student-class')?rows:[],total:path.includes('student-class')?rows.length:0}})
  render(<HuiteacherClassRelationships organizationId="o" members={[{membershipId:'t',loginName:'ci_teacher',role:'TEACHER'},{membershipId:'s',loginName:'ci_student',role:'STUDENT'}]} units={[{id:'c',name:'Synthetic class',unitKind:'CLASS'}]} api={api as never}/>);await screen.findByText('暂无当前学生班级关系。');fireEvent.change(screen.getByLabelText('学生',{exact:true}),{target:{value:'s'}});fireEvent.change(screen.getByLabelText('学生班级',{exact:true}),{target:{value:'c'}});fireEvent.click(screen.getByLabelText('设为主要班级'));fireEvent.click(screen.getByRole('button',{name:'保存学生班级'}));await screen.findByText('学生班级关系已保存，评价发布时将重新核验参与资格。');expect(calls.find(c=>c.method==='POST')).toEqual({path:'/organizations/o/student-class-assignments',method:'POST',data:{membershipId:'s',classUnitId:'c',isPrimary:false}})
 })
 it('leaves event and Run as drafts if one eligible student is below the server-provided floor',async()=>{
  const api=vi.fn(async(path:string,method='GET')=>{if(path.endsWith('/student-evaluation'))return {id:'config',eventId:'e',classUnitId:'class',staffAssignmentId:'staff',formId:'form',definitionDigest:'a'.repeat(64)};if(path.endsWith('/eligibility'))return {eligibleStudentCount:1,privacyFloor:10,teacherAssigned:true};if(path.endsWith('/run'))return {runId:'run',status:'DRAFT',version:1};throw Error('unexpected '+method+' '+path)})
  render(<HuiteacherStudentEvaluationManager organizationId="o" eventId="e" eventStatus="DRAFT" eventVersion={1} teacherName="ci_teacher" forms={[]} api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'发布评价'}));await screen.findByText('当前符合资格学生 1 人，少于发布要求的 10 人。请先补齐学校核验的学生班级关系，再发布。');expect(api.mock.calls.every(c=>(c[1]??'GET')==='GET')).toBe(true)
 })
})
