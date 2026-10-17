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
function Host({conditional=true}:{conditional?:boolean}){
  const [pageIndex,setPageIndex]=useState(0)
  const [answers,setAnswers]=useState<Record<string,ProfessionalAnswer>>({})
  const formPages=conditional?pages:pages.map(p=>({
    ...p,questions:p.questions.map(q=>({...q,displayIf:undefined})),
  }))
  return <><TaskForm unit={{kind:'FORM',instrumentKey:'form',title:'分页研究问卷',pages:formPages}}
    proof={{publicId:'project',attemptId:'attempt',accessCredential:'secret'}}
    pageIndex={pageIndex} onPageChange={setPageIndex} answer={answers}
    onChange={(key,value)=>setAnswers(a=>({...a,[key]:value}))}/>
    <output data-testid="page-number">{pageIndex}</output>
    <output data-testid="page-answers">{JSON.stringify(answers)}</output></>
}
describe('Survey real participant Form paging',()=>{
  it('preserves source section instructions as display text, not an answer field',()=>{
    render(<TaskForm unit={{kind:'FORM',instrumentKey:'source',title:'Source',pages:[{pageKey:'p',title:'Section',description:'Answer for the last 7 days',questions:[{itemKey:'q',type:'SINGLE',prompt:'Choose',required:true,options:[{optionKey:'yes',label:'Yes'}]}]}]}} pageIndex={0} onPageChange={()=>{}} answer={{}} onChange={()=>{}}/>)
    expect(screen.getByText('Answer for the last 7 days')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(1)
  })
  it.each(['RANK_ORDER','CONSTANT_SUM'])('accepts explicit refusal before advancing a required %s page',type=>{
    function RefusalHost(){
      const [pageIndex,setPageIndex]=useState(0)
      const [answers,setAnswers]=useState<Record<string,ProfessionalAnswer>>({})
      return <TaskForm unit={{kind:'FORM',instrumentKey:'refusal',title:'允许拒答',pages:[
        {pageKey:'first',title:'允许拒答的第一页',questions:[{itemKey:'question',type,
          prompt:'可明确拒答',required:true,allowRefusal:true,total:100,
          options:[{optionKey:'a',label:'选项 A'},{optionKey:'b',label:'选项 B'}]}]},
        {pageKey:'second',title:'拒答后的下一页',questions:[{itemKey:'next',type:'SHORT_TEXT',
          prompt:'后续选答题',required:false,options:[]}]},
      ]}} pageIndex={pageIndex} onPageChange={setPageIndex} answer={answers}
        onChange={(key,value)=>setAnswers(previous=>({...previous,[key]:value}))}/>
    }
    render(<RefusalHost/>)
    fireEvent.click(screen.getByRole('checkbox',{name:/我选择不回答这一题/}))
    fireEvent.click(screen.getByRole('button',{name:'下一页'}))
    expect(screen.getByText('拒答后的下一页')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'上一页'}))
    expect(screen.getByRole('checkbox',{name:/我选择不回答这一题/})).toBeChecked()
  })

  it('renders exactly one visible page and retains answers across navigation',()=>{
    render(<Host/>)
    expect(screen.getByText('第一页')).toBeInTheDocument()
    expect(screen.queryByText('第二页')).not.toBeInTheDocument()
    // The next page is conditional: until the source answer is 'yes',
    // Next is disabled rather than misleadingly claiming a page exists.
    expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByTestId('page-number')).toHaveTextContent('0')
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    expect(screen.getByRole('button',{name:'下一页'})).toBeEnabled()
    fireEvent.click(screen.getByRole('button',{name:'下一页'}))
    expect(screen.getByText('第二页')).toBeInTheDocument()
    expect(screen.queryByText('第一页')).not.toBeInTheDocument()
    expect(screen.getByTestId('page-number')).toHaveTextContent('1')
    fireEvent.change(screen.getByLabelText('补充说明'),{target:{value:'坚持完成'}})
    fireEvent.click(screen.getByRole('button',{name:'上一页'}))
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(screen.getByTestId('page-answers')).toHaveTextContent('坚持完成')
  })
  it('blocks moving to an unconditional next page until the current required answer is present',()=>{
    render(<Host conditional={false}/>)
    expect(screen.getByRole('button',{name:'下一页'})).toBeEnabled()
    fireEvent.click(screen.getByRole('button',{name:'下一页'}))
    expect(screen.getByRole('alert')).toHaveTextContent('先回答这一题')
    expect(screen.getByTestId('page-number')).toHaveTextContent('0')
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    fireEvent.click(screen.getByRole('button',{name:'下一页'}))
    expect(screen.getByTestId('page-number')).toHaveTextContent('1')
  })
  it('skips conditional pages entirely when their predicates are false',()=>{
    render(<Host/>)
    fireEvent.click(screen.getByRole('radio',{name:'不同意'}))
    expect(screen.getByText(/第 1 \/ 1 页/)).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
    expect(screen.queryByText('补充说明')).not.toBeInTheDocument()
  })
})
