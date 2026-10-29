import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import EducationStandardConfigurations from './EducationStandardConfigurations'
import {educationConfigurationRequest as request,educationConfigurationBase,type EducationUseIssue,type EducationPendingOperation} from '../../api/educationStandardConfigurations'
vi.mock('../../api/educationStandardConfigurations',async original=>({...await original<object>(),educationConfigurationRequest:vi.fn()}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const props={actorId:id(1),organizationId:id(2),product:'HUITEACHER' as const},base=educationConfigurationBase(props.organizationId,props.product)
const storageKey='education-exact-configuration:'+JSON.stringify([props.actorId,props.product,props.organizationId])
const choice={id:id(3),title:'已批准固定量表',toolKey:'synthetic',instrumentVersion:'1',combinationHash:'a'.repeat(64),versions:{CONTENT:'C-1',PARAMETERS:'none-v1',REPORT:'R-2'},
 authorities:[{id:id(4),version:1,validFrom:'2020-01-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z'}],assignable:true,unavailableReason:null}
const recipient={userId:id(5),username:'本校合法管理员',membershipId:id(6)}
let grants:unknown[]=[]
const api=vi.mocked(request)
function reads(path:string){
 if(path===base+'?page=1')return {page:1,list:[choice],hasMore:false}
 if(path.includes('/recipients?'))return {page:1,list:[recipient],hasMore:false}
 if(path.includes('/use-grants?page='))return {page:1,list:grants,hasMore:false}
 throw Error('Unexpected request '+path)
}
async function fill(){
 await screen.findByRole('option',{name:/已批准固定量表/})
 fireEvent.change(screen.getByLabelText('已批准量表配置'),{target:{value:choice.id}})
 await screen.findByRole('option',{name:recipient.username})
 fireEvent.change(screen.getByLabelText('精确分发委托'),{target:{value:id(4)}})
 fireEvent.change(screen.getByLabelText('配置接收者'),{target:{value:recipient.userId}})
 fireEvent.change(screen.getByLabelText('授权配置名称'),{target:{value:'行政固定配置'}})
 fireEvent.change(screen.getByLabelText('使用权生效时间'),{target:{value:'2030-01-01T00:00'}})
 fireEvent.change(screen.getByLabelText('使用权截止时间'),{target:{value:'2031-01-01T00:00'}})
 fireEvent.change(screen.getByLabelText('本次配置操作的管理员密码'),{target:{value:'Memory-only-test-password'}})
}
beforeEach(()=>{api.mockReset();sessionStorage.clear();grants=[]})
describe('education manager exact configuration and unknown-result recovery',()=>{
 it('distinguishes an empty qualified recipient list and an expired historical use without issuing a replacement',async()=>{
  api.mockImplementation(async path=>{
   if(path.includes('/recipients?'))return {page:1,list:[],hasMore:false} as never
   if(path.includes('/use-grants?page='))return {page:1,hasMore:false,list:[{id:id(7),userId:recipient.userId,username:recipient.username,version:1,revokedAt:null,
    validFrom:'2020-01-01T00:00:00Z',expiresAt:'2021-01-01T00:00:00Z',configurationName:'历史固定配置',canManage:true}]} as never
   return reads(path) as never
  })
  render(<EducationStandardConfigurations {...props}/>);await screen.findByRole('option',{name:/已批准固定量表/})
  fireEvent.change(screen.getByLabelText('已批准量表配置'),{target:{value:choice.id}})
  await screen.findByText('当前学校没有符合本入口资格的接收者。');await screen.findByText(/已过期/)
  expect(api.mock.calls.some(([,method])=>method==='POST')).toBe(false)
 })
 it('School uses its own manager path and shows the original report audience before saving the psychologist configuration',async()=>{
  const schoolProps={...props,product:'HUISCHOOL' as const},schoolBase=educationConfigurationBase(props.organizationId,'HUISCHOOL')
  api.mockImplementation(async(path,method,raw)=>{
   expect(path.startsWith(schoolBase)).toBe(true)
   if(method==='POST')return {id:(raw as EducationUseIssue).requestId,version:1,revoked:false} as never
   if(path.includes('/preview?'))return {title:'学生报告说明',report:{reportVersion:'R-2',audienceContract:{audience:'student'},interpretations:[{headline:'原版说明',summary:'保留原报告定义'}]}} as never
   return reads(path.replace(schoolBase,base)) as never
  })
  render(<EducationStandardConfigurations {...schoolProps}/>);await fill()
  expect(screen.getByText(/为本校心理教师选定已批准配置/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'查看报告说明'}));await screen.findByText('学生报告说明')
  expect(screen.getByText(/报告受众：学生/)).toBeInTheDocument()
  await waitFor(()=>expect(screen.getByRole('button',{name:'保存固定配置并授权'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'保存固定配置并授权'}));await screen.findByText('固定配置授权已保存。')
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 })
 it('selects an approved exact source, legal recipient and delegation and keeps passwords out of retained request data',async()=>{
  let sent:EducationUseIssue|undefined
  api.mockImplementation(async(path,method,raw)=>{
   if(method==='POST'){
    const body=raw as EducationUseIssue&{currentPassword:string};sent=body
    expect(body.currentPassword).toBe('Memory-only-test-password')
    expect(sessionStorage.getItem(storageKey)).not.toContain('Memory-only-test-password')
    expect(JSON.parse(sessionStorage.getItem(storageKey)!).pending.body).not.toHaveProperty('currentPassword')
    grants=[{id:body.requestId,userId:body.userId,username:recipient.username,version:1,revokedAt:null,validFrom:body.validFrom,expiresAt:body.expiresAt,configurationName:body.configurationName,canManage:true}]
    return {id:body.requestId,version:1,revoked:false} as never
   }
   return reads(path) as never
  })
  render(<EducationStandardConfigurations {...props}/>);await fill()
  fireEvent.click(screen.getByRole('button',{name:'保存固定配置并授权'}))
  await screen.findByText('固定配置授权已保存。')
  expect(sent).toMatchObject({userId:recipient.userId,combinationHash:choice.combinationHash,authorityGrantId:id(4),expectedAuthorityVersion:1,configurationName:'行政固定配置'})
  expect(screen.getByLabelText('本次配置操作的管理员密码')).toHaveValue('');expect(sessionStorage.getItem(storageKey)).toBeNull()
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 })
 it('requires readback before an unknown issuance retries the identical ID and complete parameters',async()=>{
  const posted:Record<string,unknown>[]=[]
  api.mockImplementation(async(path,method,raw)=>{
   if(method==='POST'){
    posted.push(raw as Record<string,unknown>)
    if(posted.length===1)throw TypeError('Network disconnected')
    return {id:posted[0].requestId,version:1,revoked:false} as never
   }
   if(path.includes('/operations/'))return null as never
   return reads(path) as never
  })
  render(<EducationStandardConfigurations {...props}/>);await fill();fireEvent.click(screen.getByRole('button',{name:'保存固定配置并授权'}))
  await screen.findByRole('button',{name:'核对原配置请求'})
  expect(screen.getByLabelText('已批准量表配置')).toBeDisabled();expect(screen.queryByRole('button',{name:'按原请求重试'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'核对原配置请求'}));await screen.findByText('暂未发现原请求；可使用原编号和原参数重试。')
  expect(posted).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('本次配置操作的管理员密码'),{target:{value:'Fresh-test-password'}})
  fireEvent.click(screen.getByRole('button',{name:'按原请求重试'}));await screen.findByText('固定配置授权已保存。')
  const {currentPassword:firstSecret,...first}=posted[0],{currentPassword:secondSecret,...second}=posted[1]
  expect(firstSecret).not.toBe(secondSecret);expect(second).toEqual(first);expect(sessionStorage.getItem(storageKey)).toBeNull()
 })
 it('does not accept a resource-only match when readback names another recipient',async()=>{
  let posted:EducationUseIssue
  api.mockImplementation(async(path,method,raw)=>{
   if(method==='POST'){posted=raw as EducationUseIssue;throw Error('Unknown response')}
   if(path.includes('/operations/'))return {kind:'ISSUE',grant:{id:posted.requestId,version:1,revokedAt:null},request:{...posted,userId:id(99)}} as never
   return reads(path) as never
  })
  render(<EducationStandardConfigurations {...props}/>);await fill();fireEvent.click(screen.getByRole('button',{name:'保存固定配置并授权'}))
  fireEvent.click(await screen.findByRole('button',{name:'核对原配置请求'}))
  await screen.findByText(/已找到的请求与原完整配置、接收者或权限依据不一致/)
  expect(screen.queryByRole('button',{name:'按原请求重试'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'保存固定配置并授权'})).toBeDisabled()
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 })
 it('restores an unknown revoke without replaying it and confirms the exact revision/reason through readback',async()=>{
  const pending:EducationPendingOperation={kind:'REVOKE',combinationId:choice.id,grantId:id(7),unknown:true,body:{requestId:id(8),expectedVersion:1,reason:'Original exact reason'}}
  sessionStorage.setItem(storageKey,JSON.stringify({...props,pending}))
  api.mockImplementation(async(path)=>path.includes('/operations/')?{kind:'REVOKE',grant:{id:id(7),version:2,revokedAt:'2030-01-01T00:00:00.000Z'},request:pending.body} as never:reads(path) as never)
  render(<EducationStandardConfigurations {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'核对原配置请求'}))
  await screen.findByText('原请求已确认，该配置授权目前已撤销。')
  expect(api.mock.calls.some(([,method])=>method==='POST')).toBe(false);expect(sessionStorage.getItem(storageKey)).toBeNull()
 })
 it('does not let a late old-scope readback replace the next school screen',async()=>{
  const pending:EducationPendingOperation={kind:'REVOKE',combinationId:choice.id,grantId:id(7),unknown:true,body:{requestId:id(8),expectedVersion:1,reason:'Original exact reason'}}
  sessionStorage.setItem(storageKey,JSON.stringify({...props,pending}))
  let resolve!:(value:unknown)=>void
  api.mockImplementation(async path=>{
   if(path.includes('/operations/'))return await new Promise<unknown>(value=>{resolve=value}) as never
   if(path.includes(id(22)))return {page:1,list:[],hasMore:false} as never
   return reads(path) as never
  })
  const view=render(<EducationStandardConfigurations {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'核对原配置请求'}))
  await waitFor(()=>expect(resolve).toBeTypeOf('function'))
  view.rerender(<EducationStandardConfigurations {...props} organizationId={id(22)}/>)
  await screen.findByText(/当前没有可分发配置/)
  resolve({kind:'REVOKE',grant:{id:id(7),version:2,revokedAt:'2030-01-01T00:00:00.000Z'},request:pending.body})
  await waitFor(()=>expect(screen.queryByText('原请求已确认，该配置授权目前已撤销。')).not.toBeInTheDocument())
  expect(screen.queryByRole('button',{name:'核对原配置请求'})).not.toBeInTheDocument();expect(api.mock.calls.some(([,method])=>method==='POST')).toBe(false)
 })
})
