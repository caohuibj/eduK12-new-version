import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {HuiteacherStudentEvaluationManager} from './HuiteacherStudentEvaluationManager'

const org='00000000-0000-4000-8000-000000000001'
const event='00000000-0000-4000-8000-000000000002'
const run='00000000-0000-4000-8000-000000000003'
const form='00000000-0000-4000-8000-000000000004'
const base='/organizations/'+org+'/evaluation-events/'+event+'/student-evaluation'
const report={
  source:'VERIFIED_HUITEACHER_STUDENT_FORM_FINAL' as const,
  eventId:event,teacherName:'王教师',formTitle:'本学期课堂反馈',
  definitionDigest:'a'.repeat(64),frozenPopulation:6,independentRespondents:5,
  participationRate:0.833,minimumRespondents:5,
  releasedAt:'2026-10-12T00:00:00Z',
  distributions:[{itemKey:'q1',prompt:'教学节奏',type:'LIKERT',status:'READY' as const,
    cells:[{key:'slow',label:'过慢',count:1},{key:'okay',label:'合适',count:4}]}],
  withheldFreeText:true as const,reportMode:'FORM_DESCRIPTIVE_AGGREGATE' as const,
  note:'身份受保护，不公布个人作答。',privacyPolicy:'FROZEN_TEACHER_V2',
}
beforeEach(()=>{vi.stubEnv('VITE_REPORT_PRIVACY_TEACHER_V2_ENABLED','true')})
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks()})
describe('Huiteacher PR2 student feedback admin materialized release',()=>{
  it('uses one explicit admin release before read, never submits raw answers',async()=>{
    const api=vi.fn(async(path:string,method='GET',data?:unknown)=>{
      if(path===base&&method==='GET')return {id:'configuration',eventId:event,
        classUnitId:'class',staffAssignmentId:'staff',formId:form,
        definitionDigest:'a'.repeat(64)}
      if(path==='/organizations/'+org+'/evaluation-events/'+event+'/run')
        return {eventId:event,runId:run,status:'CLOSED',version:4,trackCount:1}
      if(path===base+'/report/release'&&method==='POST'){
        expect(data).toEqual({})
        return report
      }
      if(path===base+'/report'&&method==='GET')return report
      throw new Error('Unexpected '+method+' '+path)
    })
    vi.spyOn(window,'confirm').mockReturnValue(true)
    render(<HuiteacherStudentEvaluationManager
      organizationId={org} eventId={event} eventStatus="CLOSED"
      eventVersion={3} teacherName="王教师"
      forms={[{id:form,title:'课堂反馈',definitionDigest:'a'.repeat(64),
        status:'PUBLISHED'}]}
      api={api as any}/>)
    fireEvent.click(await screen.findByRole('button',{name:'正式发布新版群体报告'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/report/release','POST',{}))
    expect(await screen.findByText(/已正式发布并冻结/)).toBeInTheDocument()
    expect(screen.getByText('教学节奏')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'查看群体反馈'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/report'))
    expect(api).not.toHaveBeenCalledWith(expect.stringContaining('/report/release'),'GET',expect.anything())
  })
})

describe('Huiteacher streamlined three-stage student evaluation',()=>{
  it('prepares config and Run with one action, opens + publishes once, and resumes from saved states',async()=>{
    const eventBase='/organizations/'+org+'/evaluation-events/'+event
    const calls:string[]=[]
    let currentStatus='DRAFT'
    const api=vi.fn(async(path:string,method='GET',body?:unknown)=>{
      calls.push(method+' '+path)
      if(path===base&&method==='GET')throw Error('NO_CONFIG')
      if(path===base+'/candidates')return {list:[{
        staffAssignmentId:'staff-record',classUnitId:'class-record',
        className:'六年级一班',staffRole:'TEACHING',
      }],truncated:false}
      if(path===base&&method==='POST')return {id:'configuration',
        eventId:event,classUnitId:'class-record',staffAssignmentId:'staff-record',
        formId:form,definitionDigest:'a'.repeat(64)}
      if(path===base+'/run'&&method==='POST')return {
        runId:run,status:'DRAFT',version:2,trackCount:1,
      }
      if(path===base+'/eligibility')return {eventId:event,teacherAssigned:true,
        eligibleStudentCount:10,privacyFloor:5,readyForPrivacyProtectedFeedback:true,
        note:'Test-only eligibility'}
      if(path===eventBase+'/transition'&&method==='POST'){
        expect(body).toEqual({action:'OPEN',expectedVersion:1})
        return {status:'OPEN',version:2}
      }
      if(path===base+'/run/publish'&&method==='POST'){
        expect(body).toEqual({expectedVersion:2})
        currentStatus='PUBLISHED'
        return {executionCount:10}
      }
      if(path===eventBase+'/run'&&method==='GET')return {
        runId:run,status:currentStatus,version:3,trackCount:1,
      }
      throw Error('Unexpected '+method+' '+path)
    })
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
    render(<HuiteacherStudentEvaluationManager
      organizationId={org} eventId={event} eventStatus="DRAFT"
      eventVersion={1} teacherName="王教师"
      forms={[{id:form,title:'课堂反馈',definitionDigest:'a'.repeat(64),
        status:'PUBLISHED'}]}
      api={api as any}/>)
    fireEvent.click(await screen.findByRole('button',{name:'选择学校核验的任教关系'}))
    await screen.findByRole('button',{name:'准备评价草稿'})
    fireEvent.change(screen.getByLabelText('本教师合法任教的班级'),{
      target:{value:'staff-record'}})
    fireEvent.change(screen.getByLabelText('已发布 Form V2（不计分）'),{
      target:{value:form}})
    fireEvent.click(screen.getByRole('button',{name:'准备评价草稿'}))
    await screen.findByRole('button',{name:'发布评价'})
    expect(confirm).not.toHaveBeenCalled()
    expect(calls).toContain('POST '+base+'/run')
    fireEvent.click(screen.getByRole('button',{name:'发布评价'}))
    await waitFor(()=>expect(calls).toContain('POST '+base+'/run/publish'))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(calls.indexOf('POST '+eventBase+'/transition'))
      .toBeLessThan(calls.indexOf('POST '+base+'/run/publish'))
    expect(await screen.findByText(/已分配 10 份正式任务/)).toBeInTheDocument()
  })
})
