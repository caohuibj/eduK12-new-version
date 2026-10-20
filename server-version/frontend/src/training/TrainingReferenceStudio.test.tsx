import {act,fireEvent,render,screen} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({read:vi.fn(),execute:vi.fn(),status:vi.fn()}))
vi.mock('../api/trainingReference',async load=>({...await load<object>(),trainingReferenceApi:mocks}))
import {TrainingReferenceStudio} from './TrainingReferenceStudio'
import {trainingReferenceEvidenceLabels} from '../api/trainingReference'
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actorId=id(1),courseId=id(2),compositeId=id(3),grantId=id(4)
const source={taskId:compositeId,taskName:'课程测量',publication:'2026-10-20T01:00:00.000Z',configDigest:null,variantKey:null,metrics:[{itemId:id(5),metricKey:'total',label:'总分'}]}
const candidate={candidateId:id(6),candidateHash:'a'.repeat(64),sampleSize:5,measurement:{releaseId:id(7),contentHash:'b'.repeat(64)},
 definition:{referenceVersion:'1',entries:[{scoreKey:'total',referenceKind:'descriptive_sample',statistics:{mean:3,sd:1},limitations:['仅本课程描述']}]},evidence:{applicability:'本课程'},
 source:{courseId,compositeId,selector:{itemId:id(5),scoreKey:'total',publication:source.publication,configDigest:null,variantKey:null},cutOff:'2026-10-20T05:00:00.000Z',sourceHash:'c'.repeat(64),sourceCount:5}}
const storageKey='training-reference-pending:'+actorId+':'+courseId
function mount(){return render(<TrainingReferenceStudio actorId={actorId} courseId={courseId} sources={[source]}/>)}
function choose(){fireEvent.change(screen.getByLabelText('参考来源投放'),{target:{value:JSON.stringify([source.taskId,source.publication,null,null,null])}})
 fireEvent.change(screen.getByLabelText('参考数值指标'),{target:{value:JSON.stringify([id(5),'total'])}})}
function fillCreate(){choose();fireEvent.change(screen.getByLabelText('analyze 授权 ID'),{target:{value:grantId}})
 fireEvent.change(screen.getByLabelText('参考候选版本'),{target:{value:'1'}})
 Object.values(trainingReferenceEvidenceLabels).forEach(label=>fireEvent.change(screen.getByLabelText(label),{target:{value:'真实来源证据'}}))}
async function create(){fillCreate();fireEvent.click(screen.getByRole('button',{name:'创建课程描述性候选'}));await screen.findByRole('article',{name:'课程参考候选聚合结果'})}
async function read(){fireEvent.change(screen.getByLabelText('review 授权 ID'),{target:{value:id(8)}});fireEvent.click(screen.getByRole('button',{name:'读取课程候选核验'}));await screen.findByText('已核对当前候选内容和数据权限。')}
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true)
 mocks.execute.mockResolvedValue(candidate);mocks.read.mockResolvedValue(candidate);mocks.status.mockResolvedValue({status:'MISSING',requestId:id(9)})})
