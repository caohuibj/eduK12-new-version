import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyWaveStudio} from './SurveyWaveStudio'
import {createInstrumentLibrary} from './instrument-library'
vi.mock('./SurveyFlowStudio',()=>({SurveyFlowStudio:()=>null}))
vi.mock('./SurveyStudyPreview',()=>({SurveyStudyPreview:()=>null}))
const scaleId='00000000-0000-4000-8000-000000000001'
const tools=[{id:scaleId,kind:'SCALE',title:'量表甲',status:'DRAFT',instrumentKey:'scale',revision:1,definition:{dimensions:[{dimensionKey:'total',label:'总分'}]}},
 {id:'sjt',kind:'SJT',title:'情境甲',status:'DRAFT',instrumentKey:'sjt',revision:1,definition:{metrics:[{metricKey:'cooperation',label:'合作'}]}},
 {id:'form',kind:'FORM',title:'表单甲',status:'DRAFT',instrumentKey:'form',definition:{pages:[]}},
 {id:'cog',kind:'COGNITIVE',title:'认知甲',status:'DRAFT',instrumentKey:'cog',definition:{}},
 {id:'catalog',kind:'SCALE',title:'目录甲',status:'DRAFT',instrumentKey:'catalog',catalogGrantId:'grant',definition:{dimensions:[{dimensionKey:'private',label:'私有'}]}}]
const baseWave={id:'w1',projectId:'p1',title:'反馈波次',ordinal:1,status:'DRAFT',revision:1,instrumentIds:tools.map(t=>t.id),publicationId:null,
 consentText:'本次研究的参与说明与知情同意材料，至少二十字。',generalText:'谢谢',consentVersion:1,linkageNoticeConfirmed:false,
 opensAt:null,closesAt:null,finishUntil:null,quotaStarts:null,startsCount:0,allowNewParticipants:false,hardStopAt:null}
