import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SurveyApp from './SurveyApp'
import type { BuilderLeaveRisk } from './SurveyBuilder'

function selectStudy(index:number){
  const back=screen.queryByRole('button',{name:'← 返回研究列表（保留编辑）'})
  if(back)fireEvent.click(back)
  fireEvent.click(screen.getAllByRole('button',{name:'查看/编辑'})[index])
}

vi.mock('./SurveyBuilder',()=>({SurveyBuilder:({projectId,onLeaveRiskChange}:{projectId:string;onLeaveRiskChange:(risk:BuilderLeaveRisk)=>void})=>{
  const [value,setValue]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{onLeaveRiskChange({dirty:!!value,busy})},[value,busy,onLeaveRiskChange])
  useEffect(()=>()=>onLeaveRiskChange({dirty:false,busy:false}),[onLeaveRiskChange])
  return <><label>合成草稿<input value={value} onChange={event=>setValue(event.target.value)}/></label><p>工具项目：{projectId}</p><button onClick={()=>setBusy(x=>!x)}>切换合成写入状态</button></>
}}))
vi.mock('./SurveyReportStudio',()=>({SurveyReportStudio:()=>null}))
vi.mock('./SurveyWaveStudio',()=>({SurveyWaveStudio:()=>null}))
vi.mock('./SurveyAnalyticsWorkspace',()=>({SurveyAnalyticsWorkspace:()=> <p>合成研究数据</p>}))
const projects=['第一项研究','第二项研究'].map((title,index)=>({id:'p'+index,title,description:'',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1}))
const reply=(data:unknown)=>Promise.resolve({ok:true,json:async()=>({code:0,data})} as Response)
let fetcher:Mock<(url:string)=>Promise<Response>>
beforeEach(()=>{
  window.history.replaceState(null,'','/workspace')
  fetcher=vi.fn((url:string)=>{
    if(url.endsWith('/auth/me'))return reply({id:'r',username:'researcher',mustChangePassword:false})
    if(url.endsWith('/auth/capabilities'))return reply({analytics:false,publication:true})
    if(url.includes('/projects?page='))return reply({list:projects})
    if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic'})
    if(url.endsWith('/auth/logout'))return reply({})
    throw new Error('Unexpected route '+url)
  })
  vi.stubGlobal('fetch',fetcher)
  vi.spyOn(window,'confirm').mockReturnValue(false)
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
async function openTool(){
  await screen.findByRole('heading',{name:'研究工作台'})
  selectStudy(0)
  fireEvent.click(screen.getByRole('tab',{name:'研究工具'}))
  fireEvent.change(screen.getByLabelText('合成草稿'),{target:{value:'不能丢失'}})
}
describe('researcher workspace leave protection',()=>{
  it('preserves tool edits when cancelling project switch, new project or logout',async()=>{
    render(<SurveyApp/>);await openTool()
    selectStudy(1)
    expect(screen.getByLabelText('合成草稿')).toHaveValue('不能丢失')
    expect(screen.getByText('工具项目：p0')).toBeVisible()
    fireEvent.click(screen.getByRole('tab',{name:'研究设置'}))
    fireEvent.click(screen.getByRole('button',{name:'新建其他项目'}))
    expect(screen.getByLabelText('研究名称')).toHaveValue('第一项研究')
    fireEvent.click(screen.getByRole('button',{name:'退出'}))
    expect(fetcher.mock.calls.some(([url])=>url.endsWith('/auth/logout'))).toBe(false)
    fireEvent.click(screen.getByRole('tab',{name:'研究工具'}))
    expect(screen.getByLabelText('合成草稿')).toHaveValue('不能丢失')
    expect(window.confirm).toHaveBeenCalledTimes(3)
  })
  it('allows an explicitly confirmed switch and resets the new project editor',async()=>{
    render(<SurveyApp/>);await openTool();vi.mocked(window.confirm).mockReturnValue(true)
    selectStudy(1)
    expect(screen.getByLabelText('研究名称')).toHaveValue('第二项研究')
    fireEvent.click(screen.getByRole('tab',{name:'研究工具'}))
    expect(screen.getByLabelText('合成草稿')).toHaveValue('')
    expect(screen.getByText('工具项目：p1')).toBeVisible()
  })
  it('blocks project departure during an unacknowledged tool write without offering discard',async()=>{
    render(<SurveyApp/>);await openTool()
    fireEvent.click(screen.getByRole('button',{name:'切换合成写入状态'}))
    selectStudy(1)
    expect(screen.getByRole('alert')).toHaveTextContent('当前操作尚未确认')
    expect(window.confirm).not.toHaveBeenCalled()
    expect(screen.getByLabelText('合成草稿')).toHaveValue('不能丢失')
  })
  it('protects project settings and browser reload, but same-project selection does not erase edits',async()=>{
    render(<SurveyApp/>)
    await screen.findByRole('heading',{name:'研究工作台'})
    selectStudy(0)
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'本地修改'}})
    selectStudy(0)
    expect(screen.getByLabelText('研究名称')).toHaveValue('本地修改')
    const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    selectStudy(1)
    expect(screen.getByLabelText('研究名称')).toHaveValue('本地修改')
  })
  it('does not let an older page read unlock a pending logout write',async()=>{
    let finishPage!:(value:Response)=>void,finishLogout!:(value:Response)=>void
    const pagePending=new Promise<Response>(resolve=>{finishPage=resolve})
    const logoutPending=new Promise<Response>(resolve=>{finishLogout=resolve})
    const rows=Array.from({length:25},(_,index)=>({...projects[0],id:'page-'+index,title:'分页研究 '+index}))
    const base=fetcher.getMockImplementation()!
    fetcher.mockImplementation((url:string)=>{
      if(url.endsWith('/projects?page=1'))return reply({list:rows})
      if(url.endsWith('/projects?page=2'))return pagePending
      if(url.endsWith('/auth/logout'))return logoutPending
      return base(url)
    })
    render(<SurveyApp/>)
    await screen.findByRole('heading',{name:'研究工作台'})
    fireEvent.click(screen.getByRole('button',{name:/^下一页$/}))
    // A read alone does not prevent logout.
    expect(screen.getByRole('button',{name:'退出'})).toBeEnabled()
    fireEvent.click(screen.getByRole('button',{name:'退出'}))
    await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>url.endsWith('/auth/logout'))).toBe(true))
    await act(async()=>finishPage(await reply({list:rows})))
    expect(screen.getByRole('button',{name:'退出'})).toBeDisabled()
    expect(screen.getAllByRole('button',{name:'查看/编辑'})[0]).toBeDisabled()
    expect(screen.queryByLabelText('研究名称')).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'新建研究'})).toBeDisabled()
    const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await act(async()=>finishLogout(await reply({})))
    expect(await screen.findByRole('heading',{name:'研究者登录'})).toBeInTheDocument()
  })
  it('distinguishes capabilities errors from disabled features and offers a retry',async()=>{
    let fail=true
    const base=fetcher.getMockImplementation()!
    fetcher.mockImplementation((url:string)=>url.endsWith('/auth/capabilities')&&fail?Promise.reject(new Error('offline')):base(url))
    render(<SurveyApp/>)
    await screen.findByRole('heading',{name:'研究工作台'})
    selectStudy(0)
    fireEvent.click(screen.getByRole('tab',{name:'研究数据'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('这不代表功能未开通')
    fail=false;fireEvent.click(screen.getByRole('button',{name:'重试功能状态'}))
    await waitFor(()=>expect(screen.getByLabelText('研究数据状态')).toHaveTextContent('暂未在当前环境启用'))
  })
})
