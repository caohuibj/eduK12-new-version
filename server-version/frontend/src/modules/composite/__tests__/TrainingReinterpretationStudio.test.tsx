import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {TrainingReinterpretationStudio} from '../TrainingReinterpretationStudio'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const props={actorId:id(1),compositeId:id(2),attemptId:id(3),itemIds:[id(4)]}
const result=(artifactId=id(9))=>({artifactId,artifactHash:'a'.repeat(64),createdAt:'2026-10-20T00:00:00Z',currentUseStatus:'AVAILABLE',lifecycleNotices:[] as Array<{layer:string;releaseId:string;status:string}>,artifact:{
 schemaVersion:1,semantics:'EXPLICIT_IMMUTABLE_INTERPRETATION',actorId:props.actorId,courseId:id(5),compositeId:props.compositeId,attemptId:props.attemptId,itemId:id(4),reason:'Reviewed correction',
 sourceReceiptHash:'b'.repeat(64),previous:{kind:'FINAL_RECEIPT',hash:'b'.repeat(64)},versions:{report:{releaseId:id(7),contentHash:'c'.repeat(64)}},
 interpretation:{units:[{report:{status:'READY'},references:[]}]},report:{generatorVersion:'DECLARATIVE_REPORT_V1',title:'Saved interpretation',blocks:[{type:'TEXT',text:'<script>not executable</script>'},{type:'ASSET',assetId:'private',alt:'No URL'}],limitations:[],disclaimer:null}}})
