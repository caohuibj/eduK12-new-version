import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {SurveyReinterpretationStudio} from './SurveyReinterpretationStudio'
const id='11111111-1111-4111-8111-111111111111',gid='22222222-2222-4222-8222-222222222222'
const props={actorId:'actor',projectId:'project',waveId:'wave',finalId:id,instrumentKey:'scale'}
const result=(artifactId=id)=>({artifactId,finalId:id,artifactHash:'hash',createdAt:'2026-10-20T00:00:00Z',semantics:'EXPLICIT_IMMUTABLE_INTERPRETATION',accessAudience:'researcher',artifact:{sourceFinalHash:'source',interpretation:{units:[{instrumentKey:'scale',report:{status:'READY'},references:[{metricKey:'total',referenceKind:'descriptive_sample',status:'AVAILABLE'}]}]},report:{title:'Saved report',blocks:[{type:'TEXT',text:'<script>bad()</script>'},{type:'ASSET',alt:'Authorized alternative',assetId:'private'}],limitations:['Local sample'],disclaimer:'Research only'}}})
function fill(){fireEvent.change(screen.getByLabelText('重新解释授权 UUID'),{target:{value:gid}});fireEvent.change(screen.getByLabelText('报告 release UUID（可选）'),{target:{value:id}})}
beforeEach(()=>{sessionStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true)})
afterEach(()=>vi.restoreAllMocks())
describe('explicit immutable interpretation UI',()=>{
 it('does not create on mount; sends only explicit IDs and renders safe text after confirmation',async()=>{
  const request=vi.fn(async(_path,method,body)=>method==='POST'?result(body.requestId):result())
  render(<SurveyReinterpretationStudio {...props} request={request as never}/>);expect(request).not.toHaveBeenCalled();fill()
  fireEvent.click(screen.getByText('确认创建独立解释'));await screen.findByText('Saved report')
  const body=request.mock.calls[0][2];expect(body).toMatchObject({grantId:gid,instrumentKey:'scale',reportReleaseId:id,references:[]})
  expect(body).not.toHaveProperty('actorId');expect(body).not.toHaveProperty('scores');expect(screen.getByText('<script>bad()</script>')).toBeTruthy();expect(document.querySelector('script')).toBeNull();expect(document.querySelector('img')).toBeNull()
  expect(screen.getByText('确认创建独立解释')).toBeDisabled()
 })
 it('retains uncertain UUID across remount and recovers the exact successful artifact before another creation',async()=>{
  const request=vi.fn().mockRejectedValueOnce(new Error('network unavailable'))
  const mounted=render(<SurveyReinterpretationStudio {...props} request={request}/>);fill();fireEvent.click(screen.getByText('确认创建独立解释'));await screen.findByText(/原请求编号已保存/)
  const body=request.mock.calls[0][2];mounted.unmount();request.mockResolvedValueOnce(result(body.requestId))
  render(<SurveyReinterpretationStudio {...props} request={request}/>);expect(screen.getByText(/待核对请求/)).toHaveTextContent(body.requestId)
  fireEvent.click(screen.getByText('读取精确解释工件'));await screen.findByText('Saved report')
  expect(request.mock.calls[1][0]).toContain('/interpretations/'+body.requestId);expect(request.mock.calls[1][1]).toBeUndefined();expect(screen.queryByText(/待核对请求/)).toBeNull()
 })
 it('only downloads after a fresh authorized GET and never mixes it into raw exports',async()=>{
  const request=vi.fn().mockResolvedValue(result());const create=vi.fn().mockReturnValue('blob:test'),revoke=vi.fn()
  Object.defineProperty(URL,'createObjectURL',{value:create,configurable:true});Object.defineProperty(URL,'revokeObjectURL',{value:revoke,configurable:true});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
  render(<SurveyReinterpretationStudio {...props} request={request}/>);fireEvent.change(screen.getByLabelText('已保存解释工件 UUID'),{target:{value:id}});fireEvent.click(screen.getByText('独立导出解释 JSON'))
  await waitFor(()=>expect(create).toHaveBeenCalledTimes(1));expect(request.mock.calls[0][0]).toContain('/interpretations/'+id);expect(revoke).toHaveBeenCalledWith('blob:test')
  request.mockRejectedValueOnce(new Error('access denied'));fireEvent.click(screen.getByText('独立导出解释 JSON'));await screen.findByText('access denied');expect(create).toHaveBeenCalledTimes(1);expect(screen.queryByText('Saved report')).toBeNull()
 })
 it('does not cross actor recovery and never sends when browser cannot retain the request',async()=>{
  sessionStorage.setItem('survey-reinterpret-request:other:project:wave:'+id+':scale',JSON.stringify({requestId:id,grantId:gid,instrumentKey:'scale',references:[]}))
  const request=vi.fn();render(<SurveyReinterpretationStudio {...props} request={request}/>);expect(screen.queryByText(/待核对请求/)).toBeNull();fill();vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('storage full')})
  fireEvent.click(screen.getByText('确认创建独立解释'));await screen.findByText('storage full');expect(request).not.toHaveBeenCalled()
 })
 it('allows correction after a first deterministic rejection but keeps a failed retry identity',async()=>{
  const request=vi.fn().mockRejectedValueOnce(Object.assign(new Error('版本不可用'),{status:409}))
  render(<SurveyReinterpretationStudio {...props} request={request}/>);fill();fireEvent.click(screen.getByText('确认创建独立解释'));await screen.findByText(/可修正输入/);expect(screen.getByLabelText('重新解释授权 UUID')).not.toBeDisabled()
  request.mockRejectedValueOnce(new Error('lost response'));fireEvent.click(screen.getByText('确认创建独立解释'));await screen.findByText(/原请求编号已保存/)
  const body=request.mock.calls[1][2];request.mockRejectedValueOnce(Object.assign(new Error('版本不可用'),{status:409}));fireEvent.click(screen.getByText('人工重试同一解释请求'));await waitFor(()=>expect(request).toHaveBeenCalledTimes(3));expect(request.mock.calls[2][2]).toEqual(body);expect(screen.getByLabelText('重新解释授权 UUID')).toBeDisabled()
 })
 it('does not turn a step-up refusal into unknown state, but preserves subsequent transport uncertainty',async()=>{
  const request=vi.fn().mockRejectedValueOnce(Object.assign(new Error('近期 MFA 验证 required'),{status:403}))
  render(<SurveyReinterpretationStudio {...props} request={request}/>);fill();fireEvent.click(screen.getByText('确认创建独立解释'));await screen.findByText(/原请求编号已保存/)
  const first=request.mock.calls[0][2];request.mockRejectedValueOnce(Object.assign(new Error('错误授权范围'),{status:403}));fireEvent.click(screen.getByText('人工重试同一解释请求'));await screen.findByText(/可修正输入/)
  expect(request.mock.calls[1][2]).toEqual(first);expect(screen.getByLabelText('重新解释授权 UUID')).not.toBeDisabled()
 })
 it('drops an export response arriving after leaving the selected FINAL',async()=>{
  let resolve!:(value:unknown)=>void;const request=vi.fn(()=>new Promise(r=>{resolve=r}))
  const create=vi.fn();Object.defineProperty(URL,'createObjectURL',{value:create,configurable:true})
  const view=render(<SurveyReinterpretationStudio {...props} request={request as never}/>);fireEvent.change(screen.getByLabelText('已保存解释工件 UUID'),{target:{value:id}})
  fireEvent.click(screen.getByText('独立导出解释 JSON'));view.unmount();resolve(result());await Promise.resolve();expect(create).not.toHaveBeenCalled()
 })

 it('viewing older artifact B never completes uncertain request A or disables its original retry',async()=>{
  const request=vi.fn().mockRejectedValueOnce(new Error('A response lost'))
  render(<SurveyReinterpretationStudio {...props} request={request}/>);fill();fireEvent.click(screen.getByText('确认创建独立解释'));await screen.findByText(/原请求编号已保存/)
  const body=request.mock.calls[0][2]
  request.mockResolvedValueOnce(result(gid));fireEvent.change(screen.getByLabelText('已保存解释工件 UUID'),{target:{value:gid}});fireEvent.click(screen.getByText('读取精确解释工件'));await screen.findByText('Saved report')
  expect(screen.getByText('人工重试同一解释请求')).not.toBeDisabled();expect(screen.getByText(/待核对请求/)).toHaveTextContent(body.requestId)
  request.mockRejectedValueOnce(Object.assign(new Error('A not available'),{status:404}));fireEvent.change(screen.getByLabelText('已保存解释工件 UUID'),{target:{value:body.requestId}});fireEvent.click(screen.getByText('读取精确解释工件'));await screen.findByText('A not available')
  request.mockResolvedValueOnce(result(body.requestId));fireEvent.click(screen.getByText('人工重试同一解释请求'));await screen.findByText('Saved report')
  expect(request.mock.calls[3][2]).toEqual(body);expect(screen.queryByText(/待核对请求/)).toBeNull()
 })

})
