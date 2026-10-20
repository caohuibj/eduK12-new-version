import {beforeEach,expect,it,vi} from 'vitest'
import {fireEvent,render,screen} from '@testing-library/react'
import {SurveyPrivateReferenceStudio} from './SurveyPrivateReferenceStudio'
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const request=vi.fn(),base='/projects/'+id(1)+'/analytics/waves/'+id(2)+'/reference-candidates'
const candidate={candidateId:id(4),candidateHash:'a'.repeat(64),sampleSize:3,measurement:{releaseId:id(5)},definition:{referenceVersion:'v1',entries:[{scoreKey:'total',statistics:{mean:3,sd:1},limitations:['仅描述本项目样本','qualityLimited: 2']}]},evidence:{method:'verified mean'},exclusionCounts:{qualityLimited:2},sampleManifest:[{secret:'DO_NOT_RENDER_SAMPLE'}]}
function mount(actor=id(9)){return render(<SurveyPrivateReferenceStudio projectId={id(1)} waveId={id(2)} actorId={actor} request={request}/>)}
function field(label:string,value:string){fireEvent.change(screen.getByLabelText(label),{target:{value}})}
function fill(){field('analyze 授权 UUID',id(3));field('来源工具 key','scale-key');field('指标 key','total');field('参考候选版本','v1');for(const label of ['方法依据','纳入规则','缺失处理','重复作答','组织聚类','施测差异','不确定性','适用范围','样本充分性'])field(label,'Documented method')}
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true)})
it('creates from selectors and nine evidence fields only, showing aggregate without manifest',async()=>{
 request.mockResolvedValue(candidate);mount();expect(request).not.toHaveBeenCalled();fill();fireEvent.click(screen.getByRole('button',{name:'创建描述性候选'}))
 await screen.findByText('候选聚合结果');const [path,method,body]=request.mock.calls[0]
 expect(path).toBe(base);expect(method).toBe('POST');expect(Object.keys(body).sort()).toEqual(['evidence','grantId','instrumentKey','referenceVersion','requestId','scoreKey'])
 expect(Object.keys(body.evidence)).toHaveLength(9);expect(screen.queryByText(/DO_NOT_RENDER_SAMPLE/)).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'提交审核'})).toBeDisabled();expect(screen.getByText('排除 qualityLimited：2')).toBeInTheDocument()
})
it('requires a real read before review, sends actual candidate hash, then explicit publish capability',async()=>{
 request.mockResolvedValueOnce(candidate).mockResolvedValueOnce({reviewId:id(6)}).mockResolvedValueOnce({releaseId:id(7)})
 mount();field('候选 UUID',id(4));field('review 授权 UUID',id(3));fireEvent.click(screen.getByRole('button',{name:'读取候选核验'}));await screen.findByText('候选聚合结果')
 field('审核说明','Reviewed methodology');fireEvent.click(screen.getByRole('button',{name:'提交审核'}));await screen.findByText('审核已保存：'+id(6))
 expect(request.mock.calls[1][2]).toMatchObject({candidateHash:candidate.candidateHash,grantId:id(3),decision:'APPROVED',statement:'Reviewed methodology',requestId:expect.any(String)})
 field('publish 授权 UUID',id(8));field('发布本地 key','local-summary');field('发布版本','v1');fireEvent.click(screen.getByRole('button',{name:'确认发布私有参考'}));await screen.findByText('私有描述性样本参考发布已确认。')
 expect(request.mock.calls[2]).toEqual([base+'/'+id(4)+'/publish','POST',{grantId:id(8),reviewId:id(6),localKey:'local-summary',version:'v1'}])
})
it('unknown create persists per actor and retries identical body only after MISSING',async()=>{
 request.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({status:'MISSING'}).mockResolvedValueOnce(candidate)
 const first=mount();fill();fireEvent.click(screen.getByRole('button',{name:'创建描述性候选'}));await screen.findByText(/CREATE结果尚未确认/);const body=request.mock.calls[0][2];first.unmount()
 const other=mount(id(8));expect(screen.queryByRole('button',{name:'核对待确认请求'})).not.toBeInTheDocument();other.unmount();mount()
 expect(screen.queryByRole('button',{name:'重试原编号和内容'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'核对待确认请求'}));await screen.findByRole('button',{name:'重试原编号和内容'})
 expect(request.mock.calls[1]).toEqual([base+'/request-status','POST',body]);fireEvent.click(screen.getByRole('button',{name:'重试原编号和内容'}));await screen.findByText('候选聚合结果');expect(request.mock.calls[2][2]).toEqual(body)
})
it('completed recovery consumes saved result without repeating mutation',async()=>{
 request.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({status:'COMPLETED',result:candidate})
 mount();fill();fireEvent.click(screen.getByRole('button',{name:'创建描述性候选'}));await screen.findByText(/CREATE结果尚未确认/)
 fireEvent.click(screen.getByRole('button',{name:'核对待确认请求'}));await screen.findByText('候选聚合结果');expect(request).toHaveBeenCalledTimes(2)
 expect(sessionStorage.getItem('survey-reference-pending:'+id(9)+':'+id(1)+':'+id(2))).toBeNull()
})
it('denied candidate read does not expose review controls or assume owner capability',async()=>{
 request.mockRejectedValue(new Error('CONTENT_AUTHORITY_DENIED'));mount();field('候选 UUID',id(4));field('review 授权 UUID',id(3));fireEvent.click(screen.getByRole('button',{name:'读取候选核验'}))
 await screen.findByText('CONTENT_AUTHORITY_DENIED');expect(screen.getByRole('button',{name:'提交审核'})).toBeDisabled();expect(screen.queryByText('候选聚合结果')).not.toBeInTheDocument()
})
it('does not repeat an uncertain review and restores its actual reviewId through status',async()=>{
 request.mockResolvedValueOnce(candidate).mockRejectedValueOnce(new Error('review response lost')).mockResolvedValueOnce({status:'COMPLETED',result:{reviewId:id(6)}})
 mount();field('候选 UUID',id(4));field('review 授权 UUID',id(3));fireEvent.click(screen.getByRole('button',{name:'读取候选核验'}));await screen.findByText('候选聚合结果')
 field('审核说明','Verified sample');fireEvent.click(screen.getByRole('button',{name:'提交审核'}));await screen.findByText(/REVIEW结果尚未确认/)
 expect(screen.getByRole('button',{name:'提交审核'})).toBeDisabled();expect(request).toHaveBeenCalledTimes(2)
 const body=request.mock.calls[1][2];fireEvent.click(screen.getByRole('button',{name:'核对待确认请求'}));await screen.findByText('审核已保存：'+id(6))
 expect(request.mock.calls[2]).toEqual([base+'/'+id(4)+'/reviews/request-status','POST',body]);expect(screen.getByLabelText('实际 review UUID')).toHaveValue(id(6))
})
it.each([false,true])('explicit refusal permits editing unless an unknown outcome occurred: step-up=%s',async stepUp=>{
 if(stepUp)request.mockRejectedValueOnce(Object.assign(new Error('SURVEY_MFA_REQUIRED'),{status:403}))
 request.mockRejectedValueOnce(Object.assign(new Error('CONTENT_AUTHORITY_DENIED'),{status:403}))
 mount();fill();fireEvent.click(screen.getByRole('button',{name:'创建描述性候选'}))
 if(stepUp){await screen.findByRole('button',{name:'重新认证后重试原请求'});fireEvent.click(screen.getByRole('button',{name:'重新认证后重试原请求'}))}
 await screen.findByText(/本次请求明确未执行/);expect(screen.getByLabelText('analyze 授权 UUID')).not.toBeDisabled()
})
it('unknown outcome remains immutable after MISSING and a later explicit denial',async()=>{
 request.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({status:'MISSING'}).mockRejectedValueOnce(Object.assign(new Error('CONTENT_AUTHORITY_DENIED'),{status:403}))
 mount();fill();fireEvent.click(screen.getByRole('button',{name:'创建描述性候选'}));await screen.findByText(/CREATE结果尚未确认/)
 const original=request.mock.calls[0][2];fireEvent.click(screen.getByRole('button',{name:'核对待确认请求'}));await screen.findByRole('button',{name:'重试原编号和内容'})
 fireEvent.click(screen.getByRole('button',{name:'重试原编号和内容'}));await screen.findByText('CONTENT_AUTHORITY_DENIED')
 expect(request.mock.calls[2][2]).toEqual(original);expect(screen.getByLabelText('analyze 授权 UUID')).toBeDisabled()
})
it.each(['/request-status','-evil','/'+id(4)+'/reviews/extra','/'+id(4)+'/publish'])('rejects corrupted CREATE cached path suffix %s',suffix=>{
 sessionStorage.setItem('survey-reference-pending:'+id(9)+':'+id(1)+':'+id(2),JSON.stringify({actorId:id(9),pending:{operation:'CREATE',path:base+suffix,body:{}}}))
 mount();expect(screen.getByText(/无法恢复本账号/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'创建描述性候选'})).toBeDisabled();expect(request).not.toHaveBeenCalled()
})
