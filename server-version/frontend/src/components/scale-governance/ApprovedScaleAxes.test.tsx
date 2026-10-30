import {fireEvent,render,screen,within} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import ApprovedScaleAxes,{type ApprovedScaleChoice} from './ApprovedScaleAxes'
const first:ApprovedScaleChoice={id:'exact-one',toolKey:'same-tool',title:'注意力',versions:{CONTENT:'c1',PARAMETERS:'p1',REPORT:'r1'}}
const second:ApprovedScaleChoice={...first,id:'exact-two',versions:{CONTENT:'c2',PARAMETERS:'p2',REPORT:'r2'}}
function open(){fireEvent.click(screen.getByText('按题本、参数和报告查找已批准配置'));fireEvent.change(screen.getByLabelText('量表工具'),{target:{value:'same-tool'}})}
function axes(c='c1',p='p1',r='r1'){for(const [name,value] of [['题本 C',c],['解释参数 P',p],['报告 R',r]])fireEvent.change(screen.getByLabelText(name),{target:{value}})}
describe('shared administrator approved scale axis discovery',()=>{
 it('requires all explicit axes and the exact combination before selecting, without issuing or constructing content',()=>{
  const select=vi.fn();render(<ApprovedScaleAxes choices={[first,second]} onSelect={select}/>);open();axes()
  expect(select).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'使用所选已批准组合'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('核对精确配置'),{target:{value:first.id}});fireEvent.click(screen.getByRole('button',{name:'使用所选已批准组合'}));expect(select).toHaveBeenCalledExactlyOnceWith(first.id)
  expect(screen.getByText(/专业搭配由管理员决定/)).toBeVisible()
 })
 it('refuses to imply a new approval when individually existing axes have no approved combination',()=>{
  const select=vi.fn();render(<ApprovedScaleAxes choices={[first,second]} onSelect={select}/>);open();axes('c1','p2','r2')
  expect(screen.getByText(/所选三项尚无本目录可分配/)).toBeVisible();expect(screen.queryByLabelText('核对精确配置')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'使用所选已批准组合'})).toBeDisabled();expect(select).not.toHaveBeenCalled()
 })
 it('never resolves equal displayed versions by first/latest row and requires the actual selected source',()=>{
  const select=vi.fn();render(<ApprovedScaleAxes choices={[first,{...first,id:'same-label-other-source'}]} onSelect={select}/>);open();axes()
  const exact=screen.getByLabelText('核对精确配置');expect(within(exact).getAllByRole('option')).toHaveLength(3);expect(exact).toHaveValue('')
  expect(screen.getByText(/同名版本对应多份配置/)).toBeVisible();fireEvent.change(exact,{target:{value:'same-label-other-source'}});fireEvent.click(screen.getByRole('button',{name:'使用所选已批准组合'}));expect(select).toHaveBeenCalledWith('same-label-other-source')
 })
 it('does not substitute an alternative after withdrawal or refresh removes the explicitly chosen source',()=>{
  const select=vi.fn(),other={...first,id:'another-source'},view=render(<ApprovedScaleAxes choices={[first,other]} onSelect={select}/>);open();axes();fireEvent.change(screen.getByLabelText('核对精确配置'),{target:{value:first.id}})
  view.rerender(<ApprovedScaleAxes choices={[other]} onSelect={select}/>);expect(screen.getByLabelText('核对精确配置')).toHaveValue('');expect(screen.getByRole('button',{name:'使用所选已批准组合'})).toBeDisabled();expect(select).not.toHaveBeenCalled()
 })
 it('treats explicitly absent parameters/report as selectable facts and resets all choices when changing tools',()=>{
  const select=vi.fn(),none={...first,id:'none-source',versions:{CONTENT:'c1',PARAMETERS:'none-v1',REPORT:'none-v1'}},view=render(<ApprovedScaleAxes choices={[none,{...second,toolKey:'another-tool',title:'另一工具'}]} onSelect={select}/>);open();axes('c1','none-v1','none-v1')
  expect(screen.getByRole('option',{name:'未配置阈值或常模'})).toBeVisible();expect(screen.getByRole('option',{name:'不反馈（明确未配置）'})).toBeVisible();fireEvent.change(screen.getByLabelText('核对精确配置'),{target:{value:'none-source'}})
  view.rerender(<ApprovedScaleAxes choices={[none]} disabled onSelect={select}/>);expect(screen.getByLabelText('核对精确配置')).toBeDisabled();expect(screen.getByRole('button',{name:'使用所选已批准组合'})).toBeDisabled()
  view.rerender(<ApprovedScaleAxes choices={[none,second]} onSelect={select}/>);fireEvent.change(screen.getByLabelText('量表工具'),{target:{value:''}});expect(screen.getByLabelText('题本 C')).toHaveValue('');expect(screen.queryByLabelText('核对精确配置')).not.toBeInTheDocument();expect(select).not.toHaveBeenCalled()
 })
})
