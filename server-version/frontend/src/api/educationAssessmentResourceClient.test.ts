import {describe,it,expect,vi} from 'vitest'
import {createEducationAssessmentResourceAdapter} from './educationAssessmentResourceClient'
import {educationAssessmentTrackInput} from './educationAssessmentResources'
import {assessmentDirectory,assessmentResource,assessmentScope} from '../test/educationAssessmentResources.fixture'

describe('real education assessment product API factory',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('uses %s scoped routes and keeps local identity and approval metadata out of HTTP',async product=>{
  const scope={...assessmentScope,product},directory=assessmentDirectory(scope),api=vi.fn(async()=>directory)
  const client=createEducationAssessmentResourceAdapter(api as never,product)
  await client.list(scope,'99999999-9999-4999-8999-999999999999')
  const base=`/organizations/${scope.organizationId}`
  const path=product==='TEACHER'?base+`/evaluation-events/${scope.workflowId}/run`:base+`/activities/${scope.workflowId}/runs/${scope.runId}`
  expect(api).toHaveBeenCalledWith(path+'/assessment-resources?'+new URLSearchParams({...(product==='TEACHER'?{runId:scope.runId}:{}),expectedVersion:'3',cursor:'99999999-9999-4999-8999-999999999999'}))
  const input=educationAssessmentTrackInput(scope,assessmentResource(scope))
  await client.addTrack(scope,{...input,actorKey:'forged',approved:true,sessionId:'training-session',educationOriginHash:'forged'} as typeof input)
  expect(api).toHaveBeenLastCalledWith(path+'/tracks','POST',input)
  expect(JSON.stringify(api.mock.calls)).not.toContain('actorKey')
  expect(JSON.stringify(api.mock.calls)).not.toContain('training-session')
 })
 it('rejects unsupported entry, foreign key, stale version and malformed cursor before an HTTP call',async()=>{
  const api=vi.fn(),client=createEducationAssessmentResourceAdapter(api,'TEACHER'),input=educationAssessmentTrackInput(assessmentScope,assessmentResource())
  await expect(client.list({...assessmentScope,product:'SCHOOL'})).rejects.toThrow('入口')
  await expect(client.list(assessmentScope,'opaque/training/session')).rejects.toThrow('分页')
  await expect(client.addTrack(assessmentScope,{...input,expectedVersion:4})).rejects.toThrow('版本')
  await expect(client.addTrack(assessmentScope,{...input,expectedRunId:'99999999-9999-4999-8999-999999999999'})).rejects.toThrow('版本')
  await expect(client.addTrack(assessmentScope,{...input,resource:{...input.resource,key:input.resource.key.replace('TEACHER','SCHOOL')}})).rejects.toThrow('资源')
  expect(api).not.toHaveBeenCalled()
 })
 it('rejects a server response for a different actual run rather than normalizing its identity into a directory',async()=>{
  const response=assessmentDirectory();response.scope.runId='99999999-9999-4999-8999-999999999999'
  const api=vi.fn(async()=>response),client=createEducationAssessmentResourceAdapter(api as never,'TEACHER')
  await expect(client.list(assessmentScope)).rejects.toThrow('任务版本不一致')
 })
})
