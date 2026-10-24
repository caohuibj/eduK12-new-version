import { describe,it,expect } from 'vitest'
import { createSjtNativeStagedPackage,createSjtNativeStagedFinalFixture } from '../fixtures/sjt-native-staged.fixture'
import { compileSurveyNativeSituationalHeader,frozenSurveyNativeSituationalRuntime } from '../../modules/survey/situational-native.definition'
import { SURVEY_NATIVE_SJT_PROTOCOL } from '../../modules/survey/situational-native.contract'
describe('Survey native staged source contract',()=>{
  it('uses the formal upload compiler and its native capture without changing source rights',()=>{
    const pkg=createSjtNativeStagedPackage()
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(pkg.definition.license.redistribution).toBe('allowed')
    const published={...pkg,releaseStatus:'PUBLISHED' as const}
    const header=compileSurveyNativeSituationalHeader(published)
    const frozen=frozenSurveyNativeSituationalRuntime({kind:'SJT',executionProtocol:SURVEY_NATIVE_SJT_PROTOCOL,
      compiledDefinition:pkg.definition,nativeSituational:{...header,attemptEpoch:1,frozenAt:'2026-10-24T00:00:00.000Z'}})
    expect(frozen.snapshot.definitionHash).toBe(header.definitionHash)
    expect(frozen.snapshot.scientificContext?.scientificMaturity).toBe('PILOT')
    expect(createSjtNativeStagedFinalFixture().researchCapture.events.length).toBeGreaterThan(0)
  })
  it('does not admit an unpublished source',()=>{
    expect(()=>compileSurveyNativeSituationalHeader(createSjtNativeStagedPackage())).toThrow()
  })
})
