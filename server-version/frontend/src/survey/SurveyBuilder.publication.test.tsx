import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SurveyBuilder } from './SurveyBuilder'
import type { ResearchDraft } from './builder.types'
const base='/api/survey/projects/p1/instruments'
function fixture(projectStatus='DRAFT'){
  let draft:ResearchDraft={id:'scale1',projectId:'p1',instrumentKey:'scale1',kind:'SCALE',title:'自编量表',status:'DRAFT',revision:2,authoringVersion:1,authoringFamilyId:'family1',createdAt:'',updatedAt:'',definition:{schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',dimensions:[],responseOptions:[{optionKey:'a',label:'同意',score:1}],items:[]}}
  const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
    let data:unknown
    if(url==='/api/survey/auth/csrf')data={csrfToken:'synthetic'}
    else if(url===base+'?page=1')data={list:[draft]}
    else if(url==='/api/survey/projects/p1/catalog?page=1')data={list:[]}
    else if(url===base+'/scale1')data=draft
    else if(url===base+'/scale1/measurement-release'){
      draft={...draft,status:'PUBLISHED',measurementReleaseId:'release1'};data={releaseId:'release1'}
    }else if(url===base+'/scale1/revise'){
      draft={...draft,status:'DRAFT',revision:3,authoringVersion:2};data=draft
    }else if(url===base+'/scale1/versions')data={list:[{releaseId:'release1',version:'v1',publishedAt:'2026-10-21',status:'PUBLISHED',authoringVersion:1}]}
    else throw new Error('Unexpected request '+url+' '+init?.method)
    return {ok:true,json:async()=>({code:0,data})} as Response
  })
  vi.stubGlobal('fetch',fetcher);render(<SurveyBuilder projectId="p1" projectStatus={projectStatus}/>)
  return fetcher
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
describe('Survey authoring publication entry',()=>{
  it('publishes the saved revision and explicitly revises without modifying old releases',async()=>{
    const fetcher=fixture()
    fireEvent.click(await screen.findByRole('button',{name:/自编量表 SCALE/}))
    fireEvent.click(await screen.findByRole('button',{name:'发布测量版本'}))
    await screen.findByText('测量版本已发布供本项目自用；未创建波次、启动采集或进入共用库。')
    expect(screen.getByLabelText('研究工具名称')).toHaveAttribute('readonly')
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST').map(([url,init])=>[url,JSON.parse(init!.body as string)])).toEqual([[base+'/scale1/measurement-release',{revision:2}]])
    fireEvent.click(screen.getByRole('button',{name:'查看已发布版本'}))
    await screen.findByText(/v1 · PUBLISHED/)
    fireEvent.click(screen.getByRole('button',{name:'修订新版本'}))
    await screen.findByText('已建立下一版本草稿；原发布版本、报告和波次保持不变。')
    expect(screen.getByLabelText('研究工具名称')).not.toHaveAttribute('readonly')
    expect(screen.getByText('编制版本 v2 · 编辑修订 3')).toBeInTheDocument()
    expect(fetcher.mock.calls.some(([url,init])=>url.endsWith('/revise')&&init?.body===JSON.stringify({revision:2}))).toBe(true)
  })
  it('blocks publication of unsaved edits and in closed projects',async()=>{
    fixture()
    fireEvent.click(await screen.findByRole('button',{name:/自编量表 SCALE/}))
    fireEvent.change(await screen.findByLabelText('研究工具名称'),{target:{value:'未保存'}})
    expect(screen.getByRole('button',{name:'发布测量版本'})).toBeDisabled()
    cleanup();fixture('CLOSED')
    fireEvent.click(await screen.findByRole('button',{name:/自编量表 SCALE/}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'发布测量版本'})).toBeDisabled())
  })
})
