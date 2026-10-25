import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyWaveStudio} from './SurveyWaveStudio'
import {createInstrumentLibrary} from './instrument-library'
vi.mock('./SurveyFlowStudio',()=>({SurveyFlowStudio:()=>null}))
vi.mock('./SurveyStudyPreview',()=>({SurveyStudyPreview:()=>null}))
const tool={id:'tool',kind:'SCALE',title:'测量甲',status:'DRAFT',instrumentKey:'scale',revision:2,definition:{dimensions:[{dimensionKey:'total',label:'总分'}]}}
const initial={id:'w1',projectId:'p1',title:'版本波次',ordinal:1,status:'DRAFT',revision:3,instrumentIds:['tool'],publicationId:null as string|null,
 consentText:'本次研究的参与说明与知情同意材料，至少二十字。',generalText:'谢谢',consentVersion:1,linkageNoticeConfirmed:false,
 opensAt:null,closesAt:null,finishUntil:null,quotaStarts:null,startsCount:0,allowNewParticipants:false,hardStopAt:null}
const frozen=[{draftId:'tool',title:'冻结测量甲',instrumentKey:'scale',measurementRelease:{releaseId:'measurement',contentHash:'hash',measurementHash:'hash'},contentSelection:{referencePolicy:{policyVersion:'v1',measurementReleaseId:'measurement',choices:[]},reportRelease:{releaseId:'report-old',contentHash:'hash'}}}]
function fixture(mode:'ok'|'conflict'|'unknown'|'accepted-unknown'|'unknown-conflict'='ok',toolStatus='DRAFT'){
 const currentTool={...tool,status:toolStatus}
 let wave={...initial,frozenContentSelections:undefined as typeof frozen|undefined},posts=0
 const requests:{url:string;body:any}[]=[]
 const response=(data:unknown)=>({ok:true,status:200,json:async()=>({code:0,data})})
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(String(input).includes('/package-memberships?'))return {ok:true,status:200,json:async()=>({code:0,data:{list:[]}})} as Response
  const url=String(input),body=init?.body?JSON.parse(String(init.body)):undefined;requests.push({url,body})
  if(url.endsWith('/auth/csrf'))return response({csrfToken:'csrf'})
  if(url.includes('/waves?page='))return response({list:[wave,{...wave,id:'w2',ordinal:2}]})
  if(url.includes('/instruments?page='))return response({list:[currentTool]})
  if(url.includes('/instruments/'))return response(currentTool)
  if(url.includes('/content-options?'))return response({instrumentId:'tool',instrumentKey:'scale',draftRevision:2,waveRevision:3,measurement:{releaseId:'measurement',contentHash:'hash',version:'m1'},layer:'REPORT',page:1,pageSize:25,hasMore:false,options:[{releaseId:'report-old',key:'私有报告',version:'v1',contentHash:'hash',status:'PUBLISHED',audience:'parent',language:'zh'}]})
  if(url.endsWith('/preflight'))return response({ok:true,publicationReady:true,checks:[]})
  if(url.endsWith('/prepare')){
   posts++
   if(mode==='conflict'||mode==='unknown-conflict'&&posts>1)return {ok:false,status:409,json:async()=>({code:-1,message:'报告已停用'})}
   if((mode==='unknown'||mode==='unknown-conflict')&&posts===1)throw new Error('连接中断')
   wave={...wave,publicationId:'publication',revision:4,frozenContentSelections:frozen}
   if(mode==='accepted-unknown')throw new Error('响应丢失')
   return response({publicationId:'publication'})
  }
  if(url.endsWith('/waves/w1')||url.endsWith('/waves/w2'))return response(wave)
  if(url.endsWith('/projects/p1'))return response({id:'p1',collectionMode:'SINGLE_UNLINKED',status:'ACTIVE',revision:1})
  throw new Error('Unexpected '+url)
 }))
 return requests
}
async function choose(){
 fireEvent.click(await screen.findByRole('button',{name:/T1 · 版本波次/}))
 fireEvent.click(await screen.findByText('读取 测量甲 的报告版本'))
 fireEvent.change(await screen.findByLabelText('报告版本 · 测量甲'),{target:{value:'report-old'}})
 fireEvent.click(screen.getByText('检查知情同意与所有工具'))
 await waitFor(()=>expect(screen.getByRole('button',{name:'冻结研究定义'})).toBeEnabled())
}
afterEach(()=>vi.unstubAllGlobals())
describe('Survey Wave report selection freeze boundary',()=>{
 it('does not offer unselected draft tools in the independent-library workspace',async()=>{
  fixture('ok','DRAFT');render(<SurveyWaveStudio projectId="p1" onNavigateLibrary={()=>{}}/>);
  await screen.findByRole('button',{name:/T1 · 版本波次/})
  expect(screen.queryByLabelText('SCALE · 测量甲')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:/T1 · 版本波次/}));await choose()
  expect(screen.getByLabelText('SCALE · 测量甲')).toBeChecked()
 })

 it('keeps published self-authored scales selectable for explicit wave freezing',async()=>{
  const requests=fixture('ok','PUBLISHED');render(<SurveyWaveStudio projectId="p1"/>);await choose()
  expect(screen.getByLabelText('SCALE · 测量甲')).toBeChecked()
  fireEvent.click(screen.getByRole('button',{name:'冻结研究定义'}))
  await screen.findByText('报告版本：report-old')
  expect(requests.find(row=>row.url.endsWith('/prepare'))?.body.contentSelections[0].instrumentId).toBe('tool')
 })
 it('does not offer archived scales for new wave selection',async()=>{
  fixture('ok','ARCHIVED');render(<SurveyWaveStudio projectId="p1"/>)
  fireEvent.click(await screen.findByRole('button',{name:/T1 · 版本波次/}))
  expect(screen.queryByLabelText('SCALE · 测量甲')).not.toBeInTheDocument()
 })
 it('sends exact selections separately from participant feedback and displays frozen server identities',async()=>{
  const requests=fixture();render(<SurveyWaveStudio projectId="p1"/>);await choose()
  fireEvent.click(screen.getByRole('button',{name:'冻结研究定义'}))
  expect(await screen.findByText('报告版本：report-old')).toBeInTheDocument()
  expect(screen.getByText('冻结测量甲（scale）')).toBeInTheDocument()
  expect(requests.find(row=>row.url.endsWith('/prepare'))?.body).toEqual({revision:3,contentSelections:[{instrumentId:'tool',reportReleaseId:'report-old',references:[]}]})
  expect(screen.queryByLabelText('报告版本 · 测量甲')).not.toBeInTheDocument()
 })
 it('retains selection after a known 409 and does not retry or replace with newest',async()=>{
  const requests=fixture('conflict');render(<SurveyWaveStudio projectId="p1"/>);await choose()
  fireEvent.click(screen.getByRole('button',{name:'冻结研究定义'}))
  expect(await screen.findByText(/报告已停用；原报告/)).toBeInTheDocument()
  expect(screen.getByLabelText('报告版本 · 测量甲')).toHaveValue('report-old')
  expect(requests.filter(row=>row.url.endsWith('/prepare'))).toHaveLength(1)
 })
 it('checks an uncertain freeze and only retries the original payload on explicit action',async()=>{
  const requests=fixture('unknown');render(<SurveyWaveStudio projectId="p1"/>);await choose()
  fireEvent.click(screen.getByRole('button',{name:'冻结研究定义'}))
  const retry=await screen.findByRole('button',{name:'重试原冻结请求'})
  expect(screen.getByLabelText('报告版本 · 测量甲')).toBeDisabled()
  expect(requests.filter(row=>row.url.endsWith('/prepare'))).toHaveLength(1)
  fireEvent.click(retry)
  await screen.findByText('报告版本：report-old')
  const posts=requests.filter(row=>row.url.endsWith('/prepare'));expect(posts).toHaveLength(2);expect(posts[1].body).toEqual(posts[0].body)
 })
 it('unlocks preserved choices after an uncertain request is definitively rejected on retry and verified unfrozen',async()=>{
  const requests=fixture('unknown-conflict');render(<SurveyWaveStudio projectId="p1"/>);await choose()
  fireEvent.click(screen.getByRole('button',{name:'冻结研究定义'}))
  fireEvent.click(await screen.findByRole('button',{name:'重试原冻结请求'}))
  await screen.findByText(/报告已停用；已核对波次仍未冻结/)
  const select=screen.getByLabelText('报告版本 · 测量甲')
  expect(select).toBeEnabled();expect(select).toHaveValue('report-old')
  expect(screen.queryByRole('button',{name:'重试原冻结请求'})).not.toBeInTheDocument()
  const posts=requests.filter(row=>row.url.endsWith('/prepare'));expect(posts).toHaveLength(2);expect(posts[1].body).toEqual(posts[0].body)
  fireEvent.change(select,{target:{value:''}});expect(select).toHaveValue('')
 })
 it('recovers an accepted but lost response by reading the actual frozen binding without another POST',async()=>{
  const requests=fixture('accepted-unknown');render(<SurveyWaveStudio projectId="p1"/>);await choose()
  fireEvent.click(screen.getByRole('button',{name:'冻结研究定义'}))
  await screen.findByText('报告版本：report-old')
  expect(requests.filter(row=>row.url.endsWith('/prepare'))).toHaveLength(1)
  expect(screen.queryByText('重试原冻结请求')).not.toBeInTheDocument()
  expect(screen.queryByText('冻结结果尚未确认，请先读取服务器状态，不要改选或重复创建。')).not.toBeInTheDocument()
 })
 it('invalidates unsubmitted choices when instrument-library revisions change',async()=>{
  fixture();const library=createInstrumentLibrary('p1');render(<SurveyWaveStudio projectId="p1" instrumentLibrary={library}/>);await choose()
  await library.changed(1)
  await screen.findByText(/未冻结的报告／参考选择已清空/)
  fireEvent.click(screen.getByText('读取 测量甲 的报告版本'))
  expect(await screen.findByLabelText('报告版本 · 测量甲')).toHaveValue('')
 })
})
