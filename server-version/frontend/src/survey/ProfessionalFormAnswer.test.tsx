import { useState } from 'react'
import { fireEvent,render,screen } from '@testing-library/react'
import { describe,expect,it } from 'vitest'
import { ProfessionalFormAnswer,type ProfessionalAnswer,type ProfessionalQuestion } from './ProfessionalFormAnswer'

const options=[{optionKey:'a',label:'第一项'},{optionKey:'b',label:'第二项'},{optionKey:'c',label:'第三项'}]
function Host({question}:{question:ProfessionalQuestion}){
  const [answers,setAnswers]=useState<Record<string,ProfessionalAnswer>>({})
  return <><ProfessionalFormAnswer question={question} answers={answers}
    prefix="preview" onAnswer={(key,value)=>setAnswers(a=>({...a,[key]:value}))}/>
    <output data-testid="answer-state">{JSON.stringify(answers)}</output></>
}
const read=()=>JSON.parse(screen.getByTestId('answer-state').textContent||'{}') as Record<string,ProfessionalAnswer>
describe('Professional Survey Form input contracts',()=>{
  it('stores date/time as ISO local values without silently inventing zones',()=>{
    render(<Host question={{type:'TIME',itemKey:'time',prompt:'当地时间',options:[],
      timeZone:'Asia/Shanghai'}}/>)
    fireEvent.change(screen.getByLabelText('当地时间'),{target:{value:'15:30'}})
    expect(read().time).toBe('15:30')
    expect(screen.getByText(/UTC\+08:00/)).toBeInTheDocument()
  })
  it('requires explicit ranking confirmation and preserves all stable option keys',()=>{
    render(<Host question={{type:'RANK_ORDER',itemKey:'rank',prompt:'优先级',options}}/>)
    expect(read().rank).toBeUndefined()
    fireEvent.click(screen.getByRole('button',{name:'下移第 1 项'}))
    expect(read().rank).toEqual(['b','a','c'])
  })
  it('displays a bounded slider and only stores an explicitly selected number',()=>{
    render(<Host question={{type:'SLIDER',itemKey:'range',prompt:'评分',options:[],
      min:0,max:1,step:0.25}}/>)
    expect(read().range).toBeUndefined()
    fireEvent.change(screen.getByRole('slider',{name:'评分'}),{target:{value:'0.5'}})
    expect(read().range).toBe(0.5)
  })
  it('retains zero-valued constant-sum options and shows the target total',()=>{
    render(<Host question={{type:'CONSTANT_SUM',itemKey:'budget',prompt:'分配',options,
      total:5,integerOnly:true}}/>)
    fireEvent.change(screen.getByLabelText('分值：第二项'),{target:{value:'5'}})
    expect(read().budget).toEqual({b:5})
    expect(screen.getByText(/仍有 2 项未填写/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('分值：第一项'),{target:{value:'0'}})
    fireEvent.change(screen.getByLabelText('分值：第三项'),{target:{value:'0'}})
    expect(read().budget).toEqual({a:0,b:5,c:0})
    fireEvent.change(screen.getByLabelText('分值：第一项'),{target:{value:''}})
    expect(read().budget).toEqual({b:5,c:0})
  })
  it('supports matrix row multi-select with an explicit independent refusal',()=>{
    render(<Host question={{type:'MATRIX_MULTIPLE',itemKey:'matrix',prompt:'多选行',
      options,rows:[{rowKey:'r1',label:'第一行'},{rowKey:'r2',label:'第二行'}],
      maxSelections:2,allowRefusal:true}}/>)
    const rows=screen.getAllByRole('group')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getAllByRole('checkbox',{name:'第一项'})[0])
    const answer=read()['matrix:r1']
    expect(answer).toEqual(['a'])
    fireEvent.click(screen.getAllByRole('checkbox',{name:'不愿回答本行'})[1])
    expect(read()['matrix:r2']).toEqual({_surveyRefusal:true})
  })
})
