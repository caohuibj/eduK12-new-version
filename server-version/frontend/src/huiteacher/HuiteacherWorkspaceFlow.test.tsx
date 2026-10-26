import type {ComponentProps} from 'react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {HuiteacherEvaluationStudio} from './HuiteacherEvaluationStudio'
import {HuiteacherFormStudio} from './HuiteacherFormStudio'
import HuiteacherApp from './HuiteacherApp'

vi.mock('../survey/ResearchFormEditor',()=>({ResearchFormEditor:()=> <p>表单编辑内容</p>}))
vi.mock('./HuiteacherPersonalSelf',()=>({HuiteacherPersonalSelf:()=> <p>本人个人测评</p>}))
vi.mock('./HuiteacherMyFormTasks',()=>({HuiteacherMyFormTasks:()=> <p>本人跨学校表单任务</p>}))
vi.mock('./HuiteacherMyScaleTasks',()=>({HuiteacherMyScaleTasks:()=> <p>本人跨学校量表任务</p>}))
vi.mock('./HuiteacherClassRelationships',()=>({HuiteacherClassRelationships:()=>null}))
type Api=ComponentProps<typeof HuiteacherEvaluationStudio>['api']
const target=(id:string)=>({id,name:'对象 '+id,kind:'PERSON',status:'ACTIVE',subjectUserId:null})
const event=(id:string,status='DRAFT')=>({id,targetId:'t1',kind:'ASSESSMENT',title:'活动 '+id,status,version:1})
const form={id:'f1',title:'旧表单',status:'DRAFT',revision:1,definitionDigest:'digest',definition:{pages:[]}}
const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,message:'成功',data})})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs()})

describe('Teacher evaluation workspace paging',()=>{
  it('loads only requested pages, deduplicates IDs and retains rows and cursor after failure',async()=>{
    let failNext=true
    const api=vi.fn(async(path:string)=>{
      if(path.endsWith('/evaluation-targets'))return {list:[target('t1')],nextCursor:'target cursor'}
      if(path.endsWith('/evaluation-events'))return {list:[event('e1')],nextCursor:'event cursor'}
      if(path.endsWith('/forms'))return {list:[]}
      if(path.includes('/evaluation-targets?cursor='))return {list:[target('t1'),target('t2')],nextCursor:null}
      if(path.includes('/evaluation-events?cursor=')){
        if(failNext){failNext=false;throw Error('活动分页网络错误')}
        return {list:[event('e1'),event('e2')],nextCursor:null}
      }
      throw Error('Unexpected '+path)
    })
    render(<HuiteacherEvaluationStudio organizationId="a" api={api as Api}/> )
    await screen.findByText('活动 e1')
    expect(api.mock.calls.filter(([path])=>path.includes('?cursor='))).toHaveLength(0)
    fireEvent.click(screen.getByText('创建评价活动',{selector:'summary'}))
    fireEvent.click(screen.getByRole('button',{name:'加载更多评价对象'}))
    await screen.findByRole('option',{name:'对象 t2'})
    expect(screen.getAllByRole('option',{name:'对象 t1'})).toHaveLength(1)
    expect(api).toHaveBeenCalledWith('/organizations/a/evaluation-targets?cursor=target%20cursor')
    fireEvent.click(screen.getByRole('button',{name:'加载更多评价活动'}))
    await screen.findByText(/活动分页网络错误/)
    expect(screen.getByText('活动 e1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'重试评价活动'}))
    await screen.findByText('活动 e2')
    expect(screen.getAllByText('活动 e1')).toHaveLength(1)
    expect(screen.queryByRole('button',{name:'加载更多评价活动'})).not.toBeInTheDocument()
  })

  it('ignores a pending page from a previous school',async()=>{
    let resolveOld!:(value:unknown)=>void
    const api=vi.fn(async(path:string)=>{
      if(path.includes('?cursor='))return new Promise(resolve=>{resolveOld=resolve})
      if(path.endsWith('/evaluation-events'))return {list:[event(path.includes('/a/')?'a':'b')],nextCursor:'next'}
      return {list:[]}
    })
    const view=render(<HuiteacherEvaluationStudio organizationId="a" api={api as Api}/> )
    await screen.findByText('活动 a')
    fireEvent.click(screen.getByRole('button',{name:'加载更多评价活动'}))
    view.rerender(<HuiteacherEvaluationStudio organizationId="b" api={api as Api}/> )
    await screen.findByText('活动 b')
    await act(async()=>resolveOld({list:[event('late-a')],nextCursor:null}))
    expect(screen.queryByText('活动 late-a')).not.toBeInTheDocument()
    expect(screen.getByText('活动 b')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'加载更多评价活动'})).toBeEnabled()
  })

  it('separates open activity from unpublished task without automatically publishing',async()=>{
    const api=vi.fn(async(path:string)=>{
      if(path.endsWith('/evaluation-events'))return {list:[event('e1','OPEN')],nextCursor:null}
      if(path.endsWith('/run'))return {eventId:'e1',runId:'run1',status:'DRAFT',version:1,trackCount:1}
      return {list:[]}
    })
    render(<HuiteacherEvaluationStudio organizationId="a" api={api as Api}/> )
    fireEvent.click(await screen.findByRole('button',{name:'查看任务配置'}))
    expect(await screen.findByText(/活动已开放，但任务尚未发布/)).toBeInTheDocument()
    expect(screen.getByText(/任务状态：草稿/)).toBeInTheDocument()
    expect(api.mock.calls.some(([path])=>path.endsWith('/publish'))).toBe(false)
  })
})