function fixture(frozen=false){
 let wave={...baseWave,publicationId:frozen?'publication':null,frozenParticipantFeedback:frozen?[{draftId:scaleId,instrumentKey:'scale',title:'冻结标题',participantFeedback:{mode:'DESCRIPTIVE',metricKeys:['old_metric'],release:'AFTER_COLLECTION'}},{draftId:'sjt',instrumentKey:'sjt',title:'旧情境',participantFeedback:null}]:undefined}
 const requests:Array<{url:string;body:any}>=[]
 const response=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),body=init?.body?JSON.parse(String(init.body)):undefined
  requests.push({url,body})
  if(url.endsWith('/auth/csrf'))return response({csrfToken:'csrf'})
  if(url.includes('/waves?page='))return response({list:[wave,{...wave,id:'w2',ordinal:2}]})
  if(url.includes('/instruments?page='))return response({list:tools})
  if(url.includes('/instruments/'))return response(tools.find(t=>url.endsWith('/'+t.id)))
  if(url.endsWith('/preflight'))return response({ok:true,publicationReady:true,checks:[]})
  if(url.endsWith('/prepare')){wave={...wave,publicationId:'publication',frozenParticipantFeedback:(body.participantFeedback??[]).map((item:any)=>({draftId:item.instrumentId,instrumentKey:'scale',title:'冻结标题',participantFeedback:item.feedback}))};return response({publicationId:'publication'})}
  if(/\/waves\/w[12]$/.test(url))return response({...wave,id:url.endsWith('w2')?'w2':'w1'})
  if(/\/projects\/p[12]$/.test(url))return response({id:'p1',collectionMode:'SINGLE_UNLINKED',status:'ACTIVE',revision:1})
  throw new Error('Unexpected '+url)
 }))
 return requests
}
async function select(){fireEvent.click(await screen.findByRole('button',{name:/T1 · 反馈波次/}));await screen.findByRole('heading',{name:'T1 · 反馈波次'})}
async function enable(){fireEvent.click(await screen.findByLabelText('启用 量表甲 的原始指标反馈'));fireEvent.click(screen.getByLabelText('量表甲：总分（total）'))}
async function preflight(){fireEvent.click(screen.getByRole('button',{name:'检查知情同意与所有工具'}));await waitFor(()=>expect(screen.getByRole('button',{name:'冻结研究定义'})).toBeEnabled())}
afterEach(()=>vi.unstubAllGlobals())
describe('explicit Wave participant feedback',()=>{
 it('defaults disabled and preserves the old prepare payload, excluding FORM/Cog/catalog',async()=>{
  const requests=fixture();render(<SurveyWaveStudio projectId="p1"/>);await select()
  expect(await screen.findByLabelText('启用 量表甲 的原始指标反馈')).not.toBeChecked()
  expect(screen.getByLabelText('启用 情境甲 的原始指标反馈')).not.toBeChecked()
  for(const title of ['表单甲','认知甲','目录甲'])expect(screen.queryByLabelText('启用 '+title+' 的原始指标反馈')).toBeNull()
  await preflight();fireEvent.click(screen.getByRole('button',{name:'冻结研究定义'}))
  await screen.findByText(/反馈设置已随研究定义冻结/)
  expect(requests.find(r=>r.url.endsWith('/prepare'))?.body).toEqual({revision:1})
 })
 it('requires a metric and sends only explicit policy in prepare, then locks feedback',async()=>{
  const requests=fixture();render(<SurveyWaveStudio projectId="p1"/>);await select();await preflight()
  fireEvent.click(await screen.findByLabelText('启用 量表甲 的原始指标反馈'))
  expect(screen.getByRole('button',{name:'冻结研究定义'})).toBeDisabled()
  fireEvent.click(screen.getByLabelText('量表甲：总分（total）'))
  fireEvent.change(screen.getByLabelText('量表甲 反馈开放时机'),{target:{value:'AFTER_COLLECTION'}})
  fireEvent.click(screen.getByRole('button',{name:'冻结研究定义'}))
  await screen.findByText(/反馈设置已随研究定义冻结/)
  expect(requests.find(r=>r.url.endsWith('/prepare'))?.body).toEqual({revision:1,participantFeedback:[{instrumentId:scaleId,feedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:['total'],release:'AFTER_COLLECTION'}}]})
  expect(screen.queryByLabelText('启用 量表甲 的原始指标反馈')).toBeNull()
 })
 it('clears selection when a tool is removed/reselected and when the Wave changes',async()=>{
  fixture();render(<SurveyWaveStudio projectId="p1"/>);await select();await enable()
  fireEvent.click(screen.getByLabelText('SCALE · 量表甲'));fireEvent.click(screen.getByLabelText('SCALE · 量表甲'))
  await waitFor(()=>expect(screen.getByLabelText('启用 量表甲 的原始指标反馈')).not.toBeChecked())
  await enable();fireEvent.click(screen.getByRole('button',{name:/T2 · 反馈波次/}))
  await waitFor(()=>expect(screen.getByLabelText('启用 量表甲 的原始指标反馈')).not.toBeChecked())
 })
 it('clears selection on project switch and instrument-library revision invalidation',async()=>{
  fixture();const library=createInstrumentLibrary('p1')
  const view=render(<SurveyWaveStudio projectId="p1" instrumentLibrary={library}/>);await select();await enable()
  await library.changed(1)
  await waitFor(()=>expect(screen.getByLabelText('启用 量表甲 的原始指标反馈')).not.toBeChecked())
  await enable();view.rerender(<SurveyWaveStudio projectId="p2"/>);await select()
  expect(await screen.findByLabelText('启用 量表甲 的原始指标反馈')).not.toBeChecked()
 })
 it('does not invent a frozen policy from current draft metrics',async()=>{
  fixture(true);render(<SurveyWaveStudio projectId="p1"/>);await select()
  expect(screen.getByText(/冻结标题（scale）：原始指标 old_metric；本轮采集结束后/)).toBeInTheDocument()
  expect(screen.getByText(/旧情境（sjt）：未启用原始指标反馈/)).toBeInTheDocument()
  expect(screen.queryByText(/原始指标 total/)).toBeNull()
  expect(screen.queryByLabelText('启用 量表甲 的原始指标反馈')).toBeNull()
 })
})
