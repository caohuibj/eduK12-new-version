// @vitest-environment jsdom
import {useRef,useState} from 'react'
import {fireEvent,render,screen} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyTimedScale} from './SurveyTimedScale'
import {SurveyScaleTimingTracker} from './survey-scale-timing'
const unit={instrumentKey:'scale',title:'学习状态',
  items:[{itemKey:'first',prompt:'第一题',required:true},
    {itemKey:'second',prompt:'第二题',required:true}],
  responseOptions:[{optionKey:'o1',label:'不同意'},{optionKey:'o2',label:'同意'}]}
function Harness({initialAnswers={},questions=unit,initialIndex=0}:{initialAnswers?:Record<string,string>;questions?:typeof unit;initialIndex?:number}={}){
  const [answers,setAnswers]=useState<Record<string,string>>(initialAnswers)
  const [index,setIndex]=useState(initialIndex)
  const timer=useRef(new SurveyScaleTimingTracker())
  return <>
    <SurveyTimedScale unit={questions} answer={answers} tracker={timer.current}
      index={index} onIndexChange={setIndex}
      onAnswer={(key,value)=>setAnswers(old=>({...old,[key]:value}))}
      onTiming={()=>{}}/>
    <output data-testid="answers">{JSON.stringify(answers)}</output>
  </>
}
afterEach(()=>vi.restoreAllMocks())
describe('Survey Scale participant one-by-one delivery',()=>{
  it('keeps mouse and keyboard answering available without persistent timing or keyboard explanations',()=>{
    render(<Harness/>)
    expect(screen.queryByText('关于作答计时')).toBeNull()
    expect(screen.queryByText(/方向键选择，Enter 确认/)).toBeNull()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    expect(screen.getByText('第二题')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'题目导航'})).toBeInTheDocument()
  })
  it('gates current image answers and forward navigation without deleting restored answers',()=>{
    const props={unit,answer:{first:'o2'},tracker:new SurveyScaleTimingTracker(),index:0,
      onIndexChange:vi.fn(),onAnswer:vi.fn(),onTiming:vi.fn()}
    const {rerender}=render(<SurveyTimedScale {...props} imagesReady={false}/>)
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(screen.getByRole('radio',{name:'同意'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'继续未答题'})).toBeDisabled()
    rerender(<SurveyTimedScale {...props} imagesReady/>)
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(screen.getByRole('radio',{name:'同意'})).toBeEnabled()
    expect(screen.getByRole('button',{name:'继续未答题'})).toBeEnabled()
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
  it('automatically advances after a new selection, but keeps the last item and backtracking answers',()=>{
    render(<Harness/>)
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    expect(document.getElementById('survey-answer-scale-second')).toHaveFocus()
    fireEvent.click(screen.getByRole('radio',{name:'不同意'}))
    expect(screen.getByText('第二题')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'继续未答题'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'题目导航'}))
    fireEvent.click(screen.getByRole('button',{name:'第 1 题，已作答'}))
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    expect(screen.getByText('第一题')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio',{name:'不同意'}))
    expect(screen.getByRole('radio',{name:'不同意'})).toBeChecked()
    expect(screen.getByTestId('answers').textContent).toContain('"first":"o1"')
  })
  it('does not auto-advance arrow-key selection or leak its source into a later pointer choice',()=>{
    render(<Harness/>)
    const first=screen.getByRole('radio',{name:'不同意'}),second=screen.getByRole('radio',{name:'同意'})
    first.focus()
    fireEvent.keyDown(first,{key:'ArrowRight'})
    // Model native radio navigation: focus changes before the selection event.
    second.focus();fireEvent.click(second)
    expect(screen.getByText('第一题')).toBeInTheDocument()
    expect(second).toBeChecked()
    fireEvent.pointerDown(first);fireEvent.click(first)
    expect(document.getElementById('survey-answer-scale-second')).toHaveFocus()
  })
  it('moves focus off the radio after Space selection and cancels a repeated Space',()=>{
    render(<Harness/>)
    const option=screen.getByRole('radio',{name:'同意'})
    option.focus();fireEvent.keyDown(option,{key:' '});fireEvent.click(option)
    const next=document.getElementById('survey-answer-scale-second')!
    expect(next).toHaveFocus()
    expect(fireEvent.keyDown(next,{key:' ',repeat:true})).toBe(false)
    expect(screen.getByTestId('answers').textContent).not.toContain('"second"')
  })
  it.each(['paused','readOnly','imagesReady'])('does not answer or advance when %s blocks interaction',flag=>{
    const onAnswer=vi.fn(),onIndexChange=vi.fn()
    render(<SurveyTimedScale unit={unit} answer={{}} tracker={new SurveyScaleTimingTracker()}
      index={0} onIndexChange={onIndexChange} onAnswer={onAnswer} onTiming={()=>{}}
      paused={flag==='paused'} readOnly={flag==='readOnly'} imagesReady={flag!=='imagesReady'}/>)
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    expect(onAnswer).not.toHaveBeenCalled();expect(onIndexChange).not.toHaveBeenCalled()
  })
  it('keeps video answers on the current item without auto-advancing when video later completes',()=>{
    const change=vi.fn(),advance=vi.fn()
    const props={unit,answer:{},tracker:new SurveyScaleTimingTracker(),index:0,
      onAnswer:change,onIndexChange:advance,onTiming:()=>{}}
    const {rerender}=render(<SurveyTimedScale {...props} autoAdvanceReady={false}/>)
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    expect(change).toHaveBeenCalledWith('first','o2');expect(advance).not.toHaveBeenCalled()
    rerender(<SurveyTimedScale {...props} answer={{first:'o2'}} autoAdvanceReady/>)
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(advance).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'继续未答题'}))
    expect(advance).toHaveBeenCalledWith(1)
  })
  it('keeps native repeated arrow behavior on media volume controls',()=>{
    render(<SurveyTimedScale unit={unit} answer={{}} tracker={new SurveyScaleTimingTracker()}
      index={0} onAnswer={()=>{}} onIndexChange={()=>{}} onTiming={()=>{}}
      renderMedia={()=><input type="range" aria-label="视频音量"/>}/>)
    expect(fireEvent.keyDown(screen.getByRole('slider',{name:'视频音量'}),{key:'ArrowRight',repeat:true})).toBe(true)
  })
  it('points a final video item to the outer continue or submit action, not a disabled next question',()=>{
    render(<SurveyTimedScale unit={unit} answer={{}} tracker={new SurveyScaleTimingTracker()}
      index={1} onAnswer={()=>{}} onIndexChange={()=>{}} onTiming={()=>{}} autoAdvanceReady={false}/>)
    expect(screen.getByText(/请先看完本题视频/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'下一题'})).toBeNull()
    expect(screen.queryByRole('button',{name:'继续未答题'})).toBeNull()
  })
  it('records the selected item before advancing and keeps duration with its source item',()=>{
    let now=100
    vi.spyOn(performance,'now').mockImplementation(()=>now)
    vi.spyOn(document,'hasFocus').mockReturnValue(true)
    const tracker=new SurveyScaleTimingTracker(),events:string[]=[]
    function TimingHost(){
      const [answers,setAnswers]=useState<Record<string,string>>({}),[index,setIndex]=useState(0)
      return <SurveyTimedScale unit={unit} answer={answers} tracker={tracker} index={index}
        onAnswer={(key,value)=>{events.push('answer:'+key);setAnswers(old=>({...old,[key]:value}))}}
        onTiming={()=>events.push('timing')}
        onIndexChange={next=>{events.push('next');setIndex(next)}}/>
    }
    render(<TimingHost/>);events.length=0;now=1100
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    expect(events.slice(0,3)).toEqual(['answer:first','timing','next'])
    now=2100;fireEvent.click(screen.getByRole('radio',{name:'不同意'}))
    expect(tracker.snapshot().first).toMatchObject({firstResponseMs:1000,activeTimeMs:1000})
    expect(tracker.snapshot().second).toMatchObject({firstResponseMs:1000,activeTimeMs:1000})
  })
  it('shows only one question at a time, allows backtracking and preserves choices',()=>{
    render(<Harness/>)
    expect(screen.getByText(/第一题/)).toBeInTheDocument()
    expect(screen.queryByText(/第二题/)).toBeNull()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    expect(screen.getByText(/第二题/)).toBeInTheDocument()
    expect(screen.queryByText(/第一题/)).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'题目导航'}))
    fireEvent.click(screen.getByRole('button',{name:'第 1 题，已作答'}))
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(screen.getByTestId('answers').textContent).toContain('"first":"o2"')
  })
  it('skips answered items, wraps to earlier unanswered items and never navigates to another scale',()=>{
    const questions={...unit,items:[...unit.items,{itemKey:'third',prompt:'第三题',required:true},{itemKey:'fourth',prompt:'第四题',required:true}]}
    render(<Harness questions={questions} initialAnswers={{second:'o2',unrelated:'o1'}}/>)
    fireEvent.click(screen.getByRole('button',{name:'题目导航'}))
    expect(screen.getByRole('button',{name:'第 1 题，未作答'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'第 3 题，未作答'})).toBeDisabled()
    expect(screen.getAllByRole('button',{name:/第 .*题，/})).toHaveLength(4)
    fireEvent.click(screen.getByRole('button',{name:'关闭题目导航'}))
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    expect(screen.getByText('第三题')).toBeInTheDocument()
    expect(screen.getByRole('progressbar',{name:'量表作答进度'})).toHaveAttribute('value','2')
    expect(screen.getByRole('status',{name:'作答反馈'})).toHaveTextContent('第 1 题已作答 · 已切换至第 3 题')
    fireEvent.click(screen.getByRole('button',{name:'题目导航'}))
    fireEvent.click(screen.getByRole('button',{name:'第 2 题，已作答'}))
    fireEvent.click(screen.getByRole('radio',{name:'不同意'}))
    expect(screen.getByText('第三题')).toBeInTheDocument()
  })
  it('returns from the last item to an earlier unanswered item without clearing any other answer',()=>{
    const questions={...unit,items:[...unit.items,{itemKey:'third',prompt:'第三题',required:true}]}
    render(<Harness questions={questions} initialIndex={2} initialAnswers={{second:'o2'}}/>)
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    expect(screen.getByText('第一题')).toBeInTheDocument()
    expect(screen.getByTestId('answers').textContent).toContain('"second":"o2"')
    expect(screen.getByTestId('answers').textContent).toContain('"third":"o2"')
  })
  it('confirms an arrow-key selection with Enter without requiring previous/next buttons',()=>{
    render(<Harness/>);const option=screen.getByRole('radio',{name:'同意'})
    fireEvent.keyDown(option,{key:'ArrowRight'});fireEvent.click(option)
    expect(screen.getByText('第一题')).toBeInTheDocument()
    fireEvent.keyDown(option,{key:'Enter'})
    expect(document.getElementById('survey-answer-scale-second')).toHaveFocus()
    expect(screen.queryByRole('button',{name:'上一题'})).toBeNull()
    expect(screen.queryByRole('button',{name:'下一题'})).toBeNull()
  })

})
