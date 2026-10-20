import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),fetch:vi.fn(),wait:vi.fn(),download:vi.fn(),intent:vi.fn(),clear:vi.fn()}))
vi.mock('../../../api/client',()=>({default:{get:mocks.get,post:mocks.post},sessionFetch:mocks.fetch}))
vi.mock('../../../training/context',()=>({isTrainingHost:()=>true}))
vi.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'synthetic-teacher',role:'TEACHER'}})}))
vi.mock('../../../utils/exportJobs',()=>({requestExportIntent:(scope:string,run:(key:string)=>unknown)=>{mocks.intent(scope);return run('stable-synthetic-key')},waitForExportArtifacts:mocks.wait,assertExportDownload:(r:{ok:boolean})=>{if(!r.ok)throw Error('下载失败')},triggerExportDownload:mocks.download,clearExportIntentKey:mocks.clear,ExportJobFailedError:class extends Error{}}))
import { QuestionnaireProductList } from '../QuestionnaireProducts'
const row=(id:string,status='PUBLISHED',kind='COLLECTION')=>({id,name:'合成测评 '+id,status,kind,editHref:'/questionnaire-products/'+id})
const success=(data:unknown)=>({code:0,data})
const mount=()=>render(<MemoryRouter><QuestionnaireProductList/></MemoryRouter>)
beforeEach(()=>{vi.clearAllMocks();mocks.get.mockResolvedValue(success({list:[row('published'),row('draft','DRAFT'),row('history','PUBLISHED','LEGACY')],total:3}));mocks.post.mockResolvedValue(success({artifacts:[{id:'synthetic-artifact'}]}));mocks.wait.mockResolvedValue([{downloadUrl:'/api/synthetic/original',fileName:'original-summary.zip'}]);mocks.fetch.mockResolvedValue({ok:true,blob:async()=>new Blob(['synthetic'])})})
describe('Training questionnaire list and deidentified export',()=>{
 it('separates result actions, draft editing and legacy exports without requesting data on opening',async()=>{
  mount();const title=await screen.findByRole('heading',{name:'合成测评 published'})
  const published=within(title.closest('article')!)
  expect(published.getByRole('link',{name:'作答与结果'})).toHaveAttribute('href','/composite-assessments/published/results')
  expect(within(screen.getByRole('heading',{name:'合成测评 draft'}).closest('article')!).getByRole('button',{name:'导出数据'})).toBeDisabled()
  expect(screen.getByRole('link',{name:'历史问卷导出'})).toHaveAttribute('href','/questionnaires/legacy')
  await userEvent.click(published.getByRole('button',{name:'导出数据'}))
  expect(screen.getByRole('dialog',{name:'导出脱敏摘要'})).toHaveTextContent('合成测评 published')
  expect(mocks.get).toHaveBeenCalledTimes(1);expect(mocks.post).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'})
  expect(screen.queryByRole('dialog')).toBeNull()
 })
 it('requests the selected ZIP as explicitly anonymized summary and downloads the authenticated original artifact',async()=>{
  mount();await userEvent.click((await screen.findAllByRole('button',{name:'导出数据'}))[0])
  await userEvent.click(screen.getByRole('radio',{name:/ZIP 数据与字典/}))
  await userEvent.click(screen.getByRole('button',{name:'导出 ZIP'}))
  await waitFor(()=>expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob),'original-summary.zip'))
  expect(mocks.post).toHaveBeenCalledWith('/composite-assessments/published/export',{detail:'summary',format:'zip',anonymize:true},{headers:{'X-Export-Request-Key':'stable-synthetic-key'}})
  expect(mocks.intent).toHaveBeenCalledWith('training-list:synthetic-teacher:published:summary:zip:anonymized')
  expect(mocks.fetch).toHaveBeenCalledWith('/api/synthetic/original',expect.any(Object));expect(mocks.clear).toHaveBeenCalled()
 })
 it('keeps authority failures visible and does not poll or download rejected exports',async()=>{
  mocks.post.mockResolvedValue({code:-1,message:'当前无导出权限'})
  mount();await userEvent.click((await screen.findAllByRole('button',{name:'导出数据'}))[0]);await userEvent.click(screen.getByRole('button',{name:'导出 CSV'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('当前无导出权限')
  expect(mocks.wait).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.clear).not.toHaveBeenCalled()
 })
 it('blocks repeated submits and dismissal while generating and never downloads after unmount',async()=>{
  let complete!:(value:unknown)=>void
  mocks.wait.mockReturnValue(new Promise(resolve=>{complete=resolve}))
  const view=mount();await userEvent.click((await screen.findAllByRole('button',{name:'导出数据'}))[0]);fireEvent.click(screen.getByRole('button',{name:'导出 CSV'}));fireEvent.click(screen.getByRole('button',{name:'正在生成…'}))
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(screen.getByRole('dialog')).toBeInTheDocument();expect(mocks.post).toHaveBeenCalledTimes(1)
  await waitFor(()=>expect(mocks.wait).toHaveBeenCalled());view.unmount()
  await act(async()=>complete([{downloadUrl:'/api/synthetic/original',fileName:'unused.csv'}]))
  expect(mocks.fetch).not.toHaveBeenCalled();expect(mocks.download).not.toHaveBeenCalled()
 })
 it('recovers an initial list failure through reload and keeps the empty state actionable',async()=>{
  mocks.get.mockRejectedValueOnce(new Error('网络暂不可用')).mockResolvedValue(success({list:[],total:0}))
  mount();expect(await screen.findByRole('alert')).toHaveTextContent('网络暂不可用')
  await userEvent.click(screen.getByRole('button',{name:'重新加载列表'}))
  expect(await screen.findByRole('heading',{name:'从第一份测评开始'})).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull();expect(mocks.get).toHaveBeenCalledTimes(2)
 })
})
