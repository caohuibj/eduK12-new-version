/** Lifecycle regression adapted from DOT original c5a999f407417a5a4a39495bf8c378423c3b8552; original failed reporter remains in the unchanged Library handoff.
 * SchoolParentTasks, its real deferred loader and SchoolCompositeRunner are NOT
 * mocked. Only the API and downstream FinalCompositeAssessment rendering are
 * fixtures. This tests React/jsdom task switching, not engine/HTTP/PG behavior.
 * The missing execution key/runner reset also exists in R; no R gate is added.
 */
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,within} from '@testing-library/react'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {SchoolParentTasks} from './SchoolParentTasks'
import type {SchoolApi} from './SchoolRecovery'

const downstream=vi.hoisted(()=>({received:[] as Array<{attemptId:string;instruction:string}>}))
vi.mock('../components/FinalCompositeAssessment',()=>({default:({state}:any)=>{
 const instruction=state.currentItem?.questionnaireInstruction??''
 downstream.received.push({attemptId:state.id,instruction})
 return <section aria-label="review downstream final renderer"><output data-testid="review-attempt">{state.id}</output><p>{instruction}</p></section>
}}))

const common={organizationId:'org',activityId:'activity',activityTitle:'Synthetic activity',status:'ASSIGNED',deadline:null,
 feedbackMode:'COMPOSITION',consentRequired:false,consentPurpose:null,consentVisibility:null}
const taskA={...common,executionId:'execution-a',runId:'run-a',runTitle:'甲观察任务'}
const taskB={...common,executionId:'execution-b',runId:'run-b',runTitle:'乙观察任务'}
const stateA={id:'attempt-a',assessmentId:'composition-a',name:'甲观察任务',status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',attemptEpoch:1,
 contextSnapshotHash:null,currentItem:{id:'item-a',type:'SCALE',questionnaireInstruction:'甲任务专属说明（不得沿用到乙）'}}
const startA='/organizations/org/activities/activity/runs/run-a/executions/execution-a/start'
const startB='/organizations/org/activities/activity/runs/run-b/executions/execution-b/start'
let originalScroll:typeof Element.prototype.scrollIntoView
beforeAll(()=>{originalScroll=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=vi.fn()})
afterAll(()=>{if(originalScroll)Element.prototype.scrollIntoView=originalScroll;else delete (Element.prototype as any).scrollIntoView})

describe('School parent task switch lifecycle regression',()=>{
 it('switching directly from task A to task B must discard A attempt state and instructions',async()=>{
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path==='/my/parent-run-tasks'&&method==='GET')return {list:[taskA,taskB],truncated:false}
   if(path===startA&&method==='POST')return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt-a'}
   if(path==='/composite-attempts/attempt-a?view=current-unit'&&method==='GET')return stateA
   throw Error('Unexpected test API '+method+' '+path)
  })
  render(<SchoolParentTasks api={api as SchoolApi}/>)
  const a=await screen.findByRole('heading',{name:taskA.runTitle})
  fireEvent.click(within(a.closest('article')!).getByRole('button',{name:'查看任务（开始／继续校园正式测评）'}))
  const runner=await screen.findByRole('region',{name:'校园任务作答'})
  fireEvent.click(within(runner).getByRole('button',{name:'开始或继续正式测评'}))
  expect(await within(runner).findByTestId('review-attempt')).toHaveTextContent('attempt-a')
  expect(within(runner).getByText(stateA.currentItem.questionnaireInstruction)).toBeInTheDocument()
  expect(api).toHaveBeenCalledWith(startA,'POST',{})
  // Use the actual still-available parent inbox summary, not rerendering the
  // runner manually or substituting a fake runner with its own state.
  const listToggle=screen.getByText('查看任务列表',{selector:'summary'})
  fireEvent.click(listToggle)
  expect(listToggle.closest('details')).toHaveAttribute('open')
  const b=screen.getByRole('heading',{name:taskB.runTitle})
  fireEvent.click(within(b.closest('article')!).getByRole('button',{name:'查看任务（开始／继续校园正式测评）'}))
  const after=screen.getByRole('region',{name:'校园任务作答'})
  const observation={candidate:process.env.A_REVIEW_CANDIDATE_SHA??'source-hashed-working-tree',selectedTask:taskB.executionId,
   actualAttempt:within(after).queryByTestId('review-attempt')?.textContent??null,
   actualInstruction:after.textContent,downstreamProps:downstream.received,
   apiCalls:api.mock.calls,startedTaskB:api.mock.calls.some(([path])=>path===startB),
   dom:document.body.innerHTML,mocked:['API','downstream FinalCompositeAssessment render only','jsdom scrollIntoView']}
  if(process.env.DOT_REVIEW_EVIDENCE_DIR)writeFileSync(join(process.env.DOT_REVIEW_EVIDENCE_DIR,'school-parent-switch-run-'+(process.env.DOT_REVIEW_RUN_ID??'01')+'-observation.json'),JSON.stringify(observation,null,2)+'\n')
  expect(within(after).queryByText(stateA.currentItem.questionnaireInstruction),'Task B was selected through the real inbox; task A instructions must not remain in its runner').not.toBeInTheDocument()
 })
})
