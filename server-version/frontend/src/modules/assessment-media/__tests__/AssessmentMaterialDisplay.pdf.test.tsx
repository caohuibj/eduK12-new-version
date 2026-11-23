import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {AssessmentMaterialDisplay} from '../AssessmentMaterialDisplay'
const urls=vi.hoisted(()=>({create:vi.fn(),revoke:vi.fn()}))
vi.mock('../../../components/PdfViewer',()=>({default:({isOpen,url,title,onClose}:{isOpen:boolean;url:string;title:string;onClose:()=>void})=>isOpen?<section role="dialog" aria-label="安全PDF预览"><h2>{title}</h2><output>{url}</output><button onClick={onClose}>关闭PDF预览</button></section>:null}))
const item={asset:{assetId:'fixed-pdf',contentHash:'a'.repeat(64),mimeType:'application/pdf' as const},name:'固定文档'}
const pdfResponse=()=>({ok:true,headers:new Headers({'Content-Type':'application/pdf'}),blob:async()=>new Blob(['%PDF-1.4 synthetic'],{type:'application/pdf'})} as Response)
beforeEach(()=>{urls.create.mockReset().mockReturnValue('blob:verified-pdf');urls.revoke.mockReset();const OriginalURL=URL;vi.stubGlobal('URL',class extends OriginalURL{static createObjectURL=urls.create;static revokeObjectURL=urls.revoke})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('shared assessment PDF viewer lifecycle',()=>{
 it('uses only the validated blob and revokes it when the PDF modal closes',async()=>{
  const load=vi.fn().mockResolvedValue(pdfResponse())
  render(<AssessmentMaterialDisplay item={item} load={load}/>)
  fireEvent.click(screen.getByRole('button',{name:'查看PDF 文档'}))
  expect(await screen.findByRole('link',{name:'在新窗口查看 PDF'})).toHaveAttribute('href','blob:verified-pdf')
  expect(screen.getByRole('link',{name:'下载 PDF 文档'})).toHaveAttribute('download','固定文档.pdf')
  fireEvent.click(screen.getByRole('button',{name:'在页面预览 PDF'}))
  expect(await screen.findByRole('dialog',{name:'安全PDF预览'})).toHaveTextContent('blob:verified-pdf')
  expect(load).toHaveBeenCalledWith(item.asset,expect.any(AbortSignal))
  expect(document.querySelector('iframe')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'关闭PDF预览'}))
  await waitFor(()=>expect(urls.revoke).toHaveBeenCalledExactlyOnceWith('blob:verified-pdf'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 })
 it('aborts a pending protected fetch on unmount and never creates a late object URL',async()=>{
  let finish!:(response:Response)=>void
  const load=vi.fn().mockReturnValue(new Promise<Response>(resolve=>{finish=resolve}))
  const view=render(<AssessmentMaterialDisplay item={item} load={load}/>)
  fireEvent.click(screen.getByRole('button',{name:'查看PDF 文档'}));await waitFor(()=>expect(load).toHaveBeenCalledOnce())
  const signal=load.mock.calls[0][1] as AbortSignal
  view.unmount();expect(signal.aborted).toBe(true)
  finish(pdfResponse());await new Promise(resolve=>setTimeout(resolve,0))
  expect(urls.create).not.toHaveBeenCalled()
 })
})
