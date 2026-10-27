import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {SchoolStructureImport} from './SchoolStructureImport'
import type {SchoolApi} from './SchoolRecovery'
import type {SchoolUnit} from './school-structure-import'
const units:SchoolUnit[]=[{id:'grade',name:'一年级',unitKind:'GRADE',parentUnitId:null}]
function setup(api:ReturnType<typeof vi.fn>,values=units){
 const onUnits=vi.fn(),onBusy=vi.fn()
 const props={api:api as SchoolApi,organizationId:'school',units:values,onUnits,onBusy,disabled:false}
 const view=render(<SchoolStructureImport {...props}/>)
 fireEvent.click(screen.getByRole('button',{name:'批量导入年级／班级'}))
 return {...view,props,onUnits,onBusy}
}
function preview(text:string){fireEvent.change(screen.getByLabelText('待导入内容'),{target:{value:text}});fireEvent.click(screen.getByRole('button',{name:'解析预览'}))}
describe('School structure import confirmation',()=>{
 it('previews locally, rechecks fresh units and only posts missing grades after explicit confirmation',async()=>{
  const after=[...units,{id:'g2',name:'二年级',unitKind:'GRADE',parentUnitId:null}]
  let reads=0
  const api=vi.fn(async(_path:string,method='GET')=>method==='GET'?{list:++reads===1?units:after}:after[1])
  const {onUnits}=setup(api)
  preview('一年级\n二年级')
  expect(api).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'确认新增 1 条'}))
  await screen.findByText('已新增 1 条，跳过 1 条已有项。请核对学校与班级选择。')
  expect(api.mock.calls).toEqual([['/organizations/school/units'],['/organizations/school/units','POST',{unitKind:'GRADE',name:'二年级'}],['/organizations/school/units']])
  expect(onUnits).toHaveBeenLastCalledWith(after)
 })
 it('uses the selected grade id for classes and leaves existing names untouched',async()=>{
  const api=vi.fn(async(_path:string,method='GET')=>method==='GET'?{list:units}:({id:'class'}))
  setup(api)
  fireEvent.change(screen.getByLabelText('导入类型'),{target:{value:'CLASS'}})
  fireEvent.change(screen.getByLabelText('单列班级的所属年级'),{target:{value:'grade'}})
  preview('二班')
  fireEvent.click(screen.getByRole('button',{name:'确认新增 1 条'}))
  await screen.findByText(/已新增 1 条，跳过 0 条已有项/)
  expect(api).toHaveBeenCalledWith('/organizations/school/units','POST',{unitKind:'CLASS',name:'二班',parentUnitId:'grade'})
 })
 it('stops on the first failure, preserves input and never automatically retries or proceeds',async()=>{
  let posts=0
  const api=vi.fn(async(_path:string,method='GET')=>{if(method==='GET')return {list:units};if(++posts===2)throw Error('需要重新验证动态验证码');return {id:'new'}})
  setup(api);preview('二年级\n三年级\n四年级')
  fireEvent.click(screen.getByRole('button',{name:'确认新增 3 条'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('已确认新增 1 条。停在源文件第 2 行。')
  expect(screen.getByLabelText('待导入内容')).toHaveValue('二年级\n三年级\n四年级')
  expect(posts).toBe(2)
  expect(screen.queryByRole('button',{name:'确认新增 3 条'})).not.toBeInTheDocument()
 })
 it('rechecks changed scope data and blocks writes when a parent grade disappeared',async()=>{
  const api=vi.fn(async()=>({list:[]}))
  setup(api)
  fireEvent.change(screen.getByLabelText('导入类型'),{target:{value:'CLASS'}})
  preview('一年级,二班')
  fireEvent.click(screen.getByRole('button',{name:'确认新增 1 条'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('学校结构已变化')
  expect(api.mock.calls).toEqual([['/organizations/school/units']])
 })
 it('does not write invalid previews and invalidates confirmation after editing',()=>{
  const api=vi.fn();setup(api);preview('二年级\n二年级')
  expect(screen.getByRole('button',{name:'确认新增 1 条'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('待导入内容'),{target:{value:'三年级'}})
  expect(screen.queryByRole('region',{name:'学校结构导入预览'})).not.toBeInTheDocument()
  expect(api).not.toHaveBeenCalled()
 })
 it('stops after unmount or school switch even if the previous GET returns late',async()=>{
  let resolve!:(data:{list:SchoolUnit[]})=>void
  const api=vi.fn(()=>new Promise<{list:SchoolUnit[]}>(yes=>{resolve=yes}))
  const view=setup(api);preview('二年级');fireEvent.click(screen.getByRole('button',{name:'确认新增 1 条'}))
  view.rerender(<SchoolStructureImport {...view.props} organizationId="other-school"/>)
  await act(async()=>resolve({list:units}))
  expect(api.mock.calls).toEqual([['/organizations/school/units']])
  expect(screen.queryByLabelText('待导入内容')).not.toBeInTheDocument()
 })
 it('invalidates an old confirmation while a newly selected file is still reading',async()=>{
  const api=vi.fn();setup(api);preview('二年级')
  let resolve!:(text:string)=>void
  const file={size:20,text:()=>new Promise<string>(yes=>{resolve=yes})}
  fireEvent.change(screen.getByLabelText('CSV／Excel 文件（可含表头）'),{target:{files:[file]}})
  expect(screen.queryByRole('button',{name:'确认新增 1 条'})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'解析预览'})).toBeDisabled()
  await act(async()=>resolve('年级\n三年级'))
  expect(screen.getByLabelText('待导入内容')).toHaveValue('二年级')
  expect(screen.getByRole('button',{name:'解析预览'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'使用这份名单'}))
  expect(screen.getByLabelText('待导入内容')).toHaveValue('"年级"\n"三年级"')
  expect(api).not.toHaveBeenCalled()
 })
 it('refreshes the structure without writes before resuming a partial import',async()=>{
  const api=vi.fn(async()=>({list:units}));const {onUnits}=setup(api)
  preview('二年级');fireEvent.click(screen.getByRole('button',{name:'刷新学校结构'}))
  await waitFor(()=>expect(onUnits).toHaveBeenCalledWith(units))
  expect(api.mock.calls).toEqual([['/organizations/school/units']])
  expect(screen.getByLabelText('待导入内容')).toHaveValue('二年级')
  expect(screen.queryByRole('button',{name:'确认新增 1 条'})).not.toBeInTheDocument()
 })
})
