import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {SchoolPersonnelDirectory} from './SchoolPersonnelDirectory'
import type {SchoolApi} from './SchoolRecovery'
const p={id:'p.11111111-1111-1111-1111-111111111111',personId:'11111111-1111-1111-1111-111111111111',kind:'STUDENT',persona:'STUDENT',source:'IMPORTED',number:'000001',name:null,username:null,reference:null,activation:'PENDING',account:'NOT_CREATED',membership:'NONE',admission:'NOT_REGISTERED',existingAccount:false,classUnitId:'c1',className:'一班',grade:'一年级'}
const page={list:[p],total:26,page:1,pageSize:25},units=[{id:'g1',unitKind:'GRADE',name:'一年级'},{id:'c1',unitKind:'CLASS',name:'一班',parentUnitId:'g1'}]
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}))
const mount=(api:ReturnType<typeof vi.fn>)=>render(<SchoolPersonnelDirectory api={api as SchoolApi} organizationId="school-a" units={units}/>)
describe('School unified personnel directory',()=>{
 it('queries the whole school and pages on the server rather than filtering a loaded subset',async()=>{
  const api=vi.fn().mockResolvedValue(page);mount(api);await screen.findByText('共 26 人')
  click('下一页人员');await waitFor(()=>expect(api.mock.calls[api.mock.calls.length-1][0]).toContain('page=2'))
  fireEvent.change(screen.getByRole('combobox',{name:'人员'}),{target:{value:'STAFF'}})
  await waitFor(()=>expect(api.mock.calls[api.mock.calls.length-1][0]).toContain('kind=STAFF'))
  expect(api.mock.calls[api.mock.calls.length-1][0]).toContain('page=1')
  click('检索全校人员');fireEvent.change(screen.getByRole('searchbox'),{target:{value:'000001'}});click('查询')
  await waitFor(()=>expect(api.mock.calls[api.mock.calls.length-1][0]).toContain('query=000001'))
  click('检索全校人员');expect(screen.queryByRole('searchbox')).toBeNull();expect(screen.getByText('检索：000001')).toBeVisible()
  click('清除全校检索');await waitFor(()=>expect(api.mock.calls[api.mock.calls.length-1][0]).toContain('query=&'))
 })
 it('keeps activation, membership and approval separate and reuses guarded personal credential actions',async()=>{
  const api=vi.fn().mockImplementation((path:string)=>path.endsWith('/'+p.id)?Promise.resolve({...p,classes:[]}):Promise.resolve(page))
  mount(api);await screen.findByText('共 26 人');click('000001 学生 · 一年级 · 一班 待激活 尚未建立成员关系')
  const detail=await screen.findByRole('region',{name:'人员详情'})
  expect(await within(detail).findByText('尚未激活账号')).toBeVisible();expect(within(detail).getByText('尚未注册')).toBeVisible()
  expect(within(detail).getByRole('button',{name:'发放激活码'})).toBeVisible();expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
  fireEvent.click(within(detail).getByRole('button',{name:'发放激活码'}));expect(api).toHaveBeenCalledTimes(2)
  expect(within(detail).getByRole('button',{name:'确认发放'})).toBeVisible()
  click('关闭人员详情');expect(screen.queryByRole('region',{name:'人员详情'})).toBeNull()
 })
 it('shows old students without invented names and offers no imported-identity actions',async()=>{
  const old={...p,id:'u.22222222-2222-2222-2222-222222222222',personId:null,source:'EXISTING',name:null,number:null,username:'old_student',reference:'校园学生 A001',activation:'ACTIVATED',account:'USABLE',membership:'NONE',admission:'PENDING_CLASS_APPROVAL'}
  const api=vi.fn().mockImplementation((path:string)=>Promise.resolve(path.endsWith(old.id)?{...old,classes:[]}:{...page,list:[old],total:1}))
  mount(api);await screen.findByText('校园学生 A001');fireEvent.click(screen.getByRole('button',{name:/校园学生 A001/}))
  const detail=await screen.findByRole('region',{name:'人员详情'});await within(detail).findByText('原有学校记录')
  expect(within(detail).getByText('待班级审批')).toBeVisible();expect(screen.queryByRole('button',{name:'发放激活码'})).toBeNull()
 })
 it('clears prior personal data and discards late details when switching schools',async()=>{
  let resolve!:(value:unknown)=>void
  const api=vi.fn().mockImplementation((path:string)=>path.endsWith(p.id)?new Promise(r=>{resolve=r}):Promise.resolve(page))
  const view=mount(api);await screen.findByText('共 26 人');fireEvent.click(screen.getByRole('button',{name:/000001/}))
  view.rerender(<SchoolPersonnelDirectory api={api as SchoolApi} organizationId="school-b" units={[]}/>)
  await act(async()=>resolve({...p,name:'old-private-name',classes:[]}))
  expect(screen.queryByText('old-private-name')).toBeNull();expect(screen.queryByRole('region',{name:'人员详情'})).toBeNull()
 })
 it('never automatically replays a read or write after security verification',async()=>{
  const api=vi.fn().mockRejectedValueOnce(Error('敏感操作需要重新验证动态验证码')).mockResolvedValueOnce({ok:true}).mockResolvedValue(page)
  mount(api);await screen.findByRole('form',{name:'目录身份验证'})
  fireEvent.change(screen.getByRole('textbox',{name:'6 位动态验证码'}),{target:{value:'123456'}});click('验证身份')
  await screen.findByText('验证成功，请点击刷新重新读取名单。');expect(api).toHaveBeenCalledTimes(2)
  click('刷新全校人员');await screen.findByText('共 26 人');expect(api).toHaveBeenCalledTimes(3)
 })
 it('opens the existing importer without duplicating its loaded-person list',async()=>{
  const api=vi.fn().mockResolvedValue(page);mount(api);await screen.findByText('共 26 人');click('批量导入')
  expect(screen.getByRole('textbox',{name:/粘贴名单/})).toBeVisible()
  expect(screen.queryByRole('button',{name:'读取人员名单'})).toBeNull()
  expect(screen.queryByRole('button',{name:'刷新人员名单'})).toBeNull()
 })
})

it('opens explicitly requested structure import only after the guarded directory read succeeds',async()=>{
 let finish!:(value:unknown)=>void
 const pending=new Promise(resolve=>{finish=resolve})
 const api=vi.fn().mockImplementation((path:string)=>path.includes('/directory?')?pending:Promise.resolve({list:[]}))
 render(<SchoolPersonnelDirectory api={api as SchoolApi} organizationId="school-a" units={units} initialImportKind="GRADE"/> )
 expect(screen.queryByRole('combobox',{name:'导入内容'})).not.toBeInTheDocument()
 await act(async()=>{finish({...page,batchImport:true});await pending})
 expect(await screen.findByRole('combobox',{name:'导入内容'})).toHaveValue('GRADE')
 expect(api.mock.calls.every(([,method])=>!method||method==='GET')).toBe(true)
})
