import {act,fireEvent,render,screen,within,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {EducationRosterSource} from './EducationRosterSource'
import {EducationRosterWorkbench} from './EducationRosterWorkbench'
import {EducationRosterManagement} from './EducationRosterManagement'
import type {EducationRosterApi,RosterSheet} from './types'
const units=[{id:'g',unitKind:'GRADE' as const,name:'一年级',parentUnitId:null},{id:'c',unitKind:'CLASS' as const,name:'一班',parentUnitId:'g'}]
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}))
describe('shared roster workbench interactions',()=>{
 it('requires explicit mapping application and keeps the previous text until then',async()=>{
  const api=vi.fn(),onText=vi.fn(),blocked=vi.fn(),invalidate=vi.fn()
  render(<EducationRosterSource api={api as EducationRosterApi} organizationId="org" kind="STAFF" text="old draft" onText={onText} onBlocked={blocked} onInvalidate={invalidate}/>)
  fireEvent.change(screen.getByLabelText('CSV／Excel 文件'),{target:{files:[{size:40,name:'人员.csv',text:async()=> '员工编号,人员姓名,备注\n0007,示例教师,ignore'}]}})
  await screen.findByRole('region',{name:'表头映射与样例'})
  expect(onText).not.toHaveBeenCalled();expect(invalidate).toHaveBeenCalledOnce();expect(blocked).toHaveBeenLastCalledWith(true)
  fireEvent.change(screen.getByLabelText('对应列：工号'),{target:{value:'0'}});fireEvent.change(screen.getByLabelText('对应列：姓名'),{target:{value:'1'}})
  click('使用这份名单');expect(onText).toHaveBeenCalledWith('"工号","姓名"\n"0007","示例教师"');expect(api).not.toHaveBeenCalled();expect(blocked).toHaveBeenLastCalledWith(false)
 })
 it('keeps numeric Excel identifiers out of prepared input',async()=>{
  const sheets:RosterSheet[]=[{name:'名单',rows:[{line:1,cells:['学号','年级','班级']},{line:2,cells:['7','一年级','一班'],numeric:[0]}]}]
  const api=vi.fn().mockResolvedValue({sheets}),onText=vi.fn()
  render(<EducationRosterSource api={api as EducationRosterApi} organizationId="org" kind="STUDENT" text="draft" onText={onText} onBlocked={vi.fn()} onInvalidate={vi.fn()}/>)
  fireEvent.change(screen.getByLabelText('CSV／Excel 文件'),{target:{files:[{size:20,name:'名单.xlsx',arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer}]}})
  await screen.findByRole('region',{name:'表头映射与样例'});click('使用这份名单')
  expect(screen.getByRole('alert')).toHaveTextContent('无法确认前导零');expect(onText).not.toHaveBeenCalled();expect(api.mock.calls[0][0]).toBe('/organizations/org/roster-files/read')
 })
 it('discards a late file read after manual text changes',async()=>{
  let resolve!:(s:string)=>void
  const onText=vi.fn(),blocked=vi.fn(),props={api:vi.fn() as EducationRosterApi,organizationId:'org',kind:'STAFF' as const,text:'old',onText,onBlocked:blocked,onInvalidate:vi.fn()}
  const view=render(<EducationRosterSource {...props}/>)
  fireEvent.change(screen.getByLabelText('CSV／Excel 文件'),{target:{files:[{size:30,name:'名单.csv',text:()=>new Promise<string>(yes=>{resolve=yes})}]}})
  view.rerender(<EducationRosterSource {...props} text="new draft"/>);await act(async()=>resolve('工号,姓名\nT1,示例'))
  expect(screen.queryByRole('region',{name:'表头映射与样例'})).toBeNull();expect(onText).not.toHaveBeenCalled();expect(blocked).toHaveBeenLastCalledWith(false)
 })
 it('does not apply an async read to a different school after unmount',async()=>{
  let resolve!:(s:string)=>void;const onText=vi.fn()
  const props={api:vi.fn() as EducationRosterApi,organizationId:'old',kind:'STAFF' as const,text:'',onText,onBlocked:vi.fn(),onInvalidate:vi.fn()}
  const view=render(<EducationRosterSource key="old" {...props}/>)
  fireEvent.change(screen.getByLabelText('CSV／Excel 文件'),{target:{files:[{size:30,name:'名单.csv',text:()=>new Promise<string>(yes=>{resolve=yes})}]}})
  view.rerender(<EducationRosterSource key="new" {...props} organizationId="new"/>);await act(async()=>resolve('工号,姓名\nT1,示例'))
  expect(screen.queryByRole('region',{name:'表头映射与样例'})).toBeNull();expect(onText).not.toHaveBeenCalled()
 })
 it('keeps each type draft and never writes while switching tabs or previewing',async()=>{
  const api=vi.fn().mockResolvedValue({token:'preview',add:1,skip:0,errors:0,rows:[{line:2,number:'0001',state:'add',message:'待新增'}]})
  render(<EducationRosterWorkbench api={api as EducationRosterApi} organizationId="org" units={units}/>)
  const select=screen.getByRole('combobox',{name:'导入内容'})
  fireEvent.change(screen.getByRole('textbox',{name:/粘贴名单/}),{target:{value:'学号,年级,班级\n0001,一年级,一班'}})
  fireEvent.change(select,{target:{value:'GRADE'}});fireEvent.change(screen.getByLabelText('待导入内容'),{target:{value:'二年级'}})
  fireEvent.change(select,{target:{value:'STUDENT'}});expect(screen.getByRole('textbox',{name:/粘贴名单/})).toHaveValue('学号,年级,班级\n0001,一年级,一班')
  click('解析并预览');await screen.findByRole('button',{name:'确认新增 1 条'});expect(api).toHaveBeenCalledTimes(1);expect(api.mock.calls[0][0].endsWith('/personnel/preview')).toBe(true)
  fireEvent.change(select,{target:{value:'GRADE'}});expect(screen.getByLabelText('待导入内容')).toHaveValue('二年级')
 })
 it('shows only structure import for a Teacher administrator without School governance',async()=>{
  const api=vi.fn().mockResolvedValue({structure:true,personnel:false})
  render(<EducationRosterManagement api={api as EducationRosterApi} organizationId="org" units={units} onUnits={vi.fn()} entry="TEACHER"/>)
  fireEvent.click(await screen.findByText('年级与班级批量导入'))
  const options=within(screen.getByRole('combobox',{name:'导入内容'})).getAllByRole('option').map(o=>o.textContent)
  expect(options).toEqual(['年级','班级']);expect(screen.queryByRole('region',{name:'全校人员目录'})).toBeNull();expect(api).toHaveBeenCalledTimes(1)
 })
 it('uses the same School directory and API paths when Teacher has both authorizations',async()=>{
  const api=vi.fn(async(path:string)=>path.endsWith('/capabilities')?{structure:true,personnel:true}:{list:[],total:0,page:1,pageSize:25})
  render(<EducationRosterManagement api={api as EducationRosterApi} organizationId="org" units={units} onUnits={vi.fn()} entry="TEACHER"/>)
  const directory=await screen.findByRole('region',{name:'全校人员目录'});fireEvent.click(within(directory).getByRole('button',{name:'批量导入'}))
  expect(within(screen.getByRole('combobox',{name:'导入内容'})).getAllByRole('option')).toHaveLength(5)
  await waitFor(()=>expect(api.mock.calls.some(c=>c[0].includes('/personnel/directory?'))).toBe(true))
  expect(directory).toHaveAttribute('data-entry','TEACHER')
 })
 it('keeps one-row headerless structure files and does not discard the first grade',async()=>{
  render(<EducationRosterWorkbench api={vi.fn() as EducationRosterApi} organizationId="org" units={units} initialKind="GRADE"/>)
  fireEvent.change(screen.getByLabelText('CSV／Excel 文件（可含表头）'),{target:{files:[{size:12,name:'年级.csv',text:async()=> '二年级'}]}})
  const use=await screen.findByRole('button',{name:'按无表头名单使用（保留首行）'});fireEvent.click(use)
  expect(screen.getByLabelText('待导入内容')).toHaveValue('"二年级"');click('解析预览');expect(screen.getByRole('button',{name:'确认新增 1 条'})).toBeEnabled()
 })
 it('keeps an unfinished import when the shared directory disclosure is closed',async()=>{
  const api=vi.fn(async(path:string)=>path.endsWith('/capabilities')?{structure:true,personnel:true}:{list:[],total:0,page:1,pageSize:25})
  render(<EducationRosterManagement api={api as EducationRosterApi} organizationId="org" units={units} onUnits={vi.fn()} entry="TEACHER"/>)
  const directory=await screen.findByRole('region',{name:'全校人员目录'}),toggle=within(directory).getByRole('button',{name:'批量导入'})
  fireEvent.click(toggle);fireEvent.change(screen.getByRole('textbox',{name:/粘贴名单/}),{target:{value:'still editing'}});fireEvent.click(toggle)
  expect(screen.queryByRole('textbox',{name:/粘贴名单/})).toBeNull();fireEvent.click(toggle);expect(screen.getByRole('textbox',{name:/粘贴名单/})).toHaveValue('still editing')
 })

 it('keeps the selected file after MFA expiry and retries only on an explicit click',async()=>{
  const onText=vi.fn(),arrayBuffer=vi.fn(async()=>new Uint8Array([1,2,3]).buffer)
  const api=vi.fn().mockRejectedValueOnce(Error('敏感操作需要重新验证动态验证码')).mockResolvedValue({sheets:[{name:'名单',rows:[{line:1,cells:['工号','姓名']},{line:2,cells:['T0001','合成教师']}]}]})
  render(<EducationRosterSource api={api as EducationRosterApi} organizationId="org" kind="STAFF" text="old draft" onText={onText} onBlocked={vi.fn()} onInvalidate={vi.fn()}/>)
  fireEvent.change(screen.getByLabelText('CSV／Excel 文件'),{target:{files:[{size:20,name:'名单.xlsx',arrayBuffer}]}})
  const retry=await screen.findByRole('button',{name:'重新读取文件'});expect(api).toHaveBeenCalledTimes(1);expect(onText).not.toHaveBeenCalled()
  fireEvent.click(retry);await screen.findByRole('region',{name:'表头映射与样例'});expect(api).toHaveBeenCalledTimes(2);expect(arrayBuffer).toHaveBeenCalledTimes(2)
  expect(onText).not.toHaveBeenCalled();click('使用这份名单');expect(onText).toHaveBeenCalledWith('"工号","姓名"\n"T0001","合成教师"')
 })

})