describe('Teacher form draft navigation',()=>{
  it('cancelling new form preserves the active draft and performs no creation',async()=>{
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    const api=vi.fn(async(path:string)=>path.endsWith('/f1')?form:{list:[form]})
    render(<HuiteacherFormStudio organizationId="a" api={api as Api}/> )
    fireEvent.click(await screen.findByRole('button',{name:'旧表单 · 草稿'}))
    fireEvent.change(await screen.findByLabelText('表单标题'),{target:{value:'未保存内容'}})
    fireEvent.change(screen.getByLabelText('新表单名称'),{target:{value:'新表单'}})
    fireEvent.click(screen.getByRole('button',{name:'创建表单'}))
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('表单标题')).toHaveValue('未保存内容')
    expect(api.mock.calls).toHaveLength(2)
  })

  it('warns before unloading unsaved new titles and removes the guard on unmount',async()=>{
    const api=vi.fn(async()=>({list:[]}))
    const view=render(<HuiteacherFormStudio organizationId="a" api={api as Api}/> )
    await screen.findByText('本校尚无表单，可以先创建草稿。')
    fireEvent.change(screen.getByLabelText('新表单名称'),{target:{value:'未保存新标题'}})
    const blocked=new Event('beforeunload',{cancelable:true})
    window.dispatchEvent(blocked)
    expect(blocked.defaultPrevented).toBe(true)
    view.unmount()
    const allowed=new Event('beforeunload',{cancelable:true})
    window.dispatchEvent(allowed)
    expect(allowed.defaultPrevented).toBe(false)
  })

  it('allows leaving during an ordinary form detail read',async()=>{
    let resolveRead!:(value:unknown)=>void
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
      if(url.endsWith('/auth/me'))return reply({id:'teacher',username:'Teacher',role:'TEACHER',mustChangePassword:false,
        organizations:[{organizationId:'a',organizationName:'学校 a',productAdmin:true}]})
      if(url.endsWith('/forms/f1'))return new Promise(resolve=>{resolveRead=resolve})
      if(url.endsWith('/forms'))return reply({list:[form]})
      return reply({list:[]})
    }))
    render(<HuiteacherApp/> )
    fireEvent.click(await screen.findByRole('button',{name:'学校改进'}))
    fireEvent.click(screen.getByRole('link',{name:'学校表单'}))
    fireEvent.click(await screen.findByRole('button',{name:'旧表单 · 草稿'}))
    await waitFor(()=>expect(resolveRead).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('button',{name:'教师成长'}))
    expect(screen.getByText(/个人空间 · 显示本人各学校/)).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
    await act(async()=>resolveRead(reply(form)))
    expect(screen.queryByLabelText('表单标题')).not.toBeInTheDocument()
  })

  it('protects tab and school changes and blocks leaving while a write is pending',async()=>{
    let resolveSave!:(value:unknown)=>void
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
      if(url.endsWith('/auth/me'))return reply({id:'teacher',username:'Teacher',role:'TEACHER',mustChangePassword:false,
        organizations:['a','b'].map(id=>({organizationId:id,organizationName:'学校 '+id,productAdmin:true}))})
      if(url.endsWith('/auth/csrf'))return reply({csrfToken:'test-csrf'})
      if(url.endsWith('/forms/f1')&&options?.method==='PUT')return new Promise(resolve=>{resolveSave=resolve})
      if(url.endsWith('/forms/f1'))return reply(form)
      if(url.endsWith('/forms'))return reply({list:[form]})
      return reply({list:[]})
    }))
    render(<HuiteacherApp/> )
    fireEvent.click(await screen.findByRole('button',{name:'学校改进'}))
    fireEvent.click(screen.getByRole('link',{name:'学校表单'}))
    fireEvent.click(await screen.findByRole('button',{name:'旧表单 · 草稿'}))
    fireEvent.change(await screen.findByLabelText('表单标题'),{target:{value:'保留草稿'}})
    fireEvent.click(screen.getByRole('button',{name:'教师成长'}))
    expect(screen.getByLabelText('表单标题')).toHaveValue('保留草稿')
    fireEvent.change(screen.getByLabelText('当前学校管理范围'),{target:{value:'b'}})
    expect(screen.getByLabelText('当前学校管理范围')).toHaveValue('a')
    expect(screen.getByLabelText('表单标题')).toHaveValue('保留草稿')
    fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
    await waitFor(()=>expect(resolveSave).toBeTypeOf('function'))
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button',{name:'教师成长'}))
    expect(screen.getByRole('status')).toHaveTextContent('表单正在保存或发布，请等待完成后再离开。')
    expect(screen.getByLabelText('表单标题')).toHaveValue('保留草稿')
    await act(async()=>resolveSave(reply({})))
    await screen.findByText('表单已保存；发布后定义不可改写。')
    fireEvent.click(screen.getByRole('button',{name:'教师成长'}))
    expect(await screen.findByText(/个人空间 · 显示本人各学校/)).toBeInTheDocument()
    expect(screen.getByText('本人跨学校表单任务')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation',{name:'Teacher 工作台'})).getByRole('button',{name:'教师成长'})).toHaveAttribute('aria-pressed','true')
  })
})
