import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {EducationMaterialPicker} from './EducationMaterialPicker'
import {readFileSync} from 'node:fs'
const privateToolsCss=readFileSync('src/components/education-tools/education-private-tools.css','utf8')
import type {PrivateToolApi} from './privateToolClient'
afterEach(()=>{cleanup();vi.restoreAllMocks()})
const props={entry:'TEACHER' as const,actorId:'actor',organizationId:'school',toolId:'tool',onChange:vi.fn()}
describe('Education material library has no Training permission fallback',()=>{
 it('uses only the injected scoped catalog and shows all three kinds',async()=>{
  const longName='A'.repeat(296)+'.pdf'
  const materialCss=readFileSync('src/modules/assessment-media/material-picker.css','utf8')
  expect(materialCss).toContain('.assessment-material-picker-browser li > div { min-width:0; max-width:100%; overflow-wrap:anywhere; }')
  expect(materialCss).toContain('.assessment-material-display figcaption { flex-wrap:wrap; }')
  expect(materialCss).toContain('.assessment-material-display figcaption strong { min-width:0; max-width:100%; overflow-wrap:anywhere; }')
  const api=vi.fn(async()=>({list:[{id:'asset',name:longName,mimeType:'application/pdf',contentHash:'a'.repeat(64),size:10}],total:1,pageSize:9}))
  render(<EducationMaterialPicker {...props} api={api as PrivateToolApi}/>)
  fireEvent.click(screen.getByRole('button',{name:'从素材库添加'}));await screen.findByText(longName)
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
  for(const [entry,prefix,tokens] of [['school','hs',['border','surface','ink','muted','primary']],['huiteacher','ht',['line','paper','ink','quiet','copper']]] as const){
   const css=readFileSync(`src/${entry}/${entry}-theme.css`,'utf8')
   const selector=`.${prefix}-app :is(.assessment-material-picker,.assessment-material-display):not([data-cognitive-task-root],[data-cognitive-task-root] *)`
   const palette=['line','surface','ink','muted','accent'].map((key,index)=>`--material-${key}:var(--${prefix}-${tokens[index]});`).join('')
   expect(css).toContain(selector+'{'+palette+'background:var(--material-surface);color:var(--material-ink);border-color:var(--material-line)}')
   expect(css).toContain(selector+' a{color:var(--material-accent)}')
  }
  expect(screen.getByLabelText('上传当前工具素材').closest('label')).toHaveClass('education-material-upload')
  expect(privateToolsCss).toMatch(/\.education-material-upload \{ min-width: 0; grid-template-columns: minmax\(0, 1fr\); \}/)
  expect(privateToolsCss).toMatch(/\.education-material-upload input\[type=file\] \{ width: 100%; min-width: 0; box-sizing: border-box; \}/)
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
