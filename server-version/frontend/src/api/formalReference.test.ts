import {beforeEach,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({fetch:vi.fn()}))
vi.mock('./client',()=>({sessionFetch:mocks.fetch}))
import {formalReferenceApi,type FormalReferenceOperation} from './formalReference'
const submission={operation:'SUBMIT',body:{sourceCandidateId:'source',sourceCandidateHash:'hash',analyzeGrantId:'grant',statement:'exact unchanged evidence'}} as FormalReferenceOperation
beforeEach(()=>vi.resetAllMocks())
it('uses only the Training session and exact documented aggregate endpoints',async()=>{
 mocks.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({code:0,data:[]})})
 await formalReferenceApi.grants();await formalReferenceApi.read('candidate','grant','PUBLISH');await formalReferenceApi.execute(submission)
 expect(mocks.fetch.mock.calls.map(call=>call[0])).toEqual(['/api/training/reference-governance/capabilities','/api/training/reference-governance/read','/api/training/reference-governance/submissions'])
 expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({candidateId:'candidate',grantId:'grant',purpose:'PUBLISH'})
 expect(JSON.parse(mocks.fetch.mock.calls[2][1].body)).toEqual(submission.body)
})
it('Survey source submission uses the provided Survey client without a Training fallback',async()=>{
 const survey=vi.fn().mockResolvedValue({candidateId:'created'})
 await formalReferenceApi.execute(submission,'SURVEY',survey)
 expect(survey).toHaveBeenCalledWith('/reference-governance/submissions','POST',submission.body)
 expect(mocks.fetch).not.toHaveBeenCalled()
 await expect(formalReferenceApi.execute(submission,'SURVEY')).rejects.toThrow('当前 Survey 会话')
 await expect(formalReferenceApi.execute({operation:'REVIEW',body:{}} as FormalReferenceOperation,'SURVEY',survey)).rejects.toThrow('Survey 只支持来源提交')
 expect(survey).toHaveBeenCalledOnce()
})
it('retains explicit refusal status but treats malformed or missing response bodies as unknown',async()=>{
 mocks.fetch.mockResolvedValueOnce({ok:false,status:403,json:async()=>({code:403,message:'AUTHORITY_DENIED'})})
 await expect(formalReferenceApi.grants()).rejects.toMatchObject({message:'AUTHORITY_DENIED',status:403})
 mocks.fetch.mockResolvedValueOnce({ok:false,status:403,json:async()=>{throw new Error('invalid json')}})
 await expect(formalReferenceApi.grants()).rejects.not.toHaveProperty('status')
 mocks.fetch.mockResolvedValueOnce({ok:true,status:200,json:async()=>({code:0})})
 await expect(formalReferenceApi.grants()).rejects.toThrow('未返回可核对结果')
})
