import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SchoolActivityManager } from './SchoolActivityManager'
import type { SchoolApi } from './SchoolRecovery'

const org='00000000-0000-4000-8000-000000000001'
const course='00000000-0000-4000-8000-000000000002'
const classUnit='00000000-0000-4000-8000-000000000003'
const activity={courseId:course,organizationId:org,title:'同伴支持',
  purpose:'SCHOOL_CLIMATE',status:'OPEN',version:2,participantCount:6,
  runCount:0,runs:[]}

describe('Huischool Activity peer allocation after reopen',()=>{
  it('allows an administrator to choose the class of an already open Activity',async()=>{
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path===`/organizations/${org}/activities?page=1&pageSize=50`)
        return {list:[activity]}
      if(path===`/organizations/${org}/activities/${course}`&&method==='GET')
        return activity
      if(path===`/organizations/${org}/activities/${course}/peer-allocations`&&method==='POST')
        return {cohortSize:6,assignments:6}
      throw Error('Unexpected campus API '+method+' '+path)
    })
    const originalConfirm=window.confirm
    window.confirm=vi.fn(()=>true)
    try{
      render(<SchoolActivityManager compact api={api as unknown as SchoolApi}
        organizationId={org} isAdmin classes={[{id:classUnit,name:'五年级一班',unitKind:'CLASS'}]}/>)
      fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:course}})
      expect(await screen.findByText(/状态：已开放/)).toBeInTheDocument()
      const select=screen.getByLabelText('本次互评分配班级')
      fireEvent.change(select,{target:{value:classUnit}})
      fireEvent.click(screen.getByRole('button',{name:'按同意记录随机生成非自评配对'}))
      await waitFor(()=>expect(api).toHaveBeenCalledWith(
        `/organizations/${org}/activities/${course}/peer-allocations`,'POST',
        {classUnitId:classUnit,peersPerRespondent:1},
      ))
    }finally{window.confirm=originalConfirm}
  })
})

describe('School activity and assessment states',()=>{
  it.each(['PAUSED','CLOSED'])('keeps %s batch status without requesting forbidden details',async(status)=>{
    const detail={...activity,status,runs:[{runId:'run-a',name:'适应测评',status:'PUBLISHED'}]}
    const api=vi.fn(async(path:string)=>path.endsWith('pageSize=50')?{list:[detail]}:detail)
    render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={org} isAdmin classes={[]}/>)
    fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:course}})
    const batch=await screen.findByRole('button',{name:'适应测评 · 已发布'})
    expect(batch).toBeDisabled()
    fireEvent.click(batch)
    expect(api.mock.calls.some(([path])=>path.includes('/runs/'))).toBe(false)
    expect(screen.getByText(/当前活动状态不支持读取测评批次详情/)).toBeInTheDocument()
  })
  it('explains the separate publication step after an activity opens',async()=>{
    const detail={...activity,runs:[{runId:'run-a',name:'适应测评',status:'DRAFT'}]}
    const api=vi.fn(async(path:string)=>path.endsWith('pageSize=50')?{list:[detail]}:detail)
    render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={org} isAdmin={false} classes={[]}/>)
    fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:course}})
    expect(await screen.findByText(/活动已开放，但仍有测评批次未发布/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'学校管理员正式发布测评'})).not.toBeInTheDocument()
  })
})

const deferred=<T,>()=>{
  let resolve!:(value:T)=>void
  const promise=new Promise<T>(done=>{resolve=done})
  return {promise,resolve}
}

