// @vitest-environment jsdom
import {useRef,useState} from 'react'
import {fireEvent,render,screen} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
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
  it('gates current image answers and forward navigation without deleting restored answers',()=>{
    const props={unit,answer:{first:'o2'},tracker:new SurveyScaleTimingTracker(),index:0,
      onIndexChange:vi.fn(),onAnswer:vi.fn(),onTiming:vi.fn()}
    const {rerender}=render(<SurveyTimedScale {...props} imagesReady={false}/>)
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(screen.getByRole('radio',{name:'同意'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'下一题'})).toBeDisabled()
    rerender(<SurveyTimedScale {...props} imagesReady/>)
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(screen.getByRole('radio',{name:'同意'})).toBeEnabled()
    expect(screen.getByRole('button',{name:'下一题'})).toBeEnabled()
  })
  it('uses per-item source response options rather than the compatibility union and renders authorized media',()=>{
    render(<SurveyTimedScale unit={{...unit,items:[{itemKey:'source',prompt:'Source item',required:false,
      responseOptions:[{optionKey:'typed_number',label:'Source numeric'},{optionKey:'typed_string',label:'Source string'}]}]}}
      answer={{}} tracker={new SurveyScaleTimingTracker()} index={0} onIndexChange={()=>{}}
      onAnswer={()=>{}} onTiming={()=>{}} renderMedia={key=><p>Frozen media {key}</p>}/>)
    expect(screen.getByRole('radio',{name:'Source numeric'})).toBeInTheDocument()
    expect(screen.queryByRole('radio',{name:'同意'})).toBeNull()
    expect(screen.getByText('Frozen media source')).toBeInTheDocument()
  })
  it('handles an item key that matches a built-in Object property',()=>{
    const answer=vi.fn()
    const tracker=new SurveyScaleTimingTracker()
    render(<SurveyTimedScale
      unit={{...unit,instrumentKey:'constructor',items:[{itemKey:'constructor',prompt:'特殊编码题',required:true}]}}
      answer={{}} tracker={tracker} index={0} onIndexChange={()=>{}}
      onAnswer={answer} onTiming={()=>{}}/>)
    const option=screen.getByRole('radio',{name:'同意'})
    expect(option).not.toBeChecked()
    fireEvent.click(option)
    expect(answer).toHaveBeenCalledWith('constructor','o2')
    expect(Object.prototype.hasOwnProperty.call(tracker.snapshot(),'constructor')).toBe(true)
  })
  it('shows only one question at a time, allows backtracking and preserves choices',()=>{
    render(<Harness/>)
    expect(screen.getByText(/第一题/)).toBeInTheDocument()
    expect(screen.queryByText(/第二题/)).toBeNull()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    fireEvent.click(screen.getByRole('button',{name:'下一题'}))
    expect(screen.getByText(/第二题/)).toBeInTheDocument()
    expect(screen.queryByText(/第一题/)).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'上一题'}))
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(screen.getByTestId('answers').textContent).toContain('"first":"o2"')
  })
})
