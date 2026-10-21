import {useState} from 'react'
import {act,fireEvent,render,screen} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {SurveyWaveContentSelection,type WaveContentSelection,type WaveContentRequest} from './SurveyWaveContentSelection'
const tool={id:'tool',title:'量表甲',kind:'SCALE',revision:2}
const report={releaseId:'report-old',key:'报告',version:'v1',contentHash:'hash',status:'PUBLISHED',audience:'student',language:'zh'}
const reference={releaseId:'ref-old',key:'样本参考',version:'v1',contentHash:'hash',status:'PUBLISHED',entries:[{entryKey:'entry',metricKey:'total',referenceKind:'descriptive_sample',population:{description:'本项目样本'}}]}
const catalog=(layer:string,options:unknown[],more=false,page=1)=>({instrumentId:'tool',instrumentKey:'key',draftRevision:2,waveRevision:3,measurement:{releaseId:'measurement',contentHash:'hash',version:'m1'},layer,page,pageSize:25,hasMore:more,options})
function Harness({request,scope='one'}:{request:WaveContentRequest;scope?:string}){
 const [value,setValue]=useState<WaveContentSelection[]>([])
 return <><SurveyWaveContentSelection key={scope} base="/projects/p/waves/w" revision={3} tools={[tool,{id:'form',title:'表单',kind:'FORM'}]} request={request} value={value} onChange={setValue} published={false}/><output aria-label="已选版本">{JSON.stringify(value)}</output></>
}
describe('Survey Wave exact content selector',()=>{
 it('defaults empty, reads lazily and does not treat intended audience as access permission',async()=>{
  const request=vi.fn().mockResolvedValue(catalog('REPORT',[report]))
  render(<Harness request={request}/>);expect(request).not.toHaveBeenCalled()
  expect(screen.getByLabelText('已选版本')).toHaveTextContent('[]')
  expect(screen.queryByText('读取 表单 的报告版本')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('读取 量表甲 的报告版本'))
  const select=await screen.findByLabelText('报告版本 · 量表甲')
  expect(select).toHaveValue('')
  expect(screen.getByText(/模板标注的预期受众不授予/)).toBeInTheDocument()
  fireEvent.change(select,{target:{value:'report-old'}})
  expect(screen.getByLabelText('已选版本')).toHaveTextContent('report-old')
 })
 it('chooses exact reference entries and priority without inventing population context',async()=>{
  const request=vi.fn().mockResolvedValue(catalog('REFERENCE',[reference]))
  render(<Harness request={request}/>);fireEvent.click(screen.getByText('读取 量表甲 的参考版本'))
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.change(screen.getByLabelText('优先级 · v1 · total'),{target:{value:'7'}})
  expect(JSON.parse(screen.getByLabelText('已选版本').textContent!)).toEqual([{instrumentId:'tool',references:[{releaseId:'ref-old',entryKey:'entry',priority:7}]}])
  expect(screen.getByText(/当前研究不提供年龄等人口背景/)).toBeInTheDocument()
  expect(screen.queryByLabelText(/年龄/)).not.toBeInTheDocument()
 })
 it('paginates without silently replacing a selected older report',async()=>{
  const request=vi.fn().mockImplementation((path:string)=>Promise.resolve(path.includes('page=2')?catalog('REPORT',[{...report,releaseId:'report-new',version:'v2'}],false,2):catalog('REPORT',[report],true)))
  render(<Harness request={request}/>);fireEvent.click(screen.getByText('读取 量表甲 的报告版本'))
  fireEvent.change(await screen.findByLabelText('报告版本 · 量表甲'),{target:{value:'report-old'}})
  fireEvent.click(screen.getByText('加载更多报告版本 · 量表甲'))
  await screen.findByRole('option',{name:/v2/})
  expect(screen.getByLabelText('报告版本 · 量表甲')).toHaveValue('report-old')
  expect(request).toHaveBeenLastCalledWith('/projects/p/waves/w/content-options?instrumentId=tool&layer=REPORT&page=2')
 })
 it('reports catalog failure instead of presenting it as an empty compatible list',async()=>{
  const request=vi.fn().mockRejectedValueOnce(new Error('无权限')).mockResolvedValueOnce(catalog('REPORT',[]))
  render(<Harness request={request}/>);fireEvent.click(screen.getByText('读取 量表甲 的报告版本'))
  expect(await screen.findByRole('alert')).toHaveTextContent('无权限')
  expect(screen.queryByText('当前没有兼容的已发布项目私有报告。')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('读取 量表甲 的报告版本'))
  expect(await screen.findByText('当前没有兼容的已发布项目私有报告。')).toBeInTheDocument()
 })
 it('rejects a stale revision response',async()=>{
  const request=vi.fn().mockResolvedValue({...catalog('REPORT',[report]),draftRevision:1})
  render(<Harness request={request}/>);fireEvent.click(screen.getByText('读取 量表甲 的报告版本'))
  expect(await screen.findByRole('alert')).toHaveTextContent('修订已变化')
  expect(screen.queryByLabelText('报告版本 · 量表甲')).not.toBeInTheDocument()
 })
 it('ignores an old response after a scope remount',async()=>{
  let resolve!:(value:unknown)=>void
  const request=vi.fn().mockImplementation(()=>new Promise(r=>{resolve=r}))
  const view=render(<Harness request={request}/>);fireEvent.click(screen.getByText('读取 量表甲 的报告版本'))
  view.rerender(<Harness request={request} scope="two"/>)
  await act(async()=>resolve(catalog('REPORT',[report])))
  expect(screen.queryByLabelText('报告版本 · 量表甲')).not.toBeInTheDocument()
 })
 it('reads frozen pointers only and never queries current catalog',()=>{
  const request=vi.fn()
  render(<SurveyWaveContentSelection base="/p/w" revision={3} tools={[tool]} request={request} value={[]} onChange={vi.fn()} published frozen={[{draftId:'tool',title:'冻结名称',instrumentKey:'key',measurementRelease:{releaseId:'m-old',contentHash:'h',measurementHash:'h'},contentSelection:{referencePolicy:{policyVersion:'v1',measurementReleaseId:'m-old',choices:[]},reportRelease:{releaseId:'r-old',contentHash:'h'}}}]}/> )
  expect(screen.getByText('报告版本：r-old')).toBeInTheDocument()
  expect(screen.getByText('冻结名称（key）')).toBeInTheDocument()
  expect(request).not.toHaveBeenCalled()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
 })
})
