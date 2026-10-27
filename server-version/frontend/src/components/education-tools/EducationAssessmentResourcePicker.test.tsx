import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationAssessmentResourcePicker} from './EducationAssessmentResourcePicker'
import {educationAssessmentResourceId,type EducationAssessmentResourceAdapter,type EducationAssessmentDirectory,type EducationAssessmentScope} from '../../api/educationAssessmentResources'
import {assessmentDirectory,assessmentResource,assessmentScope} from '../../test/educationAssessmentResources.fixture'

afterEach(cleanup)
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(cause:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function setup(scope=assessmentScope,adapter:EducationAssessmentResourceAdapter={list:vi.fn(async()=>assessmentDirectory(scope)),addTrack:vi.fn(async()=>{})}){
  const onBusy=vi.fn(),onRefresh=vi.fn(async()=>{})
  const props={scope,adapter,disabled:false,onBusy,onRefresh}
  return {...render(<EducationAssessmentResourcePicker {...props}/>),props,adapter,onBusy,onRefresh}
}
async function open(){fireEvent.click(screen.getByRole('button',{name:'读取已授权测评目录'}));return screen.findByLabelText('已授权测评 · 精确版本')}
async function select(scope=assessmentScope){const field=await open();fireEvent.change(field,{target:{value:educationAssessmentResourceId(assessmentResource(scope))}})}

describe('education authorized assessment picker',()=>{
  it.each(['TEACHER','SCHOOL'] as const)('sends only an exact personal track for each family in %s',async product=>{
    const scope={...assessmentScope,product}
    const list=vi.fn(async()=>assessmentDirectory(scope,['COGNITIVE','SITUATIONAL','BUNDLE'].map(family=>assessmentResource(scope,family as 'COGNITIVE'|'SITUATIONAL'|'BUNDLE'))))
    const pending=deferred<void>(),addTrack=vi.fn(()=>pending.promise)
    const {onRefresh}=setup(scope,{list,addTrack})
    const field=await open()
    expect(screen.getByRole('option',{name:/认知测评/})).toBeInTheDocument()
    expect(screen.getByRole('option',{name:/情境测评/})).toBeInTheDocument()
    expect(screen.getByRole('option',{name:/组合测评/})).toBeInTheDocument()
    fireEvent.change(field,{target:{value:educationAssessmentResourceId(assessmentResource(scope,'BUNDLE'))}})
    fireEvent.click(screen.getByText('核对固定内容、参数与报告版本'))
    expect(screen.getByText(/66666666-6666/)).toBeInTheDocument()
    expect(screen.getByText(/77777777-7777/)).toBeInTheDocument()
    expect(screen.getByText(/88888888-8888/)).toBeInTheDocument()
    const add=screen.getByRole('button',{name:'加入已授权固定版本'})
    fireEvent.click(add);fireEvent.click(add)
    expect(addTrack).toHaveBeenCalledTimes(1)
    expect(addTrack).toHaveBeenCalledWith(scope,{
      expectedVersion:3,resource:{family:'BUNDLE',key:assessmentResource(scope).key,version:'1.0.0'},
      subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},
      requestedPolicy:assessmentResource(scope).requestedPolicy,
    })
    await act(async()=>pending.resolve())
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/已加入固定版本/)).toBeInTheDocument()
  })

  it('never presents drafts, HOLD, unavailable licenses, incompatible, foreign or identity-only rows as deployable',async()=>{
    const good=assessmentResource()
    const bad=[
      {...good,releaseStatus:'DRAFT'}, {...good,releaseStatus:'HOLD'},
      ...['UNAUTHORIZED','INCOMPATIBLE','LICENSE_REQUIRED','HOLD'].map(availability=>({...good,availability})),
      {...good,product:'SCHOOL'}, {...good,organizationId:'99999999-9999-4999-8999-999999999999'},
      {...good,family:'TRAINING'}, {...good,key:'training-resource:arbitrary'}, {...good,version:'latest'},
      {...good,identityOnly:true}, {...good,requestedPolicy:{...good.requestedPolicy,analysisMode:'COHORT_AGGREGATE'}},
      {...good,units:[{...good.units[0],report:undefined}]},
      {...good,units:[{...good.units[0],references:[good.units[0].measurement]}]},
    ].map((row,index)=>({...row,title:`禁止投放 ${index}`}))
    setup(assessmentScope,{list:vi.fn(async()=>assessmentDirectory(assessmentScope,[good,...bad] as typeof good[])),addTrack:vi.fn()})
    await open()
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.queryByRole('option',{name:/禁止投放/})).not.toBeInTheDocument()
  })

  it('describes an empty authorized directory without claiming the system lacks a tool family',async()=>{
    setup(assessmentScope,{list:vi.fn(async()=>assessmentDirectory(assessmentScope,[])),addTrack:vi.fn()})
    fireEvent.click(screen.getByRole('button',{name:'读取已授权测评目录'}))
    expect(await screen.findByText(/当前学校及入口尚无获授权的认知、情境或组合工具/)).toBeInTheDocument()
    expect(screen.queryByLabelText('已授权测评 · 精确版本')).not.toBeInTheDocument()
  })

  it('does not invent a backend URL when the directory adapter is not connected',()=>{
    render(<EducationAssessmentResourcePicker scope={assessmentScope} disabled={false} onBusy={vi.fn()} onRefresh={vi.fn()}/>)
    expect(screen.getByText(/授权测评目录暂不可用/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'读取已授权测评目录'})).not.toBeInTheDocument()
  })

  it.each(['product','organizationId','workflowId','runId','expectedVersion'] as const)('rejects directory %s drift and cannot attach from the stale page',async field=>{
    const data=assessmentDirectory();Object.assign(data.scope,{[field]:field==='expectedVersion'?4:'different'})
    const addTrack=vi.fn()
    setup(assessmentScope,{list:vi.fn(async()=>data),addTrack})
    fireEvent.click(screen.getByRole('button',{name:'读取已授权测评目录'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('授权目录与当前学校、活动或任务版本不一致')
    expect(screen.queryByRole('button',{name:'加入已授权固定版本'})).not.toBeInTheDocument()
    expect(addTrack).not.toHaveBeenCalled()
  })

  it('retains exact selection after failed pagination, permits retry and deduplicates identical rows',async()=>{
    let count=0
    const list=vi.fn(async(_scope:EducationAssessmentScope,cursor?:string)=>{
      if(!cursor)return assessmentDirectory(assessmentScope,[],'empty/page')
      if(cursor==='empty/page')return assessmentDirectory(assessmentScope,[assessmentResource()],'second/page')
      if(++count===1)throw Error('分页网络失败')
      return assessmentDirectory()
    })
    setup(assessmentScope,{list,addTrack:vi.fn()})
    fireEvent.click(screen.getByRole('button',{name:'读取已授权测评目录'}))
    await screen.findByText('本页暂无获授权工具，可继续加载。')
    fireEvent.click(screen.getByRole('button',{name:'继续加载授权测评'}))
    const field=await screen.findByLabelText('已授权测评 · 精确版本')
    fireEvent.change(field,{target:{value:educationAssessmentResourceId(assessmentResource())}})
    fireEvent.click(screen.getByRole('button',{name:'继续加载授权测评'}))
    await screen.findByText('分页网络失败')
    expect(field).toHaveValue(educationAssessmentResourceId(assessmentResource()))
    fireEvent.click(screen.getByRole('button',{name:'继续加载授权测评'}))
    await waitFor(()=>expect(screen.queryByRole('button',{name:'继续加载授权测评'})).not.toBeInTheDocument())
    expect(screen.getAllByRole('option',{name:/已授权测评甲/})).toHaveLength(1)
    expect(field).toHaveValue(educationAssessmentResourceId(assessmentResource()))
  })

  it('invalidates selection when one exact version returns conflicting frozen content',async()=>{
    const list=vi.fn(async(_scope:EducationAssessmentScope,cursor?:string)=>assessmentDirectory(assessmentScope,[{...assessmentResource(),...(cursor?{educationOriginHash:'f'.repeat(64)}:{})}],cursor?null:'next'))
    setup(assessmentScope,{list,addTrack:vi.fn()});await select()
    fireEvent.click(screen.getByRole('button',{name:'继续加载授权测评'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('同一固定版本返回了不同内容')
    expect(screen.queryByRole('button',{name:'加入已授权固定版本'})).not.toBeInTheDocument()
  })

  it.each(['success','failure'])('does not reopen or overwrite a newer directory after close and late %s',async result=>{
    const late=deferred<EducationAssessmentDirectory>()
    const list=vi.fn().mockImplementationOnce(()=>late.promise).mockResolvedValue(assessmentDirectory(assessmentScope,[{...assessmentResource(),title:'新目录工具'}]))
    setup(assessmentScope,{list,addTrack:vi.fn()})
    const read=screen.getByRole('button',{name:'读取已授权测评目录'})
    fireEvent.click(read);fireEvent.click(read)
    expect(list).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button',{name:'关闭测评目录'}))
    expect(screen.queryByLabelText('已授权测评 · 精确版本')).not.toBeInTheDocument()
    await open()
    await act(async()=>result==='success'?late.resolve(assessmentDirectory()):late.reject(Error('旧目录错误')))
    expect(screen.getByRole('option',{name:/新目录工具/})).toBeInTheDocument()
    expect(screen.queryByRole('option',{name:/已授权测评甲/})).not.toBeInTheDocument()
    expect(screen.queryByText('旧目录错误')).not.toBeInTheDocument()
  })

  it.each(['product','organizationId','actorKey','workflowId','runId','expectedVersion','adapter'] as const)('discards pending directory after %s changes',async field=>{
    const late=deferred<EducationAssessmentDirectory>()
    const list=vi.fn().mockImplementationOnce(()=>late.promise).mockImplementation(async(next:EducationAssessmentScope)=>assessmentDirectory(next,[{...assessmentResource(next),title:'新绑定工具'}]))
    const {props,rerender}=setup(assessmentScope,{list,addTrack:vi.fn()})
    fireEvent.click(screen.getByRole('button',{name:'读取已授权测评目录'}))
    const scope={...assessmentScope}
    if(field!=='adapter')Object.assign(scope,{[field]:field==='product'?'SCHOOL':field==='expectedVersion'?4:'99999999-9999-4999-8999-999999999999'})
    const fresh=field==='adapter'?{list:vi.fn(async()=>assessmentDirectory(scope,[{...assessmentResource(scope),title:'新绑定工具'}])),addTrack:vi.fn()}:props.adapter
    rerender(<EducationAssessmentResourcePicker {...props} scope={scope} adapter={fresh}/>)
    await open()
    await act(async()=>late.resolve(assessmentDirectory()))
    expect(screen.getByRole('option',{name:/新绑定工具/})).toBeInTheDocument()
    expect(screen.queryByRole('option',{name:/已授权测评甲/})).not.toBeInTheDocument()
  })

  it.each(['unconfirmed','saved'])('requires a configuration read before another add after %s outcome',async outcome=>{
    const addTrack=outcome==='unconfirmed'?vi.fn(async()=>{throw Error('写入连接中断')}):vi.fn(async()=>{})
    const {onRefresh}=setup(assessmentScope,{list:vi.fn(async()=>assessmentDirectory()),addTrack})
    if(outcome==='saved')onRefresh.mockRejectedValueOnce(Error('回读中断'))
    await select();fireEvent.click(screen.getByRole('button',{name:'加入已授权固定版本'}))
    expect(await screen.findByRole('alert')).toHaveTextContent(outcome==='saved'?'已加入，但任务配置刷新失败':'添加结果尚未确认')
    expect(screen.getByRole('button',{name:'读取已授权测评目录'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'重新读取任务配置（核对添加结果）'}))
    await screen.findByText(/已重新读取任务配置/)
    expect(addTrack).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button',{name:'读取已授权测评目录'})).toBeEnabled()
  })

  it('does not refresh or revive a closed management view after a pending add completes',async()=>{
    const pending=deferred<void>()
    const {unmount,onRefresh,onBusy}=setup(assessmentScope,{list:vi.fn(async()=>assessmentDirectory()),addTrack:vi.fn(()=>pending.promise)})
    await select();fireEvent.click(screen.getByRole('button',{name:'加入已授权固定版本'}));unmount()
    await act(async()=>pending.resolve())
    expect(onRefresh).not.toHaveBeenCalled()
    expect(onBusy.mock.calls).toEqual([[true],[false]])
  })

  it('requires configuration recovery when the adapter changes during a pending write',async()=>{
    const pending=deferred<void>()
    const {props,rerender,onRefresh}=setup(assessmentScope,{list:vi.fn(async()=>assessmentDirectory()),addTrack:vi.fn(()=>pending.promise)})
    await select();fireEvent.click(screen.getByRole('button',{name:'加入已授权固定版本'}))
    const replacement={list:vi.fn(async()=>assessmentDirectory()),addTrack:vi.fn()}
    rerender(<EducationAssessmentResourcePicker {...props} adapter={replacement}/>)
    expect(screen.getByRole('button',{name:'读取已授权测评目录'})).toBeDisabled()
    await act(async()=>pending.resolve())
    expect(onRefresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'重新读取任务配置（核对添加结果）'}))
    await screen.findByText(/已重新读取任务配置/)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(replacement.addTrack).not.toHaveBeenCalled()
  })
})
