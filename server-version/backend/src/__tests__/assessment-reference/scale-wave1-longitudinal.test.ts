import { describe,it,expect } from 'vitest'
import { testReference } from './wave1-reference.fixture'
import { referenceSetHash } from '../../modules/assessment-runtime/reference-binding'
import { validateReferenceSetDefinition } from '../../modules/assessment-reference/reference'
import { buildLongitudinalReferenceSnapshot, type ScaleReferenceIdentityV1, type LongitudinalReferencePoint } from '../../modules/assessment-reference/longitudinal'
const refs=[1,2,3,4].map(n=>{const r=testReference();r.referenceVersion=`v${n}`;r.entries[0].governance!.effectiveFrom=`2026-0${n}-01T00:00:00Z`;return r})
const identity=(n:number):ScaleReferenceIdentityV1=>({instrumentKey:'test_physics',instrumentVersion:'1.0.0',scoringVersion:'1.0.0',measurementHash:'a'.repeat(64),subjectKey:'physics',locale:'zh-CN',schoolStage:'junior_secondary',frozenContext:{gradeLevel:'8'},scoreKey:'wellbeing',direction:'higher_is_more',range:{min:1,max:5},reportVersion:'1.0.0',originalReferenceVersion:`v${n}`,originalReferenceHash:referenceSetHash(refs[n-1])})
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


describe('actual frozen adult demographics, never candidate population midpoints',()=>{
 const adult=(version:string,min=216,max=480)=>{const r=testReference();r.referenceVersion=version
  r.entries[0].governance!.schoolStage='adult';r.entries[0].governance!.crossStageReReferenceAllowed=false
  r.entries[0].governance!.effectiveFrom='2026-01-01T00:00:00Z'
  r.entries[0].population={language:'zh-CN',match:{minAgeMonthsInclusive:min,maxAgeMonthsExclusive:max}}
  return r}
 const build=(ages:Array<number|undefined>,sets=[adult('adult-v1')])=>{
  const ps:LongitudinalReferencePoint[]=ages.map((age,i)=>({resultVersion:'A'+i,at:'2026-05-01T00:00:00Z',value:3,identity:{...identity(1),schoolStage:'adult' as const,originalReferenceVersion:sets[0].referenceVersion,originalReferenceHash:referenceSetHash(sets[0]),frozenContext:age===undefined?undefined:{ageMonthsAtFreeze:age}}}))
  return {ps,input:{points:ps,references:sets,generatedAt:'2026-10-01T00:00:00Z',explicitLatest:true}}
 }
 it('uses each real age including exact lower and upper-exclusive boundaries',()=>{
  const {input}=build([216,479,480,180])
  const result=buildLongitudinalReferenceSnapshot(input)
  expect(result.points.map(p=>p.reference?.status)).toEqual(['available','available','unavailable','unavailable'])
  expect(result.points.slice(2).every(p=>p.reference?.unavailableReason==='no_population_match')).toBe(true)
 })
 it('returns missing-context for historical adult identities without a frozen age',()=>{
  const {input}=build([undefined,300])
  const result=buildLongitudinalReferenceSnapshot(input)
  expect(result.points[0].reference).toMatchObject({status:'unavailable',unavailableReason:'missing_context'})
  expect(result.points[1].reference?.status).toBe('available')
 })
 it.each(['adult-to-school','school-to-adult'])('refuses %s despite a candidate cross-stage flag',direction=>{
  const a=adult('adult-v1'),school=testReference();school.referenceVersion='school-v2'
  school.entries[0].governance!.crossStageReReferenceAllowed=true;school.entries[0].governance!.effectiveFrom='2026-02-01T00:00:00Z'
  const {input}=build([300,320],[a,school])
  if(direction==='school-to-adult'){a.entries[0].governance!.crossStageReReferenceAllowed=true;a.entries[0].governance!.effectiveFrom='2026-03-01T00:00:00Z'}
  if(direction==='school-to-adult')for(const point of input.points){point.identity.schoolStage='junior_secondary' as never;point.identity.originalReferenceVersion=school.referenceVersion;point.identity.originalReferenceHash=referenceSetHash(school);point.identity.frozenContext={gradeLevel:'8'} as never}
  const result=buildLongitudinalReferenceSnapshot(input)
  expect(result.points.every(p=>p.reference?.referenceVersion===(direction==='adult-to-school'?'adult-v1':'school-v2'))).toBe(true)
 })
 it.each(['ORIGINAL','TIME_MATCHED','LATER_REFERENCE'] as const)('does not escape an adult entry into a school stratum of the same set in %s',mode=>{
  const mixed=adult('mixed-adult-school')
  mixed.entries[0].population.match!.sexAtBirth=['female']
  const school=structuredClone(testReference().entries[0])
  school.governance!.crossStageReReferenceAllowed=true
  school.population={language:'zh-CN',match:{sexAtBirth:['male'],gradeLevels:['8']}}
  mixed.entries.push(school)
  const {input}=build([300,320],[mixed])
  for(const point of input.points)point.identity.frozenContext={ageMonthsAtFreeze:300,sexAtBirth:'male',gradeLevel:'8'}
  const hash=referenceSetHash(mixed)
  const result=buildLongitudinalReferenceSnapshot({...input,mode})
  expect(result.points.map(p=>p.reference)).toEqual([
   expect.objectContaining({status:'unavailable',unavailableReason:'no_population_match'}),
   expect.objectContaining({status:'unavailable',unavailableReason:'no_population_match'}),
  ])
  expect(referenceSetHash(mixed)).toBe(hash)
  for(const point of input.points)point.identity.frozenContext!.sexAtBirth='female'
  const allowed=buildLongitudinalReferenceSnapshot({...input,mode})
  expect(allowed.points.every(p=>p.reference?.status==='available'&&p.reference.bandProvenance?.schoolStage==='adult')).toBe(true)
 })

 it('does not label a school-to-adult transition as a common compatible later population',()=>{
  const mixed=adult('same-set-age-transition'),school=structuredClone(testReference().entries[0])
  school.governance!.schoolStage='upper_secondary';school.governance!.effectiveFrom='2026-01-01T00:00:00Z'
  school.population={language:'zh-CN',match:{minAgeMonthsInclusive:168,maxAgeMonthsExclusive:216,gradeLevels:['12']}}
  mixed.entries.push(school)
  const {input}=build([215,216],[mixed])
  input.points[0].at='2026-04-01T00:00:00Z';input.points[0].identity.schoolStage='upper_secondary'
  input.points[0].identity.frozenContext={ageMonthsAtFreeze:215,gradeLevel:'12'}
  const result=buildLongitudinalReferenceSnapshot(input)
  expect(result.compatibilityDecision).toBe('FALLBACK_TIME_MATCHED')
  expect(result.points.map(p=>p.rawValue)).toEqual([3,3])
  expect(result.points.map(p=>p.reference?.bandProvenance?.schoolStage)).toEqual(['upper_secondary','adult'])
 })

})


