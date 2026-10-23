import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {EducationMaterialPicker} from './EducationMaterialPicker'
import type {PrivateToolApi} from './privateToolClient'
afterEach(()=>{cleanup();vi.restoreAllMocks()})
const props={entry:'TEACHER' as const,actorId:'actor',organizationId:'school',toolId:'tool',onChange:vi.fn()}
describe('Education material library has no Training permission fallback',()=>{
 it('uses only the injected scoped catalog and shows all three kinds',async()=>{
  const api=vi.fn(async()=>({list:[{id:'asset',name:'Owned PDF',mimeType:'application/pdf',contentHash:'a'.repeat(64),size:10}],total:1,pageSize:9}))
  render(<EducationMaterialPicker {...props} api={api as PrivateToolApi}/>)
  fireEvent.click(screen.getByRole('button',{name:'从素材库添加'}));await screen.findByText('Owned PDF')
  expect(api).toHaveBeenCalledWith('/organizations/school/private-tools/tool/materials?kind=all&page=1')
  expect(screen.queryByRole('link',{name:/在素材库上传/})).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('素材类型'),{target:{value:'video'}})
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/organizations/school/private-tools/tool/materials?kind=video&page=1'))
  fireEvent.click(screen.getByRole('button',{name:'添加'}))
  await waitFor(()=>expect(props.onChange).toHaveBeenCalledWith([expect.objectContaining({asset:expect.objectContaining({mimeType:'application/pdf'}),rightsStatus:'unknown'})]))
  expect(api).toHaveBeenCalledWith('/organizations/school/private-tools/tool/materials/register','POST',expect.objectContaining({assetId:'asset'}))
 })
 it('uploads through the selected tool with its own busy guard and leaves other tools untouched',async()=>{
  const api=vi.fn(async()=>({assetId:'asset'})),onBusy=vi.fn()
  render(<EducationMaterialPicker {...props} api={api as PrivateToolApi} onBusy={onBusy}/>)
  fireEvent.change(screen.getByLabelText('上传当前工具素材'),{target:{files:[new File(['%PDF-1.4'],'fixture.pdf',{type:'application/pdf'})]}})
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/organizations/school/private-tools/tool/materials','POST',expect.any(FormData)))
  await waitFor(()=>expect(onBusy).toHaveBeenLastCalledWith(false))
  expect(onBusy).toHaveBeenCalledWith(true)
 })
 it('cannot retain library rows after actor or tool identity changes',async()=>{
  const api=vi.fn(async()=>({list:[{id:'old',name:'Old owner PDF',mimeType:'application/pdf',contentHash:'a'.repeat(64),size:10}],total:1}))
  const view=render(<EducationMaterialPicker {...props} api={api as PrivateToolApi}/>)
  fireEvent.click(screen.getByRole('button',{name:'从素材库添加'}));await screen.findByText('Old owner PDF')
  view.rerender(<EducationMaterialPicker {...props} actorId="other" toolId="other-tool" api={api as PrivateToolApi}/>)
  expect(screen.queryByText('Old owner PDF')).not.toBeInTheDocument()
 })
})

it('an old upload finally cannot release a new session busy token',async()=>{
 let finishOld!:(value:unknown)=>void,finishNew!:(value:unknown)=>void
 const oldApi=vi.fn(()=>new Promise(resolve=>{finishOld=resolve})),newApi=vi.fn(()=>new Promise(resolve=>{finishNew=resolve})),onBusy=vi.fn()
 const view=render(<EducationMaterialPicker {...props} api={oldApi as PrivateToolApi} onBusy={onBusy}/>)
 const upload=()=>fireEvent.change(screen.getByLabelText('上传当前工具素材'),{target:{files:[new File(['%PDF-1.4'],'a.pdf',{type:'application/pdf'})]}})
 upload();expect(onBusy).toHaveBeenLastCalledWith(true)
 view.rerender(<EducationMaterialPicker {...props} toolId="new-tool" api={newApi as PrivateToolApi} onBusy={onBusy}/>)
 expect(onBusy).toHaveBeenLastCalledWith(false)
 upload();expect(onBusy).toHaveBeenLastCalledWith(true)
 const calls=onBusy.mock.calls.length
 await act(async()=>{finishOld({assetId:'old'});await Promise.resolve()})
 expect(onBusy).toHaveBeenCalledTimes(calls);expect(screen.getByLabelText('上传当前工具素材')).toBeDisabled()
 await act(async()=>{finishNew({assetId:'new'});await Promise.resolve()})
 expect(onBusy).toHaveBeenLastCalledWith(false)
})
