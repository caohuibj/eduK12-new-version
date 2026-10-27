import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {HuiteacherEvaluationStudio} from '../../huiteacher/HuiteacherEvaluationStudio'
import {SchoolActivityManager} from '../../school/SchoolActivityManager'
import {educationAssessmentResourceId,type EducationAssessmentResourceAdapter} from '../../api/educationAssessmentResources'
import {assessmentDirectory,assessmentResource,assessmentScope} from '../../test/educationAssessmentResources.fixture'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
afterEach(cleanup)

describe('education management scoped adapter integration',()=>{
  it('binds Teacher organization, event, run and version while keeping group Form configuration independent',async()=>{
    const scope=assessmentScope,base=`/organizations/${scope.organizationId}`
    const event={id:scope.workflowId,targetId:'target',title:'教师本人任务活动',kind:'ASSESSMENT',status:'DRAFT',version:1}
    const run={eventId:event.id,runId:scope.runId,status:'DRAFT',version:scope.expectedVersion,trackCount:0}
    const api=vi.fn(async(path:string)=>{
      if(path===base+'/evaluation-targets')return {list:[]}
      if(path===base+'/evaluation-events')return {list:[event]}
      if(path===base+'/forms')return {list:[{id:'group-form',title:'教师群体表单',status:'PUBLISHED',definitionDigest:'frozen-digest'}]}
      if(path===base+`/evaluation-events/${event.id}/run`)return run
      throw Error('Unexpected legacy request '+path)
    })
    const adapter:EducationAssessmentResourceAdapter={list:vi.fn(async()=>assessmentDirectory(scope,[assessmentResource(scope,'SITUATIONAL')])),addTrack:vi.fn(async()=>{})}
    render(<HuiteacherEvaluationStudio organizationId={scope.organizationId} actorKey={scope.actorKey} api={api as Api} assessmentResources={adapter}/>)
    fireEvent.click(await screen.findByRole('button',{name:'查看任务配置'}))
    fireEvent.click(await screen.findByRole('button',{name:'读取已授权测评目录'}))
    fireEvent.change(await screen.findByLabelText('已授权测评 · 精确版本'),{target:{value:educationAssessmentResourceId(assessmentResource(scope,'SITUATIONAL'))}})
    fireEvent.click(screen.getByRole('button',{name:'加入已授权固定版本'}))
    await waitFor(()=>expect(adapter.addTrack).toHaveBeenCalledWith(scope,expect.objectContaining({resource:{family:'SITUATIONAL',key:assessmentResource(scope).key,version:'1.0.0'},expectedVersion:3})))
    expect(screen.getByLabelText('向当前教师发布的 Form（不计分）')).toHaveValue('')
    expect(screen.getByRole('option',{name:'教师群体表单'})).toBeInTheDocument()
    expect(api.mock.calls.some(([path])=>path.endsWith('/tracks')||path.includes('/released-scales')||path.includes('/report'))).toBe(false)
    expect(adapter.list).toHaveBeenCalledWith(scope,undefined)
  })

  it('binds School organization, activity, run and version without routing new resources through the legacy catalog',async()=>{
    const scope={...assessmentScope,product:'SCHOOL' as const},base=`/organizations/${scope.organizationId}/activities`
    const activity={courseId:scope.workflowId,organizationId:scope.organizationId,title:'学生本人任务活动',purpose:'SCHOOL_CLIMATE',status:'DRAFT',version:1,participantCount:0,runCount:1,runs:[{runId:scope.runId,name:'正式批次',status:'DRAFT'}]}
    const run={id:scope.runId,name:'正式批次',status:'DRAFT',version:scope.expectedVersion,tracks:[]}
    const api=vi.fn(async(path:string)=>{
      if(path===base+'?page=1&pageSize=50')return {list:[activity]}
      if(path===base+'/'+scope.workflowId)return activity
      if(path.endsWith('/eligible-classes'))return {list:[]}
      if(path===base+'/'+scope.workflowId+'/runs/'+scope.runId)return {run,tracks:[]}
      if(path.endsWith('/run-resources?page=1'))return {list:[assessmentResource(scope)],nextCursor:null}
      throw Error('Unexpected legacy request '+path)
    })
    const adapter:EducationAssessmentResourceAdapter={list:vi.fn(async()=>assessmentDirectory(scope,[assessmentResource(scope,'BUNDLE')])),addTrack:vi.fn(async()=>{})}
    render(<SchoolActivityManager organizationId={scope.organizationId} actorKey={scope.actorKey} api={api as Api} isAdmin classes={[]} assessmentResources={adapter}/>)
    await screen.findByRole('option',{name:'学生本人任务活动（准备中）'})
    fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:scope.workflowId}})
    fireEvent.click(await screen.findByRole('button',{name:'正式批次 · 准备中'}))
    fireEvent.click(await screen.findByRole('button',{name:'查看已发布、受授权的测评资源'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/'+scope.workflowId+'/run-resources?page=1'))
    expect(screen.queryByLabelText('测评资源 · 精确版本')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'读取已授权测评目录'}))
    fireEvent.change(await screen.findByLabelText('已授权测评 · 精确版本'),{target:{value:educationAssessmentResourceId(assessmentResource(scope,'BUNDLE'))}})
    fireEvent.click(screen.getByRole('button',{name:'加入已授权固定版本'}))
    await waitFor(()=>expect(adapter.addTrack).toHaveBeenCalledWith(scope,expect.objectContaining({resource:{family:'BUNDLE',key:assessmentResource(scope).key,version:'1.0.0'},expectedVersion:3})))
    expect(adapter.list).toHaveBeenCalledWith(scope,undefined)
    expect(api.mock.calls.some(([path])=>path.endsWith('/tracks')||path.includes('/report'))).toBe(false)
  })
})
