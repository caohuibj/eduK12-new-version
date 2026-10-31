import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import ScaleComponentManager from './ScaleComponentManager'
import {componentContentPlaceholder} from '../../api/scaleComponentImport'
import {SCALE_BATCH_TEMPLATE} from '../../../../backend/src/modules/scale/component-import/synthetic-template'
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
afterEach(()=>vi.restoreAllMocks())
async function draftWorkspace(){fireEvent.click(screen.getByRole('tab',{name:'草稿与版本'}));return screen.findByRole('button',{name:'编辑／查看 仅报告草稿'})}
describe('minimal system administrator component workspace',()=>{
 it('filters pending intake drafts on the current page without creating a catalog draft',async()=>{
  mocks.api.mockResolvedValue({list:[draft,{...draft,id:'other',toolKey:'unrelated',configurationName:'无关草稿'}],hasMore:false})
  render(<ScaleComponentManager actorId="system" initialIntake={{target:{instrumentKey:'example',instrumentVersion:'1.0.0',name:'待审来源'},workspace:'drafts'}}/>)
  expect(screen.getByRole('tab',{name:'草稿与版本'})).toHaveAttribute('aria-selected','true')
  expect(await screen.findByRole('button',{name:'编辑／查看 仅报告草稿'})).toBeVisible()
  expect(screen.queryByRole('button',{name:'编辑／查看 无关草稿'})).not.toBeInTheDocument()
  expect(screen.getByText(/不会从目录自动创建草稿、补造计分或发布/)).toBeVisible()
  expect(mocks.api).toHaveBeenCalledExactlyOnceWith('/component-drafts?page=1')
  expect(mocks.upload).not.toHaveBeenCalled()
 })
 it('keeps an independent R draft editable while preventing incomplete publication',async()=>{
  render(<ScaleComponentManager actorId="system"/>);fireEvent.click(await draftWorkspace())
  expect(await screen.findByLabelText('完整组分定义 JSON')).not.toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'预览拟发布组合'}))
  expect(await screen.findByText('尚无 C，组分已保留')).toBeVisible()
  expect(screen.getByRole('button',{name:'发布并自动试运行'})).toBeDisabled()
  expect(mocks.api.mock.calls.some(c=>String(c[0]).endsWith('/publish'))).toBe(false)
 })
 it('saves the current revision and invalidates a previous preview after an edit',async()=>{
  render(<ScaleComponentManager actorId="system"/>);fireEvent.click(await draftWorkspace())
  const json=await screen.findByLabelText('完整组分定义 JSON')
  fireEvent.click(screen.getByRole('button',{name:/高级定义 · 完整 JSON/}))
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
  render(<ScaleComponentManager actorId="system"/>);fireEvent.click(await draftWorkspace())
  const json=await screen.findByLabelText('完整组分定义 JSON');fireEvent.click(screen.getByRole('button',{name:/高级定义 · 完整 JSON/}));fireEvent.change(json,{target:{value:'{}'}})
  expect(json).toHaveValue('{}');expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('必需结构不完整')
 })
 it('opens a saved import result directly and focuses the selected draft without resubmitting',async()=>{
  const preview={digest:'d'.repeat(64),entries:[{index:0,toolKey:'example',configurationName:draft.configurationName,changedParts:['REPORT'],issues:[]}]}
  mocks.upload.mockResolvedValueOnce(preview).mockResolvedValueOnce({...preview,entries:[{...preview.entries[0],status:'IMPORTED',draft}]})
  render(<ScaleComponentManager actorId="system"/>);fireEvent.change(screen.getByLabelText('上传 Excel'),{target:{files:[new File(['synthetic'],'one.xlsx')]}})
  fireEvent.click(screen.getByRole('button',{name:'预览导入'}));await screen.findByText('1 项 · 1 项可保存 · 0 项需处理')
  fireEvent.click(screen.getByRole('button',{name:'确认保存有效条目'}))
  fireEvent.click(await screen.findByRole('button',{name:'打开草稿 仅报告草稿'}))
  expect(await screen.findByRole('heading',{name:'仅报告草稿',level:3})).toHaveFocus()
  expect(screen.getByRole('tab',{name:'草稿与版本'})).toHaveAttribute('aria-selected','true')
  expect(mocks.upload).toHaveBeenCalledTimes(2)
 })
 it('supports keyboard task navigation and clearly filters only the current page without new requests',async()=>{
  render(<ScaleComponentManager actorId="system"/>);const tab=screen.getByRole('tab',{name:'批量导入'});tab.focus();fireEvent.keyDown(tab,{key:'ArrowRight'})
  expect(screen.getByRole('tab',{name:'草稿与版本'})).toHaveFocus();await screen.findByRole('button',{name:'编辑／查看 仅报告草稿'})
  const calls=mocks.api.mock.calls.length
  fireEvent.change(screen.getByLabelText('筛选本页草稿'),{target:{value:'does-not-exist'}})
  expect(screen.getByText('本页没有匹配的草稿')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'清除筛选'}));expect(screen.getByRole('button',{name:'编辑／查看 仅报告草稿'})).toBeVisible()
  expect(mocks.api).toHaveBeenCalledTimes(calls)
 })
 it('edits guidance using normal fields while preserving the complete C source and metadata',async()=>{
  const source=SCALE_BATCH_TEMPLATE.sources[0],content={version:'1.0.0',definition:componentContentPlaceholder(JSON.parse(JSON.stringify(source.executable.definition))),metadata:{title:'合成量表',instruction:{...source.instruction},catalog:source.catalog}}
  const cDraft={...draft,changedParts:{CONTENT:content,REPORT:draft.changedParts.REPORT}}
  const previous=mocks.api.getMockImplementation()!
  mocks.api.mockImplementation(async(path:string,body?:{draft:object})=>path==='/component-drafts/draft1'?body?{...cDraft,...body.draft,revision:4}:cDraft:previous(path,body))
  render(<ScaleComponentManager actorId="system"/>);fireEvent.click(await draftWorkspace())
  const guide=await screen.findByLabelText('指导语');fireEvent.change(guide,{target:{value:'修订后的合成指导语'}})
  fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
  await waitFor(()=>expect(mocks.api).toHaveBeenCalledWith('/component-drafts/draft1',{expectedRevision:3,draft:{toolKey:draft.toolKey,configurationName:draft.configurationName,baseCombination:null,changedParts:{...cDraft.changedParts,CONTENT:{...content,metadata:{...content.metadata,instruction:{...content.metadata.instruction,text:'修订后的合成指导语'}}}}}}))
 })
 it('distinguishes an explicit no-P choice from an absent inherited P in the saved document',async()=>{
  render(<ScaleComponentManager actorId="system"/>);fireEvent.click(await draftWorkspace())
  fireEvent.click(await screen.findByRole('button',{name:'明确不配置参数'}));fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
  await waitFor(()=>expect(mocks.api).toHaveBeenCalledWith('/component-drafts/draft1',{expectedRevision:3,draft:{toolKey:draft.toolKey,configurationName:draft.configurationName,baseCombination:null,changedParts:{REPORT:draft.changedParts.REPORT,PARAMETERS:{version:'none-v1',payload:null}}}}))
 })
 it('lets a frozen configuration expose its full definition for reading while keeping all writes disabled',async()=>{
  const previous=mocks.api.getMockImplementation()!
  mocks.api.mockImplementation(async(path:string,body?:unknown)=>path==='/component-drafts/draft1'?{...draft,publishedReleaseId:'frozen-release'}:previous(path,body))
  render(<ScaleComponentManager actorId="system"/>);fireEvent.click(await draftWorkspace())
  const toggle=await screen.findByRole('button',{name:/高级定义 · 完整 JSON/});expect(toggle).toBeEnabled();fireEvent.click(toggle)
  expect(screen.getByLabelText('完整组分定义 JSON')).toBeVisible();expect(screen.getByLabelText('完整组分定义 JSON')).toHaveAttribute('readonly')
  expect(screen.queryByRole('button',{name:'保存草稿'})).not.toBeInTheDocument()
  expect(screen.getByLabelText('配置名称')).toBeDisabled()
  expect(screen.getByRole('button',{name:'从已冻结配置创建新版本'})).toBeEnabled()
 })
})
