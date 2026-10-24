import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyToolTemplateEditor} from './SurveyToolTemplateEditor'
const loads=vi.hoisted(()=>({form:vi.fn(),scale:vi.fn(),composition:vi.fn(),preview:vi.fn()}))
vi.mock('./ResearchFormEditor',()=>{loads.form();return {ResearchFormEditor:()=> <p>Loaded form editor</p>}})
vi.mock('./ResearchScaleEditor',()=>{loads.scale();return {ResearchScaleEditor:()=> <p>Loaded scale editor</p>}})
vi.mock('./SurveyCompositionEditor',()=>{loads.composition();return {SurveyCompositionEditor:()=> <p>Loaded composition editor</p>}})
vi.mock('./ResearchPreview',()=>{loads.preview();return {ResearchPreview:()=> <p>Loaded answer preview</p>}})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('tool editor kind and preview loading',()=>{
  it('loads only the selected kind, then loads preview after validation',async()=>{
    const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
      const url=String(input)
      const data=url.endsWith('/auth/csrf')?{csrfToken:'synthetic'}:url.endsWith('/validate')?{ok:true,issues:[]}:
        {id:'form',kind:'FORM',title:'Synthetic form',revision:1,status:'DRAFT',readiness:'DRAFT',updatedAt:'2026-10-24',definition:{schemaVersion:1,pages:[]}}
      return {ok:true,json:async()=>({code:0,data})} as Response
    })
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyToolTemplateEditor id="form" onReturn={()=>{}}/>)
    await screen.findByText('Loaded form editor')
    expect(loads.form).toHaveBeenCalledOnce()
    expect(loads.scale).not.toHaveBeenCalled()
    expect(loads.composition).not.toHaveBeenCalled()
    expect(loads.preview).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button',{name:'检查与试答'}))
    await screen.findByText('Loaded answer preview')
    expect(loads.preview).toHaveBeenCalledOnce()
    expect(loads.scale).not.toHaveBeenCalled()
    expect(loads.composition).not.toHaveBeenCalled()
  })
})
