import {useState} from 'react'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {TaskForm} from '../survey/SurveyPublicApp'
import type {FormDraft} from '../survey/builder.types'
const pages:FormDraft['pages']=[{pageKey:'block1',title:'第一部分',questions:[{itemKey:'first',prompt:'第一题',type:'SINGLE',required:true,options:[{optionKey:'a',label:'第一个选择'}],rows:[]},{itemKey:'second',prompt:'本页最后一题',type:'SINGLE',required:true,options:[{optionKey:'b',label:'本页最后的选择'}],rows:[]}]},{pageKey:'block2',title:'第二部分',questions:[{itemKey:'third',prompt:'下一页的题目',type:'SINGLE',required:true,options:[{optionKey:'c',label:'下一页选项'}],rows:[]}]}]
function Form({advance=true,initial={},onPage=vi.fn()}:{advance?:boolean;initial?:Record<string,string>;onPage?:(page:number)=>void}){const [answer,setAnswer]=useState(initial);return <TaskForm purpose="HUITEACHER" advanceSingleChoiceFocus={advance} unit={{kind:'FORM',instrumentKey:'focus',title:'评价',pages}} answer={answer} onChange={(key,value)=>setAnswer(old=>({...old,[key]:value as string}))} pageIndex={0} onPageChange={onPage}/>}
afterEach(cleanup)
describe('Teacher legacy form question focus',()=>{
 it('focuses the next question on this page and requires a manual page-boundary action',async()=>{
  const onPage=vi.fn();render(<Form onPage={onPage}/>)
  fireEvent.click(screen.getByRole('radio',{name:'第一个选择'}))
  await waitFor(()=>expect(document.getElementById('survey-answer-focus-second')).toHaveFocus())
  fireEvent.click(screen.getByRole('radio',{name:'本页最后的选择'}))
  expect(onPage).not.toHaveBeenCalled()
  expect(screen.queryByRole('radio',{name:'下一页选项'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'下一页'}))
  expect(onPage).toHaveBeenCalledWith(1)
 })
 it('does not advance restored values or change the default presentation',()=>{
  const {rerender}=render(<Form initial={{first:'a'}}/>)
  expect(document.getElementById('survey-answer-focus-second')).not.toHaveFocus()
  rerender(<Form advance={false} initial={{first:'a'}}/>)
  fireEvent.click(screen.getByRole('radio',{name:'第一个选择'}))
  expect(document.getElementById('survey-answer-focus-second')).not.toHaveFocus()
 })
})
