import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),publish:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get,publishContentRelease:mocks.publish}))
import {storeReferenceCandidate,publishReviewedReferenceCandidate} from '../../modules/measurement-content/reference-candidate.repository'
import {prepareReferenceCandidate,referenceEntryKey,type ReferenceCandidate} from '../../modules/measurement-content/reference-candidate'
const fixture=()=>{
  const input:Omit<ReferenceCandidate,'schemaVersion'|'candidateHash'>={analyzerId:'analyst',measurement:{releaseId:'m1',contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64),instrumentVersion:'1',scoringVersion:'1'},scope:{kind:'PLATFORM'},definition:{schemaVersion:1,instrumentType:'scale',instrumentKey:'scale',referenceVersion:'1',status:'DRAFT',entries:[{scoreKey:'total',referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',instrumentVersion:'1',scoringVersion:'1',population:{},source:{citation:'Internal',sampleSize:1},statistics:{mean:1}}]},sampleManifest:[],evidence:{source:'INTERNAL_OBSERVED',cutoff:'2026-10-20T00:00:00Z',method:'Mean only',softwareVersion:'1',inclusionRule:'Consented',missingness:'None',repeatResponses:'First',organizationClustering:'One project',administrationDifferences:'Same',uncertainty:'Unestimated',applicability:'Exploratory',sampleAdequacy:'Descriptive only'}}
  const key=referenceEntryKey(input.definition.entries[0])
  input.sampleManifest=[{factId:'f1',factVersion:'1',measurementReleaseId:'m1',metricKeys:['total'],entryKeys:[key]}]
  const access=new Map([['f1',{factVersion:'1',measurementReleaseId:'m1',metricKeys:['total'],eligibleEntryKeys:[key]}]])
  return {input,access,candidate:prepareReferenceCandidate(input,access)}
}
beforeEach(()=>vi.clearAllMocks())
describe('reference trusted persistence boundaries',()=>{
  it('rejects a candidate whose reported scoring identity differs from the actual release',async()=>{
    const {input,access}=fixture(),db={$executeRaw:vi.fn(),$queryRaw:vi.fn()} as any
    mocks.get.mockResolvedValue({layer:'MEASUREMENT',family:'SCALE',status:'PUBLISHED',contentHash:input.measurement.contentHash,content:{instrumentVersion:'1',scoringVersion:'different',measurementHash:input.measurement.measurementHash,metrics:[{metricKey:'total'}]}})
    await expect(storeReferenceCandidate(db,input,access)).rejects.toThrow('REFERENCE_MEASUREMENT_MISMATCH')
    expect(db.$executeRaw).not.toHaveBeenCalled()
  })
  it('uses persisted approval and fresh source access before publishing',async()=>{
    const {candidate,access}=fixture(),row={payload:candidate,candidate_hash:candidate.candidateHash,reviewer_id:'reviewer',decision:'APPROVED',statement:'Approved descriptive scope',reviewed_at:new Date('2026-10-20T01:00:00Z')}
    const db={$queryRaw:vi.fn().mockResolvedValue([row])} as any
    const input={candidateId:'candidate',reviewId:'review',localKey:'local',version:'1',actorId:'publisher',purpose:'NEW_ADMINISTRATION' as const}
    await expect(publishReviewedReferenceCandidate(db,input,new Map())).rejects.toThrow('REFERENCE_SAMPLE_NOT_AUTHORIZED')
    expect(mocks.publish).not.toHaveBeenCalled()
    await publishReviewedReferenceCandidate(db,input,access)
    expect(mocks.publish).toHaveBeenCalledWith(db,expect.objectContaining({key:expect.stringMatching(/^reference:/),provenance:expect.objectContaining({reviewId:'review'})}),'publisher','NEW_ADMINISTRATION')
    row.decision='REJECTED';mocks.publish.mockClear()
    await expect(publishReviewedReferenceCandidate(db,input,access)).rejects.toThrow('REFERENCE_NOT_APPROVED')
    expect(mocks.publish).not.toHaveBeenCalled()
  })
})
