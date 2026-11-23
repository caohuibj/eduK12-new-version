import {useEffect,useState} from 'react'
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi,type Mock} from 'vitest'
import SurveyApp from './SurveyApp'
import type {BuilderLeaveRisk} from './SurveyBuilder'

vi.mock('./SurveyToolLibrary',()=>({SurveyToolLibrary:()=> <p>合成独立工具集</p>}))
vi.mock('./SurveyMaterialLibrary',()=>({SurveyMaterialLibrary:()=> <p>合成素材库</p>}))
vi.mock('./SurveyReportStudio',()=>({SurveyReportStudio:({projectId}:{projectId:string})=> <p>报告项目：{projectId}</p>}))
vi.mock('./SurveyAnalyticsWorkspace',()=>({SurveyAnalyticsWorkspace:()=> <p>合成数据页</p>}))
vi.mock('./SurveyWaveStudio',()=>({SurveyWaveStudio:({projectId,onLeaveRiskChange}:{projectId:string;onLeaveRiskChange:(risk:BuilderLeaveRisk)=>void})=>{
  const [value,setValue]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{onLeaveRiskChange({dirty:!!value,busy})},[value,busy,onLeaveRiskChange])
  useEffect(()=>()=>onLeaveRiskChange({dirty:false,busy:false}),[onLeaveRiskChange])
  return <><p>问卷项目：{projectId}</p><label>历史测试草稿<input value={value} onChange={event=>setValue(event.target.value)}/></label><button onClick={()=>setBusy(value=>!value)}>切换历史测试写入</button></>
}}))
const projects=['第一项研究','第二项研究','第三项研究'].map((title,index)=>({id:'p'+index,title,description:'',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1}))
const reply=(data:unknown,ok=true)=>Promise.resolve({ok,json:async()=>({code:ok?0:403,message:ok?'ok':'研究项目不可用',data})} as Response)
const deferred=()=>{let resolve!:(response:Response)=>void;const promise=new Promise<Response>(done=>{resolve=done});return {promise,resolve}}
let fetcher:Mock<(url:string,init?:RequestInit)=>Promise<Response>>
beforeEach(()=>{
  window.history.replaceState(null,'','/workspace')
  vi.spyOn(window,'confirm').mockReturnValue(false)
  fetcher=vi.fn((url:string)=>{
    if(url.endsWith('/auth/me'))return reply({id:'researcher',username:'合成研究者',mustChangePassword:false})
    if(url.endsWith('/auth/capabilities'))return reply({analytics:true,publication:true})
    if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic'})
    if(url.includes('/projects?page='))return reply({list:projects,total:projects.length,page:1,hasNext:false})
    const project=projects.find(row=>url.endsWith('/projects/'+row.id))
    if(project)return reply(project)
    throw new Error('Unexpected request '+url)
  })
  vi.stubGlobal('fetch',fetcher)
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
const historyLocation=(url:string)=>act(()=>{window.history.pushState(null,'',url);window.dispatchEvent(new PopStateEvent('popstate'))})
const selectedId=()=>new URLSearchParams(window.location.search).get('project')
const projectReads=(id:string)=>fetcher.mock.calls.filter(([url,init])=>url.endsWith('/projects/'+id)&&(!init?.method||init.method==='GET'))
async function openFirst(){
  fireEvent.click(within(await screen.findByRole('article',{name:projects[0].title})).getByRole('button',{name:'查看/编辑'}))
  await screen.findByRole('tab',{name:'研究设置'})
}

describe('Survey workspace browser history restoration',()=>{
  it('restores the saved project section across tools and media without replacing its retained draft',async()=>{
    render(<SurveyApp/>);await openFirst()
    fireEvent.click(screen.getByRole('tab',{name:'发布与采集'}))
    fireEvent.change(await screen.findByLabelText('历史测试草稿'),{target:{value:'保留当前问卷编辑'}})
    fireEvent.click(screen.getByRole('link',{name:'工具集',exact:true}))
    await screen.findByText('合成独立工具集')
    historyLocation('/workspace?project=p0&section=publish')
    expect(await screen.findByLabelText('历史测试草稿')).toBeVisible()
    expect(screen.getByLabelText('历史测试草稿')).toHaveValue('保留当前问卷编辑')
    expect(screen.getByRole('tab',{name:'发布与采集'})).toHaveAttribute('aria-selected','true')
    historyLocation('/workspace/media');expect(await screen.findByText('合成素材库')).toBeVisible()
    historyLocation('/workspace?project=p0&section=reports')
    expect(await screen.findByText('报告项目：p0')).toBeVisible()
    expect(screen.getByRole('tab',{name:'私有报告'})).toHaveAttribute('aria-selected','true')
    expect(selectedId()).toBe('p0');expect(projectReads('p0')).toHaveLength(0)
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('reads another history-selected project and restores its exact section',async()=>{
    render(<SurveyApp/>);await openFirst()
    historyLocation('/workspace?project=p1&section=reports')
    expect(await screen.findByText('报告项目：p1')).toBeVisible()
    expect(screen.getByLabelText('研究名称')).toHaveValue(projects[1].title)
    expect(screen.getByRole('tab',{name:'私有报告'})).toHaveAttribute('aria-selected','true')
    expect(selectedId()).toBe('p1');expect(projectReads('p1')).toHaveLength(1)
  })

  it('keeps unsaved settings and their URL when replacing the project is cancelled',async()=>{
    render(<SurveyApp/>);await openFirst()
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'未保存的名称'}})
    historyLocation('/workspace?project=p1&section=reports')
    expect(screen.getByLabelText('研究名称')).toHaveValue('未保存的名称')
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(selectedId()).toBe('p0');expect(projectReads('p1')).toHaveLength(0)
  })

  it.each(['questionnaire','settings'] as const)('blocks history departure during an unacknowledged %s write',async kind=>{
    const pending=deferred(),base=fetcher.getMockImplementation()!
    fetcher.mockImplementation((url,init)=>url.endsWith('/projects/p0')&&init?.method==='PATCH'?pending.promise:base(url,init))
    render(<SurveyApp/>);await openFirst()
    if(kind==='questionnaire'){
      fireEvent.click(screen.getByRole('tab',{name:'发布与采集'}))
      fireEvent.click(await screen.findByRole('button',{name:'切换历史测试写入'}))
    }else{
      fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'正在保存的名称'}})
      fireEvent.click(screen.getByRole('button',{name:'保存修改'}))
      await waitFor(()=>expect(fetcher.mock.calls.some(([url,init])=>url.endsWith('/projects/p0')&&init?.method==='PATCH')).toBe(true))
    }
    historyLocation('/workspace?project=p1&section=reports')
    expect(await screen.findByRole('alert')).toHaveTextContent('当前操作尚未确认')
    expect(selectedId()).toBe('p0');expect(projectReads('p1')).toHaveLength(0)
    expect(window.confirm).not.toHaveBeenCalled()
    if(kind==='settings')await act(async()=>pending.resolve(await reply({...projects[0],title:'正在保存的名称',revision:2})))
  })

  it.each(['project','section'] as const)('ignores a late history response after a subsequent explicit %s selection',async kind=>{
    const pending=deferred(),base=fetcher.getMockImplementation()!
    fetcher.mockImplementation((url,init)=>url.endsWith('/projects/p1')?pending.promise:base(url,init))
    render(<SurveyApp/>);await openFirst()
    historyLocation('/workspace?project=p1&section=reports')
    await waitFor(()=>expect(projectReads('p1')).toHaveLength(1))
    if(kind==='project'){
      fireEvent.click(screen.getByRole('button',{name:'← 返回研究列表（保留编辑）'}))
      fireEvent.click(within(screen.getByRole('article',{name:projects[2].title})).getByRole('button',{name:'查看/编辑'}))
    }else fireEvent.click(screen.getByRole('tab',{name:'发布与采集'}))
    await act(async()=>pending.resolve(await reply(projects[1])))
    const expected=kind==='project'?projects[2]:projects[0]
    expect(screen.getByLabelText('研究名称')).toHaveValue(expected.title)
    expect(selectedId()).toBe(expected.id)
    if(kind==='section')expect(screen.getByRole('tab',{name:'发布与采集'})).toHaveAttribute('aria-selected','true')
    expect(screen.queryByText('报告项目：p1')).not.toBeInTheDocument()
  })

  it('cancels a pending restore when current settings are edited before its response',async()=>{
    const pending=deferred(),base=fetcher.getMockImplementation()!
    fetcher.mockImplementation((url,init)=>url.endsWith('/projects/p1')?pending.promise:base(url,init))
    render(<SurveyApp/>);await openFirst()
    historyLocation('/workspace?project=p1&section=reports')
    await waitFor(()=>expect(projectReads('p1')).toHaveLength(1))
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'恢复期间新输入的名称'}})
    await act(async()=>pending.resolve(await reply(projects[1])))
    expect(screen.getByLabelText('研究名称')).toHaveValue('恢复期间新输入的名称')
    expect(selectedId()).toBe('p0')
  })

  it('preserves the current project and session if a history-selected project cannot be read',async()=>{
    const base=fetcher.getMockImplementation()!
    fetcher.mockImplementation((url,init)=>url.endsWith('/projects/p1')?reply(null,false):base(url,init))
    render(<SurveyApp/>);await openFirst()
    historyLocation('/workspace?project=p1&section=reports')
    expect(await screen.findByRole('alert')).toHaveTextContent('当前编辑已保留')
    expect(screen.getByLabelText('研究名称')).toHaveValue(projects[0].title)
    expect(selectedId()).toBe('p0')
    expect(screen.queryByRole('heading',{name:'研究者登录'})).not.toBeInTheDocument()
  })
})
