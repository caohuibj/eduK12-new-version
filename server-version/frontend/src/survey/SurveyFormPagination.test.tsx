import { useState } from 'react'
import { fireEvent,render,screen } from '@testing-library/react'
import { describe,expect,it } from 'vitest'
import { TaskForm } from './SurveyPublicApp'
import type { ProfessionalAnswer } from './ProfessionalFormAnswer'
const pages=[
  {pageKey:'p1',title:'第一页',questions:[{
    itemKey:'source',type:'SINGLE',prompt:'先回答这一题',required:true,options:[
      {optionKey:'yes',label:'同意'},{optionKey:'no',label:'不同意'}],
  }]},
  {pageKey:'p2',title:'第二页',questions:[{
    itemKey:'follow',type:'SHORT_TEXT',prompt:'补充说明',required:true,options:[],
    displayIf:{itemKey:'source',operator:'EQUALS' as const,optionKey:'yes'},
  }]},
]
function Host(){
  const [pageIndex,setPageIndex]=useState(0)
  const [answers,setAnswers]=useState<Record<string,ProfessionalAnswer>>({})
  return <><TaskForm unit={{kind:'FORM',instrumentKey:'form',title:'分页研究问卷',pages}}
    proof={{publicId:'project',attemptId:'attempt',accessCredential:'secret'}}
    pageIndex={pageIndex} onPageChange={setPageIndex} answer={answers}
    onChange={(key,value)=>setAnswers(a=>({...a,[key]:value}))}/>
    <output data-testid="page-number">{pageIndex}</output>
    <output data-testid="page-answers">{JSON.stringify(answers)}</output></>
}
describe('Survey real participant Form paging',()=>{
  it('renders exactly one visible page and retains answers across navigation',()=>{
    render(<Host/>)
    expect(screen.getByText('第一页')).toBeInTheDocument()
    expect(screen.queryByText('第二页')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'下一页'}))
    expect(screen.getByRole('alert')).toHaveTextContent('先回答这一题')
    expect(screen.getByTestId('page-number')).toHaveTextContent('0')
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    fireEvent.click(screen.getByRole('button',{name:'下一页'}))
    expect(screen.getByText('第二页')).toBeInTheDocument()
    expect(screen.queryByText('第一页')).not.toBeInTheDocument()
    expect(screen.getByTestId('page-number')).toHaveTextContent('1')
    fireEvent.change(screen.getByLabelText('补充说明'),{target:{value:'坚持完成'}})
    fireEvent.click(screen.getByRole('button',{name:'上一页'}))
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(screen.getByTestId('page-answers')).toHaveTextContent('坚持完成')
  })
  it('skips conditional pages entirely when their predicates are false',()=>{
    render(<Host/>)
    fireEvent.click(screen.getByRole('radio',{name:'不同意'}))
    expect(screen.getByText(/第 1 \/ 1 页/)).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
    expect(screen.queryByText('补充说明')).not.toBeInTheDocument()
  })
})
