import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import StandardDelegationPanel from './StandardDelegationPanel'
const client=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}))
vi.mock('../../api/client',()=>({default:client}))
vi.mock('../../admin/AdminStepUp',()=>({default:({onVerified}:{onVerified:()=>void})=><button onClick={onVerified}>完成现有管理员验证</button>}))
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),combination={id:id(2),title:'AUDIT 合成量表',instrumentVersion:'1.0',contentVersion:'C1',parametersVersion:'P1',reportVersion:'R1'}
const other={...combination,id:id(3),reportVersion:'R2'},schoolOnly={...combination,id:id(4),reportVersion:'R3'}
const school={id:id(5),label:'AUDIT 一校'},school2={id:id(6),label:'AUDIT 二校'}
const admin=(product='SCHOOL')=>({id:product==='SCHOOL'?id(7):id(8),label:'正式 '+product+' 管理员'})
const measure=id(9),base='/admin/permissions/standard-delegations/'+combination.id
const exactKey='education-source:STANDARD_SCALE:'+combination.id+':'+ 'c'.repeat(64)
const cover=(product='SCHOOL',assignable=true)=>({measurementReleaseId:measure,coverageDigest:'a'.repeat(64),combinationResourceKey:exactKey,
 combinationCoverageDigest:assignable?'b'.repeat(64):null,assignable,combinations:product==='SCHOOL'?[combination,other,schoolOnly]:[combination,other]})
const record={id:id(10),version:3,product:'SCHOOL',schoolName:school.label,adminName:admin().label,startsAt:'2027-01-01T00:00:00Z',expiresAt:'2030-01-01T00:00:00Z',revokedAt:null as string|null,status:'ACTIVE',reason:'合成旧委托',scope:'MEASUREMENT' as string}
let records:typeof record[]=[]
function reply<T>(data:T){return {code:0,data}}
function directory(product='SCHOOL',assignable=true){return {cover:cover(product,assignable),schools:[school],administrators:[admin(product)],records,moreSchools:false,moreAdministrators:false,moreRecords:false}}
function metadata(intent:any,revoked=false){return {grantId:intent.requestId,version:revoked?2:1,parentGrantId:null,issuerId:actor,subjectId:intent.adminId,
 scope:{product:intent.product,scopeKind:'ORGANIZATION',scopeId:intent.schoolId,resourceKind:'material',resourceKeys:[intent.scope==='COMBINATION'?exactKey:measure]},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:intent.startsAt,expiresAt:intent.expiresAt,revokedAt:revoked?'2027-01-01T00:00:00Z':null}}
