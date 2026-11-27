import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {HuiteacherStudentEvaluationManager} from './HuiteacherStudentEvaluationManager'

type Props=Parameters<typeof HuiteacherStudentEvaluationManager>[0]
type Api=Props['api']
const eventId='event-a',organizationId='school-a'
const base=`/organizations/${organizationId}/evaluation-events/${eventId}`
const configPath=base+'/student-evaluation'
const config={id:'config-a',eventId,classUnitId:'class-a',staffAssignmentId:'staff-a',
  formId:'form-a',definitionDigest:'fixed-a'}
const draft={runId:'run-a',status:'DRAFT',version:2}
const forms=[{id:'form-a',title:'本校固定表单',definitionDigest:'fixed-a',status:'PUBLISHED' as const}]
const props={organizationId,eventId,eventStatus:'DRAFT',eventVersion:1,teacherName:'示例教师',forms}
const httpError=(status:number)=>Object.assign(new Error('HTTP '+status),{status,code:'PRODUCT_DENIED'})
function deferred<T>(){
  let resolve!:(value:T)=>void
  const promise=new Promise<T>(done=>{resolve=done})
  return {promise,resolve}
}
const writes=(mock:{mock:{calls:unknown[][]}})=>mock.mock.calls.filter(([,method])=>method==='POST')