describe('School activity scoped class picker',()=>{
  const draft={...activity,status:'DRAFT',version:1}
  const base=`/organizations/${org}/activities`
  it('loads only the activity picker for ordinary teachers and retries without using management classes',async()=>{
    let attempts=0
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path.endsWith('pageSize=50'))return {list:[draft]}
      if(path===`${base}/${course}`)return draft
      if(path===`${base}/${course}/eligible-classes`){
        if(++attempts===1)throw Error('班级目录暂不可用')
        return {list:[{id:classUnit,name:'本人任教班级'}]}
      }
      if(path===`${base}/${course}/participants`&&method==='POST')return {selected:6}
      throw Error('Unexpected '+path)
    })
    render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={org} isAdmin={false}
      classes={[{id:'not-eligible',name:'管理目录中的其他班级',unitKind:'CLASS'}]}/>)
    await screen.findByRole('option',{name:'同伴支持（准备中）'})
    expect(api.mock.calls.some(([path])=>path.endsWith('eligible-classes'))).toBe(false)
    fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:course}})
    expect(await screen.findByText('班级目录暂不可用')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'加入当前班级学生'})).toBeDisabled()
    expect(screen.queryByText('管理目录中的其他班级')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'重试加载班级'}))
    await screen.findByRole('option',{name:'本人任教班级'})
    fireEvent.change(screen.getByLabelText('班级'),{target:{value:classUnit}})
    fireEvent.click(screen.getByRole('button',{name:'加入当前班级学生'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(`${base}/${course}/participants`,'POST',expect.objectContaining({classUnitIds:[classUnit]})))
    expect(api.mock.calls.some(([path])=>path.includes('/units'))).toBe(false)
  })

  it('keeps a late directory from a previous activity out of the active picker',async()=>{
    const old=deferred<{list:Array<{id:string;name:string}>}>()
    const second={...draft,courseId:'second-course',title:'第二个活动'}
    const api=vi.fn(async(path:string)=>{
      if(path.endsWith('pageSize=50'))return {list:[draft,second]}
      if(path===`${base}/${course}`)return draft
      if(path===`${base}/second-course`)return second
      if(path===`${base}/${course}/eligible-classes`)return old.promise
      if(path===`${base}/second-course/eligible-classes`)return {list:[{id:'second-class',name:'第二活动班级'}]}
      throw Error('Unexpected '+path)
    })
    render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={org} isAdmin={false} classes={[]}/>)
    await screen.findByRole('option',{name:'同伴支持（准备中）'})
    fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:course}})
    await screen.findByText('正在加载可分配班级…')
    fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:second.courseId}})
    await screen.findByRole('option',{name:'第二活动班级'})
    await act(async()=>{old.resolve({list:[{id:classUnit,name:'旧活动班级'}]})})
    await waitFor(()=>expect(screen.queryByRole('option',{name:'旧活动班级'})).not.toBeInTheDocument())
    expect(screen.getByRole('option',{name:'第二活动班级'})).toBeInTheDocument()
  })

  it('ignores an old activity detail after the organization changes and shows a scoped empty state',async()=>{
    const old=deferred<typeof draft>()
    const otherOrg='00000000-0000-4000-8000-000000000009'
    const second={...draft,organizationId:otherOrg,courseId:'other-course',title:'另一学校活动'}
    const api=vi.fn(async(path:string)=>{
      if(path===base+'?page=1&pageSize=50')return {list:[draft]}
      if(path===`${base}/${course}`)return old.promise
      if(path===`/organizations/${otherOrg}/activities?page=1&pageSize=50`)return {list:[second]}
      if(path.endsWith('/other-course'))return second
      if(path.endsWith('/other-course/eligible-classes'))return {list:[]}
      throw Error('Unexpected '+path)
    })
    const view=render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={org} isAdmin={false} classes={[]}/>)
    await screen.findByRole('option',{name:'同伴支持（准备中）'})
    fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:course}})
    view.rerender(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={otherOrg} isAdmin={false} classes={[]}/>)
    await screen.findByRole('option',{name:'另一学校活动（准备中）'})
    fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:second.courseId}})
    await screen.findByText(/当前没有可分配的获批班级/)
    await act(async()=>{old.resolve(draft)})
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'同伴支持'})).not.toBeInTheDocument())
    expect(screen.getByRole('heading',{name:'另一学校活动'})).toBeInTheDocument()
    expect(api.mock.calls.some(([path])=>path===`${base}/${course}/eligible-classes`)).toBe(false)
  })
})


