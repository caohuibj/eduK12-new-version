import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyReportStudio} from './SurveyReportStudio'
import {SurveyAnalyticsWorkspace} from './SurveyAnalyticsWorkspace'
vi.mock('./SurveyPrivateReferenceStudio',()=>({SurveyPrivateReferenceStudio:()=>null}))
vi.mock('./SurveyStoredReportReader',()=>({SurveyStoredReportReader:()=>null}))
const response=(data:unknown)=>({ok:true,headers:new Headers(),json:async()=>({code:0,data})} as Response)
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done});return {promise,resolve}}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
describe('Survey initial data states',()=>{
  it('does not call pending or failed report reads empty, and allows retry',async()=>{
    const pending=deferred<Response>()
    let retry=false
    const fetcher=vi.fn((url:string)=>{
      if(url.endsWith('/measurements'))return retry?Promise.resolve(response([])):pending.promise
      return Promise.resolve(response([]))
    })
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyReportStudio projectId="p1" nativePublishing={false}/>)
    expect(screen.getByText('正在加载测量版本与报告，请稍候…')).toBeInTheDocument()
    expect(screen.queryByText('暂无报告草稿')).not.toBeInTheDocument()
    expect(screen.queryByText(/暂无本项目获准的测量发布版本/)).not.toBeInTheDocument()
    pending.resolve({ok:false,json:async()=>({code:1,message:'测量读取失败'})} as Response)
    await screen.findByText('测量读取失败')
    expect(screen.queryByText('暂无报告草稿')).not.toBeInTheDocument()
    expect(screen.queryByText(/暂无本项目获准的测量发布版本/)).not.toBeInTheDocument()
    retry=true
    fireEvent.click(screen.getByRole('button',{name:'刷新报告与测量列表'}))
    await screen.findByText('暂无报告草稿')
    expect(screen.getByText(/暂无本项目获准的测量发布版本/)).toBeInTheDocument()
  })
  it('keeps analytics pending distinct from failure and a successful empty project',async()=>{
    const pending=deferred<Response>();let retry=false
    vi.stubGlobal('fetch',vi.fn((url:string)=>url.endsWith('/overview')
      ?retry?Promise.resolve(response({collectionMode:'SINGLE_UNLINKED',waves:[],note:'仅描述'})):pending.promise
      :Promise.resolve(response({list:[]}))))
    render(<SurveyAnalyticsWorkspace projectId="p1"/>)
    expect(screen.getByText('正在加载完成进度…')).toBeInTheDocument()
    expect(screen.queryByText(/本项目暂无研究波次/)).not.toBeInTheDocument()
    pending.resolve({ok:false,status:503,headers:new Headers(),json:async()=>({code:1,message:'暂不可用'})} as Response)
    await screen.findByText(/完成进度加载失败/)
    expect(screen.queryByText(/本项目暂无研究波次/)).not.toBeInTheDocument()
    retry=true;fireEvent.click(screen.getByRole('button',{name:'刷新完成进度'}))
    await screen.findByText(/本项目暂无研究波次/)
    expect(screen.getByText('此页暂无可复核的已完成答卷。')).toBeInTheDocument()
    expect(screen.getByRole('list',{name:'导出操作步骤'})).toBeInTheDocument()
  })
  it('preserves loaded overview on refresh failure and does not auto export',async()=>{
    let fail=false
    const fetcher=vi.fn((url:string)=>{
      if(url.endsWith('/overview'))return Promise.resolve(fail
        ?{ok:false,status:503,headers:new Headers(),json:async()=>({code:1,message:'刷新失败'})} as Response
        :response({collectionMode:'SINGLE_UNLINKED',waves:[{id:'w1',ordinal:1,title:'已读波次',status:'OPEN',starts:2,finalCompleted:1,analysisIncluded:1,qualityExcluded:0,excluded:0}],note:'仅描述'}))
      return Promise.resolve(response({list:[]}))
    })
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyAnalyticsWorkspace projectId="p1"/>)
    await screen.findByRole('rowheader',{name:'T1 · 已读波次'})
    await waitFor(()=>expect(screen.getByRole('button',{name:'刷新完成进度'})).toBeEnabled())
    fail=true;fireEvent.click(screen.getByRole('button',{name:'刷新完成进度'}))
    await screen.findByText(/下方保留上次成功读取的数据/)
    expect(screen.getByRole('rowheader',{name:'T1 · 已读波次'})).toBeInTheDocument()
    expect(fetcher.mock.calls.some(([url])=>url.includes('/exports'))).toBe(false)
  })
})
