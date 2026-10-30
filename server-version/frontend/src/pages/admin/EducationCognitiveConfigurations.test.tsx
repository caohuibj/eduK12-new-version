import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import EducationCognitiveConfigurations from './EducationCognitiveConfigurations'
import {educationConfigurationRequest as request} from '../../api/educationStandardConfigurations'
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
