import { describe,expect,it } from 'vitest'
import { referenceEntryKey } from '../../modules/measurement-content/reference-candidate'
import { selectFrozenReferencePolicy,type FrozenReferencePolicy,type VerifiedReferenceForSelection } from '../../modules/measurement-content/reference-policy'
import type { AssessmentReferenceEntry } from '../../modules/assessment-reference/reference'
const entry=(population:AssessmentReferenceEntry['population'],referenceKind:AssessmentReferenceEntry['referenceKind']='descriptive_sample'):AssessmentReferenceEntry=>({scoreKey:'total',referenceKind,evidenceLevel:'local_pilot',provenanceType:'local_observed',instrumentVersion:'1',scoringVersion:'1',population,source:{citation:'Internal',sampleSize:20},statistics:{mean:1}})
const fixture=()=>{
  const entries=[entry({}),entry({match:{minAgeMonthsInclusive:120,maxAgeMonthsExclusive:144}})]
  const releases:VerifiedReferenceForSelection[]=entries.map((e,i)=>({releaseId:`r${i}`,contentHash:'a'.repeat(64),measurementReleaseId:'m1',status:'PUBLISHED',entries:[e]}))
  const policy:FrozenReferencePolicy={policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:'m1',choices:entries.map((e,i)=>({releaseId:releases[i].releaseId,contentHash:releases[i].contentHash,entryKey:referenceEntryKey(e),metricKey:e.scoreKey,referenceKind:e.referenceKind,priority:i}))}
  return {releases,policy}
}
describe('frozen exact population selection',()=>{
  it('uses only explicit priority and truly matching population, with approved general fallback',()=>{
    const {releases,policy}=fixture()
    expect(selectFrozenReferencePolicy(policy,releases,{ageMonthsAtFreeze:130})[0]).toMatchObject({status:'SELECTED',entryKey:policy.choices[1].entryKey})
    expect(selectFrozenReferencePolicy(policy,releases,{})[0]).toMatchObject({status:'SELECTED',entryKey:policy.choices[0].entryKey})
    policy.choices.shift()
    expect(selectFrozenReferencePolicy(policy,releases,{})[0]).toMatchObject({status:'UNAVAILABLE',reason:'MISSING_CONTEXT'})
  })
  it('refuses equal-priority ambiguity instead of choosing by array order',()=>{
    const {releases,policy}=fixture();policy.choices.forEach(c=>c.priority=0)
    expect(selectFrozenReferencePolicy(policy,releases,{ageMonthsAtFreeze:130})[0]).toMatchObject({status:'UNAVAILABLE',reason:'AMBIGUOUS'})
  })
  it('allows normal supersession within frozen policy but downgrades revoked slots',()=>{
    const {releases,policy}=fixture();releases.forEach(r=>r.status='SUPERSEDED')
    expect(selectFrozenReferencePolicy(policy,releases,{})[0].status).toBe('SELECTED')
    releases[0].status='REVOKED'
    expect(selectFrozenReferencePolicy(policy,releases,{})[0]).toMatchObject({status:'UNAVAILABLE',reason:'REVOKED'})
    releases[0].contentHash='b'.repeat(64)
    expect(()=>selectFrozenReferencePolicy(policy,releases,{})).toThrow('REFERENCE_POLICY_IDENTITY_MISMATCH')
  })
})
