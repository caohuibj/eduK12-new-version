import {describe,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {EducationScaleCsvImport} from './EducationScaleCsvImport'
import type {PrivateTool} from './privateToolClient'
const content='item_code,prompt,reverse,score_keys,response_set_key\nQ2,Question,true,total,default'
const tool:PrivateTool={id:'tool',title:'Synthetic',kind:'SCALE',revision:1,contentHash:'a'.repeat(64),definition:{} as PrivateTool['definition']}
const preview={digest:'b'.repeat(64),previewToken:'c'.repeat(64),previewExpiresAt:1792282200000,expectedRevision:1,expectedContentHash:tool.contentHash,
 count:1,totalItems:2,responseSetKey:'default',responseSet:{options:[{value:'yes',label:'Yes',score:1}]},scores:[{key:'total',label:'Total',aggregation:'sum'}],items:[{itemCode:'Q2',content:'Question',reverse:true,scoreKeys:['total']}]}
const props=()=>({api:vi.fn(),organizationId:'org',tool,disabled:false,onImported:vi.fn(),onBusy:vi.fn(),onPendingChange:vi.fn()})
const enter=()=>fireEvent.change(screen.getByLabelText('CSV 内容'),{target:{value:content}})
const start=()=>fireEvent.click(screen.getByRole('button',{name:'预检导入'}))
describe('education CSV component DTO contract',()=>{
 it('previews exact saved revision/hash and applies exact proof through education API',async()=>{
  const p=props(),saved={...tool,revision:2,contentHash:'d'.repeat(64),importedCount:1}
  p.api.mockResolvedValueOnce(preview).mockResolvedValueOnce(saved)
  render(<EducationScaleCsvImport {...p}/>);enter();start()
  expect(p.onPendingChange).toHaveBeenLastCalledWith(true)
  fireEvent.click(await screen.findByRole('button',{name:'确认导入并保存草稿'}))
  await waitFor(()=>expect(p.onImported).toHaveBeenCalledWith(saved))
  expect(p.api).toHaveBeenNthCalledWith(1,'/organizations/org/private-tools/tool/import/preview','POST',{content,expectedRevision:1,expectedContentHash:tool.contentHash})
  expect(p.api).toHaveBeenNthCalledWith(2,'/organizations/org/private-tools/tool/import/apply','POST',{content,expectedRevision:1,expectedContentHash:tool.contentHash,digest:preview.digest,previewToken:preview.previewToken,previewExpiresAt:preview.previewExpiresAt})
  expect(screen.getByLabelText('CSV 内容')).toHaveValue('');expect(p.onPendingChange).toHaveBeenLastCalledWith(false)
  expect(p.onBusy).toHaveBeenLastCalledWith(false)
 })
 it.each(['PRIVATE_TOOL_REVISION_CONFLICT','PRIVATE_TOOL_CSV_PREVIEW_EXPIRED'])('retains CSV and does not retry or report success after %s',async code=>{
  const p=props();p.api.mockResolvedValueOnce(preview).mockRejectedValueOnce({code})
  render(<EducationScaleCsvImport {...p}/>);enter();start()
  fireEvent.click(await screen.findByRole('button',{name:'确认导入并保存草稿'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('输入已保留')
  expect(screen.getByLabelText('CSV 内容')).toHaveValue(content);expect(p.onImported).not.toHaveBeenCalled()
  expect(screen.queryByRole('button',{name:'确认导入并保存草稿'})).not.toBeInTheDocument();expect(p.api).toHaveBeenCalledTimes(2)
 })
 it('invalidates preview on local content or saved revision changes',async()=>{
  const p=props();p.api.mockResolvedValue(preview);const view=render(<EducationScaleCsvImport {...p}/>);enter();start()
  await screen.findByRole('button',{name:'确认导入并保存草稿'})
  fireEvent.change(screen.getByLabelText('CSV 内容'),{target:{value:content+'\n'}})
  expect(screen.queryByRole('button',{name:'确认导入并保存草稿'})).not.toBeInTheDocument()
  start();await screen.findByRole('button',{name:'确认导入并保存草稿'})
  view.rerender(<EducationScaleCsvImport {...p} tool={{...tool,revision:2}}/>)
  expect(screen.queryByRole('button',{name:'确认导入并保存草稿'})).not.toBeInTheDocument()
 })
 it('ignores stale identity responses without unlocking a later request',async()=>{
  const p=props();let first!:(value:unknown)=>void,second!:(value:unknown)=>void
  p.api.mockImplementationOnce(()=>new Promise(resolve=>{first=resolve})).mockImplementationOnce(()=>new Promise(resolve=>{second=resolve}))
  const view=render(<EducationScaleCsvImport {...p}/>);enter();start()
  view.rerender(<EducationScaleCsvImport {...p} organizationId="other"/>);start()
  await act(async()=>first(preview))
  expect(screen.queryByRole('button',{name:'确认导入并保存草稿'})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'预检导入'})).toBeDisabled()
  await act(async()=>second(preview))
  expect(await screen.findByRole('button',{name:'确认导入并保存草稿'})).toBeEnabled()
  expect(p.onImported).not.toHaveBeenCalled()
 })
})
