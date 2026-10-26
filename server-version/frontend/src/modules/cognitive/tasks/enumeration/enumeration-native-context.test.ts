import {describe,it,expect} from 'vitest'
import {enumerationFixtureContext} from './fixtures.test-support'
import {enumerationRecipeConfig} from './generated/protocol'
import {validateEnumerationContext,enumerationContextPlan,type EnumerationContext} from './display'
/** Synthetic input contracts only: these values are not actual ruler/physical measurements. */
function nativeFixture():EnumerationContext {
 const old=enumerationFixtureContext(),config=enumerationRecipeConfig('experience')
 return {...old,usage:'AUTHENTICATED_CONTENT_CANDIDATE',config,recipe:structuredClone(config.stimulusRecipe),
  calibration:{...old.calibration!,id:'synthetic-unit-self-report',source:'self_reported_ruler_and_distance'}}
}
describe('thin enumeration native context routing',()=>{
 it('accepts a cloned frozen recipe, preserves internal context and chooses the exact plan contract',()=>{
  const old=enumerationFixtureContext(),native=nativeFixture()
  expect(()=>validateEnumerationContext(old)).not.toThrow()
  expect(native.recipe).not.toBe(native.config.stimulusRecipe)
  expect(()=>validateEnumerationContext(native)).not.toThrow()
  expect(enumerationContextPlan(native,0)).toEqual(enumerationContextPlan(old,0))
  const wrongScope={...native,usage:'INTERNAL_REVIEW_ONLY'} as unknown as EnumerationContext
  expect(()=>validateEnumerationContext(wrongScope)).toThrow('config tuple')
 })
 it('rejects a changed recipe, synthetic native calibration or old null config without changing valid data',()=>{
  const changed=nativeFixture();Object.assign(changed.recipe!,{fieldDiameterDeg:7})
  expect(()=>validateEnumerationContext(changed)).toThrow()
  const synthetic=nativeFixture();synthetic.calibration!.source='synthetic_fixture'
  expect(()=>validateEnumerationContext(synthetic)).toThrow('self-reported')
  const missing={...nativeFixture(),config:enumerationFixtureContext().config} as unknown as EnumerationContext
  expect(()=>validateEnumerationContext(missing)).toThrow('config tuple')
 })
})