describe('School psychologist backend operation capabilities',()=>{
  const capabilities={canSubmit:false,canOpen:true,canPause:false,canResume:false,canClose:true,
    canPublishRun:false,ownPsychologyPublisher:true}
  it('allows own opening from backend capability without administrator UI identity',async()=>{
    const detail={...activity,status:'SUBMITTED',capabilities}
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path.endsWith('pageSize=50'))return {list:[detail]}
      if(path.endsWith('/govern')&&method==='POST')return {status:'OPEN',version:3}
      return detail
    })
    render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={org} isAdmin={false} classes={[]}/>)
    fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:course}})
    fireEvent.click(await screen.findByRole('button',{name:'开放本人活动'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(`/organizations/${org}/activities/${course}/govern`,'POST',
      {action:'OPEN',expectedVersion:2}))
  })
  it('does not infer control from administrator prop when backend capabilities deny it',async()=>{
    const detail={...activity,status:'SUBMITTED',capabilities:{...capabilities,canOpen:false,canClose:false,ownPsychologyPublisher:false}}
    const api=vi.fn(async(path:string)=>path.endsWith('pageSize=50')?{list:[detail]}:detail)
    render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={org} isAdmin classes={[]}/>)
    fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:course}})
    await screen.findByText(/状态：学校审核中/)
    expect(screen.queryByRole('button',{name:'学校管理员批准开放'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'关闭提议'})).not.toBeInTheDocument()
  })
  it('closes an owned paused batch from activity facts without fetching forbidden run details',async()=>{
    const detail={...activity,status:'PAUSED',capabilities:{...capabilities,canOpen:false,canResume:true},
      runs:[{runId:'run-own',name:'本人测评',status:'PUBLISHED',capabilities:{canPublish:false,canClose:true,canCancel:true}}]}
    const api=vi.fn(async(path:string)=>path.endsWith('pageSize=50')?{list:[detail]}:detail)
    const original=window.confirm;window.confirm=vi.fn(()=>true)
    try{
      render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={org} isAdmin={false} classes={[]}/>)
      fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:course}})
      fireEvent.click(await screen.findByRole('button',{name:'收尾 本人测评'}))
      await waitFor(()=>expect(api).toHaveBeenCalledWith(`/organizations/${org}/activities/${course}/runs/run-own/close`,'POST',{}))
      expect(api.mock.calls.some(([path])=>path.endsWith('/runs/run-own'))).toBe(false)
    }finally{window.confirm=original}
  })
})


it('publishes own psychologist batch using server run capabilities without isAdmin',async()=>{
  const detail={...activity,capabilities:{canSubmit:false,canOpen:false,canPause:true,canResume:false,canClose:true,canPublishRun:true,ownPsychologyPublisher:true},
    runs:[{runId:'run-own',name:'本人测评',status:'DRAFT',capabilities:{canPublish:true,canClose:false,canCancel:false}}]}
  const base=`/organizations/${org}/activities/${course}`
  const api=vi.fn(async(path:string)=>{
    if(path.endsWith('pageSize=50'))return {list:[detail]}
    if(path===base+'/runs/run-own')return {run:{id:'run-own',name:'本人测评',status:'DRAFT',version:2}}
    if(path.endsWith('/preview'))return {tracks:[{executionCount:1,subjectCount:1,respondentCount:1}]}
    return detail
  })
  const original=window.confirm;window.confirm=vi.fn(()=>true)
  try{
    render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={org} isAdmin={false} classes={[]}/>)
    fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:course}})
    fireEvent.click(await screen.findByRole('button',{name:'本人测评 · 准备中'}))
    fireEvent.click(await screen.findByRole('button',{name:'预览合法参与者数量'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'正式发布本人测评'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'正式发布本人测评'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/runs/run-own/publish','POST',{expectedVersion:2}))
  }finally{window.confirm=original}
})

