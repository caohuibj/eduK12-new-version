import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({fetch:vi.fn()}))
vi.mock('../client',()=>({sessionFetch:mocks.fetch}))
import {trainingReferenceApi,type TrainingReferenceOperation} from '../trainingReference'
const context={courseId:'course/1',compositeId:'task/1',grantId:'grant/1'}
const create:TrainingReferenceOperation={operation:'CREATE',body:{requestId:'uuid',selector:{itemId:'item',scoreKey:'total',publication:'2026-10-20T00:00:00Z',configDigest:null,variantKey:null},referenceVersion:'1',evidence:{methodRationale:'a',inclusionRule:'a',missingness:'a',repeatResponses:'a',organizationClustering:'a',administrationDifferences:'a',uncertainty:'a',applicability:'a',sampleAdequacy:'a'}}}
beforeEach(()=>{vi.clearAllMocks();mocks.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({code:0,data:{candidateId:'candidate'}})})})
describe('Training reference session transport',()=>{
 it('uses existing session/CSRF transport, encoded exact scope and original body',async()=>{
  await trainingReferenceApi.execute(context,create)
  expect(mocks.fetch).toHaveBeenCalledWith('/api/questionnaire-products/task%2F1/reference-candidates/courses/course%2F1/?grantId=grant%2F1',expect.objectContaining({method:'POST',body:JSON.stringify(create.body)}))
 })
 it('derives review and publish paths while keeping original full status bodies',async()=>{
  const review:TrainingReferenceOperation={operation:'REVIEW',body:{requestId:'uuid',candidateId:'candidate/1',candidateHash:'hash',decision:'APPROVED',statement:'Reviewed'}}
  await trainingReferenceApi.execute(context,review)
  expect(mocks.fetch.mock.calls[0][0]).toContain('/candidate%2F1/review?');expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).not.toHaveProperty('candidateId')
  await trainingReferenceApi.status(context,review)
  expect(mocks.fetch.mock.calls[1][0]).toContain('/request-status/REVIEW?');expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual(review.body)
 })
 it('preserves known HTTP status, but malformed responses remain uncertain',async()=>{
  mocks.fetch.mockResolvedValueOnce({ok:false,status:403,json:async()=>({code:-1,message:'Denied'})})
  await expect(trainingReferenceApi.execute(context,create)).rejects.toMatchObject({status:403,message:'Denied'})
  mocks.fetch.mockResolvedValueOnce({ok:true,status:200,json:async()=>{throw new Error('not JSON')}})
  await expect(trainingReferenceApi.execute(context,create)).rejects.toThrow('无法核对')
 })
})