describe('Teacher student evaluation read recovery',()=>{
  it.each([new TypeError('网络中断'),httpError(403),httpError(500)])(
    'keeps a configuration read error distinct from an absent configuration: %s',async error=>{
      let failure=true
      const api=vi.fn(async(path:string)=>{
        if(path!==configPath)throw new Error('Unexpected '+path)
        throw failure?error:httpError(404)
      })
      render(<HuiteacherStudentEvaluationManager {...props} api={api as Api}/>)
      expect(await screen.findByRole('alert')).toHaveTextContent(error.message)
      expect(screen.queryByRole('button',{name:'选择学校核验的任教关系'})).not.toBeInTheDocument()
      expect(screen.queryByRole('button',{name:'继续准备已保存的评价'})).not.toBeInTheDocument()
      expect(screen.queryByText(/须先冻结本次评价/)).not.toBeInTheDocument()
      expect(writes(api)).toEqual([])
      failure=false
      fireEvent.click(screen.getByRole('button',{name:'重试读取评价配置与任务'}))
      expect(await screen.findByRole('button',{name:'选择学校核验的任教关系'})).toBeEnabled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(writes(api)).toEqual([])
    },
  )

  it.each([new TypeError('任务网络中断'),httpError(403),httpError(500)])(
    'does not offer Run creation on an uncertain Run read: %s',async error=>{
      let failure=true
      const api=vi.fn(async(path:string)=>{
        if(path===configPath)return config
        if(path===base+'/run'){if(failure)throw error;return draft}
        throw new Error('Unexpected '+path)
      })
      render(<HuiteacherStudentEvaluationManager {...props} api={api as Api}/>)
      expect(await screen.findByRole('alert')).toHaveTextContent(error.message)
      expect(screen.getByText('class-a')).toBeInTheDocument()
      expect(screen.queryByRole('button',{name:'继续准备已保存的评价'})).not.toBeInTheDocument()
      expect(screen.queryByRole('button',{name:'选择学校核验的任教关系'})).not.toBeInTheDocument()
      failure=false
      fireEvent.click(screen.getByRole('button',{name:'重试读取评价配置与任务'}))
      expect(await screen.findByRole('button',{name:'发布评价'})).toBeEnabled()
      expect(screen.getByText('run-a')).toBeInTheDocument()
      expect(writes(api)).toEqual([])
    },
  )

  it('treats only an explicit Run 404 as absent and rereads an unknown creation before another POST',async()=>{
    let created=false
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path===configPath)return config
      if(path===base+'/run'){if(!created)throw httpError(404);return draft}
      if(path===configPath+'/run'&&method==='POST'){
        created=true
        throw new TypeError('创建响应丢失')
      }
      throw new Error('Unexpected '+method+' '+path)
    })
    render(<HuiteacherStudentEvaluationManager {...props} api={api as Api}/>)
    const create=await screen.findByRole('button',{name:'继续准备已保存的评价'})
    fireEvent.click(create);fireEvent.click(create)
    expect(await screen.findByRole('alert')).toHaveTextContent('操作结果需要重新核对')
    expect(screen.queryByRole('button',{name:'继续准备已保存的评价'})).not.toBeInTheDocument()
    expect(writes(api)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button',{name:'重试读取评价配置与任务'}))
    expect(await screen.findByRole('button',{name:'发布评价'})).toBeEnabled()
    expect(writes(api)).toHaveLength(1)
  })

  it('retains the known Run after a post-publication read failure and blocks writes until an explicit reread',async()=>{
    let published=false,failedRead=false
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path===configPath)return config
      if(path===base+'/run'){
        if(published&&!failedRead){failedRead=true;throw httpError(503)}
        return {...draft,status:published?'PUBLISHED':'DRAFT'}
      }
      if(path===configPath+'/eligibility')return {teacherAssigned:true,eligibleStudentCount:10,privacyFloor:10}
      if(path===configPath+'/run/publish'&&method==='POST'){published=true;return {executionCount:10}}
      throw new Error('Unexpected '+method+' '+path)
    })
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
    try{
      render(<HuiteacherStudentEvaluationManager {...props} eventStatus="OPEN" api={api as Api}/>)
      fireEvent.click(await screen.findByRole('button',{name:'发布评价'}))
      expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503')
      expect(screen.getByText('run-a')).toBeInTheDocument()
      expect(screen.getByRole('button',{name:'发布评价'})).toBeDisabled()
      expect(screen.queryByRole('button',{name:'继续准备已保存的评价'})).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button',{name:'重试读取评价配置与任务'}))
      expect(await screen.findByRole('button',{name:'查看参与进度'})).toBeEnabled()
      expect(screen.getByText('run-a')).toBeInTheDocument()
      expect(writes(api)).toHaveLength(1)
    }finally{confirm.mockRestore()}
  })

  it('confirms the composition Run preview count and forwards the selected publication deadline',async()=>{
    const deadline='2099-07-31T10:30'
    const stored='2099-07-31T08:00:00.000Z'
    const composition={...config,formId:null,definitionDigest:null,
      privateComposition:{versionId:'composition-a',contentHash:'hash-a'}}
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path===configPath)return composition
      if(path===base+'/run')return draft
      if(path===configPath+'/eligibility')return {teacherAssigned:true,eligibleStudentCount:14,privacyFloor:10}
      if(path===configPath+'/run/preview'&&method==='POST')return {runId:draft.runId,version:draft.version,
        intakeDeadline:stored,tracks:[{executionCount:11}]}
      if(path===configPath+'/run/publish'&&method==='POST')return {executionCount:11}
      throw new Error('Unexpected '+method+' '+path)
    })
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
    try{
      render(<HuiteacherStudentEvaluationManager {...props} eventStatus="OPEN" api={api as Api}/>)
      const publish=await screen.findByRole('button',{name:'发布评价'})
      fireEvent.change(screen.getByLabelText('停止接受新作答（本地时间）'),{target:{value:deadline}})
      fireEvent.click(publish)
      expect(await screen.findByText('评价已发布，已分配 11 份正式任务。')).toBeInTheDocument()
      expect(writes(api)).toEqual([
        [configPath+'/run/preview','POST',{expectedVersion:draft.version}],
        [configPath+'/run/publish','POST',{expectedVersion:draft.version,maxResponses:11,intakeDeadline:new Date(deadline).toISOString()}],
      ])
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('本次确认作答上限 11 份'))
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('已入场的学生仍可继续作答'))
    }finally{confirm.mockRestore()}
  })

  it.each([
    ['different Run',{runId:'other-run',version:draft.version,intakeDeadline:null,tracks:[{executionCount:11}]}],
    ['missing tracks',{runId:draft.runId,version:draft.version,intakeDeadline:null}],
  ])('does not open or publish a draft using an invalid preview (%s)',async(_description,planned)=>{
    const composition={...config,formId:null,definitionDigest:null,
      privateComposition:{versionId:'composition-a',contentHash:'hash-a'}}
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path===configPath)return composition
      if(path===base+'/run')return draft
      if(path===configPath+'/eligibility')return {teacherAssigned:true,eligibleStudentCount:14,privacyFloor:10}
      if(path===configPath+'/run/preview'&&method==='POST')return planned
      throw new Error('Unexpected '+method+' '+path)
    })
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
    try{
      render(<HuiteacherStudentEvaluationManager {...props} api={api as Api}/>)
      fireEvent.click(await screen.findByRole('button',{name:'发布评价'}))
      expect(await screen.findByText('预览名额或任务版本无效，请重新读取评价任务。')).toBeInTheDocument()
      expect(writes(api)).toEqual([[configPath+'/run/preview','POST',{expectedVersion:draft.version}]])
      expect(confirm).not.toHaveBeenCalled()
    }finally{confirm.mockRestore()}
  })

  it('clears the previous event immediately and ignores its late configuration response',async()=>{
    const old=deferred<typeof config>()
    const otherPath=base.replace(eventId,'event-b')
    const api=vi.fn(async(path:string)=>{
      if(path===configPath)return old.promise
      if(path===otherPath+'/student-evaluation')return {...config,id:'config-b',eventId:'event-b',classUnitId:'class-b'}
      if(path===otherPath+'/run')return {...draft,runId:'run-b'}
      throw new Error('Unexpected '+path)
    })
    const view=render(<HuiteacherStudentEvaluationManager {...props} api={api as Api}/>)
    await waitFor(()=>expect(api).toHaveBeenCalled())
    view.rerender(<HuiteacherStudentEvaluationManager {...props} eventId="event-b" api={api as Api}/>)
    expect(await screen.findByText('class-b')).toBeInTheDocument()
    await act(async()=>{old.resolve(config)})
    expect(screen.queryByText('class-a')).not.toBeInTheDocument()
    expect(screen.getByText('run-b')).toBeInTheDocument()
    expect(api.mock.calls.some(([path])=>path===base+'/run')).toBe(false)
    expect(writes(api)).toEqual([])
  })

  it('drops loaded configuration on an API identity change and ignores the old Run response',async()=>{
    const old=deferred<typeof draft>()
    const apiA=vi.fn(async(path:string)=>{
      if(path===configPath)return config
      if(path===base+'/run')return old.promise
      throw new Error('Unexpected '+path)
    })
    const apiB=vi.fn(async()=>{throw httpError(404)})
    const view=render(<HuiteacherStudentEvaluationManager {...props} api={apiA as Api}/>)
    await screen.findByText('class-a')
    view.rerender(<HuiteacherStudentEvaluationManager {...props} api={apiB as Api}/>)
    expect(screen.queryByText('class-a')).not.toBeInTheDocument()
    await screen.findByRole('button',{name:'选择学校核验的任教关系'})
    await act(async()=>{old.resolve(draft)})
    expect(screen.queryByRole('button',{name:'发布评价'})).not.toBeInTheDocument()
    expect(screen.queryByText('任务编号')).not.toBeInTheDocument()
    expect(writes(apiA)).toEqual([]);expect(writes(apiB)).toEqual([])
  })

  it('does not continue a configuration POST into Run creation after switching API identity',async()=>{
    const pending=deferred<typeof config>()
    const apiA=vi.fn(async(path:string,method='GET')=>{
      if(path===configPath&&method==='POST')return pending.promise
      if(path===configPath)throw httpError(404)
      if(path===configPath+'/candidates')return {list:[{staffAssignmentId:'staff-a',classUnitId:'class-a',className:'一班',staffRole:'HOMEROOM'}]}
      throw new Error('Unexpected '+method+' '+path)
    })
    const apiB=vi.fn(async()=>{throw httpError(404)})
    const view=render(<HuiteacherStudentEvaluationManager {...props} api={apiA as Api}/>)
    fireEvent.click(await screen.findByRole('button',{name:'选择学校核验的任教关系'}))
    const staff=await screen.findByLabelText('本教师合法任教的班级')
    await waitFor(()=>expect(screen.getByRole('button',{name:'选择学校核验的任教关系'})).toBeEnabled())
    fireEvent.change(staff,{target:{value:'staff-a'}})
    fireEvent.change(screen.getByLabelText('已发布 Form V2（不计分）'),{target:{value:'form-a'}})
    fireEvent.click(screen.getByRole('button',{name:'准备评价草稿'}))
    await waitFor(()=>expect(writes(apiA)).toHaveLength(1))
    view.rerender(<HuiteacherStudentEvaluationManager {...props} api={apiB as Api}/>)
    await screen.findByRole('button',{name:'选择学校核验的任教关系'})
    await act(async()=>{pending.resolve(config)})
    expect(apiA.mock.calls.some(([path,method])=>path===configPath+'/run'&&method==='POST')).toBe(false)
    expect(screen.queryByText('class-a')).not.toBeInTheDocument()
    expect(writes(apiB)).toEqual([])
  })
})