function fill(){
 fireEvent.change(screen.getByLabelText('投放课程 UUID'),{target:{value:id(5)}});fireEvent.change(screen.getByLabelText('重新解释授权 UUID'),{target:{value:id(6)}})
 fireEvent.change(screen.getByLabelText('报告 release UUID（可选）'),{target:{value:id(7)}});fireEvent.change(screen.getByLabelText('新解释原因'),{target:{value:'Reviewed correction'}})
}
const create=()=>fireEvent.click(screen.getByText('确认创建独立解释'))
beforeEach(()=>{sessionStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true)})
afterEach(()=>vi.restoreAllMocks())
describe('explicit Training artifact authoring and separate export',()=>{
 it('does not create on mount; only sends explicit IDs and reason after confirmation',async()=>{
  const request=vi.fn(async(_path:string,method?:string,body?:any)=>method==='POST'?result(body.requestId):result())
  render(<TrainingReinterpretationStudio {...props} request={request as never}/>);expect(request).not.toHaveBeenCalled();fill();create()
  await screen.findByText(/Saved interpretation/)
  expect(request.mock.calls[0][0]).toContain('/courses/'+id(5)+'/attempts/'+props.attemptId+'/interpretations?grantId='+id(6))
  const body=request.mock.calls[0][2];expect(body).toMatchObject({itemId:id(4),reason:'Reviewed correction',reportReleaseId:id(7),references:[]})
  expect(body).not.toHaveProperty('actorId');expect(body).not.toHaveProperty('metrics');expect(body).not.toHaveProperty('populationContext')
  expect(screen.getByText('<script>not executable</script>')).toBeTruthy();expect(document.querySelector('script')).toBeNull();expect(document.querySelector('img')).toBeNull()
  expect(screen.getByText('确认创建独立解释')).toBeDisabled()
 })
 it('retains unknown UUID/body across remount and later definite refusal',async()=>{
  const request=vi.fn().mockRejectedValueOnce(new Error('network lost'))
  const first=render(<TrainingReinterpretationStudio {...props} request={request}/>);fill();create();await screen.findByText(/原请求编号已保存/)
  const body=request.mock.calls[0][2];first.unmount();request.mockRejectedValueOnce(Object.assign(new Error('revoked'),{status:403}))
  render(<TrainingReinterpretationStudio {...props} request={request}/>);fireEvent.click(screen.getByText('重试同一解释请求'))
  await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));expect(request.mock.calls[1][2]).toEqual(body);expect(screen.getByLabelText('新解释原因')).toBeDisabled()
 })
 it('reading an old artifact never resolves the outstanding create request',async()=>{
  const request=vi.fn().mockRejectedValueOnce(new Error('unknown'))
  render(<TrainingReinterpretationStudio {...props} request={request}/>);fill();create();await screen.findByText(/原请求编号已保存/)
  const body=request.mock.calls[0][2];request.mockResolvedValueOnce(result(id(9)))
  fireEvent.change(screen.getByLabelText('已保存解释工件 UUID'),{target:{value:id(9)}});fireEvent.click(screen.getByText('读取精确解释工件'))
  await screen.findByText(/Saved interpretation/);expect(screen.getByText(/待核对请求/)).toHaveTextContent(body.requestId)
  request.mockResolvedValueOnce(result(body.requestId));fireEvent.click(screen.getByText('重试同一解释请求'));await waitFor(()=>expect(screen.queryByText(/待核对请求/)).toBeNull())
  expect(request.mock.calls[2][2]).toEqual(body)
 })
 it('refuses sending if recovery storage fails and never restores another actor',async()=>{
  sessionStorage.setItem(['training-interpretation','another',props.compositeId,props.attemptId].join(':'),'corrupt')
  const request=vi.fn();render(<TrainingReinterpretationStudio {...props} request={request}/>);fill()
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('storage unavailable')});create()
  await screen.findByText('storage unavailable');expect(request).not.toHaveBeenCalled()
 })
 it('exports only via fresh dedicated GET; current denial clears prior private view',async()=>{
  const saved=result(),exported={document:{schemaVersion:1,schema:'TRAINING_INTERPRETATION_EXPORT_V1',artifactId:saved.artifactId,artifactHash:saved.artifactHash,createdAt:saved.createdAt,artifact:saved.artifact},exportHash:'d'.repeat(64),lifecycleNotices:[],currentUseStatus:'AVAILABLE'}
  const request=vi.fn().mockResolvedValueOnce(exported),createUrl=vi.fn().mockReturnValue('blob:export'),revoke=vi.fn()
  Object.defineProperty(URL,'createObjectURL',{value:createUrl,configurable:true});Object.defineProperty(URL,'revokeObjectURL',{value:revoke,configurable:true});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
  render(<TrainingReinterpretationStudio {...props} request={request}/>);fill();fireEvent.change(screen.getByLabelText('已保存解释工件 UUID'),{target:{value:id(9)}})
  fireEvent.click(screen.getByText('独立导出解释 JSON'));await waitFor(()=>expect(createUrl).toHaveBeenCalledTimes(1))
  expect(request.mock.calls[0][0]).toContain('/interpretations/'+id(9)+'/export?grantId=');expect(request.mock.calls[0][1]).toBeUndefined();expect(revoke).toHaveBeenCalledWith('blob:export')
  request.mockRejectedValueOnce(new Error('current access denied'));fireEvent.click(screen.getByText('独立导出解释 JSON'));await screen.findByText('current access denied')
  expect(createUrl).toHaveBeenCalledTimes(1);expect(screen.queryByText(/Saved interpretation/)).toBeNull()
 })
 it('suppresses withdrawn report conclusions while preserving historical identity',async()=>{
  const saved=result();saved.currentUseStatus='REVOKED';saved.lifecycleNotices=[{layer:'REPORT',releaseId:id(7),status:'REVOKED'}]
  render(<TrainingReinterpretationStudio {...props} request={vi.fn().mockResolvedValue(saved)}/>);fill();fireEvent.change(screen.getByLabelText('已保存解释工件 UUID'),{target:{value:id(9)}});fireEvent.click(screen.getByText('读取精确解释工件'))
  await screen.findByText(/停止展示结论/);expect(screen.queryByText(/Saved interpretation/)).toBeNull()
 })
 it('drops late export responses when leaving the exact FINAL',async()=>{
  let resolve!:(value:unknown)=>void;const request=vi.fn(()=>new Promise(r=>resolve=r)),createUrl=vi.fn()
  Object.defineProperty(URL,'createObjectURL',{value:createUrl,configurable:true})
  const mounted=render(<TrainingReinterpretationStudio {...props} request={request as never}/>);fill();fireEvent.change(screen.getByLabelText('已保存解释工件 UUID'),{target:{value:id(9)}});fireEvent.click(screen.getByText('独立导出解释 JSON'));mounted.unmount();resolve(result())
  await new Promise(r=>setTimeout(r,0));expect(createUrl).not.toHaveBeenCalled()
 })
 it('allows correction after the first known rollback rejection',async()=>{
  render(<TrainingReinterpretationStudio {...props} request={vi.fn().mockRejectedValue(Object.assign(new Error('not allowed'),{status:403}))}/>);fill();create()
  await screen.findByText(/可以修正输入/);expect(screen.getByLabelText('新解释原因')).not.toBeDisabled();expect(screen.queryByText(/待核对请求/)).toBeNull()
 })
})
