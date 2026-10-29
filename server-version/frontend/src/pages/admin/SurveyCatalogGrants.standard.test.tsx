import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import {SurveyCatalogGrants} from './SurveyCatalogGrants'
import {ResearchCatalog,type CatalogApi,type CatalogGrant} from '../../survey/ResearchCatalog'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const actor=id(1),recipient=id(2),other=id(3),source={kind:'SCALE' as const,sourceId:'survey-standard:'+id(4),sourceVersion:'a'.repeat(64)}
const row={ref:source,title:'原量表',available:true,configuration:{instrumentVersion:'1.0.0',report:'1.1.0',axes:{CONTENT:'c',PARAMETERS:'p',REPORT:'r'}}}
const people=[{id:recipient,username:'研究者甲',status:'ACTIVE'},{id:other,username:'研究者乙',status:'ACTIVE'}]
function grant(body:any):CatalogGrant{return {id:body.exact.requestId,recipientId:recipient,title:row.title,kind:'SCALE',status:'ACTIVE',sourceRef:body.source,
 configurationName:body.exact.configurationName,selectedBinding:{authorizationId:body.exact.requestId,authorizationRevision:1,bindingHash:'b'.repeat(64),configurationHash:'c'.repeat(64)}}}
const endpoint='/researchers/'+recipient+'/tool-grants'
const writes=(api:ReturnType<typeof vi.fn>)=>api.mock.calls.filter(call=>call[1]==='POST')
async function prepare(api:ReturnType<typeof vi.fn>,name=true,authenticatedActor:string|null=actor){
 render(<SurveyCatalogGrants api={api as CatalogApi} password="synthetic-password" researchers={people} actorId={authenticatedActor??undefined}/>)
 fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:recipient}})
 await waitFor(()=>expect(screen.getByRole('button',{name:'查询可授权版本'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'查询可授权版本'}));await screen.findByRole('heading',{name:row.title})
 if(name)fireEvent.change(screen.getByLabelText('标准量表授权配置名称'),{target:{value:'固定体验报告'}})
 if(name)await waitFor(()=>expect(screen.getByRole('button',{name:/授权此版本：原量表/})).toBeEnabled())
}
function mockApi(post:(body:any)=>unknown,operation:()=>unknown=()=>null,includeActor=true){
 return vi.fn(async(path:string,method?:string,body?:unknown)=>{
  if(method==='POST')return post(body)
  if(path.startsWith('/source-catalog'))return {list:[row],page:1,hasMore:false,terminalReason:'END_OF_CATALOG',...(includeActor?{actorId:actor}:{})}
  if(path.includes('/tool-grant-requests/'))return {operation:operation()}
  return {list:[]}
 })
}
beforeEach(()=>{sessionStorage.clear();vi.restoreAllMocks()})
describe('Survey named fixed standard configuration and exact request recovery',()=>{
 it('requires a business name, issues one exact server-bound request and never lets the researcher choose R',async()=>{
  const api=mockApi(grant);await prepare(api,false)
  expect(screen.getByRole('button',{name:/授权此版本：原量表/})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('标准量表授权配置名称'),{target:{value:'固定体验报告'}})
  fireEvent.click(screen.getByRole('button',{name:/授权此版本：原量表/}))
  await waitFor(()=>expect(writes(api)).toHaveLength(1))
  expect(writes(api)[0]).toEqual([endpoint,'POST',{currentPassword:'synthetic-password',source,exact:{requestId:expect.any(String),configurationName:'固定体验报告'}}])
  await waitFor(()=>expect(sessionStorage.getItem('survey-exact-standard-use:'+actor)).toBeNull())
 })
 it('retains no secret and confirms a lost response through original complete intent without a second write',async()=>{
  let input:any
  const api=mockApi(body=>{input=body;throw Error('connection lost')},()=>({grant:grant(input),request:{...input.exact,userId:recipient,source}}))
  await prepare(api);fireEvent.click(screen.getByRole('button',{name:/授权此版本：原量表/}))
  await screen.findByRole('region',{name:'固定量表原请求核对'})
  const stored=sessionStorage.getItem('survey-exact-standard-use:'+actor)!
  expect(stored).toContain(input.exact.requestId);expect(stored).not.toContain('synthetic-password');expect(stored).not.toContain('currentPassword')
  expect(screen.getByLabelText('标准量表授权配置名称')).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}))
  await waitFor(()=>expect(screen.queryByRole('region',{name:'固定量表原请求核对'})).toBeNull())
  expect(writes(api)).toHaveLength(1)
 })
 it('allows only an original-number retry after explicit absent readback',async()=>{
  let attempts=0
  const api=mockApi(body=>{if(++attempts===1)throw Error('unknown outcome');return grant(body)})
  await prepare(api);fireEvent.click(screen.getByRole('button',{name:/授权此版本：原量表/}));await screen.findByRole('region',{name:'固定量表原请求核对'})
  expect(screen.queryByRole('button',{name:'按原固定配置请求重试'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}));fireEvent.click(await screen.findByRole('button',{name:'按原固定配置请求重试'}))
  await waitFor(()=>expect(writes(api)).toHaveLength(2));expect(writes(api)[1]).toEqual(writes(api)[0])
  await waitFor(()=>expect(screen.queryByRole('region',{name:'固定量表原请求核对'})).toBeNull())
 })
 it('keeps a conflicting request blocked and cannot turn a different recipient into the original grant',async()=>{
  let input:any
  const api=mockApi(body=>{input=body;throw Error('lost')},()=>({grant:{...grant(input),recipientId:other},request:{...input.exact,userId:other,source}}))
  await prepare(api);fireEvent.click(screen.getByRole('button',{name:/授权此版本：原量表/}));await screen.findByRole('region',{name:'固定量表原请求核对'})
  fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}))
  await screen.findByText(/完整配置意图不一致/)
  expect(screen.queryByRole('button',{name:'按原固定配置请求重试'})).toBeNull();expect(writes(api)).toHaveLength(1)
  expect(sessionStorage.getItem('survey-exact-standard-use:'+actor)).not.toBeNull()
 })
 it('recovers the original recipient even after the manager changes the visible researcher',async()=>{
  const api=mockApi(()=>{throw Error('lost')});await prepare(api)
  fireEvent.click(screen.getByRole('button',{name:/授权此版本：原量表/}));await screen.findByRole('region',{name:'固定量表原请求核对'})
  fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:other}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'核对原固定配置请求'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}))
  await screen.findByRole('button',{name:'按原固定配置请求重试'})
  expect(api.mock.calls.find(call=>call[0].includes('/tool-grant-requests/'))?.[0]).toContain('/researchers/'+recipient+'/')
  expect(writes(api)).toHaveLength(1)
 })
 it('does not fall back to untyped standard issuance when the authenticated catalog lacks actor identity',async()=>{
  const api=mockApi(grant,()=>null,false);await prepare(api,false)
  fireEvent.change(screen.getByLabelText('标准量表授权配置名称'),{target:{value:'固定体验报告'}})
  expect(screen.getByRole('button',{name:/授权此版本：原量表/})).toBeDisabled();expect(writes(api)).toHaveLength(0)
 })
 it('requires the live authenticated account to match the issuer returned by the source catalog',async()=>{
  const api=mockApi(grant);await prepare(api,false,id(8))
  fireEvent.change(screen.getByLabelText('标准量表授权配置名称'),{target:{value:'固定体验报告'}})
  expect(screen.getByRole('button',{name:/授权此版本：原量表/})).toBeDisabled();expect(writes(api)).toHaveLength(0)
 })
 it('rejects malformed absence readback and keeps the original operation blocked without a retry button',async()=>{
  const api=mockApi(()=>{throw Error('lost')},()=>false);await prepare(api)
  fireEvent.click(screen.getByRole('button',{name:/授权此版本：原量表/}));await screen.findByRole('region',{name:'固定量表原请求核对'})
  await waitFor(()=>expect(screen.getByRole('button',{name:'核对原固定配置请求'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}));await screen.findByText(/不能确认请求不存在/)
  expect(screen.queryByRole('button',{name:'按原固定配置请求重试'})).toBeNull();expect(writes(api)).toHaveLength(1)
  expect(sessionStorage.getItem('survey-exact-standard-use:'+actor)).not.toBeNull()
 })
 it('shows a researcher the fixed business configuration and imports its exact grant without an R selector',async()=>{
  const value=grant({source,exact:{requestId:id(9),configurationName:'固定体验报告'}}),api=vi.fn(async()=>({list:[value]})),onImport=vi.fn(async()=>{})
  render(<ResearchCatalog api={api as CatalogApi} projectId={id(5)} busy={false} onImport={onImport}/>)
  fireEvent.click(await screen.findByRole('button',{name:'使用此配置：固定体验报告'}));expect(onImport).toHaveBeenCalledWith(value)
  expect(screen.queryByRole('combobox')).toBeNull()
  const article=screen.getByRole('button',{name:'使用此配置：固定体验报告'}).closest('article')!
  expect(within(article).getByText('固定体验报告')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('筛选当前页授权工具'),{target:{value:'固定体验'}});expect(api).toHaveBeenCalledTimes(1)
 })
})

