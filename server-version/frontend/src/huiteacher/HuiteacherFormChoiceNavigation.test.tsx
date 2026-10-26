import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {HuiteacherMyFormTasks} from './HuiteacherMyFormTasks'
import type {FormDraft} from '../survey/builder.types'
const pages:FormDraft['pages']=[{pageKey:'block1',title:'第一部分',questions:[{itemKey:'first',prompt:'第一题',type:'SINGLE',required:true,options:[{optionKey:'a',label:'第一个选择'}],rows:[]},{itemKey:'second',prompt:'本页最后一题',type:'SINGLE',required:true,options:[{optionKey:'b',label:'本页最后的选择'}],rows:[]}]},{pageKey:'block2',title:'第二部分',questions:[{itemKey:'third',prompt:'下一页的题目',type:'SINGLE',required:true,options:[{optionKey:'c',label:'下一页选项'}],rows:[]}]}]
const originalScroll=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollIntoView')
afterEach(()=>{cleanup();sessionStorage.clear();vi.restoreAllMocks();if(originalScroll)Object.defineProperty(HTMLElement.prototype,'scrollIntoView',originalScroll);else Reflect.deleteProperty(HTMLElement.prototype,'scrollIntoView')})
describe('Teacher multi-question form selection',()=>{
 it.each([false,true])('keeps focus and scroll position until a manual page action (student=%s)',async(student)=>{
  const api=vi.fn(async(path:string)=>path.endsWith('/task')?{attemptId:'attempt',formId:'form',status:'STARTED',title:'同页多题表单',definitionDigest:'fixed',pages}:{list:[{executionId:'execution',formTitle:'同页多题表单',eventTitle:'活动',status:'STARTED',runtimeBindingKind:'HUITEACHER_FORM_V2',runtimeBindingRef:'attempt'}]})
  render(<HuiteacherMyFormTasks api={api as Parameters<typeof HuiteacherMyFormTasks>[0]['api']} student={student}/>)
  fireEvent.click(await screen.findByRole('button',{name:'继续评价'}))
  const first=await screen.findByRole('radio',{name:'第一个选择'})
  const scroll=vi.fn();Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:scroll})
  first.focus();fireEvent.click(first)
  await waitFor(()=>expect(first).toBeChecked())
  expect(first).toHaveFocus();expect(scroll).not.toHaveBeenCalled()
  const last=screen.getByRole('radio',{name:'本页最后的选择'});last.focus();fireEvent.click(last)
  expect(last).toBeChecked();expect(last).toHaveFocus();expect(scroll).not.toHaveBeenCalled()
  expect(screen.queryByRole('radio',{name:'下一页选项'})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'正式提交评价'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'下一页'}))
  expect(await screen.findByRole('radio',{name:'下一页选项'})).toBeInTheDocument()
  expect(api.mock.calls.some(([path])=>path.endsWith('/final'))).toBe(false)
 })
})
