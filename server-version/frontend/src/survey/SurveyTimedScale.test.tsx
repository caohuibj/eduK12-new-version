// @vitest-environment jsdom
import {useRef,useState} from 'react'
import {fireEvent,render,screen} from '@testing-library/react'
import {describe,expect,it} from 'vitest'
import {SurveyTimedScale} from './SurveyTimedScale'
import {SurveyScaleTimingTracker} from './survey-scale-timing'
const unit={instrumentKey:'scale',title:'学习状态',
  items:[{itemKey:'first',prompt:'第一题',required:true},
    {itemKey:'second',prompt:'第二题',required:true}],
  responseOptions:[{optionKey:'o1',label:'不同意'},{optionKey:'o2',label:'同意'}]}
function Harness(){
  const [answers,setAnswers]=useState<Record<string,string>>({})
  const [index,setIndex]=useState(0)
  const timer=useRef(new SurveyScaleTimingTracker())
  return <>
    <SurveyTimedScale unit={unit} answer={answers} tracker={timer.current}
      index={index} onIndexChange={setIndex}
      onAnswer={(key,value)=>setAnswers(old=>({...old,[key]:value}))}
      onTiming={()=>{}}/>
    <output data-testid="answers">{JSON.stringify(answers)}</output>
  </>
}
describe('Survey Scale participant one-by-one delivery',()=>{
  it('shows only one question at a time, allows backtracking and preserves choices',()=>{
    render(<Harness/>)
    expect(screen.getByText('第一题')).toBeInTheDocument()
    expect(screen.queryByText('第二题')).toBeNull()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    fireEvent.click(screen.getByRole('button',{name:'下一题'}))
    expect(screen.getByText('第二题')).toBeInTheDocument()
    expect(screen.queryByText('第一题')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'上一题'}))
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(screen.getByTestId('answers').textContent).toContain('"first":"o2"')
  })
})
