import {act,cleanup,fireEvent,render,renderHook,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {TrainingScaleLibrarySubmission} from './TrainingScaleLibrarySubmission'
import {SurveyScaleLibrarySubmission} from '../../survey/SurveyScaleLibrarySubmission'
import {useScaleLibrarySubmission} from './useScaleLibrarySubmission'
const api=vi.hoisted(()=>({source:vi.fn(),submissions:vi.fn(),submit:vi.fn(),withdraw:vi.fn()}))
vi.mock('../../api/scaleLibraryGovernance',()=>({governanceApi:()=>api,submissionStatusLabel:{SUBMITTED:'待审核'}}))
const metadata={title:'量表',author:'作者',copyright:'自有',applicability:'用途',scoringDescription:'求和',reportDescription:'描述性'}
const declaration={schemaVersion:1 as const,administrations:[{population:'STUDENT' as const,responseMode:'SELF' as const}]}
beforeEach(()=>{
 vi.resetAllMocks()
 api.source.mockResolvedValue({sourceId:'s',defaults:metadata,releases:['r1','r2'].map((releaseId,index)=>({releaseId,version:String(index+1),title:'量表',eligible:true,defaults:metadata,mediaManifest:{schemaVersion:1,manifestHash:'empty',items:[],releaseIds:[releaseId]}}))})
 api.submissions.mockResolvedValue({list:[]});api.submit.mockResolvedValue({id:'submitted'})
})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
async function open(product:'TRAINING'|'SURVEY'){
 render(product==='TRAINING'?<TrainingScaleLibrarySubmission sourceId="s"/>:<SurveyScaleLibrarySubmission sourceId="s"/>)
 if(product==='TRAINING'){
  fireEvent.click(screen.getByRole('button',{name:'申请进入共用库 / 查看申请状态'}))
  fireEvent.click(await screen.findByRole('button',{name:/^申请进入共用库$/}))
 }
 const label=product==='TRAINING'?'已发布版本':'申请的测量发布版本'
 await screen.findByRole('option',{name:product==='TRAINING'?'量表 · v1':'量表 · 1'})
 fireEvent.change(screen.getByLabelText(label),{target:{value:'r1'}})
 return {select:screen.getByLabelText(label),submit:screen.getByRole('button',{name:product==='TRAINING'?'提交入库申请':'提交此版本的入库申请'})}
}
function add(population='STUDENT',mode='SELF'){
 fireEvent.click(screen.getByRole('button',{name:'增加适用方式'}))
 const index=screen.getAllByLabelText(/^适用人群 \d+$/).length
 fireEvent.change(screen.getByLabelText(`适用人群 ${index}`),{target:{value:population}})
 fireEvent.change(screen.getByLabelText(`作答方式 ${index}`),{target:{value:mode}})
}
describe.each(['TRAINING','SURVEY'] as const)('%s exact applicability application',product=>{
 it('does not invent an administration when the optional declaration has no rows',async()=>{
  const {submit}=await open(product)
  expect(screen.queryByLabelText('适用人群 1')).not.toBeInTheDocument()
  fireEvent.click(submit)
  await waitFor(()=>expect(api.submit).toHaveBeenCalledTimes(1))
  expect(api.submit.mock.calls[0][4]).toBeUndefined()
 })
 it('blocks half rows and duplicates, and submits only explicit valid pairs',async()=>{
  const {submit}=await open(product)
  fireEvent.click(screen.getByRole('button',{name:'增加适用方式'}))
  expect(submit).toBeDisabled()
  fireEvent.change(screen.getByLabelText('适用人群 1'),{target:{value:'STUDENT'}})
  expect(submit).toBeDisabled()
  fireEvent.change(screen.getByLabelText('作答方式 1'),{target:{value:'SELF'}})
  add()
  expect(within(screen.getByLabelText('作答方式 2')).getByRole('option',{name:'学生自评'})).toBeDisabled()
  expect(submit).toBeDisabled()
  fireEvent.change(screen.getByLabelText('适用人群 2'),{target:{value:'TEACHER'}})
  expect(within(screen.getByLabelText('作答方式 2')).queryByRole('option',{name:'家长评学生'})).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('作答方式 2'),{target:{value:'STUDENT_REPORT'}})
  fireEvent.click(submit)
  await waitFor(()=>expect(api.submit).toHaveBeenCalledTimes(1))
  expect(api.submit.mock.calls[0][4]).toEqual({schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'},{population:'TEACHER',responseMode:'STUDENT_REPORT'}]})
 })
 it('keeps cancelled release switches intact and discards confirmed rows even on a round trip',async()=>{
  const {select}=await open(product);add()
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  fireEvent.change(select,{target:{value:'r2'}})
  expect(select).toHaveValue('r1');expect(screen.getByLabelText('作答方式 1')).toHaveValue('SELF')
  const blocked=new Event('beforeunload',{cancelable:true});window.dispatchEvent(blocked);expect(blocked.defaultPrevented).toBe(true)
  confirm.mockReturnValue(true)
  fireEvent.change(select,{target:{value:'r2'}})
  expect(select).toHaveValue('r2');expect(screen.queryByLabelText('适用人群 1')).not.toBeInTheDocument()
  fireEvent.change(select,{target:{value:'r1'}})
  expect(screen.queryByLabelText('适用人群 1')).not.toBeInTheDocument()
  const allowed=new Event('beforeunload',{cancelable:true});window.dispatchEvent(allowed);expect(allowed.defaultPrevented).toBe(false)
 })
})
it('includes applicability in idempotency identity and reuses the ID only for identical uncertain retries',async()=>{
 api.submit.mockRejectedValue(Error('结果未确认'))
 const {result}=renderHook(()=>useScaleLibrarySubmission('TRAINING','s'))
 await waitFor(()=>expect(result.current.loading).toBe(false))
 await act(async()=>{await result.current.submit('r1',metadata,undefined,declaration)})
 const first=api.submit.mock.calls[0][2]
 await act(async()=>{await result.current.refresh()})
 await act(async()=>{await result.current.submit('r1',metadata,undefined,declaration)})
 expect(api.submit.mock.calls[1][2]).toBe(first)
 await act(async()=>{await result.current.refresh()})
 const changed={schemaVersion:1 as const,administrations:[{population:'TEACHER' as const,responseMode:'SELF' as const}]}
 await act(async()=>{await result.current.submit('r1',metadata,undefined,changed)})
 expect(api.submit.mock.calls[2][2]).not.toBe(first)
 expect(api.submit.mock.calls[2][4]).toEqual(changed)
})
