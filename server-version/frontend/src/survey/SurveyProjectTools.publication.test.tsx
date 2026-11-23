import {afterEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {SurveyProjectTools} from './SurveyProjectTools'
import type {InstrumentLibrary} from './instrument-library'

vi.mock('./instrument-library',()=>({useInstrumentLibrary:()=>({list:[],page:1,loading:false,error:'',refresh:vi.fn()})}))
type TestTool={id:string;title:string;kind:string;status:string;revision:number;measurementReleaseId:string|null}
const scale:TestTool={id:'scale 1',title:'本研究量表',kind:'SCALE',status:'DRAFT',revision:4,measurementReleaseId:null}
function setup(options:{tools?:TestTool[];before?:()=>boolean;refreshFails?:boolean;reject?:boolean}={}){
 const changed=vi.fn(options.refreshFails?()=>Promise.reject(new Error('列表读取失败')):()=>Promise.resolve())
 const onLeaveRiskChange=vi.fn()
 const fetcher=vi.fn(async(path:RequestInfo|URL)=>{
  if(String(path).endsWith('/auth/csrf'))return {ok:true,json:async()=>({code:0,data:{csrfToken:'csrf-test'}})}
  return options.reject?{ok:false,json:async()=>({code:409,message:'保存的修订已变化'})}:{ok:true,json:async()=>({code:0,data:{releaseId:'exact-release'}})}
 })
 vi.stubGlobal('fetch',fetcher)
 render(<SurveyProjectTools projectId="project 1" projectStatus="DRAFT" instrumentLibrary={{changed} as unknown as InstrumentLibrary}
  selectedTools={options.tools??[scale]} selectionIds={(options.tools??[scale]).map(t=>t.id)}
  onLeaveRiskChange={onLeaveRiskChange} onNavigateLibrary={vi.fn()} onBeforeSelect={options.before}/>)
 return {changed,fetcher,onLeaveRiskChange}
}
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('Survey project measurement publication in the normal selection path',()=>{
 it('explicitly publishes the exact saved Scale revision with CSRF before any wave freeze',async()=>{
  const {fetcher,changed,onLeaveRiskChange}=setup()
  fireEvent.click(screen.getByRole('button',{name:'发布测量版本：本研究量表'}))
  await screen.findByText(/“本研究量表”的测量版本已发布/)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher).toHaveBeenLastCalledWith('/api/survey/projects/project%201/instruments/scale%201/measurement-release',expect.objectContaining({method:'POST',headers:expect.objectContaining({'X-CSRF-Token':'csrf-test'}),body:JSON.stringify({revision:4})}))
  expect(changed).toHaveBeenCalledOnce()
  expect(onLeaveRiskChange).toHaveBeenCalledWith({dirty:false,busy:true})
  await waitFor(()=>expect(onLeaveRiskChange).toHaveBeenLastCalledWith({dirty:false,busy:false}))
  expect(screen.queryByRole('button',{name:'发布测量版本：本研究量表'})).not.toBeInTheDocument()
 })
 it('keeps an acknowledged release successful when refreshing the list fails, with no republish action',async()=>{
  const {fetcher}=setup({refreshFails:true})
  fireEvent.click(screen.getByRole('button',{name:'发布测量版本：本研究量表'}))
  await screen.findByText(/测量版本已发布；波次仍须检查与冻结/)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'发布测量版本：本研究量表'})).not.toBeInTheDocument()
 })
 it('preserves revision conflict as a failure and releases the UI lock for a deliberate retry',async()=>{
  const {changed,onLeaveRiskChange}=setup({reject:true})
  fireEvent.click(screen.getByRole('button',{name:'发布测量版本：本研究量表'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存的修订已变化')
  expect(changed).not.toHaveBeenCalled()
  expect(screen.getByRole('button',{name:'发布测量版本：本研究量表'})).toBeEnabled()
  expect(screen.queryByText(/测量版本已发布；波次仍须检查与冻结/)).not.toBeInTheDocument()
  expect(onLeaveRiskChange).toHaveBeenLastCalledWith({dirty:false,busy:false})
 })
 it('respects the parent pending-action guard before making any request',()=>{
  const {fetcher}=setup({before:()=>false})
  fireEvent.click(screen.getByRole('button',{name:'发布测量版本：本研究量表'}))
  expect(fetcher).not.toHaveBeenCalled()
 })
 it('does not offer measurement publication for Forms or an already released Scale',()=>{
  setup({tools:[{...scale,id:'form',kind:'FORM'},{...scale,id:'released',measurementReleaseId:'existing'}]})
  expect(screen.queryByRole('button',{name:/发布测量版本：/})).not.toBeInTheDocument()
  expect(screen.getByText('测量版本已发布；波次仍须检查与冻结。')).toBeVisible()
 })
})
