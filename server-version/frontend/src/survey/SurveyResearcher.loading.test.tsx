import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyProjectTools} from './SurveyProjectTools'
import {createInstrumentLibrary} from './instrument-library'

const loads=vi.hoisted(()=>({editor:vi.fn(),legacy:vi.fn()}))
vi.mock('./SurveyToolTemplateEditor',()=>{
  loads.editor()
  return {SurveyToolTemplateEditor:()=> <p>Loaded independent editor</p>}
})
vi.mock('./SurveyBuilder',()=>{
  loads.legacy()
  return {SurveyBuilder:({projectId,legacyOnly}:{projectId:string;legacyOnly:boolean})=> <p>Legacy {projectId} {String(legacyOnly)}</p>}
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('researcher tool entry module boundaries',()=>{
  it('does not import editors or fetch picker data until explicitly opened',async()=>{
    const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
      const url=String(input)
      if(!url.includes('/instruments?page=')&&!url.includes('/tool-library?'))throw new Error('Unexpected '+url)
      return {ok:true,json:async()=>({code:0,data:{list:[],total:0}})} as Response
    })
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyProjectTools projectId="p1" projectStatus="DRAFT" instrumentLibrary={createInstrumentLibrary('p1')} onLeaveRiskChange={()=>{}} onNavigateLibrary={()=>{}}/>)
    await screen.findByText('尚未加入工具，点击“从工具集添加”开始选用。')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(loads.editor).not.toHaveBeenCalled()
    expect(loads.legacy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'从工具集添加'}))
    await screen.findByRole('region',{name:'选用研究工具'})
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2))
    expect(loads.editor).not.toHaveBeenCalled()
    expect(loads.legacy).not.toHaveBeenCalled()
    const details=screen.getByText('已加入工具的查看与兼容管理').closest('details')!
    details.open=true;fireEvent(details,new Event('toggle'))
    await screen.findByText('Legacy p1 true')
    expect(loads.legacy).toHaveBeenCalledOnce()
    expect(loads.editor).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('imports the independent editor only after opening a listed tool',async()=>{
    const {SurveyToolLibrary}=await import('./SurveyToolLibrary')
    window.history.replaceState(null,'','/workspace/tools')
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({code:0,data:{list:[{id:'tool',kind:'FORM',title:'Synthetic tool',status:'DRAFT',revision:1}],total:1}})} as Response)))
    render(<SurveyToolLibrary/>)
    await screen.findByRole('heading',{name:'Synthetic tool'})
    expect(loads.editor).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'编辑'}))
    await screen.findByText('Loaded independent editor')
    expect(loads.editor).toHaveBeenCalledOnce()
  })

})
