import {describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {UnknownTask} from './fixtures/unknown-runner'
describe('unknown package runner contract',()=>{
 it('keeps practice local and emits only raw formal responses',async()=>{
  const onTrialComplete=vi.fn().mockResolvedValue(undefined)
  render(<UnknownTask taskContext={{sessionId:'test',testType:'TEST_ONBOARDING_UNKNOWN_V1',engineVersion:'1.0.0',scoringVersion:'1.0.0',configVersion:'1',attemptNo:1,config:{trialCount:2},randomSeed:'fixed'}} trialIndex={0} onTrialComplete={onTrialComplete}/>)
  fireEvent.click(screen.getByText('Unknown instructions: start practice'))
  fireEvent.click(screen.getByText('Practice response: start formal'))
  expect(onTrialComplete).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Unknown formal 0'))
  await waitFor(()=>expect(onTrialComplete).toHaveBeenCalledExactlyOnceWith({correct:true}))
 })
})
