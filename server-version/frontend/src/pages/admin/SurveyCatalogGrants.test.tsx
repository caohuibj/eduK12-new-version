import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {SurveyCatalogGrants} from './SurveyCatalogGrants'
import type {CatalogApi} from '../../survey/ResearchCatalog'

type SourcePage={page:number;hasMore:boolean;terminalReason:'PAGE_LIMIT_REACHED'|'END_OF_CATALOG'|null;list:ReturnType<typeof sources>}
function sources(page:number,count=25){return Array.from({length:count},(_,i)=>({
  ref:{kind:'SCALE' as const,sourceId:'source-'+((page-1)*25+i+1),sourceVersion:'1'},
  title:'Source '+((page-1)*25+i+1),available:true,
}))}
function deferred<T>(){
  let resolve!:(value:T)=>void,reject!:(reason:Error)=>void
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no})
  return {promise,resolve,reject}
}
const next=()=>screen.getByRole('button',{name:'来源下一页'})
const previous=()=>screen.getByRole('button',{name:'来源上一页'})
const query=()=>screen.getByRole('button',{name:'查询可授权版本'})

it('loads the linked researcher and standard versions without submitting changes',async()=>{
  const subjectId='11260000-0000-4000-8000-000000000001'
  const target={id:subjectId,username:'Linked Researcher',status:'ACTIVE'}
  const version=(key:string,title:string)=>({
    ref:{kind:'SCALE',sourceId:'survey-standard:'+subjectId,sourceVersion:'1'},title,available:true,
    configuration:{toolKey:key,instrumentVersion:'1',report:null,axes:{CONTENT:'1',PARAMETERS:'1',REPORT:'1'}},
  })
  const api=vi.fn(async(path:string)=>path.startsWith('/researchers?')
    ?{list:[target]}
    :{page:1,hasMore:false,terminalReason:null,list:[version('licensed_scale','Linked Version'),version('different_scale','Other Version')]})
  render(<SurveyCatalogGrants api={api as CatalogApi} password="" researchers={[]} initialStandard={{subjectId,toolKey:'licensed_scale'}}/>)
  expect(await screen.findByRole('heading',{name:'Linked Version'})).toBeVisible()
  expect(screen.getByLabelText('授权给研究者')).toHaveValue(subjectId)
  expect(screen.queryByRole('heading',{name:'Other Version'})).not.toBeInTheDocument()
  expect(api.mock.calls).toEqual([['/researchers?userId='+subjectId],['/source-catalog?kind=SCALE&page=1&keyword=licensed_scale']])
})