describe('adult population-specific reference effective dates',()=>{
 const window=(min:number,max:number,effectiveFrom:string)=>{
  const e=structuredClone(testReference().entries[0])
  e.population={language:'zh-CN',match:{minAgeMonthsInclusive:min,maxAgeMonthsExclusive:max}}
  Object.assign(e.governance!,{schoolStage:'adult',effectiveFrom,populationKey:`adult:${min}-${max}`})
  return e
 }
 const inputFor=(entries:ReturnType<typeof testReference>['entries'],ages:number[])=>{
  const original=testReference();original.referenceVersion='adult-date-original'
  original.entries=[window(216,480,'2026-01-01T00:00:00Z')]
  const candidate=testReference();candidate.referenceVersion='adult-date-candidate';candidate.entries=entries
  const references=[original,candidate]
  for(const reference of references)expect(validateReferenceSetDefinition(reference).issues).toEqual([])
  return {references,generatedAt:'2026-10-01T00:00:00Z',explicitLatest:true,
   points:ages.map((age,i)=>({resultVersion:`DATE-${i}`,at:`2026-0${5+i}-01T00:00:00Z`,value:3,
    identity:{...identity(1),schoolStage:'adult' as const,frozenContext:{ageMonthsAtFreeze:age},
     originalReferenceVersion:original.referenceVersion,originalReferenceHash:referenceSetHash(original)}}))}
 }
 it('excludes a candidate whose actual last adult window is not yet effective',()=>{
  const input=inputFor([window(216,360,'2026-02-01T00:00:00Z'),window(360,480,'2027-01-01T00:00:00Z')],[400,401])
  for(const mode of ['LATER_REFERENCE','TIME_MATCHED'] as const){
   const result=buildLongitudinalReferenceSnapshot({...input,mode})
   expect(result.selectedReferenceVersions).toEqual(['adult-date-original'])
   expect(result.points.every(p=>p.reference?.status==='available'&&p.reference.bandProvenance?.effectiveFrom==='2026-01-01T00:00:00Z')).toBe(true)
  }
 })
 it('checks earlier adult windows even when the last window is already effective',()=>{
  const input=inputFor([window(360,480,'2026-02-01T00:00:00Z'),window(216,360,'2027-01-01T00:00:00Z')],[359,360])
  const later=buildLongitudinalReferenceSnapshot(input)
  expect(later.selectedReferenceVersions).toEqual(['adult-date-original'])
  const timeMatched=buildLongitudinalReferenceSnapshot({...input,mode:'TIME_MATCHED'})
  expect(timeMatched.points.map(p=>p.reference?.referenceVersion)).toEqual(['adult-date-original','adult-date-candidate'])
  expect(timeMatched.points.map(p=>p.reference?.bandProvenance?.effectiveFrom)).toEqual(['2026-01-01T00:00:00Z','2026-02-01T00:00:00Z'])
 })
 it('allows effective adult windows and applies each measurement time cutoff',()=>{
  const input=inputFor([window(216,360,'2026-06-01T00:00:00Z'),window(360,480,'2026-04-01T00:00:00Z')],[359,360])
  const later=buildLongitudinalReferenceSnapshot(input)
  expect(later.compatibilityDecision).toBe('COMPATIBLE_LATER_REFERENCE')
  expect(later.selectedReferenceVersions).toEqual(['adult-date-candidate'])
  expect(later.points.map(p=>p.reference?.bandProvenance?.effectiveFrom)).toEqual(['2026-06-01T00:00:00Z','2026-04-01T00:00:00Z'])
  const timeMatched=buildLongitudinalReferenceSnapshot({...input,mode:'TIME_MATCHED'})
  expect(timeMatched.points.map(p=>p.reference?.referenceVersion)).toEqual(['adult-date-original','adult-date-candidate'])
  expect(timeMatched.points.every(p=>p.reference?.status==='available')).toBe(true)
 })
})
