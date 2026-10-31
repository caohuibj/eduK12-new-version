import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import ScaleComponentManager from './ScaleComponentManager'
const mocks=vi.hoisted(()=>({api:vi.fn(),upload:vi.fn(),download:vi.fn()}))
vi.mock('../../api/scaleComponentImport',async()=>({...await vi.importActual('../../api/scaleComponentImport'),componentRequest:mocks.api,uploadComponentWorkbook:mocks.upload,downloadComponentTemplate:mocks.download}))
vi.mock('../../admin/AdminStepUp',()=>({default:()=> <p>管理员验证</p>}))
const draft={id:'draft1',revision:3,publishedReleaseId:null,updatedAt:'2026-10-31T00:00:00Z',toolKey:'example',configurationName:'仅报告草稿',baseCombination:null,changedParts:{REPORT:{version:'2.0.0',payload:null}}}
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();mocks.api.mockImplementation(async(path:string,body?:unknown)=>{
 if(path.startsWith('/component-drafts?page='))return {list:[draft],hasMore:false}
 if(path==='/component-drafts/draft1/preview')return {draftId:draft.id,revision:3,previewHash:'a'.repeat(64),configurationName:draft.configurationName,baseCombination:null,changedParts:['REPORT'],inheritedParts:[],blockers:['尚无 C，组分已保留'],parts:{REPORT:{version:'2.0.0',hash:'b'.repeat(64),payload:null}},triplet:null,reviewNotice:'核对参数和报告'}
 if(path==='/component-drafts/draft1')return body?{...draft,revision:4,...(body as {draft:object}).draft}:draft
 throw Error('Unexpected API '+path)
 })})
describe('minimal system administrator component workspace',()=>{
 it('keeps an independent R draft editable while preventing incomplete publication',async()=>{
  render(<ScaleComponentManager actorId="system"/>);fireEvent.click(await screen.findByRole('button',{name:'编辑／查看 仅报告草稿'}))
  await screen.findByLabelText('完整组分定义 JSON')
  fireEvent.click(screen.getByRole('button',{name:'预览拟发布组合'}))
  expect(await screen.findByText('尚无 C，组分已保留')).toBeVisible()
  expect(screen.getByRole('button',{name:'发布并自动试运行'})).toBeDisabled()
  expect(mocks.api.mock.calls.some(c=>String(c[0]).endsWith('/publish'))).toBe(false)
 })
 it('saves the current revision and invalidates a previous preview after an edit',async()=>{
  render(<ScaleComponentManager actorId="system"/>);fireEvent.click(await screen.findByRole('button',{name:'编辑／查看 仅报告草稿'}))
  const json=await screen.findByLabelText('完整组分定义 JSON')
  fireEvent.click(screen.getByRole('button',{name:'预览拟发布组合'}));await screen.findByText('尚无 C，组分已保留')
  const next={...draft,configurationName:'修订报告'};const {id:_,revision:__,publishedReleaseId:___,updatedAt:____,...document}=next
  fireEvent.change(json,{target:{value:JSON.stringify(document)}})
  expect(screen.queryByText('尚无 C，组分已保留')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
  await waitFor(()=>expect(mocks.api).toHaveBeenCalledWith('/component-drafts/draft1',{expectedRevision:3,draft:document}))
  expect(document.changedParts).toEqual({REPORT:{version:'2.0.0',payload:null}})
 })
 it('binds import confirmation to the preview and disables it after changing files',async()=>{
  mocks.upload.mockResolvedValue({digest:'d'.repeat(64),entries:[{index:0,toolKey:'example',changedParts:['REPORT'],issues:[]}]})
  render(<ScaleComponentManager actorId="system"/>);await screen.findByText('版本草稿')
  const upload=screen.getByLabelText('上传 Excel'),first=new File(['synthetic'],'one.xlsx')
  fireEvent.change(upload,{target:{files:[first]}});fireEvent.click(screen.getByRole('button',{name:'预览导入'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'确认保存有效条目'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'确认保存有效条目'}))
  await waitFor(()=>expect(mocks.upload).toHaveBeenCalledWith('save',first,{requestId:expect.any(String),expectedDigest:'d'.repeat(64)}))
  fireEvent.change(upload,{target:{files:[new File(['different'],'two.xlsx')]}})
  expect(screen.getByRole('button',{name:'确认保存有效条目'})).toBeDisabled()
 })
 it('retains incomplete JSON edits without crashing or saving a malformed document',async()=>{
  render(<ScaleComponentManager actorId="system"/>);fireEvent.click(await screen.findByRole('button',{name:'编辑／查看 仅报告草稿'}))
  const json=await screen.findByLabelText('完整组分定义 JSON');fireEvent.change(json,{target:{value:'{}'}})
  expect(json).toHaveValue('{}');expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('必需结构不完整')
 })
})