function defaultRead(path:string){const url=new URL(path,'http://test.local');return reply(directory(url.searchParams.get('product')??'SCHOOL'))}
async function choose(product='SCHOOL'){
 fireEvent.click(await screen.findByRole('button',{name:'选择学校 '+school.label}))
 fireEvent.click(screen.getByRole('button',{name:'选择管理员 '+admin(product).label}))
 fireEvent.change(screen.getByLabelText('委托生效时间（本地时间）'),{target:{value:'2028-01-01T10:30'}})
 fireEvent.change(screen.getByLabelText('委托到期时间（本地时间）'),{target:{value:'2029-01-01T10:30'}})
 fireEvent.change(screen.getByLabelText('分配权限原因'),{target:{value:'本轮合成分配'}})
}
function mount(){return render(<StandardDelegationPanel actorId={actor} combination={combination} onClose={vi.fn()}/>)}
beforeEach(()=>{
 vi.resetAllMocks();sessionStorage.clear();records=[];vi.spyOn(window,'confirm').mockReturnValue(true)
 client.get.mockImplementation(async(path:string)=>defaultRead(path))
 client.post.mockImplementation(async(path:string,body:any)=>{
  if(path.endsWith('/revoke')){records=records.map(row=>({...row,revokedAt:'2027-01-01T00:00:00Z',status:'REVOKED',version:row.version+1}));return reply({grantId:path.split('/').slice(-2)[0],version:4})}
  records=[{...record,id:body.requestId,version:1,product:body.product,adminName:admin(body.product).label,startsAt:body.startsAt,expiresAt:body.expiresAt,status:'SCHEDULED',reason:body.reason,scope:body.scope??'MEASUREMENT'}]
  return reply({grantId:body.requestId,version:1})
 })
})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it.each(['SCHOOL','TEACHER'])('confirms every actual %s combination and future scope, then reads records in place',async product=>{
 mount()
 if(product!=='SCHOOL')fireEvent.change(screen.getByLabelText('分发入口'),{target:{value:product}})
 await choose(product)
 const region=screen.getByRole('region',{name:'实际委托范围'})
 expect(within(region).getAllByRole('listitem')).toHaveLength(product==='SCHOOL'?3:2)
 vi.mocked(window.confirm).mockReturnValueOnce(false)
 fireEvent.click(screen.getByRole('button',{name:'确认分配权限'}))
 await waitFor(()=>expect(window.confirm).toHaveBeenCalled())
 expect(client.post).not.toHaveBeenCalled()
 const confirmCalls=vi.mocked(window.confirm).mock.calls;const prompt=confirmCalls[confirmCalls.length-1]![0]!
 expect(prompt).toContain('R R1');expect(prompt).toContain('R R2')
 if(product==='SCHOOL')expect(prompt).toContain('R R3');else expect(prompt).not.toContain('R R3')
 expect(prompt).toContain('今后新获准组合也在这笔委托范围内')
 expect(prompt).toContain('不会授予校内人员资格、个人使用权或商业工具许可')
 await waitFor(()=>expect(screen.getByRole('button',{name:'确认分配权限'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'确认分配权限'}))
 await waitFor(()=>expect(client.post).toHaveBeenCalledWith(base,expect.objectContaining({product,schoolId:school.id,adminId:admin(product).id,coverageDigest:'a'.repeat(64),startsAt:new Date('2028-01-01T10:30').toISOString(),expiresAt:new Date('2029-01-01T10:30').toISOString(),reason:'本轮合成分配'})))
 const history=screen.getByRole('region',{name:'此测量版本的原委托'})
 expect(await within(history).findByRole('heading',{name:school.label+' · '+admin(product).label})).toBeVisible()
 expect(screen.getByText('请求已确认，请回读当前状态；签发记录不代表当前仍有效。')).toBeVisible()
 vi.mocked(window.confirm).mockClear()
 fireEvent.change(screen.getByLabelText('分发入口'),{target:{value:product==='SCHOOL'?'TEACHER':'SCHOOL'}})
 expect(window.confirm).not.toHaveBeenCalled()
})
it('shows just the selected combination and keeps its scope across a pending-request reload',async()=>{
 client.post.mockRejectedValueOnce(new Error('页面连接中断'))
 mount();await choose()
 fireEvent.change(screen.getByLabelText('委托范围'),{target:{value:'COMBINATION'}})
 const region=screen.getByRole('region',{name:'实际委托范围'})
 expect(within(region).getAllByRole('listitem')).toHaveLength(1)
 expect(region).toHaveTextContent('R R1')
 expect(region).not.toHaveTextContent('R R2')
 fireEvent.click(screen.getByRole('button',{name:'确认分配权限'}))
 await screen.findByRole('region',{name:'待核对分配请求'})
 const [path,intent]=client.post.mock.calls[0]
 expect(path).toBe(base)
 expect(intent).toMatchObject({scope:'COMBINATION',coverageDigest:'b'.repeat(64)})
 const prompt=vi.mocked(window.confirm).mock.calls[0][0]
 expect(prompt).not.toContain('R R2')
 expect(prompt).not.toContain('今后新获准组合')
 cleanup()
 mount()
 expect(await screen.findByLabelText('委托范围')).toHaveValue('COMBINATION')
 fireEvent.click(screen.getByRole('button',{name:'重试同一请求'}))
 await waitFor(()=>expect(client.post.mock.calls[1]).toEqual([base,intent]))
 expect(await screen.findByText(/仅当前组合 · 待生效/)).toBeVisible()
})
it('keeps candidate search and pagination separate from the original grant records',async()=>{
 records=[record]
 client.get.mockImplementation(async(path:string)=>{
  const url=new URL(path,'http://test.local'),data=directory()
  return reply({...data,schools:url.searchParams.get('schoolQuery')==='二校'?[school2]:[school],moreSchools:true,moreAdministrators:true,moreRecords:true})
 })
 mount();await screen.findByRole('button',{name:'选择学校 '+school.label})
 fireEvent.change(screen.getByLabelText('学校名称'),{target:{value:'二校'}})
 fireEvent.click(screen.getByRole('button',{name:'搜索学校'}))
 await screen.findByRole('button',{name:'选择学校 '+school2.label})
 fireEvent.change(screen.getByLabelText('管理员姓名或账号'),{target:{value:'正式'}})
 fireEvent.click(screen.getByRole('button',{name:'搜索管理员'}))
 await waitFor(()=>expect(client.get.mock.calls.some(([path])=>new URL(path,'http://test.local').searchParams.get('adminQuery')==='正式')).toBe(true))
 await waitFor(()=>expect(screen.getByRole('button',{name:'下一页学校'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'下一页学校'}))
 await waitFor(()=>expect(client.get.mock.calls.some(([path])=>new URL(path,'http://test.local').searchParams.get('schoolPage')==='2')).toBe(true))
 expect(await screen.findByRole('heading',{name:school.label+' · '+admin().label})).toBeVisible()
 await waitFor(()=>expect(screen.getByRole('button',{name:'下一页委托'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'下一页委托'}))
 await waitFor(()=>expect(client.get.mock.calls.some(([path])=>new URL(path,'http://test.local').searchParams.get('page')==='2')).toBe(true))
 expect(client.post).not.toHaveBeenCalled()
})
it('drops an earlier product response instead of showing its candidates in the new entry',async()=>{
 let finish!:(value:unknown)=>void
 const old=new Promise(resolve=>{finish=resolve})
 client.get.mockImplementation((path:string)=>new URL(path,'http://test.local').searchParams.get('product')==='SCHOOL'?old:Promise.resolve(reply(directory('TEACHER'))))
 mount();fireEvent.change(screen.getByLabelText('分发入口'),{target:{value:'TEACHER'}})
 await screen.findByRole('button',{name:'选择管理员 '+admin('TEACHER').label})
 await act(async()=>{finish(reply(directory()));await old})
 expect(screen.queryByRole('button',{name:'选择管理员 '+admin().label})).not.toBeInTheDocument()
 expect(client.post).not.toHaveBeenCalled()
})
it('unlocks a first definite business rejection so an invalid administrator can be replaced',async()=>{
 client.post.mockRejectedValueOnce(Object.assign(new Error('目标管理员当前已无此入口资格'),{status:403}))
 mount();await choose();fireEvent.click(screen.getByRole('button',{name:'确认分配权限'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('本次变更明确未执行')
 expect(screen.queryByRole('region',{name:'待核对分配请求'})).not.toBeInTheDocument()
 expect(screen.getByLabelText('分发入口')).toBeEnabled()
 expect(screen.getByLabelText('分配权限原因')).toBeEnabled()
 expect(sessionStorage.getItem('standard-delegation-pending:'+actor+':'+combination.id+':SCHOOL')).toBeNull()
})
it('keeps an MFA rejection on the same intent, refreshes after verification and retries the same request',async()=>{
 client.post.mockRejectedValueOnce(Object.assign(new Error('需要近期管理员双因素验证'),{status:403}))
 mount();await choose();fireEvent.click(screen.getByRole('button',{name:'确认分配权限'}))
 const pending=await screen.findByRole('region',{name:'待核对分配请求'})
 const intent=client.post.mock.calls[0][1]
 expect(screen.getByLabelText('分发入口')).toBeDisabled()
 const reads=client.get.mock.calls.length
 fireEvent.click(screen.getByRole('button',{name:'完成现有管理员验证'}))
 await waitFor(()=>expect(client.get.mock.calls.length).toBeGreaterThan(reads))
 await waitFor(()=>expect(within(pending).getByRole('button',{name:'重试同一请求'})).toBeEnabled())
 fireEvent.click(within(pending).getByRole('button',{name:'重试同一请求'}))
 await waitFor(()=>expect(client.post).toHaveBeenCalledTimes(2))
 expect(client.post.mock.calls[1]).toEqual([base,intent])
 await screen.findByText('请求已确认，请回读当前状态；签发记录不代表当前仍有效。')
})
it('uses an exact metadata read after an unknown issue and does not infer failure from an empty records page',async()=>{
 client.post.mockRejectedValueOnce(new Error('回执连接中断'))
 const view=mount();await choose();fireEvent.click(screen.getByRole('button',{name:'确认分配权限'}))
 await screen.findByRole('region',{name:'待核对分配请求'})
 const intent=client.post.mock.calls[0][1]
 view.unmount()
 client.get.mockImplementation(async(path:string)=>path==='/admin/permissions/content-grants/'+intent.requestId?reply(metadata(intent,true)):defaultRead(path))
 mount()
 fireEvent.click(screen.getByRole('button',{name:'读取原委托当前状态'}))
 expect(await screen.findByText('已读取原委托，当前状态为已撤销；这不认定此前请求由谁完成。')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'按已读状态结束待核对'}))
 expect(await screen.findByText('原请求已核对，当前委托状态为已撤销。')).toBeVisible()
 expect(client.post).toHaveBeenCalledTimes(1)
 expect(client.get).toHaveBeenCalledWith('/admin/permissions/content-grants/'+intent.requestId)
})
it('does not discard an earlier unknown issue after a later business rejection or a missing metadata result',async()=>{
 client.post.mockRejectedValueOnce(new Error('回执连接中断')).mockRejectedValueOnce(Object.assign(new Error('目标管理员资格已撤销'),{status:403}))
 mount();await choose();fireEvent.click(screen.getByRole('button',{name:'确认分配权限'}))
 const pending=await screen.findByRole('region',{name:'待核对分配请求'})
 await waitFor(()=>expect(within(pending).getByRole('button',{name:'重试同一请求'})).toBeEnabled())
 fireEvent.click(within(pending).getByRole('button',{name:'重试同一请求'}))
 await waitFor(()=>expect(client.post).toHaveBeenCalledTimes(2))
 client.get.mockRejectedValueOnce(Object.assign(new Error('未找到原委托'),{status:404}))
 await waitFor(()=>expect(within(pending).getByRole('button',{name:'读取原委托当前状态'})).toBeEnabled())
 fireEvent.click(within(pending).getByRole('button',{name:'读取原委托当前状态'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('未找到原委托')
 expect(screen.getByRole('region',{name:'待核对分配请求'})).toBeVisible()
 expect(screen.getByLabelText('分配权限原因')).toBeDisabled()
 expect(screen.queryByRole('button',{name:'按已读状态结束待核对'})).not.toBeInTheDocument()
})
it('refreshes a protected GET after inline MFA without losing the selected combination or entry',async()=>{
 let blocked=true
 client.get.mockImplementation(async(path:string)=>{if(blocked){blocked=false;throw Object.assign(new Error('需要近期管理员双因素验证'),{status:403})}return defaultRead(path)})
 mount();await screen.findByRole('alert')
 fireEvent.click(screen.getByRole('button',{name:'完成现有管理员验证'}))
 expect(await screen.findByRole('button',{name:'选择学校 '+school.label})).toBeVisible()
 expect(screen.getByLabelText('分发入口')).toHaveValue('SCHOOL')
 expect(screen.getByRole('region',{name:'组合分配权限'})).toHaveTextContent(combination.title)
 expect(client.post).not.toHaveBeenCalled()
})
it('keeps withdrawn historical delegation management available without allowing a new issue',async()=>{
 records=[record]
 client.get.mockImplementation(async()=>reply(directory('SCHOOL',false)))
 mount()
 expect(await screen.findByText('当前选中组合不可新增分配。历史委托仍可在下方查询、核对和撤销。')).toBeVisible()
 expect(screen.getByRole('button',{name:'确认分配权限'})).toBeDisabled()
 fireEvent.change(screen.getByLabelText('撤销原因 · '+school.label+' / '+admin().label),{target:{value:'本轮撤销原委托'}})
 vi.mocked(window.confirm).mockReturnValueOnce(false)
 fireEvent.click(screen.getByRole('button',{name:'撤销此委托'}))
 await waitFor(()=>expect(window.confirm).toHaveBeenCalled());expect(client.post).not.toHaveBeenCalled()
 await waitFor(()=>expect(screen.getByRole('button',{name:'撤销此委托'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'撤销此委托'}))
 await waitFor(()=>expect(client.post).toHaveBeenCalledWith(base+'/'+record.id+'/revoke',{expectedVersion:3,reason:'本轮撤销原委托'}))
 expect(await screen.findByText(/已撤销 ·/)).toBeVisible()
 expect(screen.queryByRole('button',{name:'撤销此委托'})).not.toBeInTheDocument()
})