it('keeps Survey axis discovery in the authenticated approved page and submits the exact chosen source after normal name/password checks',async()=>{
 const actual={...row,configuration:{...row.configuration,toolKey:'original-tool',axisVersions:{CONTENT:'内容一',PARAMETERS:'none-v1',REPORT:'报告二'}}}
 const api=mockApi(grant);api.mockImplementation(async(path:string,method?:string,body?:any)=>{
  if(method==='POST')return grant(body)
  if(path.startsWith('/source-catalog'))return {list:[actual],page:1,hasMore:false,terminalReason:'END_OF_CATALOG',actorId:actor}
  return {list:[]}
 })
 await prepare(api);fireEvent.click(screen.getByText('按题本、参数和报告查找已批准配置'));fireEvent.change(screen.getByLabelText('量表工具'),{target:{value:'original-tool'}})
 for(const [name,value] of [['题本 C','内容一'],['解释参数 P','none-v1'],['报告 R','报告二']])fireEvent.change(screen.getByLabelText(name),{target:{value}})
 const exact=screen.getByLabelText('核对精确配置'),option=within(exact).getAllByRole('option')[1] as HTMLOptionElement;fireEvent.change(exact,{target:{value:option.value}});fireEvent.click(screen.getByRole('button',{name:'使用所选已批准组合'}))
 const selected=screen.getByRole('region',{name:'已选精确版本'});expect(selected).toHaveTextContent('已选 1 个精确版本');expect(writes(api)).toHaveLength(0)
 fireEvent.click(within(selected).getByRole('button',{name:/授权已选版本/}));await waitFor(()=>expect(writes(api)).toHaveLength(1));expect(writes(api)[0][2]).toMatchObject({source,exact:{configurationName:'固定体验报告'}});expect(writes(api)[0][2]).not.toHaveProperty('axisVersions')
})
