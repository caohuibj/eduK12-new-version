import React from 'react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {cleanup,renderHook,waitFor,render,screen,fireEvent} from '@testing-library/react'
import {createEnumerationRecipeSnapshot} from '../../../../../backend/src/modules/cognitive/content-candidates/enumeration/package'
import {createTeacherCognitiveClient} from '../../../huiteacher/assessmentRuntime.client'
import type {EducationReportApi} from '../../../components/education-tools/EducationScalePersonalReport'
import {createSurveyCognitiveApi} from '../../../survey/survey-cognitive-api'
import {useCognitiveSession} from '../core/useCognitiveSession'
import {assertNativeSession} from '../core/native-session-contract'
import type {CognitiveSession} from '../types'
import type {CognitiveSessionApi} from '../api'
import type {SchoolApi} from '../../../school/SchoolRecovery'
// Parent presentation only; the School host, CognitiveRunner and native admission hook are real.
vi.mock('../../../components/FinalCompositeAssessment',()=>({default:({state,onEnterCognitive}:any)=><button onClick={()=>onEnterCognitive(state.currentItem)}>进入当前认知子项</button>}))
vi.mock('../../situational/pages/SituationalRunner',()=>({default:()=>null}))
import {SchoolCompositeRunner} from '../../../school/SchoolCompositeRunner'

function native(){const s=createEnumerationRecipeSnapshot('experience');return {sessionId:'entry-enum',assignmentId:null,nativeTask:true,deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS',attemptNo:1,attemptEpoch:1,
 testType:s.testType,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,configVersion:s.configVersion,definitionHash:s.configHash,protocolSignature:s.protocolSignature,protocol:s.protocol,config:s.config,randomSeed:'synthetic-entry-boundary',sessionSnapshot:s} as unknown as CognitiveSession}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('Enumeration education entry boundaries; no product authority is invented',()=>{
 it('Teacher factory has no archive transport and the real hook rejects an injected native payload',async()=>{
  const session=native();expect(()=>assertNativeSession(session)).not.toThrow()
  const request=vi.fn(async()=>session),api=createTeacherCognitiveClient(request as EducationReportApi,'parent','slot',session.sessionId)
  expect(api.archiveRaw).toBeUndefined();expect(api.getRawArchive).toBeUndefined()
  const hook=renderHook(()=>useCognitiveSession(session.sessionId,api,{aggregateOnly:true}))
  await waitFor(()=>expect(hook.result.current.state.status).toBe('ERROR'))
  expect(hook.result.current.state.error?.message).toBe('当前入口尚不支持此认知测验')
  expect(request.mock.calls).toEqual([['/assessment-composite-attempts/parent/items/slot/cognitive/entry-enum']])
 })
 it('Survey factory keeps its proof/localDraftScope and rejects an injected Enumeration payload before FINAL',async()=>{
  const session=native(),request=vi.fn(async()=>session),proof={accessCredential:'synthetic-proof'}
  const api=createSurveyCognitiveApi(request as any,'/r/project/attempts/attempt/cognitive/slot',proof,vi.fn())
  expect(api.localDraftScope).toBe('survey-cognitive');expect(api.archiveRaw).toBeUndefined()
  const hook=renderHook(()=>useCognitiveSession(session.sessionId,api))
  await waitFor(()=>expect(hook.result.current.state.status).toBe('ERROR'))
  expect(hook.result.current.state.error?.message).toBe('当前入口尚不支持此认知测验')
  expect(request.mock.calls).toEqual([['/r/project/attempts/attempt/cognitive/slot/entry-enum/read','POST',proof]])
 })
 it.each(['aggregateOnly','localDraftScope'] as const)('adding a test-only archive function cannot bypass %s',async boundary=>{
  const session=native(),archiveRaw=vi.fn(),submitFinal=vi.fn(),api:CognitiveSessionApi={getSession:vi.fn(async()=>({code:0,message:'synthetic',data:session})),archiveRaw,submitFinal,appendTrial:vi.fn(),completeSession:vi.fn(),...(boundary==='localDraftScope'?{localDraftScope:'survey-cognitive' as const}:{})}
  const hook=renderHook(()=>useCognitiveSession(session.sessionId,api,{aggregateOnly:boundary==='aggregateOnly'}))
  await waitFor(()=>expect(hook.result.current.state.status).toBe('ERROR'))
  expect(hook.result.current.state.error?.message).toBe('当前入口尚不支持此认知测验')
  expect(archiveRaw).not.toHaveBeenCalled();expect(submitFinal).not.toHaveBeenCalled()
 })
 it('mounts the actual School client/runner and stops the injected native child before calibration or submission',async()=>{
  const session=native(),start='/organizations/org/activities/activity/runs/run/executions/execution/start',parent='/composite-attempts/parent',child=parent+'/items/slot/cognitive/'+session.sessionId
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path===start&&method==='POST')return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'parent'}
   if(path===parent+'?view=current-unit')return {id:'parent',status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',currentItem:{id:'slot',type:'COGNITIVE',position:1,cognitiveSession:{sessionId:session.sessionId}}}
   if(path===child)return session
   throw Error('Unexpected School route '+method+' '+path)
  })
  render(<SchoolCompositeRunner api={api as unknown as SchoolApi} execution={{organizationId:'org',courseId:'activity',runId:'run',executionId:'execution'}} onExit={vi.fn()} onFinished={vi.fn()}/> )
  fireEvent.click(screen.getByRole('button',{name:'开始或继续正式测评'}))
  fireEvent.click(await screen.findByRole('button',{name:'进入当前认知子项'}))
  await screen.findByText('当前入口尚不支持此认知测验')
  expect(api.mock.calls.map(c=>c[0])).toEqual([start,parent+'?view=current-unit',child])
  expect(screen.queryByRole('button',{name:'确认校准'})).toBeNull()
  expect(api.mock.calls.some(c=>c[0].includes('/submit')||c[0].includes('raw-archive')||c[0].startsWith('/cognitive/'))).toBe(false)
 })
})
