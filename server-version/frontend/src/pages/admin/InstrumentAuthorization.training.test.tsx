import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import InstrumentAuthorization from './InstrumentAuthorization'
const api=vi.hoisted(()=>({list:vi.fn(),create:vi.fn(),approve:vi.fn(),publishPreviewScale:vi.fn()}))
vi.mock('../../api/instrumentAuthorizations',()=>({instrumentAuthorizationApi:api}))
const row={authorizationId:'auth-1',version:1,instrumentKey:'demo',instrumentVersion:'2',status:'DRAFT',scope:{commercialNature:'NON_COMMERCIAL'}}
beforeEach(()=>{vi.clearAllMocks();api.list.mockResolvedValue({code:0,data:{list:[row]}});api.create.mockResolvedValue({code:0});api.approve.mockResolvedValue({code:0});api.publishPreviewScale.mockResolvedValue({code:0,data:{identity:{},blockers:[]}})})
describe('Training content rights integration',()=>{
 it('retains declaration approval and blocks duplicate submissions',async()=>{
  let resolve!:(value:unknown)=>void;api.approve.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  render(<InstrumentAuthorization training/>);await screen.findByText('demo')
  fireEvent.click(screen.getByText('批准管理',{selector:'summary'}))
  fireEvent.change(screen.getByLabelText('自批确认声明'),{target:{value:'已核对合法授权依据'}})
  const approve=screen.getByRole('button',{name:'批准 demo 2 授权版本 1'});fireEvent.click(approve);fireEvent.click(approve)
  expect(api.approve).toHaveBeenCalledExactlyOnceWith('auth-1','已核对合法授权依据');expect(approve).toBeDisabled()
  await act(async()=>resolve({code:0}));await waitFor(()=>expect(approve).toBeEnabled())
 })
 it('validates blank rights fields instead of inventing legal identities',async()=>{
  render(<InstrumentAuthorization training/>);await screen.findByText('demo');fireEvent.click(screen.getByRole('button',{name:'新建授权草稿'}));fireEvent.click(screen.getByRole('button',{name:'创建授权草稿'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('请填写');expect(api.create).not.toHaveBeenCalled();expect(screen.getByPlaceholderText('授权方 grantor')).toHaveValue('')
 })
 it('filters rights records without affecting the underlying authorization collection',async()=>{
  render(<InstrumentAuthorization training/>);await screen.findByText('demo')
  const heading=screen.getByRole('heading',{name:'内容权利授权'}).closest('header')!
  const search=within(heading).getByRole('button',{name:'权利检索'})
  expect(search).toHaveAttribute('aria-expanded','false');expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  expect(within(heading).getByRole('button',{name:'刷新权利'})).toBeVisible()
  fireEvent.click(search);expect(screen.getByRole('searchbox')).toHaveFocus()
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'does-not-exist'}});expect(screen.queryByText('demo')).not.toBeInTheDocument();expect(screen.getByText('未找到匹配权利记录')).toBeVisible()
  fireEvent.keyDown(screen.getByRole('searchbox'),{key:'Escape'});expect(search).toHaveFocus();expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  fireEvent.click(search);expect(screen.getByRole('searchbox')).toHaveValue('does-not-exist')
  fireEvent.pointerDown(screen.getByRole('heading',{name:'内容权利授权'}));expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  fireEvent.click(search);fireEvent.click(screen.getByRole('button',{name:'重置'}));expect(screen.getByText('demo')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'完成'}));expect(search).toHaveFocus();expect(api.list).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button',{name:'刷新权利'}));await waitFor(()=>expect(api.list).toHaveBeenCalledTimes(2))
  expect(api.create).not.toHaveBeenCalled();expect(api.approve).not.toHaveBeenCalled()
 })
 it('keeps complete rights metadata visible while approval declarations and preview tools are collapsed',async()=>{
  render(<InstrumentAuthorization training/>);const tr=(await screen.findByText('demo')).closest('tr')!
  for(const value of ['demo','2','DRAFT','NON_COMMERCIAL','v1'])expect(within(tr).getByText(value)).toBeVisible()
  const action=within(tr).getByText('批准管理',{selector:'summary'})
  expect(action.closest('details')).not.toHaveAttribute('open')
  expect(within(tr).getByText('批准',{selector:'button'})).not.toBeVisible()
  expect(screen.getByText('预览发布条件',{selector:'button'})).not.toBeVisible()
  fireEvent.click(action);expect(screen.getByLabelText('自批确认声明')).toBeVisible();expect(screen.getByLabelText('自批确认声明')).toHaveValue('')
  fireEvent.click(action);expect(within(tr).getByText('批准',{selector:'button'})).not.toBeVisible()
  fireEvent.click(screen.getByText('发布条件预览',{selector:'summary'}));expect(screen.getByRole('button',{name:'预览发布条件'})).toBeVisible()
  expect(api.approve).not.toHaveBeenCalled();expect(api.publishPreviewScale).not.toHaveBeenCalled()
 })

})