it('separates compact configuration and preserves unsaved inputs per activity without opening anything',async()=>{
 const second='00000000-0000-4000-8000-000000000004'
 const draft={...activity,status:'DRAFT',runs:[],capabilities:{canSubmit:true}}
 const other={...draft,courseId:second,title:'学习安排'}
 const api=vi.fn(async(path:string)=>{
  if(path.endsWith('pageSize=50'))return {list:[draft,other]}
  if(path.endsWith('/eligible-classes'))return {list:[{id:classUnit,name:'五年级一班'}]}
  if(path.endsWith('/'+second))return other
  if(path.endsWith('/'+course))return draft
  throw Error('unexpected compact activity read '+path)
 })
 render(<SchoolActivityManager compact api={api as unknown as SchoolApi} organizationId={org} isAdmin={false} classes={[]}/>)
 expect(screen.getByRole('button',{name:'创建活动草稿'})).not.toBeVisible()
 await screen.findByRole('option',{name:'同伴支持（准备中）'})
 const choose=async(id:string,title:string)=>{
  fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:id}})
  await screen.findByRole('heading',{name:title})
 }
 await choose(course,'同伴支持')
 expect(screen.getByRole('button',{name:'班级与参与者'})).toHaveAttribute('aria-pressed','true')
 expect(screen.queryByRole('button',{name:'提交学校审核'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'阅读／练习／打卡'}))
 expect(screen.getByRole('region',{name:'阅读、练习与打卡'})).toBeVisible()
 fireEvent.change(screen.getByLabelText('任务名称'),{target:{value:'活动A未保存标题'}})
 fireEvent.change(screen.getByLabelText('内容'),{target:{value:'活动A未保存内容'}})
 fireEvent.click(screen.getByRole('button',{name:'正式测评批次'}))
 fireEvent.change(screen.getByLabelText('测评批次名称'),{target:{value:'活动A未保存批次'}})
 fireEvent.click(screen.getByRole('button',{name:'进度与结果说明'}))
 expect(screen.getByRole('button',{name:'提交学校审核'})).toBeInTheDocument()
 await choose(second,'学习安排')
 fireEvent.click(screen.getByRole('button',{name:'阅读／练习／打卡'}))
 expect(screen.getByLabelText('任务名称')).toHaveValue('')
 expect(screen.getByLabelText('内容')).toHaveValue('')
 fireEvent.change(screen.getByLabelText('任务名称'),{target:{value:'活动B未保存标题'}})
 await choose(course,'同伴支持')
 fireEvent.click(screen.getByRole('button',{name:'阅读／练习／打卡'}))
 expect(screen.getByLabelText('任务名称')).toHaveValue('活动A未保存标题')
 expect(screen.getByLabelText('内容')).toHaveValue('活动A未保存内容')
 fireEvent.click(screen.getByRole('button',{name:'正式测评批次'}))
 expect(screen.getByLabelText('测评批次名称')).toHaveValue('活动A未保存批次')
 expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
})


it.each([true,false])('keeps compact psychologist lifecycle controls in the results panel and honors backend canOpen=%s',async canOpen=>{
 const detail={...activity,status:'SUBMITTED',runs:[],capabilities:{canOpen,canSubmit:false,canClose:false,canPause:false,canResume:false,canPublishRun:false,ownPsychologyPublisher:true}}
 const api=vi.fn(async(path:string)=>path.endsWith('pageSize=50')?{list:[detail]}:detail)
 render(<SchoolActivityManager compact api={api as unknown as SchoolApi} organizationId={org} isAdmin={false} classes={[]}/>)
 const help=screen.getByRole('button',{name:'活动与发布说明'})
 expect(help).toHaveAttribute('aria-expanded','false')
 expect(screen.queryByText(/教师准备活动；学校管理员/)).not.toBeInTheDocument()
 fireEvent.click(help)
 expect(screen.getByText(/只有已批准班级中的授权学生/)).toBeInTheDocument()
 fireEvent.keyDown(help,{key:'Escape'})
 expect(help).toHaveAttribute('aria-expanded','false')
 fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:course}})
 await screen.findByRole('heading',{name:'同伴支持'})
 expect(screen.getByRole('button',{name:'班级与参与者'})).toHaveAttribute('aria-pressed','true')
 expect(screen.queryByRole('button',{name:'开放本人活动'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'进度与结果说明'}))
 expect(screen.getByRole('region',{name:'活动进度与结果'})).toBeVisible()
 expect(screen.queryByRole('region',{name:'阅读、练习与打卡'})).not.toBeInTheDocument()
 if(canOpen)expect(screen.getByRole('button',{name:'开放本人活动'})).toBeEnabled()
 else expect(screen.queryByRole('button',{name:'开放本人活动'})).not.toBeInTheDocument()
 expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
})
