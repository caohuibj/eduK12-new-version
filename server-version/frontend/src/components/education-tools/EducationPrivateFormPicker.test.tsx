import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPrivateScalePicker} from './EducationPrivateScalePicker'
import type {PrivateToolApi} from './privateToolClient'
const row={toolId:'tool',versionId:'fixed',title:'本人表单',sourceRevision:2,contentHash:'hash',compatibility:{compatible:true},createdAt:'2026-10-22'}
const endpoint='/organizations/org/activities/activity/runs/run/tracks'
const baseProps={entry:'SCHOOL' as const,kind:'FORM' as const,organizationId:'org',actorKey:'author',scopeKey:'activity:run',endpoint,expectedVersion:7,disabled:false}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
async function select(){fireEvent.click(screen.getByRole('button',{name:'读取我的固定表单'}));await screen.findByRole('option',{name:/本人表单/});fireEvent.change(screen.getByLabelText('我的表单 · 固定版本'),{target:{value:'fixed'}})}
afterEach(cleanup)
describe('private fixed-form picker',()=>{
 it('preserves selected candidates on page failure and merges exact versions without duplication',async()=>{
  let pages=0
  const api=vi.fn(async(path:string)=>{if(path.endsWith('&cursor=next%2Fpage')){if(++pages===1)throw Error('分页失败');return {list:[row,{...row,versionId:'second',title:'另一个固定版'}],nextCursor:null}}return {list:[row],nextCursor:'next/page'}})
  render(<EducationPrivateScalePicker {...baseProps} api={api as PrivateToolApi} onBusy={vi.fn()} onRefresh={vi.fn()}/>);await select()
  expect(api).toHaveBeenCalledWith('/organizations/org/private-tools/runtime-candidates?kind=FORM')
  expect(screen.getByText(/可加入活动草稿，执行接入尚未完成/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'继续加载我的表单'}));await screen.findByText('分页失败')
  expect(screen.getByLabelText('我的表单 · 固定版本')).toHaveValue('fixed')
  fireEvent.click(screen.getByRole('button',{name:'继续加载我的表单'}));await screen.findByRole('option',{name:/另一个固定版/})
  expect(screen.getAllByRole('option',{name:/本人表单/})).toHaveLength(1)
  expect(screen.getByLabelText('我的表单 · 固定版本')).toHaveValue('fixed')
  expect(api).toHaveBeenLastCalledWith('/organizations/org/private-tools/runtime-candidates?kind=FORM&cursor=next%2Fpage')
 })
 it('retains incompatibility explanations and refuses missing or incompatible metadata even if options are forced selected',async()=>{
  const rejected={...row,versionId:'rejected',title:'不兼容表单',compatibility:{compatible:false,code:'FORM_RUNTIME_UNSUPPORTED',issues:[{pageKey:'page-a',itemKey:'item-b',reason:'UNSUPPORTED_TYPE',message:'当前运行器不支持此题型'}]}}
  const missing={...row,versionId:'missing',title:'未说明兼容性',compatibility:undefined}
  const api=vi.fn(async()=>({list:[rejected,missing],nextCursor:null}))
  render(<EducationPrivateScalePicker {...baseProps} api={api as PrivateToolApi} onBusy={vi.fn()} onRefresh={vi.fn()}/>)
  fireEvent.click(screen.getByRole('button',{name:'读取我的固定表单'}))
  await screen.findByRole('option',{name:/不兼容表单/})
  expect(screen.getByText(/当前运行器不支持此题型/)).toBeInTheDocument()
  expect(screen.getByText(/page-a/)).toBeInTheDocument();expect(screen.getByText(/item-b/)).toBeInTheDocument()
  for(const id of ['rejected','missing']){
   fireEvent.change(screen.getByLabelText('我的表单 · 固定版本'),{target:{value:id}})
   fireEvent.change(screen.getByLabelText('本次作答方式'),{target:{value:'SELF'}})
   const button=screen.getByRole('button',{name:'加入我的固定表单'})
   expect(button).toBeDisabled()
   button.removeAttribute('disabled');fireEvent.click(button);button.setAttribute('disabled','')
  }
  expect(api).toHaveBeenCalledTimes(1)
 })
 it('locks uncertain CAS failures until explicit reread and resets choice before permitting any retry',async()=>{
  const api=vi.fn(async(_path:string,method='GET')=>{if(method==='POST')throw Error('409 revision conflict');return {list:[row],nextCursor:null}})
  const refresh=vi.fn().mockResolvedValue(undefined),busy=vi.fn()
  render(<EducationPrivateScalePicker {...baseProps} api={api as PrivateToolApi} onBusy={busy} onRefresh={refresh}/>);await select()
  expect(screen.getByRole('button',{name:'加入我的固定表单'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('本次作答方式'),{target:{value:'SELF'}})
  fireEvent.click(screen.getByRole('button',{name:'加入我的固定表单'}))
  await screen.findByText(/添加未确认/)
  const add=screen.getByRole('button',{name:'加入我的固定表单'});expect(add).toBeDisabled();fireEvent.click(add)
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'重新读取任务配置（不会重复添加）'}))
  await screen.findByText('已重新读取配置，请先核对是否已加入；确需添加时重新选择。')
  expect(screen.getByLabelText('我的表单 · 固定版本')).toHaveValue('');expect(screen.getByLabelText('本次作答方式')).toHaveValue('')
  expect(refresh).toHaveBeenCalledTimes(1);expect(busy).toHaveBeenLastCalledWith(false);expect(add).toBeDisabled()
 })
 it('clears selection after success even if refresh fails and does not silently repeat the write',async()=>{
  const post=deferred<object>()
  const api=vi.fn(async(_path:string,method='GET')=>method==='POST'?post.promise:{list:[row],nextCursor:null})
  const refresh=vi.fn().mockRejectedValueOnce(Error('刷新失败')).mockRejectedValueOnce(Error('恢复仍失败')).mockResolvedValue(undefined)
  render(<EducationPrivateScalePicker {...baseProps} api={api as PrivateToolApi} onBusy={vi.fn()} onRefresh={refresh}/>);await select()
  fireEvent.change(screen.getByLabelText('本次作答方式'),{target:{value:'SELF'}})
  const add=screen.getByRole('button',{name:'加入我的固定表单'});fireEvent.click(add);fireEvent.click(add)
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
  await act(async()=>post.resolve({}))
  await screen.findByText(/已添加，但任务配置刷新失败/)
  expect(screen.getByLabelText('我的表单 · 固定版本')).toHaveValue('');expect(add).toBeDisabled()
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
  expect(screen.getByLabelText('我的表单 · 固定版本')).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'重新读取任务配置（不会重复添加）'}))
  await screen.findByText('恢复仍失败')
  expect(screen.getByLabelText('我的表单 · 固定版本')).toBeDisabled();expect(add).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'重新读取任务配置（不会重复添加）'}))
  await screen.findByText('已重新读取配置，请先核对是否已加入；确需添加时重新选择。')
  expect(screen.getByLabelText('我的表单 · 固定版本')).toBeEnabled()
  expect(screen.getByLabelText('我的表单 · 固定版本')).toHaveValue('');expect(add).toBeDisabled()
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 })
 it('discards a candidate page returned after a kind-only scope change',async()=>{
  const late=deferred<{list:typeof row[];nextCursor:string}>()
  const api=vi.fn(async(path:string)=>path.includes('kind=FORM')?late.promise:{list:[{...row,title:'新学校表单'}],nextCursor:null})
  const props={...baseProps,api:api as PrivateToolApi,onBusy:vi.fn(),onRefresh:vi.fn()}
  const {rerender}=render(<EducationPrivateScalePicker {...props}/>)
  fireEvent.click(screen.getByRole('button',{name:'读取我的固定表单'}))
  rerender(<EducationPrivateScalePicker {...props} kind="SCALE"/>)
  fireEvent.click(screen.getByRole('button',{name:'读取我的固定量表'}));await screen.findByRole('option',{name:/新学校表单/})
  await act(async()=>late.resolve({list:[row],nextCursor:'old'}))
  expect(screen.queryByRole('option',{name:/本人表单/})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/继续加载我的(量表|表单)/})).not.toBeInTheDocument()
 })
})
