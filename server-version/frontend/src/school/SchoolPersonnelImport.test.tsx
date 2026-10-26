import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {SchoolPersonnelImport,SchoolPersonnelClaim} from './SchoolPersonnelImport'
import type {SchoolApi} from './SchoolRecovery'
const org='school-a',text='学号,年级,班级\nS001,一年级,一班'
const preview={token:'fixed',add:1,skip:0,errors:0,rows:[{line:2,number:'S001',name:'',state:'add',message:'待新增'}]}
const click=(label:string)=>fireEvent.click(screen.getByRole('button',{name:label}))
beforeEach(()=>vi.restoreAllMocks())
async function prepare(api:SchoolApi){render(<SchoolPersonnelImport api={api} organizationId={org}/>);click('批量导入');fireEvent.change(screen.getByRole('textbox',{name:/粘贴名单/}),{target:{value:text}});click('解析并预览');await screen.findByRole('button',{name:'确认新增 1 条'})}
describe('School personnel preview/confirm',()=>{
 it('makes no writes before confirmation and imports only parsed input plus the server token',async()=>{
  const api=vi.fn().mockResolvedValueOnce(preview).mockResolvedValueOnce({added:1,skipped:0}).mockResolvedValue({list:[],next:null})
  await prepare(api as SchoolApi)
  expect(api).toHaveBeenCalledTimes(1)
  click('确认新增 1 条');await screen.findByRole('status')
  expect(api.mock.calls[1][0]).toBe('/organizations/school-a/personnel/import')
  expect(api.mock.calls[1][2]).toMatchObject({input:{kind:'STUDENT',rows:[{number:'S001'}]},previewToken:'fixed',verifiedOffline:false})
 })
 it('invalidates preview after editing and blocks a server-reported conflict',async()=>{
  const api=vi.fn().mockResolvedValue(preview)
  await prepare(api as SchoolApi)
  fireEvent.change(screen.getByRole('textbox',{name:/粘贴名单/}),{target:{value:text+'\nS002,一年级,一班'}})
  expect(screen.queryByRole('button',{name:'确认新增 1 条'})).toBeNull()
  api.mockResolvedValue({...preview,errors:1});click('解析并预览')
  expect(await screen.findByRole('button',{name:'确认新增 1 条'})).toBeDisabled()
 })
 it('retains the same batch ID on uncertain response and does not automatically retry',async()=>{
  const api=vi.fn().mockResolvedValueOnce(preview).mockRejectedValueOnce(Error('connection lost')).mockResolvedValueOnce({added:1,skipped:0}).mockResolvedValue({list:[],next:null})
  await prepare(api as SchoolApi);click('确认新增 1 条');await screen.findByRole('alert')
  const batch=api.mock.calls[1][2].batchId;expect(api).toHaveBeenCalledTimes(2)
  click('确认新增 1 条');await screen.findByRole('status');expect(api.mock.calls[2][2].batchId).toBe(batch)
 })
 it('requires explicit offline verification when an existing login is present',async()=>{
  const api=vi.fn().mockResolvedValue(preview)
  render(<SchoolPersonnelImport api={api as SchoolApi} organizationId={org}/>);click('批量导入')
  fireEvent.change(screen.getByRole('textbox',{name:/粘贴名单/}),{target:{value:'学号,年级,班级,已有校园用户名\nS001,一年级,一班,student-old'}})
  click('解析并预览');expect(await screen.findByRole('button',{name:'确认新增 1 条'})).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'));expect(screen.getByRole('button',{name:'确认新增 1 条'})).not.toBeDisabled()
 })
 it('clears preview, personal details and credentials when switching school',async()=>{
  const api=vi.fn().mockResolvedValue(preview),view=render(<SchoolPersonnelImport api={api as SchoolApi} organizationId={org}/>)
  click('批量导入');fireEvent.change(screen.getByRole('textbox',{name:/粘贴名单/}),{target:{value:text}});click('解析并预览');await screen.findByRole('button',{name:'确认新增 1 条'})
  view.rerender(<SchoolPersonnelImport api={api as SchoolApi} organizationId="school-b"/>);expect(screen.queryByText(/S001/)).toBeNull();expect(screen.queryByRole('button',{name:'确认新增 1 条'})).toBeNull()
 })
 it('discards a late preview after the school changes',async()=>{
  let resolve!:(value:unknown)=>void
  const api=vi.fn(()=>new Promise(r=>{resolve=r})),view=render(<SchoolPersonnelImport api={api as SchoolApi} organizationId={org}/>)
  click('批量导入');fireEvent.change(screen.getByRole('textbox',{name:/粘贴名单/}),{target:{value:text}});click('解析并预览')
  view.rerender(<SchoolPersonnelImport api={api as SchoolApi} organizationId="school-b"/>);await act(async()=>resolve(preview));expect(screen.queryByText(/S001/)).toBeNull()
 })
 it('keeps manual account verification separate from import and activation',async()=>{
  const p={id:'person-1',kind:'STAFF',number:'T001',name:'合成教师',persona:'TEACHER',grade:null,className:null,activated:false,existingAccount:false}
  const api=vi.fn().mockResolvedValueOnce({list:[p],next:null}).mockResolvedValueOnce({status:'PENDING_OWNER_CONFIRMATION'}).mockResolvedValue({list:[{...p,existingAccount:true}],next:null})
  render(<SchoolPersonnelImport api={api as SchoolApi} organizationId={org}/>);click('刷新人员名单');await screen.findByRole('button',{name:'核实已有账号'});click('核实已有账号')
  fireEvent.change(screen.getByRole('textbox',{name:'已有校园用户名'}),{target:{value:'teacher_old'}})
  expect(screen.getByRole('button',{name:'确认核实结果'})).toBeDisabled();expect(api).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('checkbox'));click('确认核实结果');await screen.findByRole('status')
  expect(api.mock.calls[1]).toEqual(['/organizations/school-a/personnel/person-1/bind-existing','POST',{username:'teacher_old',verifiedOffline:true}])
  expect(screen.queryByText('one-time-test-code')).toBeNull()
 })
 it('keeps input and batch ID during MFA refresh and never automatically replays a write',async()=>{
  const api=vi.fn().mockResolvedValueOnce(preview).mockRejectedValueOnce(Error('敏感操作需要重新验证动态验证码')).mockResolvedValueOnce({stepUp:true}).mockResolvedValueOnce({added:1,skipped:0}).mockResolvedValue({list:[],next:null})
  await prepare(api as SchoolApi);click('确认新增 1 条');await screen.findByRole('alert')
  const batch=api.mock.calls[1][2].batchId
  expect(screen.getByRole('textbox',{name:/粘贴名单/})).toHaveValue(text)
  fireEvent.change(screen.getByRole('textbox',{name:'6 位动态验证码'}),{target:{value:'123456'}});click('验证身份')
  await screen.findByText(/身份验证成功/)
  expect(api).toHaveBeenCalledTimes(3)
  expect(api.mock.calls[2]).toEqual(['/auth/mfa/step-up','POST',{code:'123456'}])
  expect(screen.getByRole('textbox',{name:/粘贴名单/})).toHaveValue(text)
  click('确认新增 1 条');await screen.findByText(/已新增 1 条/)
  expect(api.mock.calls[3][2].batchId).toBe(batch)
 })
 it('shows actual errors first without hiding the complete preview',async()=>{
  const mixed={...preview,errors:1,skip:1,rows:[...preview.rows,{line:3,number:'S002',name:'',state:'error',message:'班级名册已锁定'},{line:4,number:'S003',name:'',state:'skip',message:'人员已存在，跳过'}]}
  const api=vi.fn().mockResolvedValue(mixed)
  await prepare(api as SchoolApi)
  const panel=screen.getByRole('region',{name:'名单导入预览'})
  expect(within(panel).getByText('S002')).toBeVisible()
  expect(within(panel).queryByText('S001')).toBeNull()
  expect(within(panel).queryByText('S003')).toBeNull()
  expect(screen.getByRole('button',{name:'确认新增 1 条'})).toBeDisabled()
  click('只看错误');expect(within(panel).getByText('S003')).toBeVisible()
  click('只看错误');expect(within(panel).queryByText('S003')).toBeNull()
  click('返回修改名单');expect(screen.getByRole('textbox',{name:/粘贴名单/})).toHaveFocus()
 })
 it('explains an all-duplicate preview without presenting an unusable zero-row import',async()=>{
  const api=vi.fn().mockResolvedValue({...preview,add:0,skip:1,rows:[{...preview.rows[0],state:'skip',message:'人员已存在，跳过'}]})
  render(<SchoolPersonnelImport api={api as SchoolApi} organizationId={org}/>);click('批量导入')
  fireEvent.change(screen.getByRole('textbox',{name:/粘贴名单/}),{target:{value:text}});click('解析并预览')
  await screen.findByText(/这些记录已存在，无需再次导入/)
  expect(screen.queryByRole('button',{name:/确认新增/})).toBeNull();expect(api).toHaveBeenCalledTimes(1)
 })
 it('preserves pasted input on a failed file read and invalidates the previous confirmation',async()=>{
  const api=vi.fn().mockResolvedValue(preview)
  await prepare(api as SchoolApi)
  const file={size:20,name:'名单.csv',text:()=>Promise.reject(Error('file unavailable'))}
  fireEvent.change(screen.getByLabelText('UTF-8 CSV／TSV 文件'),{target:{files:[file]}})
  await screen.findByText(/文件读取失败，当前文本已保留/)
  expect(screen.getByRole('textbox',{name:/粘贴名单/})).toHaveValue(text)
  expect(screen.queryByRole('button',{name:'确认新增 1 条'})).toBeNull()
  expect(api).toHaveBeenCalledTimes(1)
 })
 it('keeps verification beside the chosen person and cancels issuing without a credential request',async()=>{
  const people=[{id:'p1',kind:'STAFF',number:'T001',name:'教师甲',persona:'TEACHER',grade:null,className:null,activated:false,existingAccount:false},{id:'p2',kind:'STAFF',number:'T002',name:'教师乙',persona:'TEACHER',grade:null,className:null,activated:false,existingAccount:false}]
  const api=vi.fn().mockResolvedValue({list:people,next:null})
  render(<SchoolPersonnelImport api={api as SchoolApi} organizationId={org}/>);click('刷新人员名单');await screen.findByText('教师乙')
  const row=screen.getByText('教师乙').closest('li')!
  fireEvent.click(within(row).getByRole('button',{name:'核实已有账号'}))
  expect(within(row).getByRole('form',{name:'为 T002 核实已有账号'})).toBeVisible()
  fireEvent.click(within(row).getByRole('button',{name:'取消'}))
  fireEvent.click(within(row).getByRole('button',{name:'发放激活码'}))
  expect(within(row).getByRole('region',{name:'为 T002 确认发放激活码'})).toHaveTextContent('原有未使用的个人码将失效')
  fireEvent.click(within(row).getByRole('button',{name:'取消'}))
  expect(api).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('region',{name:'本次激活凭据'})).toBeNull()
 })
 it('keeps an active search visible and clearable when its input is collapsed',async()=>{
  const people=[{id:'p1',kind:'STAFF',number:'T001',name:'教师甲',persona:'TEACHER',activated:false,existingAccount:false},{id:'p2',kind:'STAFF',number:'T002',name:'教师乙',persona:'TEACHER',activated:false,existingAccount:false}]
  const api=vi.fn().mockResolvedValue({list:people,next:null})
  render(<SchoolPersonnelImport api={api as SchoolApi} organizationId={org}/>);click('刷新人员名单');await screen.findByText('教师乙')
  click('检索名单');fireEvent.change(screen.getByRole('searchbox'),{target:{value:'教师甲'}});click('检索名单')
  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(screen.getByText('检索：教师甲')).toBeVisible()
  expect(screen.queryByText('教师乙')).toBeNull()
  click('清空名单检索');expect(screen.getByText('教师乙')).toBeVisible()
 })
 it('shows activation codes only after an explicit single-person request',async()=>{
  const p={id:'person-1',kind:'STUDENT',number:'S001',name:'',persona:'STUDENT',grade:'一年级',className:'一班',activated:false,existingAccount:false}
  const api=vi.fn().mockResolvedValueOnce({list:[p],next:null}).mockResolvedValue({code:'one-time-test-code',expiresAt:'2030-01-01T00:00:00Z'})
  render(<SchoolPersonnelImport api={api as SchoolApi} organizationId={org}/>);click('刷新人员名单');await screen.findByRole('button',{name:'发放激活码'})
  expect(api).toHaveBeenCalledTimes(1);click('发放激活码');expect(api).toHaveBeenCalledTimes(1);click('确认发放');const credential=await screen.findByRole('region',{name:'本次激活凭据'})
  expect(within(credential).getByText('one-time-test-code')).toBeVisible();click('关闭凭据');expect(screen.queryByText('one-time-test-code')).toBeNull()
 })
})
describe('School existing identity owner confirmation',()=>{
 it('uses authenticated student claim without submitting a new username or password',async()=>{
  const api=vi.fn().mockResolvedValueOnce({kind:'STUDENT',organizationId:org,classUnitId:'class-a'}).mockResolvedValue({})
  render(<SchoolPersonnelClaim api={api as SchoolApi} student onComplete={vi.fn()}/>);fireEvent.click(screen.getByText('激活名单身份（已有校园账号）'))
  fireEvent.change(screen.getByRole('textbox',{name:'学校发放的个人激活码'}),{target:{value:'code-test'}});fireEvent.change(screen.getByRole('textbox',{name:'学号'}),{target:{value:'S001'}})
  click('使用当前账号确认');await screen.findByRole('status');expect(api.mock.calls[1]).toEqual(['/claim-existing-student','POST',{organizationId:org,classUnitId:'class-a',studentNumber:'S001',activationCode:'code-test'}])
 })
 it('does not fall back to account creation when staff claim fails',async()=>{
  const api=vi.fn().mockResolvedValueOnce({kind:'STAFF'}).mockRejectedValue(Error('owner mismatch'))
  render(<SchoolPersonnelClaim api={api as SchoolApi} student={false} onComplete={vi.fn()}/>);fireEvent.click(screen.getByText('激活名单身份（已有校园账号）'))
  fireEvent.change(screen.getByRole('textbox',{name:'学校发放的个人激活码'}),{target:{value:'code-test'}});click('使用当前账号确认');await screen.findByRole('alert')
  await waitFor(()=>expect(api).toHaveBeenCalledTimes(2));expect(api.mock.calls[1][0]).toBe('/personnel/claim-staff')
 })
})