describe('Training private descriptive reference workspace',()=>{
 it('uses actual selected source and metric; never asks for publication/hash or sends actor/samples',async()=>{
  mount();await create();const [context,request]=mocks.execute.mock.calls[0]
  expect(context).toEqual({courseId,compositeId,grantId});expect(request.operation).toBe('CREATE')
  expect(request.body.selector).toEqual(candidate.source.selector);expect(request.body).not.toHaveProperty('actorId');expect(request.body).not.toHaveProperty('statistics')
  expect(sessionStorage.getItem(storageKey)).toBeNull();expect(screen.getByRole('button',{name:'提交课程参考审核'})).toBeDisabled()
 })
 it('requires a fresh capability-authorized read then uses exact candidate hash for review and explicit publish',async()=>{
  mount();await create();await read();fireEvent.change(screen.getByLabelText('审核说明'),{target:{value:'核对版本及局限'}})
  mocks.execute.mockResolvedValueOnce({reviewId:id(10)});fireEvent.click(screen.getByRole('button',{name:'提交课程参考审核'}));await screen.findByText('审核已保存：'+id(10))
  expect(mocks.execute.mock.calls[1][0].grantId).toBe(id(8));expect(mocks.execute.mock.calls[1][1].body).toMatchObject({candidateId:id(6),candidateHash:candidate.candidateHash,decision:'APPROVED'})
  fireEvent.change(screen.getByLabelText('publish 授权 ID'),{target:{value:id(11)}});fireEvent.change(screen.getByLabelText('参考发布 key'),{target:{value:'course-local'}})
  fireEvent.change(screen.getByLabelText('参考发布版本'),{target:{value:'1'}});mocks.execute.mockResolvedValueOnce({releaseId:id(12),contentHash:'f'.repeat(64),version:'1',status:'PUBLISHED'})
  fireEvent.click(screen.getByRole('button',{name:'发布课程私有参考'}));await screen.findByText(/私有描述性参考已发布/)
  expect(mocks.execute.mock.calls[2][1].body).toMatchObject({candidateId:id(6),reviewId:id(10),localKey:'course-local',version:'1'})
 })
 it('saves uncertainty before POST, restores on remount and permits only same-request retry after MISSING',async()=>{
  const first=mount();fillCreate();mocks.execute.mockRejectedValueOnce(new Error('connection lost'))
  fireEvent.click(screen.getByRole('button',{name:'创建课程描述性候选'}));await screen.findByText(/结果未确认/)
  const original=mocks.execute.mock.calls[0],saved=JSON.parse(sessionStorage.getItem(storageKey)!)
  expect(saved.hadUnknownOutcome).toBe(true);expect(saved.request).toEqual(original[1]);expect(screen.queryByRole('button',{name:'重试原参考请求'})).toBeNull()
  first.unmount();mount();expect(screen.getByRole('button',{name:'创建课程描述性候选'})).toBeDisabled()
  mocks.status.mockResolvedValueOnce({status:'MISSING',requestId:saved.request.body.requestId})
  fireEvent.click(screen.getByRole('button',{name:'核对参考请求状态'}));await screen.findByRole('button',{name:'重试原参考请求'})
  fireEvent.click(screen.getByRole('button',{name:'重试原参考请求'}));await screen.findByRole('article',{name:'课程参考候选聚合结果'})
  expect(mocks.execute.mock.calls[1]).toEqual(original)
 })
 it('retains an earlier unknown outcome when the identical retry gets 403',async()=>{
  mount();fillCreate();mocks.execute.mockRejectedValueOnce(new Error('lost'))
  fireEvent.click(screen.getByRole('button',{name:'创建课程描述性候选'}));await screen.findByText(/结果未确认/)
  const saved=JSON.parse(sessionStorage.getItem(storageKey)!)
  mocks.status.mockResolvedValueOnce({status:'MISSING',requestId:saved.request.body.requestId});fireEvent.click(screen.getByRole('button',{name:'核对参考请求状态'}));await screen.findByRole('button',{name:'重试原参考请求'})
  mocks.execute.mockRejectedValueOnce(Object.assign(new Error('permission revoked'),{status:403}));fireEvent.click(screen.getByRole('button',{name:'重试原参考请求'}))
  await screen.findByText(/permission revoked/);expect(JSON.parse(sessionStorage.getItem(storageKey)!).request).toEqual(saved.request)
  expect(screen.getByRole('button',{name:'创建课程描述性候选'})).toBeDisabled()
 })
 it('clears a known first refusal but does not convert another actor’s stored request into a retry',async()=>{
  mount();fillCreate();mocks.execute.mockRejectedValueOnce(Object.assign(new Error('not authorized'),{status:403}))
  fireEvent.click(screen.getByRole('button',{name:'创建课程描述性候选'}));await screen.findByText(/明确未执行/);expect(sessionStorage.getItem(storageKey)).toBeNull()
 })
 it('keeps publication uncertainty recoverable through exact PUBLISH status',async()=>{
  const saved={schemaVersion:1,actorId,context:{courseId,compositeId,grantId},hadUnknownOutcome:true,
   request:{operation:'PUBLISH',body:{requestId:id(20),candidateId:id(6),reviewId:id(10),localKey:'local',version:'1'}}}
  sessionStorage.setItem(storageKey,JSON.stringify(saved));mount()
  mocks.status.mockResolvedValueOnce({status:'COMPLETED',requestId:id(20),result:{releaseId:id(12),contentHash:'f'.repeat(64),version:'1',status:'PUBLISHED'}})
  fireEvent.click(screen.getByRole('button',{name:'核对参考请求状态'}));await screen.findByText(/私有描述性参考已发布/)
  expect(mocks.status).toHaveBeenCalledWith(saved.context,saved.request);expect(mocks.execute).not.toHaveBeenCalled();expect(sessionStorage.getItem(storageKey)).toBeNull()
 })
 it('blocks malformed or cross-actor storage; does not send a caller-controlled URL',()=>{
  sessionStorage.setItem(storageKey,JSON.stringify({schemaVersion:1,actorId:'other',context:{courseId,compositeId,grantId},request:{operation:'CREATE',body:{requestId:id(20)}},hadUnknownOutcome:true,path:'https://example.com'}))
  mount();expect(screen.getByText(/无法核对本账号保存的请求/)).toBeVisible();expect(screen.getByRole('button',{name:'创建课程描述性候选'})).toBeDisabled();expect(mocks.execute).not.toHaveBeenCalled()
 })
 it('drops a late mutation response after unmount without clearing recoverable storage',async()=>{
  let resolve!:(value:unknown)=>void;mocks.execute.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  const rendered=mount();fillCreate();fireEvent.click(screen.getByRole('button',{name:'创建课程描述性候选'}));rendered.unmount()
  await act(async()=>resolve(candidate));expect(sessionStorage.getItem(storageKey)).not.toBeNull()
 })
 it('recovers its original request even when another scientific panel is pending',async()=>{
  const saved={schemaVersion:1,actorId,context:{courseId,compositeId,grantId},hadUnknownOutcome:true,
   request:{operation:'CREATE',body:{requestId:id(20),selector:candidate.source.selector,referenceVersion:'1',evidence:Object.fromEntries(Object.keys(trainingReferenceEvidenceLabels).map(key=>[key,'真实证据']))}}}
  sessionStorage.setItem(storageKey,JSON.stringify(saved));render(<TrainingReferenceStudio actorId={actorId} courseId={courseId} sources={[source]} disabled/>)
  mocks.status.mockResolvedValueOnce({status:'MISSING',requestId:id(20)});fireEvent.click(screen.getByRole('button',{name:'核对参考请求状态'}))
  fireEvent.click(await screen.findByRole('button',{name:'重试原参考请求'}));await screen.findByRole('article',{name:'课程参考候选聚合结果'})
  expect(mocks.execute).toHaveBeenCalledWith(saved.context,saved.request)
  expect(screen.getByLabelText('参考来源投放')).toHaveValue(JSON.stringify([source.taskId,source.publication,null,null,null]))
  expect(screen.getByLabelText('参考数值指标')).toHaveValue(JSON.stringify([id(5),'total']))
 })
 it('clears the formal handoff when analyze authority or source identity changes',async()=>{
  const ready=vi.fn();render(<TrainingReferenceStudio actorId={actorId} courseId={courseId} sources={[source]} onCandidateReady={ready}/>)
  await create();expect(ready).toHaveBeenLastCalledWith({candidate,analyzeGrantId:grantId,verified:true})
  fireEvent.change(screen.getByLabelText('analyze 授权 ID'),{target:{value:id(21)}});expect(ready).toHaveBeenLastCalledWith(null)
  await read();expect(ready).toHaveBeenLastCalledWith({candidate,analyzeGrantId:id(21),verified:true})
  fireEvent.change(screen.getByLabelText('参考数值指标'),{target:{value:''}});expect(ready).toHaveBeenLastCalledWith(null)
  expect(screen.queryByRole('article',{name:'课程参考候选聚合结果'})).toBeNull()
 })
 it('restores only minimal candidate identity for pending formal recovery, never trusts it as a fresh read',async()=>{
  const ready=vi.fn(),view=render(<TrainingReferenceStudio actorId={actorId} courseId={courseId} sources={[source]} onCandidateReady={ready}/>)
  await create();const saved=JSON.parse(sessionStorage.getItem(storageKey+':candidate')!)
  expect(saved).toMatchObject({candidateId:id(6),candidateHash:candidate.candidateHash,analyzeGrantId:grantId,compositeId})
  expect(saved).not.toHaveProperty('statistics');expect(saved).not.toHaveProperty('sampleManifest');view.unmount();ready.mockClear()
  render(<TrainingReferenceStudio actorId={actorId} courseId={courseId} sources={[source]} onCandidateReady={ready}/>)
  expect(ready).toHaveBeenLastCalledWith({candidate:{candidateId:id(6),candidateHash:candidate.candidateHash},analyzeGrantId:grantId,verified:false})
  expect(screen.getByLabelText('候选 ID')).toHaveValue(id(6));expect(screen.queryByRole('article',{name:'课程参考候选聚合结果'})).toBeNull()
  expect(screen.getByRole('button',{name:'提交课程参考审核'})).toBeDisabled();await read();expect(ready).toHaveBeenLastCalledWith({candidate,analyzeGrantId:grantId,verified:true})
 })
 it('does not send when the browser cannot save the recovery identity',()=>{
  mount();fillCreate();const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')})
  fireEvent.click(screen.getByRole('button',{name:'创建课程描述性候选'}));expect(screen.getByText(/会话存储不可用/)).toBeVisible();expect(mocks.execute).not.toHaveBeenCalled();fail.mockRestore()
 })
})