describe('source catalog pagination controls',()=>{
  it('uses server page and hasMore, blocks repeated asynchronous Next clicks, and stops at the 1000-source cap',async()=>{
    const first=deferred<SourcePage>(),last=deferred<SourcePage>()
    const api=vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise)
    render(<SurveyCatalogGrants api={api as CatalogApi} password="password" researchers={[]}/>)
    expect(next()).toBeDisabled();expect(previous()).toBeDisabled()
    fireEvent.click(query())
    expect(query()).toBeDisabled();expect(screen.getByLabelText('来源类型')).toBeDisabled()
    await act(async()=>first.resolve({page:39,hasMore:true,terminalReason:null,list:sources(39)}))
    expect(screen.getByText('来源第 39 页')).toBeInTheDocument()
    expect(next()).toBeEnabled()
    fireEvent.click(next());fireEvent.click(next())
    expect(api).toHaveBeenCalledTimes(2)
    expect(api).toHaveBeenLastCalledWith('/source-catalog?kind=SCALE&page=40')
    expect(next()).toBeDisabled();expect(previous()).toBeDisabled()
    expect(screen.getByText('来源第 39 页')).toBeInTheDocument()
    await act(async()=>last.resolve({page:40,hasMore:false,terminalReason:'PAGE_LIMIT_REACHED',list:sources(40)}))
    expect(screen.getByText('来源第 40 页')).toBeInTheDocument()
    expect(screen.queryByRole('heading',{name:'Source 951'})).not.toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'Source 976'})).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('每类最多显示前 1000 个版本，仍有更多版本未显示')
    expect(next()).toBeDisabled();expect(previous()).toBeEnabled()
    fireEvent.click(next())
    expect(api).toHaveBeenCalledTimes(2)
  })
  it.each([25,12,0])('respects the server terminal state for a page with %i rows',async(count)=>{
    const api=vi.fn().mockResolvedValue({page:40,hasMore:false,terminalReason:'END_OF_CATALOG',list:sources(40,count)})
    render(<SurveyCatalogGrants api={api as CatalogApi} password="password" researchers={[]}/>)
    fireEvent.click(query())
    await waitFor(()=>expect(query()).toBeEnabled())
    expect(screen.getByText('来源第 40 页')).toBeInTheDocument()
    expect(next()).toBeDisabled();expect(previous()).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent(count?'已到达来源目录末页':'当前页没有可授权版本')
    expect(screen.queryByText(/仍有更多版本未显示/)).not.toBeInTheDocument()
    fireEvent.click(next());expect(api).toHaveBeenCalledTimes(1)
  })
  it('resets rows, page and terminal metadata on a type change, then queries that type from page 1',async()=>{
    const form=deferred<SourcePage>()
    const api=vi.fn().mockResolvedValueOnce({page:40,hasMore:false,terminalReason:'PAGE_LIMIT_REACHED',list:sources(40)}).mockReturnValueOnce(form.promise)
    render(<SurveyCatalogGrants api={api as CatalogApi} password="password" researchers={[]}/>)
    fireEvent.click(query())
    await waitFor(()=>expect(query()).toBeEnabled())
    fireEvent.change(screen.getByLabelText('来源类型'),{target:{value:'FORM'}})
    expect(screen.getByText('来源第 1 页')).toBeInTheDocument()
    expect(screen.queryByRole('heading',{name:'Source 976'})).not.toBeInTheDocument()
    expect(screen.queryByText(/仍有更多版本未显示/)).not.toBeInTheDocument()
    expect(next()).toBeDisabled();expect(previous()).toBeDisabled()
    expect(api).toHaveBeenCalledTimes(1)
    fireEvent.click(query())
    expect(api).toHaveBeenLastCalledWith('/source-catalog?kind=FORM&page=1')
    expect(screen.getByLabelText('来源类型')).toBeDisabled()
    await act(async()=>form.resolve({page:1,hasMore:false,terminalReason:'END_OF_CATALOG',list:[]}))
    expect(screen.getByText('来源第 1 页')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('当前页没有可授权版本')
    expect(next()).toBeDisabled()
  })
  it('keeps the accepted page on a failed Next, retries that same page, and refreshes from page 1',async()=>{
    const failed=deferred<SourcePage>(),retry=deferred<SourcePage>()
    const api=vi.fn().mockResolvedValueOnce({page:39,hasMore:true,terminalReason:null,list:sources(39)})
      .mockReturnValueOnce(failed.promise).mockReturnValueOnce(retry.promise)
      .mockResolvedValueOnce({page:1,hasMore:true,terminalReason:null,list:sources(1)})
    render(<SurveyCatalogGrants api={api as CatalogApi} password="password" researchers={[]}/>)
    fireEvent.click(query())
    await waitFor(()=>expect(next()).toBeEnabled())
    fireEvent.click(next())
    await act(async()=>failed.reject(new Error('目录暂时不可用')))
    expect(screen.getByRole('alert')).toHaveTextContent('目录暂时不可用')
    expect(screen.getByText('来源第 39 页')).toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'Source 951'})).toBeInTheDocument()
    fireEvent.click(next())
    expect(api.mock.calls.slice(1).map(call=>call[0])).toEqual(['/source-catalog?kind=SCALE&page=40','/source-catalog?kind=SCALE&page=40'])
    await act(async()=>retry.resolve({page:40,hasMore:false,terminalReason:'PAGE_LIMIT_REACHED',list:sources(40)}))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(query())
    await waitFor(()=>expect(screen.getByText('来源第 1 页')).toBeInTheDocument())
    expect(api).toHaveBeenLastCalledWith('/source-catalog?kind=SCALE&page=1')
    expect(screen.queryByText(/仍有更多版本未显示/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading',{name:'Source 976'})).not.toBeInTheDocument()
    expect(previous()).toBeDisabled();expect(next()).toBeEnabled()
  })
})
