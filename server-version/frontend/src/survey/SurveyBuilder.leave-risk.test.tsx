import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SurveyBuilder } from './SurveyBuilder'
const response=(data:unknown)=>Promise.resolve({ok:true,json:async()=>({code:0,data})} as Response)
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('builder leave-risk signals',()=>{
  it('reports unsaved draft inputs and a pending write, then clears acknowledged edits',async()=>{
    const risk=vi.fn()
    let resolve!:(value:Response)=>void
    const pending=new Promise<Response>(done=>{resolve=done})
    const draft={id:'draft',projectId:'p',instrumentKey:'form',kind:'FORM',title:'私有草稿',revision:1,status:'DRAFT',definition:{schemaVersion:1,pages:[]}}
    vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
      if(url.endsWith('/csrf'))return response({csrfToken:'synthetic'})
      if(url.endsWith('/instruments')&&init?.method==='POST')return pending
      if(url.endsWith('/assets'))return response({assets:[]})
      return response({list:[]})
    }))
    render(<SurveyBuilder projectId="p" onLeaveRiskChange={risk}/>)
    await waitFor(()=>expect(risk).toHaveBeenLastCalledWith({dirty:false,busy:false}))
    fireEvent.change(screen.getByLabelText('名称',{exact:true}),{target:{value:'私有草稿'}})
    expect(risk).toHaveBeenLastCalledWith({dirty:true,busy:false})
    fireEvent.click(screen.getByRole('button',{name:'创建草稿'}))
    expect(risk).toHaveBeenLastCalledWith({dirty:true,busy:true})
    await act(async()=>resolve(await response(draft)))
    await waitFor(()=>expect(risk).toHaveBeenLastCalledWith({dirty:false,busy:false}))
    fireEvent.change(screen.getByLabelText('研究工具名称'),{target:{value:'修改后的名称'}})
    expect(risk).toHaveBeenLastCalledWith({dirty:true,busy:false})
  })
  it('preserves unimported bulk content when tool switching is cancelled',async()=>{
    const risk=vi.fn(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    const draft=(id:string)=>({id,projectId:'p',instrumentKey:id,kind:'FORM',title:id,revision:1,status:'DRAFT',definition:{schemaVersion:1,pages:[]}})
    vi.stubGlobal('fetch',vi.fn((url:string)=>{
      if(url.endsWith('/instruments?page=1'))return response({list:[draft('first'),draft('second')]})
      if(url.endsWith('/instruments/first'))return response(draft('first'))
      if(url.endsWith('/assets'))return response({assets:[]})
      return response({list:[]})
    }))
    render(<SurveyBuilder projectId="p" onLeaveRiskChange={risk}/>)
    fireEvent.click(await screen.findByRole('button',{name:/first.*FORM/}))
    fireEvent.change(await screen.findByLabelText('待解析的导入内容'),{target:{value:'尚未导入的题目'}})
    expect(risk).toHaveBeenLastCalledWith({dirty:true,busy:false})
    fireEvent.click(screen.getByRole('button',{name:/second.*FORM/}))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('待解析的导入内容')).toHaveValue('尚未导入的题目')
    expect(screen.getByLabelText('研究工具名称')).toHaveValue('first')
  })
})
