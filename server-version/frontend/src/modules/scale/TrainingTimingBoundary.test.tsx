import {describe,it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {TrainingTimingBoundary} from './TrainingTimingBoundary'
import {SurveyScaleTimingTracker} from './item-timing'
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('optional Training foreground timing',()=>{
 it('pauses, hides and resumes without collecting input contents',()=>{
  vi.spyOn(document,'hasFocus').mockReturnValue(true)
  let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now)
  const tracker=new SurveyScaleTimingTracker(),onTiming=vi.fn()
  render(<TrainingTimingBoundary tracker={tracker} itemKey="Q1" locked={false} onTiming={onTiming}><button onClick={()=>tracker.answer('Q1',undefined,1)}>回答</button></TrainingTimingBoundary>)
  now=100;fireEvent.click(screen.getByText('暂停作答与计时'))
  expect(screen.getByText('回答')).toBeDisabled()
  now=500;fireEvent.click(screen.getByText('继续作答与计时'))
  now=550;fireEvent.click(screen.getByText('回答'))
  expect(tracker.snapshot().Q1.firstResponseMs).toBe(150)
  now=600;fireEvent(window,new Event('blur'));now=1000
  expect(tracker.snapshot().Q1.activeTimeMs).toBe(200)
  fireEvent(window,new Event('focus'));now=1025
  expect(tracker.snapshot().Q1.activeTimeMs).toBe(225)
  expect(tracker.snapshot().Q1).not.toHaveProperty('responseValue')
 })
})
