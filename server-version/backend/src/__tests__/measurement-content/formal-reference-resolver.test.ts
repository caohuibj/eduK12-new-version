import {beforeEach,describe,expect,it,vi} from 'vitest'
import {prepareFormalReferenceCandidate} from '../../modules/measurement-content/formal-reference'
import {referenceCandidateRelease} from '../../modules/measurement-content/reference-candidate'
import {prepareRelease} from '../../modules/measurement-content/release'
import type {StoredRelease} from '../../modules/measurement-content/repository'
import {ids,sourceFixture} from './formal-reference.fixture'
const mocks=vi.hoisted(()=>({get:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
import {resolveFormalReferenceRelease} from '../../modules/measurement-content/formal-reference-resolver'
let release:StoredRelease,row:any,tx:any
const request=()=>({releaseId:release.releaseId,contentHash:release.contentHash,measurementReleaseId:ids.measurement,purpose:'NEW_BINDING' as const})
beforeEach(()=>{
  vi.resetAllMocks()
  const f=sourceFixture(),candidate=prepareFormalReferenceCandidate(f.source,f.promotion,f.facts,f.consentEvidence).candidate
  const reviewedAt='2026-10-20T01:00:00.000Z',review={candidateHash:candidate.candidateHash,reviewerId:'independent',decision:'APPROVED' as const,statement:'Evidence independently reviewed',reviewedAt}
  const input=referenceCandidateRelease(candidate,review,'formal-cross-entry','1')
  input.provenance={...input.provenance,candidateId:ids.candidate,reviewId:ids.grant}
  release={...prepareRelease(input),releaseId:'77777777-7777-4777-8777-777777777777',status:'PUBLISHED',publishedBy:'publisher',publishedAt:new Date(reviewedAt)}
  row={payload:candidate,candidate_hash:candidate.candidateHash,reviewer_id:review.reviewerId,decision:review.decision,
    statement:review.statement,reviewed_at:new Date(reviewedAt),reviewer_grant_id:ids.grant,reviewer_grant_version:1}
  tx={$queryRaw:vi.fn(async()=>[row])};mocks.get.mockImplementation(async()=>release)
})
describe('formal cross-entry release consumer',()=>{
  it('resolves an exact reviewed platform release to aggregate entries with no personal members',async()=>{
    const result=await resolveFormalReferenceRelease(tx,request())
    expect(mocks.get).toHaveBeenCalledWith(tx,release.releaseId,true)
    expect(result.entries[0].referenceKind).toBe('normative_distribution')
    expect(JSON.stringify(result)).not.toMatch(/private-person|sampleManifest|sourceBinding|analyzeGrantId/)
    result.entries[0].statistics.mean=999
    expect(row.payload.definition.entries[0].statistics.mean).toBe(2)
  })
  it('reuses a caller-held exact release lifecycle lock without rereading it',async()=>{
    await resolveFormalReferenceRelease(tx,request(),release)
    expect(mocks.get).not.toHaveBeenCalled();expect(tx.$queryRaw).toHaveBeenCalledOnce()
  })
  it('rejects an exact hash, measurement or release identity substitution before candidate read',async()=>{
    for(const change of [{releaseId:ids.source},{contentHash:'f'.repeat(64)},{measurementReleaseId:ids.source}])
      await expect(resolveFormalReferenceRelease(tx,{...request(),...change},release)).rejects.toThrow('FORMAL_REFERENCE_RELEASE_NOT_ELIGIBLE')
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('keeps lifecycle separate: retired cannot bind, revoked cannot reinterpret, history remains marked',async()=>{
    release.status='RETIRED'
    await expect(resolveFormalReferenceRelease(tx,request(),release)).rejects.toThrow('CONTENT_NOT_SELECTABLE')
    expect((await resolveFormalReferenceRelease(tx,{...request(),purpose:'REINTERPRETATION'},release)).status).toBe('RETIRED')
    release.status='REVOKED'
    await expect(resolveFormalReferenceRelease(tx,{...request(),purpose:'REINTERPRETATION'},release)).rejects.toThrow('CONTENT_REVOKED')
    expect((await resolveFormalReferenceRelease(tx,{...request(),purpose:'HISTORY'},release)).status).toBe('REVOKED')
  })
  it.each(['missing-review-grant','rejected','self-review','changed-review','changed-candidate'])('rejects untrusted persisted review: %s',async mode=>{
    if(mode==='missing-review-grant')row.reviewer_grant_id=null
    if(mode==='rejected')row.decision='REJECTED'
    if(mode==='self-review')row.reviewer_id=row.payload.analyzerId
    if(mode==='changed-review')row.statement='A different review cannot substitute for the published exact review'
    if(mode==='changed-candidate')row.payload.definition.entries[0].statistics.mean=100
    await expect(resolveFormalReferenceRelease(tx,request(),release)).rejects.toThrow()
  })
  it('rejects private releases and altered provenance instead of treating them as cross-entry',async()=>{
    const privateRelease={...release,scope:{kind:'PRIVATE',ownerId:'analyst',product:'TRAINING',resourceId:ids.project}} as StoredRelease
    await expect(resolveFormalReferenceRelease(tx,request(),privateRelease)).rejects.toThrow('FORMAL_REFERENCE_RELEASE_NOT_ELIGIBLE')
    await expect(resolveFormalReferenceRelease(tx,request(),{...release,provenance:{...release.provenance,unexpected:true}})).rejects.toThrow('FORMAL_REFERENCE_RELEASE_NOT_ELIGIBLE')
  })
})
