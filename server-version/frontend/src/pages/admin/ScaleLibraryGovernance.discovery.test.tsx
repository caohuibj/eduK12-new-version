import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {expect,it,vi} from 'vitest'
const api=vi.hoisted(()=>({capabilities:vi.fn(),submissions:vi.fn(),catalog:vi.fn(),grant:vi.fn()}))
vi.mock('../../api/scaleLibraryGovernance',async()=>({...await vi.importActual('../../api/scaleLibraryGovernance'),governanceApi:()=>api}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>({user:{platformRole:'STANDARD'}})}))
import ScaleLibraryGovernance from './ScaleLibraryGovernance'
import {EMPTY_CATALOG_FACETS} from '../../api/catalogDiscovery'
it('uses shared server filtering across pages instead of hiding returned rows with a local title search',async()=>{
 api.capabilities.mockResolvedValue({systemAdmin:false,reviewGrants:[],distributionGrants:[]});api.submissions.mockResolvedValue({list:[]})
 const row={catalogId:'exact',origin:'STANDARD_REGISTRY',title:'远端命中',exactVersion:{instrumentKey:'registered',instrumentVersion:'1.0.0'},availability:{status:'RESTRICTED',reasons:[]},authorization:{mechanism:'DEPLOYMENT_AND_USE_GRANT',requiresRuntimeCheck:true,useGrantStatus:'NOT_EVALUATED'},classificationTags:[{id:'MOTIVATION',label:'学习动机',facet:'domain'}]}
 api.catalog.mockImplementation(async(page=1)=>({list:[row],page,hasMore:page===1,tagFacets:{...EMPTY_CATALOG_FACETS,domain:[{id:'MOTIVATION',label:'学习动机'}]}}))
 render(<MemoryRouter><ScaleLibraryGovernance/></MemoryRouter>);await screen.findByText('远端命中 · 标准量表（只读）')
 fireEvent.click(screen.getByRole('button',{name:'目录下一页'}));await waitFor(()=>expect(api.catalog).toHaveBeenCalledWith(2))
 const search=within(screen.getByRole('search',{name:'公共量表总汇检索'}))
 fireEvent.change(search.getByLabelText('关键词'),{target:{value:'  标签匹配  '}})
 fireEvent.change(search.getByLabelText('领域'),{target:{value:'MOTIVATION'}})
 fireEvent.click(search.getByRole('button',{name:'检索'}))
 await waitFor(()=>expect(api.catalog).toHaveBeenCalledWith(1,25,expect.objectContaining({keyword:'标签匹配',domain:'MOTIVATION'})))
 await screen.findByText('远端命中 · 标准量表（只读）')
 expect(api.grant).not.toHaveBeenCalled()
})
