import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import {SurveyCatalogGrants} from './SurveyCatalogGrants'
import {ResearchCatalog,type CatalogApi,type CatalogGrant} from '../../survey/ResearchCatalog'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const actor=id(1),recipient=id(2),source={kind:'COGNITIVE' as const,sourceId:'cognitive-profile:'+id(3)+':experience',sourceVersion:'a'.repeat(64)}
const row={ref:source,title:'反应时 · 体验配置',available:true},people=[{id:recipient,username:'研究者甲',status:'ACTIVE'}]
const preview={source,artifactHash:source.sourceVersion,profile:'experience',reportStyle:{title:'固定反应报告',headline:[{key:'medianRt',label:'反应时中位数'}],detail:[],caveats:['仅作体验反馈'],disclaimer:'无常模比较'}}
const makeGrant=(body:any):CatalogGrant=>({id:body.exact.requestId,recipientId:recipient,title:row.title,kind:'COGNITIVE',status:'ACTIVE',sourceRef:body.source,configurationName:body.exact.configurationName,
 selectedBinding:{authorizationId:body.exact.requestId,authorizationRevision:1,bindingHash:'b'.repeat(64),configurationHash:'c'.repeat(64)}})
function mockApi(post:(body:any)=>unknown,read:(body:any)=>unknown=()=>null){let original:any;return vi.fn(async(path:string,method?:string,body?:any)=>{
 if(method==='POST'){original=body;return post(body)}
 if(path.startsWith('/source-catalog'))return {list:[row],page:1,hasMore:false,terminalReason:'END_OF_CATALOG',actorId:actor}
 if(path.startsWith('/cognitive-profile-preview'))return preview
 if(path.includes('/tool-grant-requests/'))return {operation:read(original)}
 return {list:[]}
})}
async function prepare(api:ReturnType<typeof mockApi>){
 render(<SurveyCatalogGrants api={api as CatalogApi} actorId={actor} password="synthetic-password" researchers={people}/>)
 fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:recipient}})
 await waitFor(()=>expect(screen.getByLabelText('来源类型')).toBeEnabled())
 fireEvent.change(screen.getByLabelText('来源类型'),{target:{value:'COGNITIVE'}})
 fireEvent.click(screen.getByRole('button',{name:'查询可授权版本'}));await screen.findByRole('heading',{name:row.title})
}
const writes=(api:ReturnType<typeof mockApi>)=>api.mock.calls.filter(c=>c[1]==='POST')
beforeEach(()=>{sessionStorage.clear();vi.restoreAllMocks()})
describe('Survey exact cognitive administrator and consumer UI contracts (mock API only)',()=>{
 it('previews the frozen report structure read-only then sends one named exact profile grant',async()=>{
  const api=mockApi(makeGrant);await prepare(api)
  const button=screen.getByRole('button',{name:/授权此版本：反应时/});expect(button).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'预览此报告'}));const section=await screen.findByRole('region',{name:'认知报告预览'})
  expect(section).toHaveTextContent('体验报告');expect(section).toHaveTextContent('反应时中位数');expect(section).toHaveTextContent('无常模比较');expect(writes(api)).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('认知授权配置名称'),{target:{value:'课堂反应体验'}});fireEvent.click(button)
  await waitFor(()=>expect(writes(api)).toHaveLength(1));expect(writes(api)[0]).toEqual(['/researchers/'+recipient+'/tool-grants','POST',{currentPassword:'synthetic-password',source,exact:{requestId:expect.any(String),configurationName:'课堂反应体验'}}])
  await waitFor(()=>expect(sessionStorage.getItem('survey-exact-standard-use:'+actor)).toBeNull())
 })
 it('recovers an unknown response using the original profile, artifact and business name without a second write',async()=>{
  const api=mockApi(()=>{throw Error('lost response')},body=>({request:{...body.exact,userId:recipient,source},grant:makeGrant(body)}));await prepare(api)
  fireEvent.change(screen.getByLabelText('认知授权配置名称'),{target:{value:'保留原体验配置'}});fireEvent.click(screen.getByRole('button',{name:/授权此版本：反应时/}))
  await screen.findByRole('region',{name:'固定量表原请求核对'});const raw=sessionStorage.getItem('survey-exact-standard-use:'+actor)!
  expect(raw).toContain(source.sourceVersion);expect(raw).toContain(source.sourceId);expect(raw).not.toContain('synthetic-password')
  fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}));await waitFor(()=>expect(sessionStorage.getItem('survey-exact-standard-use:'+actor)).toBeNull());expect(writes(api)).toHaveLength(1)
 })
 it('lets a researcher import the fixed business configuration without a profile selector',async()=>{
  const grant=makeGrant({source,exact:{requestId:id(9),configurationName:'课堂反应体验'}}),onImport=vi.fn(async()=>{}),api=vi.fn(async()=>({list:[grant]}))
  render(<ResearchCatalog api={api as CatalogApi} projectId={id(8)} busy={false} onImport={onImport}/>)
  fireEvent.click(await screen.findByRole('button',{name:'使用此配置：课堂反应体验'}));expect(onImport).toHaveBeenCalledWith(grant);expect(screen.queryByRole('combobox')).toBeNull()
  expect(within(screen.getByRole('button',{name:'使用此配置：课堂反应体验'}).closest('article')!).getByText('课堂反应体验')).toBeInTheDocument()
 })
})
