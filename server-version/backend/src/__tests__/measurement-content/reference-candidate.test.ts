import { describe, expect, it } from 'vitest'
import { prepareReferenceCandidate, reviewReferenceCandidate, referenceCandidateRelease } from '../../modules/measurement-content/reference-candidate'
import type { ReferenceCandidate } from '../../modules/measurement-content/reference-candidate'
const fixture=():Omit<ReferenceCandidate,'schemaVersion'|'candidateHash'>=>({
  analyzerId:'analyst',measurement:{releaseId:'m1',contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64),instrumentVersion:'1',scoringVersion:'1'},
  scope:{kind:'PRIVATE',ownerId:'analyst',product:'SURVEY',resourceId:'project'},
  definition:{schemaVersion:1,instrumentType:'sjt',instrumentKey:'discussion',referenceVersion:'1',status:'DRAFT',entries:[{
    scoreKey:'effort',referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',instrumentVersion:'1',scoringVersion:'1',population:{},source:{citation:'Internal authorized sample',sampleSize:2},statistics:{mean:2},
  }]},
  sampleManifest:['f1','f2'].map(factId=>({factId,factVersion:'1',measurementReleaseId:'m1',metricKeys:['effort']})),
  evidence:{source:'INTERNAL_OBSERVED',cutoff:'2026-10-20T00:00:00Z',method:'Descriptive mean only',softwareVersion:'1',inclusionRule:'Consented project facts',missingness:'Complete cases',repeatResponses:'First eligible fact',organizationClustering:'Single project',administrationDifferences:'Same protocol',uncertainty:'Not a norm',applicability:'Project only',sampleAdequacy:'Exploratory descriptive estimate only'},
})
const access=new Map([['f1','1'],['f2','1']])
const review=(candidateHash:string,reviewerId='reviewer')=>({candidateHash,reviewerId,reviewedAt:'2026-10-20T01:00:00Z',statement:'Reviewed scope and evidence',decision:'APPROVED' as const})
describe('internal reference candidate preparation',()=>{
  it('retains SJT identity and exact source facts without promoting a private sample to norm',()=>{
    const c=prepareReferenceCandidate(fixture(),access)
    expect(referenceCandidateRelease(c,review(c.candidateHash),'private-reference','1').family).toBe('SJT')
    const norm=fixture();norm.definition.entries[0].evidenceLevel='local_norm'
    expect(()=>prepareReferenceCandidate(norm,access)).toThrow('REFERENCE_PRIVATE_OFFICIAL_NORM_FORBIDDEN')
  })
  it('rejects unauthorized, stale, duplicate and wrong-measurement sample facts',()=>{
    expect(()=>prepareReferenceCandidate(fixture(),new Map())).toThrow('REFERENCE_SAMPLE_NOT_AUTHORIZED')
    const duplicate=fixture();duplicate.sampleManifest[1]=duplicate.sampleManifest[0]
    expect(()=>prepareReferenceCandidate(duplicate,access)).toThrow('REFERENCE_DUPLICATE_FACT')
    const wrong=fixture();wrong.sampleManifest[0].measurementReleaseId='other'
    expect(()=>prepareReferenceCandidate(wrong,access)).toThrow('REFERENCE_SAMPLE_MEASUREMENT_MISMATCH')
  })
  it('binds review to immutable evidence and denies formal cross-entry self-review',()=>{
    const input=fixture();input.scope={kind:'PLATFORM'};input.definition.entries[0].referenceKind='normative_distribution';input.definition.entries[0].statistics={mean:2,sd:1}
    const c=prepareReferenceCandidate(input,access)
    expect(()=>reviewReferenceCandidate(c,review(c.candidateHash,'analyst'))).toThrow('REFERENCE_INDEPENDENT_REVIEW_REQUIRED')
    c.evidence.method='Changed after review'
    expect(()=>reviewReferenceCandidate(c,review(c.candidateHash))).toThrow('REFERENCE_REVIEW_STALE')
  })
  it('rejects nonfinite estimates and false sample counts',()=>{
    const invalid=fixture();invalid.definition.entries[0].statistics.mean=NaN
    expect(()=>prepareReferenceCandidate(invalid,access)).toThrow('REFERENCE_CANDIDATE_INVALID')
    const count=fixture();count.definition.entries[0].source.sampleSize=100
    expect(()=>prepareReferenceCandidate(count,access)).toThrow('REFERENCE_SAMPLE_COUNT_MISMATCH')
  })
})
