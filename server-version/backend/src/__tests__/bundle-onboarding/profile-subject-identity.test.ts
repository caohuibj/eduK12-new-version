import {it,expect} from 'vitest'
import path from 'node:path'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {dependencyBlockers} from '../../modules/assessment-bundle/onboarding/dependencies'
import {getExecutableScalePackage} from '../../modules/scale/onboarding/executable-registry'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'

function legacy(){
  const p=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.2'))
  if(p.schemaVersion!==2)throw new Error('PROFILE_FIXTURE_REQUIRED')
  return structuredClone(p)
}
// Dependency-only synthetic fixture, never registered, installed or used for a
// JD-R report. No scientific parameters are adopted by this contract test.
function crossSubject(){
  const p=legacy()
  p.profile.applicability.domain='synthetic_cross_subject'
  p.profile.bindings=p.profile.bindings.slice(0,2)
  p.evidence=p.evidence.filter(e=>e.evidenceKey!=='c')
  p.profile.profiles=p.profile.profiles.filter(profile=>['P1','P4'].includes(profile.id))
  for(const profile of p.profile.profiles){delete profile.centers['math.time_opportunity_cost'];delete profile.pattern['math.time_opportunity_cost']}
  for(const fixture of Object.values(p.fixtures))delete fixture.values.c
  for(const [i,key] of ['hse_demands_zh_cn','hse_control_zh_cn'].entries()){
    const d=getExecutableScalePackage(key,'1.0.0')!.definition,b=p.profile.bindings[i],e=p.evidence.find(e=>e.evidenceKey===b.evidenceKey)!,slot=p.manifest.definition.slots.find(s=>s.slotKey===e.slotKey)!
    slot.instrumentKey=key;slot.valueSelectors=[d.scoring.scores[0].key];e.selector=d.scoring.scores[0].key
    b.source={...b.source,instrumentKey:key,scoringVersion:d.scoring.scoringVersion,localizationVersion:d.versionAxes!.localizationVersion,subjectKey:d.versionAxes!.subjectKey,
      runtimeDefinitionHash:canonicalHash(d),measurementHash:hashScaleDefinition(d),expectedItems:d.items.length}
    b.transformation={...b.transformation,min:1,max:5}
  }
  return p
}
it('preserves legacy same-domain validation and accepts exact distinct source subjects',()=>{
  expect(dependencyBlockers(legacy())).toEqual([])
  const p=crossSubject()
  expect(p.profile.bindings.map(b=>b.source.subjectKey)).toEqual(['hse_msit_demands','hse_msit_control'])
  expect(dependencyBlockers(p)).toEqual([])
})
it('rejects an absent/wrong subject or a changed runtime while preserving source identity checks',()=>{
  const missing=crossSubject();delete missing.profile.bindings[0].source.subjectKey
  expect(dependencyBlockers(missing)).toEqual(['e: PROFILE frozen measurement/scoring/locale/item identity mismatch'])
  const wrong=crossSubject();wrong.profile.bindings[1].source.subjectKey='hse_msit_demands'
  expect(dependencyBlockers(wrong)).toEqual(['v: PROFILE frozen measurement/scoring/locale/item identity mismatch'])
  const changed=crossSubject();changed.profile.bindings[0].source.runtimeDefinitionHash='0'.repeat(64)
  expect(dependencyBlockers(changed)).toEqual(['e: PROFILE frozen measurement/scoring/locale/item identity mismatch'])
})
