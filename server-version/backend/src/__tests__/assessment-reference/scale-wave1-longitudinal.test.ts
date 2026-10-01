import { describe,it,expect } from 'vitest'
import { testReference } from './wave1-reference.fixture'
import { referenceSetHash } from '../../modules/assessment-runtime/reference-binding'
import { buildLongitudinalReferenceSnapshot, type ScaleReferenceIdentityV1 } from '../../modules/assessment-reference/longitudinal'
const refs=[1,2,3,4].map(n=>{const r=testReference();r.referenceVersion=`v${n}`;r.entries[0].governance!.effectiveFrom=`2026-0${n}-01T00:00:00Z`;return r})
const identity=(n:number):ScaleReferenceIdentityV1=>({instrumentKey:'test_physics',instrumentVersion:'1.0.0',scoringVersion:'1.0.0',measurementHash:'a'.repeat(64),subjectKey:'physics',locale:'zh-CN',schoolStage:'junior_secondary',scoreKey:'wellbeing',direction:'higher_is_more',range:{min:1,max:5},reportVersion:'1.0.0',originalReferenceVersion:`v${n}`,originalReferenceHash:referenceSetHash(refs[n-1])})
const points=[1,2,3].map(n=>({resultVersion:`T${n}`,at:`2026-0${n}-10T00:00:00Z`,value:n,identity:identity(n)}))
describe('longitudinal later-reference priority',()=>{
 it('defaults to later attached v3 and only explicit regeneration selects v4',()=>{
  const input={points,references:refs.slice(0,3),generatedAt:'2026-10-01T00:00:00Z'}
  const old=buildLongitudinalReferenceSnapshot(input)
  expect(old.selectedReferenceVersions).toEqual(['v3'])
  expect(buildLongitudinalReferenceSnapshot({...input,references:refs})).toEqual(old)
  expect(buildLongitudinalReferenceSnapshot({...input,references:refs,explicitLatest:true}).selectedReferenceVersions).toEqual(['v4'])
  expect(buildLongitudinalReferenceSnapshot({...input,mode:'ORIGINAL'}).selectedReferenceVersions).toEqual(['v1','v2','v3'])
 })
 it('falls back per time when stages differ; subject, scorer and hashes never mix',()=>{
  const p=structuredClone(points);p[0].identity.schoolStage='upper_secondary'
  const result=buildLongitudinalReferenceSnapshot({points:p,references:refs,generatedAt:'2026-10-01T00:00:00Z'})
  expect(result.compatibilityDecision).toBe('FALLBACK_TIME_MATCHED');expect(result.points[0].reference).toBeNull()
  p[0].identity.originalReferenceHash='f'.repeat(64)
  expect(()=>buildLongitudinalReferenceSnapshot({points:p,references:refs,generatedAt:'2026-10-01T00:00:00Z'})).toThrow('FROZEN_REFERENCE_INVALID')
  const changed=structuredClone(refs);changed[3].instrumentKey='test_math'
  expect(buildLongitudinalReferenceSnapshot({points,references:changed,explicitLatest:true,generatedAt:'2026-10-01T00:00:00Z'}).selectedReferenceVersions).toEqual(['v3'])
  changed[2].entries[0].scoringVersion='2.0.0'
  expect(()=>buildLongitudinalReferenceSnapshot({points,references:changed,generatedAt:'2026-10-01T00:00:00Z'})).toThrow('FROZEN_REFERENCE_INVALID')
 })
})

describe('longitudinal provenance regression',()=>{
 it('does not silently adopt a newly imported backdated reference during fallback',()=>{
  const sourcePoints=structuredClone(points.slice(0,2))
  sourcePoints[0].identity.direction='different-direction'
  const input={points:sourcePoints,references:refs.slice(0,2),generatedAt:'2026-10-01T00:00:00Z'}
  const before=buildLongitudinalReferenceSnapshot(input)
  expect(before.compatibilityDecision).toBe('FALLBACK_TIME_MATCHED')
  const imported=structuredClone(refs[1]);imported.referenceVersion='backdated-import'
  imported.entries[0].governance!.effectiveFrom='2026-02-05T00:00:00Z'
  expect(buildLongitudinalReferenceSnapshot({...input,references:[...input.references,imported]})).toEqual(before)
 })
 it('uses the matching score entry effective date, not an unrelated first entry',()=>{
  const newer=structuredClone(refs[3]);const unrelated=structuredClone(newer.entries[0])
  unrelated.scoreKey='other';unrelated.governance!.effectiveFrom='2027-01-01T00:00:00Z'
  newer.entries.unshift(unrelated)
  expect(buildLongitudinalReferenceSnapshot({points,references:[...refs.slice(0,3),newer],explicitLatest:true,generatedAt:'2026-10-01T00:00:00Z'}).selectedReferenceVersions).toEqual(['v4'])
 })
 it('rejects non-finite raw observations rather than freezing JSON null',()=>{
  expect(()=>buildLongitudinalReferenceSnapshot({points:[{...points[0],value:NaN},points[1]],references:refs,generatedAt:'2026-10-01T00:00:00Z'})).toThrow('LONGITUDINAL_SOURCE_INVALID')
 })
})
