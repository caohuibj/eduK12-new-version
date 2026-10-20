import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {prepareReferenceCandidate} from '../../modules/measurement-content/reference-candidate'
import {prepareFormalReferenceCandidate} from '../../modules/measurement-content/formal-reference'
import {ids,sourceFixture} from './formal-reference.fixture'
const mocks=vi.hoisted(()=>({transaction:vi.fn(),authority:vi.fn(),sourceAuthority:vi.fn(),source:vi.fn(),consent:vi.fn(),trainingAuthority:vi.fn(),
  trainingSource:vi.fn(),trainingRecord:vi.fn(),store:vi.fn(),publish:vi.fn(),tx:{$queryRaw:vi.fn(),$executeRaw:vi.fn()}}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/measurement-content/formal-reference-authority',()=>({assertFormalReferenceAuthority:mocks.authority}))
vi.mock('../../modules/survey/reference-candidates.service',()=>({verifySurveyReferenceCandidate:mocks.source,surveyReferenceConsentEvidence:mocks.consent,assertSurveyReferenceSubmissionAuthority:mocks.sourceAuthority}))
vi.mock('../../modules/training-analysis/reference-source',()=>({assertTrainingReferenceAuthority:mocks.trainingAuthority}))
vi.mock('../../modules/training-analysis/reference-candidates.service',()=>({verifyTrainingReferenceCandidate:mocks.trainingSource,readTrainingReferenceCandidateRecord:mocks.trainingRecord}))
vi.mock('../../modules/measurement-content/reference-candidate.repository',()=>({storeReferenceCandidate:mocks.store,publishReviewedReferenceCandidate:mocks.publish}))
import {submitFormalReferenceCandidate,readFormalReferenceCandidate,reviewFormalReferenceCandidate,publishFormalReferenceCandidate} from '../../modules/measurement-content/formal-reference.service'
const reviewerGrant='77777777-7777-4777-8777-777777777777',reviewId='88888888-8888-4888-8888-888888888888'
let committedTransactions=0
let fixture:ReturnType<typeof sourceFixture>,formal:ReturnType<typeof prepareFormalReferenceCandidate>['candidate'],reviews:Map<string,any>
const submit=()=>{const {kind:_kind,...input}=fixture.promotion;return input}
const reviewInput=()=>({candidateId:ids.candidate,grantId:reviewerGrant,requestId:reviewId,candidateHash:formal.candidateHash,
  decision:'APPROVED' as const,statement:'Scope, consent and scientific evidence reviewed independently',consentReviewed:true as const})
const publishInput=()=>({candidateId:ids.candidate,grantId:reviewerGrant,candidateHash:formal.candidateHash,reviewId,localKey:'norm',version:'1'})
beforeEach(()=>{
  vi.resetAllMocks();fixture=sourceFixture();formal=prepareFormalReferenceCandidate(fixture.source,fixture.promotion,fixture.facts,fixture.consentEvidence).candidate
  reviews=new Map();committedTransactions=0;mocks.transaction.mockImplementation(async fn=>{const result=await fn(mocks.tx);committedTransactions++;return result})
  mocks.authority.mockImplementation(async(_tx,input)=>({grantId:input.grantId,version:1}))
  mocks.sourceAuthority.mockResolvedValue({grantId:ids.grant,version:1});mocks.trainingAuthority.mockResolvedValue({grantId:ids.grant,version:1})
  mocks.source.mockResolvedValue({facts:fixture.facts});mocks.consent.mockResolvedValue(fixture.consentEvidence)
  mocks.store.mockImplementation(async(_tx,input,facts)=>({candidateId:ids.candidate,candidate:prepareReferenceCandidate(input,facts)}))
  mocks.publish.mockResolvedValue({releaseId:'release',contentHash:'e'.repeat(64),version:'1',status:'PUBLISHED',family:'SCALE',layer:'REFERENCE'})
  mocks.tx.$queryRaw.mockImplementation(async(q:any)=>{
    if(q.sql.includes('measurement_reference_candidates'))return [{payload:q.values[0]===ids.source?fixture.source:formal}]
    if(q.sql.includes('measurement_reference_reviews')){
      const review=reviews.get(q.values[0])
      if(!review)return []
      if(q.values.length>1&&(review.candidate_id!==q.values[1]||review.candidate_hash!==q.values[2]))return []
      return [review]
    }
    throw new Error('Unexpected query')
  })
  mocks.tx.$executeRaw.mockImplementation(async(q:any)=>{
    if(q.sql.includes('INSERT INTO measurement_reference_reviews')){
      const [id,candidate_id,candidate_hash,reviewer_id,reviewer_grant_id,reviewer_grant_version,decision,statement,reviewed_at]=q.values
      if(!reviews.has(id))reviews.set(id,{id,candidate_id,candidate_hash,reviewer_id,reviewer_grant_id,reviewer_grant_version,decision,statement,reviewed_at})
      return 1
    }
    throw new Error('Unexpected mutation')
  })
})
describe('formal reference operation boundaries',()=>{
  it('allows only explicit source-owner entry submission, with deterministic aggregate-only retry',async()=>{
    const first=await submitFormalReferenceCandidate('analyst','SURVEY',submit())
    const retry=await submitFormalReferenceCandidate('analyst','SURVEY',submit())
    expect(first).toEqual(retry)
    expect(first.candidateHash).toBe(formal.candidateHash)
    expect(JSON.stringify(first)).not.toContain('private-person')
    expect(mocks.source).toHaveBeenCalledWith(mocks.tx,fixture.source,ids.grant)
    await expect(submitFormalReferenceCandidate('other','SURVEY',submit())).rejects.toThrow('REFERENCE_FORMAL_SOURCE_REQUIRED')
    await expect(submitFormalReferenceCandidate('analyst','TRAINING',submit())).rejects.toThrow('REFERENCE_FORMAL_SOURCE_REQUIRED')
  })
  it.each(['statistics','sampleManifest','definition','analyzerId','formalConsentEvidence'])('does not import caller %s',async field=>{
    await expect(submitFormalReferenceCandidate('analyst','SURVEY',{...submit(),[field]:{fake:true}})).rejects.toThrow()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('checks exact explicit reviewer authority before loading private source facts',async()=>{
    mocks.authority.mockRejectedValueOnce(new Error('NO_PLATFORM_GRANT'))
    await expect(readFormalReferenceCandidate('reviewer',{candidateId:ids.candidate,grantId:reviewerGrant})).rejects.toThrow('NO_PLATFORM_GRANT')
    expect(mocks.source).not.toHaveBeenCalled()
  })
  it('returns aggregate and recorded consent evidence without personal membership',async()=>{
    const value=await readFormalReferenceCandidate('reviewer',{candidateId:ids.candidate,grantId:reviewerGrant})
    expect(value.consentEvidence).toEqual(fixture.consentEvidence)
    expect(JSON.stringify(value)).not.toMatch(/private-person|sourceBinding|factVersion|analyzeGrantId/)
    expect(mocks.authority).toHaveBeenCalledTimes(3)
  })
  it('refuses source withdrawal/revocation/quality changes and changed consent evidence before review writes',async()=>{
    mocks.source.mockRejectedValueOnce(new Error('SOURCE_WITHDRAWN'))
    await expect(reviewFormalReferenceCandidate('reviewer',reviewInput())).rejects.toThrow('SOURCE_WITHDRAWN')
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
    mocks.consent.mockResolvedValueOnce([{...fixture.consentEvidence[0],purpose:'Changed scope'}])
    await expect(reviewFormalReferenceCandidate('reviewer',reviewInput())).rejects.toThrow('REFERENCE_REVIEW_STALE')
  })
  it('denies self-review and stale candidate hash even with a platform review grant',async()=>{
    await expect(reviewFormalReferenceCandidate('analyst',reviewInput())).rejects.toThrow('REFERENCE_INDEPENDENT_REVIEW_REQUIRED')
    await expect(reviewFormalReferenceCandidate('reviewer',{...reviewInput(),candidateHash:'f'.repeat(64)})).rejects.toThrow('REFERENCE_REVIEW_STALE')
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('requires explicit recorded-consent review rather than defaulting an acknowledgment',async()=>{
    const {consentReviewed:_consent,...input}=reviewInput()
    await expect(reviewFormalReferenceCandidate('reviewer',input)).rejects.toThrow()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('stores exact reviewer grant/version and recovers only the identical review request',async()=>{
    const first=await reviewFormalReferenceCandidate('reviewer',reviewInput())
    expect(await reviewFormalReferenceCandidate('reviewer',reviewInput())).toEqual(first)
    expect(reviews.get(reviewId)).toMatchObject({candidate_hash:formal.candidateHash,reviewer_grant_id:reviewerGrant,reviewer_grant_version:1})
    await expect(reviewFormalReferenceCandidate('reviewer',{...reviewInput(),statement:'different decision evidence'})).rejects.toThrow('REFERENCE_REVIEW_REQUEST_CONFLICT')
  })
  it('publishes only exact persisted approved review after current source and reviewer grant checks',async()=>{
    await reviewFormalReferenceCandidate('reviewer',reviewInput());mocks.authority.mockClear()
    const published=await publishFormalReferenceCandidate('publisher',publishInput())
    expect(published.releaseId).toBe('release')
    expect(mocks.authority).toHaveBeenCalledWith(mocks.tx,{actorId:'reviewer',grantId:reviewerGrant,capability:'reference.review',measurementReleaseId:ids.measurement})
    expect(mocks.publish).toHaveBeenCalledWith(mocks.tx,expect.objectContaining({candidateId:ids.candidate,reviewId,actorId:'publisher',purpose:'NEW_ADMINISTRATION'}),expect.any(Map))
  })
  it('rejects stale/rejected/ungranted review and current reviewer grant revocation',async()=>{
    await reviewFormalReferenceCandidate('reviewer',reviewInput())
    reviews.get(reviewId).decision='REJECTED'
    await expect(publishFormalReferenceCandidate('publisher',publishInput())).rejects.toThrow('REFERENCE_APPROVED_REVIEW_NOT_FOUND')
    reviews.get(reviewId).decision='APPROVED';reviews.get(reviewId).reviewer_grant_id=null
    await expect(publishFormalReferenceCandidate('publisher',publishInput())).rejects.toThrow('REFERENCE_APPROVED_REVIEW_NOT_FOUND')
    reviews.get(reviewId).reviewer_grant_id=reviewerGrant
    mocks.authority.mockImplementation(async(_tx,input)=>{if(input.actorId==='reviewer')throw new Error('REVIEW_GRANT_REVOKED');return {grantId:input.grantId,version:1}})
    await expect(publishFormalReferenceCandidate('publisher',publishInput())).rejects.toThrow('REVIEW_GRANT_REVOKED')
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it('does not trust a stored candidate modified after source submission',async()=>{
    formal.evidence.method='Rewritten statistics procedure'
    await expect(readFormalReferenceCandidate('reviewer',{candidateId:ids.candidate,grantId:reviewerGrant})).rejects.toThrow('REFERENCE_REVIEW_STALE')
    formal.candidateHash=canonicalHash(Object.fromEntries(Object.entries(formal).filter(([key])=>key!=='candidateHash')))
    await expect(readFormalReferenceCandidate('reviewer',{candidateId:ids.candidate,grantId:reviewerGrant})).rejects.toThrow('REFERENCE_REVIEW_STALE')
  })
})

describe('terminal authority after awaited writes',()=>{
  it.each(['SOURCE_EXPIRED','SOURCE_REVOKED'])('rejects submit after candidate unique-conflict wait: %s',async code=>{
    mocks.store.mockImplementationOnce(async(_tx,input,facts)=>{
      mocks.sourceAuthority.mockRejectedValueOnce(new Error(code))
      return {candidateId:ids.candidate,candidate:prepareReferenceCandidate(input,facts)}
    })
    await expect(submitFormalReferenceCandidate('analyst','SURVEY',submit())).rejects.toThrow(code)
    expect(committedTransactions).toBe(0);expect(mocks.source).toHaveBeenCalledOnce()
  })
  it.each(['SOURCE','CALLER'])('rejects review after INSERT conflict wait if %s authority expires',async target=>{
    const insert=mocks.tx.$executeRaw.getMockImplementation()!
    mocks.tx.$executeRaw.mockImplementationOnce(async(q:any)=>{
      const result=await insert(q)
      if(target==='SOURCE')mocks.sourceAuthority.mockRejectedValueOnce(new Error('AUTHORITY_EXPIRED_AFTER_WAIT'))
      else mocks.authority.mockRejectedValueOnce(new Error('AUTHORITY_EXPIRED_AFTER_WAIT'))
      return result
    })
    await expect(reviewFormalReferenceCandidate('reviewer',reviewInput())).rejects.toThrow('AUTHORITY_EXPIRED_AFTER_WAIT')
    expect(committedTransactions).toBe(0);expect(mocks.source).toHaveBeenCalledOnce()
  })
  it.each(['SOURCE_EXPIRED','SOURCE_REVOKED','REVIEWER_EXPIRED','REVIEWER_REVOKED','PUBLISHER_EXPIRED','PUBLISHER_REVOKED'])(
    'rolls back after awaited publication when original %s authority is no longer current',async code=>{
      await reviewFormalReferenceCandidate('reviewer',reviewInput());committedTransactions=0;mocks.source.mockClear()
      mocks.publish.mockImplementationOnce(async()=>{
        if(code.startsWith('SOURCE'))mocks.sourceAuthority.mockRejectedValueOnce(new Error(code))
        else mocks.authority.mockImplementation(async(_tx,input)=>{
          if(input.actorId===(code.startsWith('REVIEWER')?'reviewer':'publisher'))throw new Error(code)
          return {grantId:input.grantId,version:1}
        })
        return {releaseId:'release',contentHash:'e'.repeat(64),version:'1',status:'PUBLISHED',family:'SCALE',layer:'REFERENCE'}
      })
      await expect(publishFormalReferenceCandidate('publisher',publishInput())).rejects.toThrow(code)
      expect(mocks.publish).toHaveBeenCalledOnce();expect(committedTransactions).toBe(0)
      expect(mocks.source).toHaveBeenCalledOnce()
    })
  it.each(['SOURCE','REVIEWER','PUBLISHER'])('refuses silently replacing original %s grant/version after write',async target=>{
    await reviewFormalReferenceCandidate('reviewer',reviewInput());committedTransactions=0
    mocks.publish.mockImplementationOnce(async()=>{
      if(target==='SOURCE')mocks.sourceAuthority.mockResolvedValueOnce({grantId:ids.grant,version:2})
      else mocks.authority.mockImplementation(async(_tx,input)=>({grantId:input.grantId,
        version:input.actorId===(target==='REVIEWER'?'reviewer':'publisher')?2:1}))
      return {releaseId:'release',contentHash:'e'.repeat(64),version:'1',status:'PUBLISHED',family:'SCALE',layer:'REFERENCE'}
    })
    await expect(publishFormalReferenceCandidate('publisher',publishInput())).rejects.toThrow('REFERENCE_AUTHORITY_STALE')
    expect(committedTransactions).toBe(0)
  })
})
