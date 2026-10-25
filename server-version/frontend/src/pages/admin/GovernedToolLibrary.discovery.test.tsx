import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}))
vi.mock('../../api/surveyGovernance',async()=>({...await vi.importActual('../../api/surveyGovernance'),governedRequest:mocks.read}))
vi.mock('../../api/surveyManagement',()=>({surveyManagementRequest:mocks.write}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>({user:{platformRole:'STANDARD'}})}))
import GovernedToolLibrary from './GovernedToolLibrary'
import {EMPTY_CATALOG_FACETS} from '../../api/catalogDiscovery'
const row=(title:string)=>({id:title,family:'COGNITIVE',title,toolVersion:'1',state:'ONLINE',hash:'hash',version:1,blockers:[],versions:{content:'1',parameters:null,report:null},components:[],classificationTags:[{id:'cognitive-domain:response_inhibition',label:'反应抑制',facet:'domain'}],policy:{decision:'APPROVED',version:1,paused:false},policyIdentity:{resourceKey:'governed-release:'+title,fingerprint:'hash'},states:{content:{ready:true,reasons:[]},assignment:{ready:true,reasons:[]},deployment:{ready:false,reasons:[]}}})
const page=(title:string)=>({list:[row(title)],hasMore:false,tagFacets:{...EMPTY_CATALOG_FACETS,domain:[{id:'cognitive-domain:response_inhibition',label:'反应抑制'}]}})
beforeEach(()=>{vi.resetAllMocks()})
describe('cognitive classification management',()=>{
 it('ignores an older response after a new query and clears stale actions on failed refresh',async()=>{
  let resolve!:(data:unknown)=>void
  mocks.read.mockReturnValueOnce(new Promise(done=>{resolve=done})).mockResolvedValueOnce(page('new result')).mockRejectedValueOnce(new Error('synthetic read failure'))
  render(<MemoryRouter><GovernedToolLibrary/></MemoryRouter>)
  const search=within(screen.getByRole('search',{name:'认知及其他工具目录检索'}))
  fireEvent.change(search.getByLabelText('关键词'),{target:{value:'反应抑制'}});fireEvent.click(search.getByRole('button',{name:'检索'}))
  await screen.findByRole('heading',{name:'new result'})
  await act(async()=>resolve(page('old result')))
  expect(screen.queryByRole('heading',{name:'old result'})).not.toBeInTheDocument()
  expect(mocks.read.mock.calls[1][1]).toContain('keyword=%E5%8F%8D%E5%BA%94%E6%8A%91%E5%88%B6')
  expect(mocks.write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'刷新目录（只读）'}));await screen.findByRole('alert')
  expect(screen.queryByRole('heading',{name:'new result'})).not.toBeInTheDocument()
 })
 it('preserves an acknowledged scope update when only its read refresh fails and never auto repeats it',async()=>{
  mocks.read.mockResolvedValueOnce(page('exact task')).mockRejectedValueOnce(new Error('refresh unavailable'));mocks.write.mockResolvedValue({})
  render(<MemoryRouter><GovernedToolLibrary/></MemoryRouter>);await screen.findByRole('heading',{name:'exact task'})
  fireEvent.change(screen.getByLabelText('本次范围审批或暂停原因'),{target:{value:'synthetic pause'}})
  fireEvent.click(screen.getByText('状态、详情与操作'));fireEvent.click(screen.getByRole('button',{name:'暂停 Survey 新使用'}))
  await screen.findByText('仅更新 Survey 使用范围，未分配任何研究者授权。')
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('目录读取失败'))
  expect(mocks.write).toHaveBeenCalledTimes(1)
  expect(mocks.write).toHaveBeenCalledWith('survey-library','/policies',{resourceKey:'governed-release:exact task',fingerprint:'hash',expectedVersion:1,decision:'APPROVED',paused:true,reason:'synthetic pause'})
 })
})
