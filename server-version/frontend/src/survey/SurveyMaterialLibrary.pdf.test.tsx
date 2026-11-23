import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {SurveyMaterialLibrary} from './SurveyMaterialLibrary'
vi.mock('../components/shared-ui/ModalSurface',()=>({default:({open,children}:{open:boolean;children:React.ReactNode})=>open?<div>{children}</div>:null}))
vi.mock('../components/PdfViewer',()=>({default:({isOpen,url,title,onClose}:{isOpen:boolean;url:string;title:string;onClose:()=>void})=>isOpen?<section role="dialog" aria-label="安全PDF预览"><h2>{title}</h2><output>{url}</output><button onClick={onClose}>关闭PDF预览</button></section>:null}))
vi.mock('../components/scale-governance/ScaleLibraryMediaPreview',()=>({ScaleLibraryMediaPreview:({context}:{context:{id:string}})=><p>精确版本预览：{context.id}</p>}))
const pdf={id:'owned-pdf',name:'测试文档.pdf',kind:'document',mimeType:'application/pdf',source:'owned',size:1000,updatedAt:'2026-11-23T00:00:00Z'}
const response=(data:unknown)=>Promise.resolve({ok:true,json:async()=>({code:0,data})} as Response)
beforeEach(()=>{window.history.replaceState(null,'','/workspace/media');vi.stubGlobal('fetch',vi.fn(()=>response({list:[pdf],total:1})))})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('Survey PDF preview integration',()=>{
 it('opens the existing safe renderer for an owned PDF and closes it without a sandboxed iframe',async()=>{
  render(<SurveyMaterialLibrary/>);await screen.findByRole('article',{name:pdf.name})
  fireEvent.click(screen.getByRole('button',{name:'预览素材：'+pdf.name}))
  const viewer=await screen.findByRole('dialog',{name:'安全PDF预览'})
  expect(viewer).toHaveTextContent('/api/survey/media-library/owned-pdf/content')
  expect(document.querySelector('iframe')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'关闭PDF预览'}))
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
 })
 it('preserves exact-entry governance for a bound PDF instead of opening the owner endpoint',async()=>{
  vi.stubGlobal('fetch',vi.fn(()=>response({list:[{...pdf,source:'granted',bound:{entryId:'frozen-entry',title:'精确量表',item:{assetId:'owned-pdf'}}}],total:1})))
  render(<SurveyMaterialLibrary/>);await screen.findByRole('article',{name:pdf.name})
  fireEvent.click(screen.getByRole('button',{name:'预览素材：'+pdf.name}))
  expect(await screen.findByText('精确版本预览：frozen-entry')).toBeVisible()
  expect(screen.queryByRole('dialog',{name:'安全PDF预览'})).not.toBeInTheDocument()
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('/owned-pdf/content'))).toBe(false)
 })
})
