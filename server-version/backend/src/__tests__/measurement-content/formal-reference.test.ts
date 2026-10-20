import {describe,expect,it} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {formalReferenceCandidateView,prepareFormalReferenceCandidate} from '../../modules/measurement-content/formal-reference'
import {prepareReferenceCandidate,referenceCandidateRelease,referenceEntryKey,reviewReferenceCandidate,
  type ReferenceCandidate,type FormalReferencePromotion} from '../../modules/measurement-content/reference-candidate'

import {sourceFixture} from './formal-reference.fixture'
import {selectFrozenReferencePolicy} from '../../modules/measurement-content/reference-policy'
describe('formal aggregate reference projection',()=>{
  it('derives only from exact observed identity and preserves values while creating a distinct DRAFT',()=>{
    const {source,facts,promotion,consentEvidence}=sourceFixture(),result=prepareFormalReferenceCandidate(source,promotion,facts,consentEvidence)
    expect(result.candidate.candidateHash).not.toBe(source.candidateHash)
    expect(result.candidate.scope).toEqual({kind:'PLATFORM'})
    expect(result.candidate.definition.status).toBe('DRAFT')
    expect(result.candidate.definition.entries[0]).toMatchObject({referenceKind:'normative_distribution',evidenceLevel:'local_norm',
      statistics:source.definition.entries[0].statistics,derivation:{distributionAssumption:'unknown',allowEstimatedPercentile:false}})
    expect(result.candidate.measurement).toEqual(source.measurement)
    expect(source.definition.entries[0].referenceKind).toBe('descriptive_sample')
    expect(result.candidate.sampleManifest[0].entryKeys).not.toEqual(source.sampleManifest[0].entryKeys)
  })
  it('exports only aggregate evidence plus manifest hash/count, never membership or source binding',()=>{
    const {source,facts,promotion,consentEvidence}=sourceFixture(),{candidate}=prepareFormalReferenceCandidate(source,promotion,facts,consentEvidence)
    const review={candidateHash:candidate.candidateHash,reviewerId:'independent',reviewedAt:'2026-10-20T01:00:00.000Z',
      statement:'Reviewed evidence and limitations',decision:'APPROVED' as const}
    const view=formalReferenceCandidateView(candidate),release=referenceCandidateRelease(candidate,review,'formal','1')
    expect(view.sampleManifestHash).toBe(canonicalHash(candidate.sampleManifest))
    expect(view.sampleCount).toBe(2)
    expect(view.consentEvidence[0].body).toBe(consentEvidence[0].body)
    expect(JSON.stringify(release)).not.toContain(consentEvidence[0].body)
    expect(JSON.stringify({view,release})).not.toMatch(/private-person|factVersion|entryKeys|sourceBinding|analyzeGrantId/)
    if(release.layer!=='REFERENCE')throw new Error('wrong layer')
    expect(release.content.evidence).toMatchObject({sampleCount:2,sampleManifestHash:view.sampleManifestHash,consentBodyHashes:[consentEvidence[0].bodyHash]})
    expect(release.content.evidence).not.toHaveProperty('sampleManifest')
  })
  it('also keeps private published reference packages free of personal membership',()=>{
    const {source}=sourceFixture(),release=referenceCandidateRelease(source,{candidateHash:source.candidateHash,reviewerId:'analyst',
      reviewedAt:'2026-10-20T01:00:00.000Z',statement:'Private descriptive review',decision:'APPROVED'},'private','1')
    expect(JSON.stringify(release)).not.toMatch(/private-person|factVersion|entryKeys/)
  })
  it('rejects source hash substitution, missing facts and non-computable distribution',()=>{
    const {source,facts,promotion,consentEvidence}=sourceFixture()
    expect(()=>prepareFormalReferenceCandidate(source,{...promotion,sourceCandidateHash:'c'.repeat(64)},facts,consentEvidence)).toThrow('REFERENCE_FORMAL_SOURCE_REQUIRED')
    expect(()=>prepareFormalReferenceCandidate(source,promotion,new Map(),consentEvidence)).toThrow('REFERENCE_SAMPLE_NOT_AUTHORIZED')
    const {candidateHash:_hash,schemaVersion:_schema,...payload}=source
    delete payload.definition.entries[0].statistics.sd
    const noSd=prepareReferenceCandidate(payload,facts)
    expect(()=>prepareFormalReferenceCandidate(noSd,{...promotion,sourceCandidateHash:noSd.candidateHash},facts,consentEvidence)).toThrow('REFERENCE_FORMAL_ESTIMATE_NOT_SUPPORTED')
  })
  it('requires independent exact-hash review and refuses an approved old proposal',()=>{
    const {source,facts,promotion,consentEvidence}=sourceFixture(),{candidate}=prepareFormalReferenceCandidate(source,promotion,facts,consentEvidence)
    const review={candidateHash:candidate.candidateHash,reviewerId:'analyst',reviewedAt:'2026-10-20T01:00:00.000Z',statement:'Self approval',decision:'APPROVED' as const}
    expect(()=>reviewReferenceCandidate(candidate,review)).toThrow('REFERENCE_INDEPENDENT_REVIEW_REQUIRED')
    const revised=prepareFormalReferenceCandidate(source,{...promotion,uncertainty:'Revised uncertainty'},facts,consentEvidence).candidate
    expect(()=>reviewReferenceCandidate(revised,{...review,reviewerId:'independent'})).toThrow('REFERENCE_REVIEW_STALE')
  })
  it('does not allow a private source binding to masquerade as a platform submission',()=>{
    const {source,facts}=sourceFixture(),{candidateHash:_hash,schemaVersion:_schema,...input}=source
    expect(()=>prepareReferenceCandidate({...input,scope:{kind:'PLATFORM'}},facts)).toThrow('REFERENCE_SOURCE_BINDING_INVALID')
  })
  it('uses real frozen selection for missing, outside and matching population context',()=>{
    const {source,facts,promotion,consentEvidence}=sourceFixture()
    const candidate=prepareFormalReferenceCandidate(source,promotion,facts,consentEvidence).candidate,entry=candidate.definition.entries[0]
    const choice={releaseId:'formal',contentHash:'d'.repeat(64),entryKey:referenceEntryKey(entry),metricKey:'total',
      referenceKind:'normative_distribution' as const,priority:1}
    const policy={policyVersion:'EXACT_POPULATION_PRIORITY_V1' as const,measurementReleaseId:source.measurement.releaseId,choices:[choice]}
    const releases=[{releaseId:'formal',contentHash:choice.contentHash,measurementReleaseId:source.measurement.releaseId,
      status:'PUBLISHED' as const,entries:[entry]}]
    expect(selectFrozenReferencePolicy(policy,releases,{})).toMatchObject([{status:'UNAVAILABLE',reason:'MISSING_CONTEXT'}])
    expect(selectFrozenReferencePolicy(policy,releases,{ageMonthsAtFreeze:144})).toMatchObject([{status:'UNAVAILABLE',reason:'NO_MATCH'}])
    expect(selectFrozenReferencePolicy(policy,releases,{ageMonthsAtFreeze:132})).toMatchObject([{status:'SELECTED'}])
    const general=prepareFormalReferenceCandidate(source,{...promotion,targetPopulation:{kind:'GENERAL_POPULATION',
      basis:'Explicit proposed general population applicability, not inferred from missing match'}},facts,consentEvidence).candidate.definition.entries[0]
    expect(selectFrozenReferencePolicy({...policy,choices:[{...choice,entryKey:referenceEntryKey(general)}]},
      [{...releases[0],entries:[general]}],{})).toMatchObject([{status:'SELECTED'}])
  })
  it('rejects text-only or empty structured applicability rather than silently matching everyone',()=>{
    const {source,facts,promotion,consentEvidence}=sourceFixture()
    expect(()=>prepareFormalReferenceCandidate(source,{...promotion,targetPopulation:undefined} as any,facts,consentEvidence)).toThrow()
    expect(()=>prepareFormalReferenceCandidate(source,{...promotion,targetPopulation:{kind:'SUPPORTED_MATCH',match:{},basis:'text only'}} as any,facts,consentEvidence)).toThrow()
  })
})

it('does not admit consent evidence without the exact accepted immutable notice body/hash',()=>{
  const {source,facts,promotion,consentEvidence}=sourceFixture()
  for(const change of [{body:undefined},{bodyHash:undefined},{body:consentEvidence[0].body+' Changed restriction'}])
    expect(()=>prepareFormalReferenceCandidate(source,promotion,facts,[{...consentEvidence[0],...change}] as any)).toThrow()
})
