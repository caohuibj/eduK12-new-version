import {fireEvent,render,screen} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {ComponentProps} from 'react'
const mocks=vi.hoisted(()=>({sources:vi.fn(),sourceProps:vi.fn(),submissionProps:vi.fn(),governanceProps:vi.fn()}))
vi.mock('../api/trainingAnalysis',()=>({trainingAnalysisApi:{sources:mocks.sources}}))
vi.mock('./TrainingReferenceStudio',()=>({TrainingReferenceStudio:(props:ComponentProps<typeof import('./TrainingReferenceStudio').TrainingReferenceStudio>)=>{
 mocks.sourceProps(props)
 return <section aria-label="reference source"><button onClick={()=>props.onRiskChange?.(true)}>source pending</button><button onClick={()=>props.onRiskChange?.(false)}>source recovered</button>
  <button disabled={props.disabled} onClick={()=>props.onCandidateReady?.({candidate:{candidateId:'candidate-1',candidateHash:'exact-hash'} as never,analyzeGrantId:'analyze-1',verified:true})}>source ready</button><button onClick={()=>props.onCandidateReady?.({candidate:{candidateId:'candidate-1',candidateHash:'exact-hash'},analyzeGrantId:'analyze-1',verified:false})}>source resume</button></section>
}}))
vi.mock('./FormalReferenceStudio',()=>({
 FormalReferenceSubmission:(props:ComponentProps<typeof import('./FormalReferenceStudio').FormalReferenceSubmission>)=>{mocks.submissionProps(props);return <button disabled={props.disabled} onClick={()=>props.onRiskChange?.(true)}>submit formal</button>},
 default:(props:ComponentProps<typeof import('./FormalReferenceStudio').default>)=>{mocks.governanceProps(props);return <button disabled={props.disabled} onClick={()=>props.onRiskChange?.(true)}>governance action</button>},
}))
import {TrainingLongitudinalAnalysis as TrainingCourseAnalysis} from './TrainingCourseAnalysis'
const source={taskId:'task-1',taskName:'actual source',publication:'2026-10-20T00:00:00.000Z',configDigest:null,variantKey:null,metrics:[{itemId:'item-1',metricKey:'total'}]}
beforeEach(()=>{vi.clearAllMocks();mocks.sources.mockResolvedValue({list:[source],canQuality:false,canExport:false})})
describe('Training longitudinal analysis reference entry integration',()=>{
 it('passes the actual actor/source and exact current candidate to explicit formal submission',async()=>{
  render(<TrainingCourseAnalysis actorId="owner-1" courseId="course-1"/>);fireEvent.click(await screen.findByText('source ready'))
  expect(mocks.sourceProps.mock.lastCall?.[0]).toMatchObject({actorId:'owner-1',courseId:'course-1',sources:[source]})
  expect(mocks.submissionProps.mock.lastCall?.[0]).toMatchObject({actorId:'owner-1',product:'TRAINING',candidateId:'candidate-1',candidateHash:'exact-hash',analyzeGrantId:'analyze-1'})
  expect(screen.getByText('submit formal')).toBeEnabled()
  fireEvent.click(screen.getByText('source pending'));expect(screen.getByText('submit formal')).toBeDisabled();expect(screen.getByText('governance action')).toBeDisabled()
  expect(screen.getByRole('combobox',{name:'波次 1 任务'})).toBeDisabled()
  fireEvent.click(screen.getByText('source recovered'));expect(screen.getByText('submit formal')).toBeEnabled()
  fireEvent.click(screen.getByText('submit formal'));expect(screen.getByText('source ready')).toBeDisabled();expect(screen.getByText('governance action')).toBeDisabled()
 })
 it('mounts the saved formal recovery identity but disables new submission until current verification',async()=>{
  render(<TrainingCourseAnalysis actorId="owner-1" courseId="course-1"/>);fireEvent.click(await screen.findByText('source resume'))
  expect(screen.getByText('submit formal')).toBeDisabled();expect(mocks.submissionProps.mock.lastCall?.[0]).toMatchObject({candidateId:'candidate-1',candidateHash:'exact-hash'})
  fireEvent.click(screen.getByText('source ready'));expect(screen.getByText('submit formal')).toBeEnabled()
 })
 it('does not equate course data access with formal governance eligibility or hide pending recovery',async()=>{
  mocks.sources.mockRejectedValueOnce({status:403});render(<TrainingCourseAnalysis actorId="reviewer-1" courseId="course-1"/>)
  await screen.findByText(/当前账号没有本课程数据分析权限/)
  expect(screen.getByText('governance action')).toBeEnabled();expect(screen.getByText('source ready')).toBeDisabled()
  expect(screen.getByText('source recovered')).toBeEnabled()
 })
 it('clears the previous actor’s candidate handoff and reloads real source authority',async()=>{
  const view=render(<TrainingCourseAnalysis actorId="owner-1" courseId="course-1"/>);fireEvent.click(await screen.findByText('source ready'))
  expect(screen.getByText('submit formal')).toBeVisible();view.rerender(<TrainingCourseAnalysis actorId="owner-2" courseId="course-1"/>)
  await screen.findByText('source ready');expect(screen.queryByText('submit formal')).toBeNull();expect(mocks.sources).toHaveBeenCalledTimes(2)
  expect(mocks.sourceProps.mock.lastCall?.[0].actorId).toBe('owner-2')
 })
})
