import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({post:vi.fn(),study:vi.fn(),changes:vi.fn()}))
vi.mock('../../../api/client',()=>({default:{post:mocks.post}}))
vi.mock('../../../api/anonymousStudy',()=>({publicStudyApi:mocks.study}))
vi.mock('../../reporting/PersonalChangesReport',()=>({PersonalChangesReport:({report}:{report:{reportId:string}})=><div>{report.reportId}</div>}))
import {TrainingPersonalChanges} from '../TrainingPersonalChanges'
afterEach(()=>{cleanup();vi.resetAllMocks()})
describe('Training own changes request scope',()=>{
 it('discards an old response when the account/attempt changes',async()=>{
  let complete!:(value:unknown)=>void
  mocks.post.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve})).mockResolvedValueOnce({code:0,data:{status:'AVAILABLE',reportId:'bob-view'}})
  const view=render(<TrainingPersonalChanges attemptId="alice-attempt" actorId="alice"/>)
  fireEvent.click(screen.getByRole('button',{name:'查看我的变化'}))
  view.rerender(<TrainingPersonalChanges attemptId="bob-attempt" actorId="bob"/>)
  await act(async()=>{complete({code:0,data:{status:'AVAILABLE',reportId:'alice-private'}})})
  expect(screen.queryByText('alice-private')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'查看我的变化'}))
  await screen.findByText('bob-view')
  expect(mocks.post).toHaveBeenLastCalledWith('/composite-assessments/attempts/bob-attempt/changes',{})
 })
 it('uses the stable study credential and clears the rendered view when it changes',async()=>{
  mocks.study.mockReturnValue({changes:mocks.changes})
  mocks.changes.mockResolvedValue({status:'AVAILABLE',reportId:'study-view'})
  const view=render(<TrainingPersonalChanges attemptId="attempt" study={{studyId:'study',credential:'first-proof'}}/>)
  fireEvent.click(screen.getByRole('button',{name:'查看我的变化'}));await screen.findByText('study-view')
  expect(mocks.study).toHaveBeenCalledWith('first-proof');expect(mocks.changes).toHaveBeenCalledWith('study','attempt')
  view.rerender(<TrainingPersonalChanges attemptId="attempt" study={{studyId:'study',credential:'rotated-proof'}}/>)
  expect(screen.queryByText('study-view')).toBeNull();expect(mocks.post).not.toHaveBeenCalled()
 })
})
