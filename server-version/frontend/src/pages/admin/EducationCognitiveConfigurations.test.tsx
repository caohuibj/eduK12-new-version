import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import EducationCognitiveConfigurations from './EducationCognitiveConfigurations'
import {educationConfigurationRequest as request,EducationConfigurationHttpError} from '../../api/educationStandardConfigurations'
vi.mock('../../api/educationStandardConfigurations',async original=>({...await original<object>(),educationConfigurationRequest:vi.fn()}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const actorId=id(1),organizationId=id(2),source={configId:id(3),title:'原生反应任务',profile:'research',artifactHash:'a'.repeat(64),assignable:true,authorities:[{id:id(4),version:1,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}]},person={userId:id(5),username:'本校合法使用者'},api=vi.mocked(request)
let input:any
const reads=(path:string)=>path.includes('/recipients?')?{list:[person]}:path.includes('/use-grants?page=')?{list:[]}:path.includes('/preview?')?{artifactHash:source.artifactHash,profile:source.profile,reportStyle:{title:'科研报告结构',headline:[{key:'rt',label:'反应时'}],detail:[],caveats:['仅描述表现'],disclaimer:'无常模解释'}}:path.endsWith('?page=1')?{list:[source],hasMore:false}:null
async function fill(product:'HUISCHOOL'|'HUITEACHER'){
 render(<EducationCognitiveConfigurations actorId={actorId} organizationId={organizationId} product={product}/>);await screen.findByRole('option',{name:/原生反应任务/})
 fireEvent.change(screen.getByLabelText('认知测验与报告'),{target:{value:source.artifactHash}});await screen.findByRole('option',{name:person.username})
 fireEvent.change(screen.getByLabelText('认知授权接收者'),{target:{value:person.userId}});fireEvent.change(screen.getByLabelText('认知配置名称'),{target:{value:'固定科研报告'}})
 fireEvent.change(screen.getByLabelText('认知授权开始'),{target:{value:'2030-01-01T00:00'}});fireEvent.change(screen.getByLabelText('认知授权结束'),{target:{value:'2031-01-01T00:00'}})
 fireEvent.change(screen.getByLabelText('认知授权当前管理员密码'),{target:{value:'synthetic-password'}})
}
beforeEach(()=>{sessionStorage.clear();api.mockReset();input=null})
describe('Education cognitive management UI contracts, mocked transport only',()=>{
 it('review: manages recipient 26 and grant 101 and pins the replacement recipient outside the returned page',async()=>{
  const later={userId:id(126),username:'第26位接收者'},grant={id:id(301),userId:later.userId,username:later.username,version:1,revokedAt:null,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:'第101条授权',canManage:true}
  api.mockImplementation(async(path,method,body)=>{
   if(method==='POST'){input=body;return {id:input.requestId,version:1,revoked:false}}
   if(path.includes('/operations/'))return {kind:'ISSUE',grant:{id:input.requestId,version:1,revokedAt:null},request:{...input,profile:source.profile}}
   if(path.includes('/recipients?')){const u=new URL(path,'http://localhost');return {list:u.searchParams.get('q')?[]:u.searchParams.get('page')==='2'?[later]:Array.from({length:25},(_,i)=>({userId:id(100+i),username:'前页接收者'+i})),hasMore:u.searchParams.get('page')==='1'} as any}
   if(path.includes('/use-grants?page='))return {list:path.endsWith('page=2')?[grant]:Array.from({length:100},(_,i)=>({...grant,id:id(400+i),configurationName:'前页授权'+i})),hasMore:path.endsWith('page=1')} as any
   return reads(path) as any
  })
  render(<EducationCognitiveConfigurations actorId={actorId} organizationId={organizationId} product="HUISCHOOL"/>);await screen.findByRole('option',{name:/原生反应任务/});fireEvent.change(screen.getByLabelText('认知测验与报告'),{target:{value:source.artifactHash}})
  fireEvent.click(await screen.findByRole('button',{name:'下一页认知接收者'}));await screen.findByRole('option',{name:later.username});fireEvent.change(screen.getByLabelText('认知授权接收者'),{target:{value:later.userId}})
  fireEvent.click(await screen.findByRole('button',{name:'下一页认知授权'}));fireEvent.click(await screen.findByRole('button',{name:'替换认知配置：第101条授权'}));fireEvent.change(screen.getByLabelText('认知测验与报告'),{target:{value:source.artifactHash}})
  await waitFor(()=>expect(api.mock.calls.some(c=>c[0].includes('q='+encodeURIComponent(later.username)))).toBe(true))
  expect(screen.getByLabelText('认知授权接收者')).toHaveValue(later.userId);expect(screen.getByLabelText('认知授权接收者')).toBeDisabled()
  fireEvent.change(screen.getByLabelText('认知授权开始'),{target:{value:'2030-01-01T00:00'}});fireEvent.change(screen.getByLabelText('认知授权结束'),{target:{value:'2031-01-01T00:00'}});fireEvent.change(screen.getByLabelText('认知配置替换原因'),{target:{value:'改用新的固定报告'}});fireEvent.change(screen.getByLabelText('认知授权当前管理员密码'),{target:{value:'synthetic-password'}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'授权固定认知配置'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'授权固定认知配置'}));await screen.findByText('原认知配置请求已确认。')
  expect(input).toMatchObject({userId:later.userId,replaces:{grantId:grant.id,expectedVersion:1,reason:'改用新的固定报告'}})
 })
 it('review: a definite fresh POST rejection unlocks correction with a new request',async()=>{
  let rejectedId=''
  api.mockImplementation(async(path,method,body)=>{if(method==='POST'){input=body;if(!rejectedId){rejectedId=input.requestId;throw new EducationConfigurationHttpError('使用授权有效期不能超过精确分发委托',409)}return {id:input.requestId,version:1,revoked:false}}if(path.includes('/operations/'))return {kind:'ISSUE',grant:{id:input.requestId,version:1,revokedAt:null},request:{...input,profile:source.profile}};return reads(path) as any})
  await fill('HUISCHOOL');fireEvent.click(screen.getByRole('button',{name:'授权固定认知配置'}));await screen.findByText(/本次未保存，可修正/)
  expect(screen.queryByRole('region',{name:'认知原请求核对'})).not.toBeInTheDocument();expect(screen.getByLabelText('认知授权结束')).toBeEnabled()
  fireEvent.change(screen.getByLabelText('认知授权结束'),{target:{value:'2030-06-01T00:00'}});fireEvent.change(screen.getByLabelText('认知授权当前管理员密码'),{target:{value:'synthetic-password'}});fireEvent.click(screen.getByRole('button',{name:'授权固定认知配置'}));await screen.findByText('原认知配置请求已确认。')
  expect(input.requestId).not.toBe(rejectedId);expect(input.expiresAt).toContain('2030-06-01');expect(api.mock.calls.filter(c=>c[0].includes('/operations/'))).toHaveLength(1)
 })
 it('review: accepted POST followed by a rejected readback keeps the original pending request',async()=>{
  api.mockImplementation(async(path,method,body)=>{if(method==='POST'){input=body;return {id:input.requestId,version:1,revoked:false}}if(path.includes('/operations/'))throw new EducationConfigurationHttpError('读取暂不可用',409);return reads(path) as any})
  await fill('HUISCHOOL');fireEvent.click(screen.getByRole('button',{name:'授权固定认知配置'}));await screen.findByText(/请先核对原请求，不要改号重发/)
  expect(screen.getByLabelText('认知授权结束')).toBeDisabled();expect(JSON.parse(sessionStorage.getItem('education-exact-cognitive:'+JSON.stringify([actorId,'HUISCHOOL',organizationId]))!)).toMatchObject({unknown:true,body:{requestId:input.requestId}})
 })
 it('review: an unknown write and its rejected retry retain the original intent after an absent readback',async()=>{
  let writes=0,original=''
  api.mockImplementation(async(path,method,body)=>{if(method==='POST'){input=body;writes++;if(writes===1){original=input.requestId;throw new EducationConfigurationHttpError('等待超时',408)}throw new EducationConfigurationHttpError('使用授权有效期不能超过精确分发委托',409)}if(path.includes('/operations/'))return null;return reads(path) as any})
  await fill('HUITEACHER');fireEvent.click(screen.getByRole('button',{name:'授权固定认知配置'}));await screen.findByText(/请先核对原请求，不要改号重发/);fireEvent.click(screen.getByRole('button',{name:'核对原认知请求'}));await screen.findByRole('button',{name:'按原认知请求重试'})
  fireEvent.change(screen.getByLabelText('认知授权当前管理员密码'),{target:{value:'synthetic-password'}});fireEvent.click(screen.getByRole('button',{name:'按原认知请求重试'}));await waitFor(()=>expect(writes).toBe(2));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('使用授权有效期不能超过'))
  expect(input.requestId).toBe(original);expect(screen.getByLabelText('认知授权结束')).toBeDisabled();expect(screen.getByRole('region',{name:'认知原请求核对'})).toBeInTheDocument()
 })
 it('review: historical unavailable sources stay selectable for grant inspection and revocation, not issuance',async()=>{
  const grant={id:id(9),userId:person.userId,username:person.username,version:1,revokedAt:null,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:'历史配置',canManage:true}
  api.mockImplementation(async(path,method,body)=>{if(method==='POST'){input=body;return {id:grant.id,version:2,revoked:true}}if(path.includes('/operations/'))return {kind:'REVOKE',grant:{id:grant.id,version:2,revokedAt:'2030-01-01T00:00:00Z'},request:input};if(path.includes('/use-grants?page='))return {list:[grant],hasMore:false};if(path.endsWith('?page=1'))return {list:[{...source,assignable:false,authorities:[],unavailableReason:'原配置已停止新增分发或当前入口未批准'}],hasMore:false};return reads(path) as any})
  const prompt=vi.spyOn(window,'prompt').mockReturnValue('撤销历史配置')
  try{render(<EducationCognitiveConfigurations actorId={actorId} organizationId={organizationId} product="HUISCHOOL"/>);await screen.findByRole('option',{name:/仅供回读/});fireEvent.change(screen.getByLabelText('认知测验与报告'),{target:{value:source.artifactHash}});await screen.findByText('历史配置')
   expect(screen.getByRole('button',{name:'授权固定认知配置'})).toBeDisabled();expect(api.mock.calls.some(c=>c[0].includes('/recipients?'))).toBe(false)
   fireEvent.change(screen.getByLabelText('认知授权当前管理员密码'),{target:{value:'synthetic-password'}});fireEvent.click(screen.getByRole('button',{name:'撤销认知配置：历史配置'}));await screen.findByText('原认知配置请求已确认。');expect(input).toMatchObject({expectedVersion:1,reason:'撤销历史配置'})
  }finally{prompt.mockRestore()}
 })
 it('review: a restored request is uncertain even if its last saved flag preceded the POST',async()=>{
  const requestId=id(88),key='education-exact-cognitive:'+JSON.stringify([actorId,'HUISCHOOL',organizationId])
  sessionStorage.setItem(key,JSON.stringify({kind:'ISSUE',configId:source.configId,profile:source.profile,unknown:false,body:{requestId,userId:person.userId,artifactHash:source.artifactHash,authorityGrantId:id(4),expectedAuthorityVersion:1,validFrom:'2030-01-01T00:00:00Z',expiresAt:'2031-01-01T00:00:00Z',configurationName:'保留原请求'}}))
  api.mockImplementation(async(path,method,body)=>{if(method==='POST'){input=body;throw new EducationConfigurationHttpError('使用授权有效期不能超过精确分发委托',409)}if(path.includes('/operations/'))return null;return reads(path) as any})
  render(<EducationCognitiveConfigurations actorId={actorId} organizationId={organizationId} product="HUISCHOOL"/>);fireEvent.click(screen.getByRole('button',{name:'核对原认知请求'}));await screen.findByRole('button',{name:'按原认知请求重试'})
  fireEvent.change(screen.getByLabelText('认知授权当前管理员密码'),{target:{value:'synthetic-password'}});fireEvent.click(screen.getByRole('button',{name:'按原认知请求重试'}));await screen.findByText(/请先核对原请求，不要改号重发/)
  expect(input.requestId).toBe(requestId);expect(screen.getByRole('region',{name:'认知原请求核对'})).toBeInTheDocument();expect(JSON.parse(sessionStorage.getItem(key)!)).toMatchObject({unknown:true,body:{requestId}})
 })
 it.each(['HUISCHOOL','HUITEACHER'] as const)('%s previews without writing and confirms one exact named profile operation',async product=>{
  api.mockImplementation(async(path,method,body)=>{if(method==='POST'){input=body;return {id:input.requestId,version:1,revoked:false}}if(path.includes('/operations/'))return {kind:'ISSUE',grant:{id:input.requestId,version:1,revokedAt:null},request:{...input,currentPassword:undefined,profile:source.profile}};return reads(path) as any})
  await fill(product);fireEvent.click(screen.getByRole('button',{name:'预览认知报告'}));expect(await screen.findByRole('region',{name:'教育认知报告预览'})).toHaveTextContent('无常模解释');expect(api.mock.calls.filter(c=>c[1]==='POST')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button',{name:'授权固定认知配置'}));await screen.findByText('原认知配置请求已确认。')
  const writes=api.mock.calls.filter(c=>c[1]==='POST');expect(writes).toHaveLength(1);expect(writes[0][0]).toContain('/products/'+product+'/cognitive-profile-configurations/'+source.configId+'/research/use-grants');expect(writes[0][2]).toMatchObject({userId:person.userId,artifactHash:source.artifactHash,authorityGrantId:id(4),configurationName:'固定科研报告',currentPassword:'synthetic-password'})
  expect(sessionStorage.getItem('education-exact-cognitive:'+JSON.stringify([actorId,product,organizationId]))).toBeNull()
 })
 it('retains an unknown original request without password and resolves it by readback without another POST',async()=>{
  api.mockImplementation(async(path,method,body)=>{if(method==='POST'){input=body;throw Error('lost response')}if(path.includes('/operations/'))return {kind:'ISSUE',grant:{id:input.requestId,version:1,revokedAt:null},request:{...input,profile:source.profile}};return reads(path) as any})
  await fill('HUITEACHER');fireEvent.click(screen.getByRole('button',{name:'授权固定认知配置'}));await screen.findByRole('region',{name:'认知原请求核对'})
  const raw=sessionStorage.getItem('education-exact-cognitive:'+JSON.stringify([actorId,'HUITEACHER',organizationId]))!;expect(raw).toContain(source.artifactHash);expect(raw).not.toContain('synthetic-password');expect(raw).not.toContain('currentPassword')
  fireEvent.click(screen.getByRole('button',{name:'核对原认知请求'}));await screen.findByText('原认知配置请求已确认。');expect(api.mock.calls.filter(c=>c[1]==='POST')).toHaveLength(1)
 })
})
