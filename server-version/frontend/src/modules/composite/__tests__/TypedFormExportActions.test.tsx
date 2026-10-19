import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({exportData:vi.fn(),fetch:vi.fn(),wait:vi.fn(),download:vi.fn(),clear:vi.fn()}))
vi.mock('../api',()=>({compositeApi:{exportData:mocks.exportData}}))
vi.mock('../../../api/client',()=>({sessionFetch:mocks.fetch}))
vi.mock('../../../utils/exportJobs',()=>({requestExportIntent:(_scope:string,run:(key:string)=>unknown)=>run('stable-request'),waitForExportArtifacts:mocks.wait,assertExportDownload:()=>{},triggerExportDownload:mocks.download,clearExportIntentKey:mocks.clear,ExportJobFailedError:class extends Error{}}))
import {TypedFormExportActions} from '../TypedFormExportActions'
beforeEach(()=>{vi.clearAllMocks();mocks.exportData.mockResolvedValue({code:0,data:{artifacts:[{id:'a'}]}});mocks.wait.mockResolvedValue([{downloadUrl:'/api/original/artifact',fileName:'exact.zip'}]);mocks.fetch.mockResolvedValue({blob:async()=>new Blob(['bytes'])})})
describe('Training typed original export workflow',()=>{
 it('uses durable full ZIP intent and authenticated original artifact download',async()=>{
  render(<TypedFormExportActions assessmentId="parent"/>);await userEvent.click(screen.getByRole('button',{name:'完整表单与字段字典（ZIP）'}))
  await waitFor(()=>expect(mocks.download).toHaveBeenCalled());expect(mocks.exportData).toHaveBeenCalledWith('parent',{detail:'full',format:'zip'},'stable-request');expect(mocks.fetch).toHaveBeenCalledWith('/api/original/artifact',expect.any(Object));expect(mocks.clear).toHaveBeenCalled();expect(screen.getByText(/暂不支持 SAV/)).toBeTruthy()
 })
 it('keeps current authority error visible and never downloads on rejected intent',async()=>{
  mocks.exportData.mockResolvedValue({code:-1,message:'当前无权限'});render(<TypedFormExportActions assessmentId="parent"/>);await userEvent.click(screen.getByRole('button',{name:'导出表单摘要（CSV）'}))
  await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('当前无权限'));expect(mocks.fetch).not.toHaveBeenCalled();expect(mocks.wait).not.toHaveBeenCalled()
 })
})
