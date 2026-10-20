import { describe, expect, it, vi } from 'vitest'
import { prepareReferenceCandidate, reviewReferenceCandidate, referenceCandidateRelease, referenceEntryKey } from '../../modules/measurement-content/reference-candidate'
import * as canonical from '../../modules/assessment-runtime/canonical'
import type { ReferenceCandidate } from '../../modules/measurement-content/reference-candidate'
const fixture=():Omit<ReferenceCandidate,'schemaVersion'|'candidateHash'>=>({
  analyzerId:'analyst',measurement:{releaseId:'m1',contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64),instrumentVersion:'1',scoringVersion:'1'},
  scope:{kind:'PRIVATE',ownerId:'analyst',product:'SURVEY',resourceId:'project'},
  definition:{schemaVersion:1,instrumentType:'sjt',instrumentKey:'discussion',referenceVersion:'1',status:'DRAFT',entries:[{
    scoreKey:'effort',referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',instrumentVersion:'1',scoringVersion:'1',population:{},source:{citation:'Internal authorized sample',sampleSize:2},statistics:{mean:2},
  }]},
  sampleManifest:['f1','f2'].map(factId=>({factId,factVersion:'1',measurementReleaseId:'m1',metricKeys:['effort'],entryKeys:[]})),
  evidence:{source:'INTERNAL_OBSERVED',cutoff:'2026-10-20T00:00:00Z',method:'Descriptive mean only',softwareVersion:'1',inclusionRule:'Consented project facts',missingness:'Complete cases',repeatResponses:'First eligible fact',organizationClustering:'Single project',administrationDifferences:'Same protocol',uncertainty:'Not a norm',applicability:'Project only',sampleAdequacy:'Exploratory descriptive estimate only'},
})
const authorize=(input:ReturnType<typeof fixture>)=>{
  const keys=input.definition.entries.map(referenceEntryKey)
  for(const member of input.sampleManifest)member.entryKeys=keys
  return new Map(input.sampleManifest.map(m=>[m.factId,{factVersion:m.factVersion,measurementReleaseId:m.measurementReleaseId,metricKeys:m.metricKeys,eligibleEntryKeys:keys}]))
}
const prepared=()=>{const input=fixture();return prepareReferenceCandidate(input,authorize(input))}
const review=(candidateHash:string,reviewerId='reviewer')=>({candidateHash,reviewerId,reviewedAt:'2026-10-20T01:00:00Z',statement:'Reviewed scope and evidence',decision:'APPROVED' as const})
describe('internal reference candidate preparation',()=>{
  it('retains SJT identity and exact source facts without promoting a private sample to norm',()=>{
    const c=prepared()
    expect(referenceCandidateRelease(c,review(c.candidateHash),'private-reference','1').family).toBe('SJT')
    const norm=fixture();norm.definition.entries[0].evidenceLevel='local_norm'
    expect(()=>prepareReferenceCandidate(norm,authorize(norm))).toThrow('REFERENCE_PRIVATE_OFFICIAL_NORM_FORBIDDEN')
  })
  it('rejects unauthorized, stale, duplicate and wrong-measurement sample facts',()=>{
    expect(()=>prepareReferenceCandidate(fixture(),new Map())).toThrow('REFERENCE_SAMPLE_NOT_AUTHORIZED')
    const duplicate=fixture();duplicate.sampleManifest[1]=duplicate.sampleManifest[0]
    expect(()=>prepareReferenceCandidate(duplicate,authorize(duplicate))).toThrow('REFERENCE_DUPLICATE_FACT')
    const wrong=fixture();wrong.sampleManifest[0].measurementReleaseId='other'
    expect(()=>prepareReferenceCandidate(wrong,new Map(wrong.sampleManifest.map(m=>[m.factId,{factVersion:'1',measurementReleaseId:'m1',metricKeys:['effort'],eligibleEntryKeys:[]}])) )).toThrow('REFERENCE_SAMPLE_SOURCE_MISMATCH')
  })
  it('binds review to immutable evidence and denies formal cross-entry self-review',()=>{
    const input=fixture();input.scope={kind:'PLATFORM'};input.definition.entries[0].referenceKind='normative_distribution';input.definition.entries[0].statistics={mean:2,sd:1}
    const c=prepareReferenceCandidate(input,authorize(input))
    expect(()=>reviewReferenceCandidate(c,review(c.candidateHash,'analyst'))).toThrow('REFERENCE_INDEPENDENT_REVIEW_REQUIRED')
    c.evidence.method='Changed after review'
    expect(()=>reviewReferenceCandidate(c,review(c.candidateHash))).toThrow('REFERENCE_REVIEW_STALE')
  })
  it('counts actual members per population entry rather than the metric batch',()=>{
    const input=fixture(),first=input.definition.entries[0]
    first.population={match:{minAgeMonthsInclusive:120,maxAgeMonthsExclusive:144}};first.source.sampleSize=50
    const second=structuredClone(first);second.population={match:{minAgeMonthsInclusive:144,maxAgeMonthsExclusive:168}}
    input.definition.entries.push(second)
    const keys=input.definition.entries.map(referenceEntryKey)
    input.sampleManifest=Array.from({length:100},(_,i)=>({factId:`f${i}`,factVersion:'1',measurementReleaseId:'m1',metricKeys:['effort'],entryKeys:[keys[i<50?0:1]]}))
    const trusted=new Map(input.sampleManifest.map(m=>[m.factId,{factVersion:m.factVersion,measurementReleaseId:m.measurementReleaseId,metricKeys:m.metricKeys,eligibleEntryKeys:[...m.entryKeys]}]))
    expect(prepareReferenceCandidate(input,trusted).definition.entries.map(e=>e.source.sampleSize)).toEqual([50,50])
    first.source.sampleSize=100;second.source.sampleSize=100
    expect(()=>prepareReferenceCandidate(input,trusted)).toThrow('REFERENCE_SAMPLE_COUNT_MISMATCH')
    first.source.sampleSize=50;second.source.sampleSize=50;input.sampleManifest[0].entryKeys=[keys[1]]
    expect(()=>prepareReferenceCandidate(input,trusted)).toThrow('REFERENCE_SAMPLE_ENTRY_NOT_ELIGIBLE')
  })
  it('computes each population entry key once per preparation, not once per sample',()=>{
    const input=fixture(),access=authorize(input),spy=vi.spyOn(canonical,'canonicalHash')
    try{
      prepareReferenceCandidate(input,access)
      const entryHashCalls=spy.mock.calls.filter(([value])=>Boolean(value&&typeof value==='object'&&'population' in value&&'scoreKey' in value))
      expect(entryHashCalls).toHaveLength(input.definition.entries.length)
    }finally{spy.mockRestore()}
  })
  it('rejects nonfinite estimates and false sample counts',()=>{
    const invalid=fixture();invalid.definition.entries[0].statistics.mean=NaN
    expect(()=>prepareReferenceCandidate(invalid,authorize(invalid))).toThrow('REFERENCE_CANDIDATE_INVALID')
    const count=fixture();count.definition.entries[0].source.sampleSize=100
    expect(()=>prepareReferenceCandidate(count,authorize(count))).toThrow('REFERENCE_SAMPLE_COUNT_MISMATCH')
  })
})
