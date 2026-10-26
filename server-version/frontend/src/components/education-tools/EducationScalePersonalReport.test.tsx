import {act,cleanup,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {EducationScalePersonalReport,type EducationReportApi,type EducationScalePersonalReportData} from './EducationScalePersonalReport'
import type {SafeScaleUnitReport} from '../../modules/reporting/ScaleUnitReportCard'
const unit:SafeScaleUnitReport={itemId:'unit',type:'SCALE',kind:'scale',scaleName:'受控量表',scaleCode:'private',caveats:[],disclaimer:'仅描述性反馈',completedAt:null,totalTime:0,rawScoreFeedback:[{scoreKey:'total',rangeKey:'range',text:'私有分数解释',images:[{asset:{assetId:'asset/a',contentHash:'hash',mimeType:'image/png'},altText:'报告图',order:0}]}]}
const ready:EducationScalePersonalReportData={schemaVersion:1,kind:'EDUCATION_SCALE_PERSONAL_REPORT',state:'READY',mode:'INDIVIDUAL_SUMMARY',unitReports:[unit]}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
// jsdom does not decode Blob URLs; actual decode refusal is covered by the hook and browser contracts.
beforeEach(()=>vi.stubGlobal('Image',class {src='';decode=()=>Promise.resolve()}))
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('education personal report projection boundary',()=>{
 it.each([{schemaVersion:2},{kind:'UNKNOWN_REPORT'},{state:'WITHHELD'},{mode:'GROUP_SUMMARY'}])('fails closed despite injected unitReports when headers mismatch (%j)',override=>{
  const api=vi.fn()
  render(<EducationScalePersonalReport data={{...ready,...override}} api={api as EducationReportApi} entry="SCHOOL" executionId="exec"/>)
  expect(screen.getByText('当前报告尚未获准显示，不提供个人分数、解释或图片。')).toBeInTheDocument()
  expect(screen.queryByText('私有分数解释')).not.toBeInTheDocument()
  expect(screen.queryByText('受控量表')).not.toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument();expect(api).not.toHaveBeenCalled()
 })
 it('shows completed without authorized tool content for an empty ready projection',()=>{
  render(<EducationScalePersonalReport data={{...ready,unitReports:[]}} api={vi.fn() as EducationReportApi} entry="TEACHER" executionId="exec"/>)
  expect(screen.getByText('本次测评已完成，当前没有获准展示的逐工具报告内容。')).toBeInTheDocument()
  expect(screen.queryByText('当前报告尚未获准显示，不提供个人分数、解释或图片。')).not.toBeInTheDocument()
 })
 it('uses the execution-scoped Blob API, revokes URLs, and discards late image responses after withdrawal',async()=>{
  const create=vi.fn(()=> 'blob:authorized-report'),revoke=vi.fn()
  vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke})
  const late=deferred<Blob>()
  const api=vi.fn().mockResolvedValueOnce(new Blob(['png'],{type:'image/png'})).mockImplementationOnce(()=>late.promise)
  const {rerender}=render(<EducationScalePersonalReport data={ready} api={api as EducationReportApi} entry="SCHOOL" executionId="execution/a"/>)
  expect(await screen.findByRole('img',{name:'报告图'})).toHaveAttribute('src','blob:authorized-report')
  expect(api).toHaveBeenCalledWith('/library-scale/executions/execution%2Fa/report/images/asset%2Fa','GET',undefined,{responseType:'blob'})
  rerender(<EducationScalePersonalReport data={ready} api={api as EducationReportApi} entry="SCHOOL" executionId="execution/b"/>)
  await waitFor(()=>expect(api).toHaveBeenCalledTimes(2))
  expect(revoke).toHaveBeenCalledWith('blob:authorized-report')
  rerender(<EducationScalePersonalReport data={{...ready,state:'WITHHELD'}} api={api as EducationReportApi} entry="SCHOOL" executionId="execution/b"/>)
  await act(async()=>late.resolve(new Blob(['late'],{type:'image/png'})))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByText('私有分数解释')).not.toBeInTheDocument()
  expect(create).toHaveBeenCalledTimes(1)
  expect(api.mock.calls.every(([path])=>path.startsWith('/library-scale/executions/'))).toBe(true)
 })
 it('keeps authorized text but never falls back to Training for a denied image',async()=>{
  const api=vi.fn().mockRejectedValue(Error('图片无权限'))
  const fallback=vi.fn();vi.stubGlobal('fetch',fallback)
  render(<EducationScalePersonalReport data={ready} api={api as EducationReportApi} entry="TEACHER" executionId="exec"/>)
  await screen.findByText('反馈图片暂时无法读取，以上文字反馈仍可查看。')
  expect(screen.getByText('私有分数解释')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(fallback).not.toHaveBeenCalled()
  expect(api).toHaveBeenCalledTimes(1)
 })
})
