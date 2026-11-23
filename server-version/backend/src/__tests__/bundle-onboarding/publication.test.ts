import {describe,it,expect} from 'vitest'
import {validateReview} from '../../modules/bundle-product/package-release'
import {verifyPackageFixtures} from '../../modules/assessment-bundle/onboarding/fixtures'
import {scaffoldPackage} from '../../modules/assessment-bundle/onboarding/template'
import {dependencyBlockers} from '../../modules/assessment-bundle/onboarding/dependencies'
import {BundleDefinitionProvider,freezeBundleProductionDefinition,readFrozenBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
describe('content-bound publication and immutable freeze',()=>{
  it('validates content hash and allowed claims without requiring HMAC keys or 7-day expiry timers',()=>{
    const hash='a'.repeat(64)
    const review={contentHash:hash,reviewerId:'fixture',claims:['independent_summary','joint_conclusion']}
    expect(validateReview(review,hash).contentHash).toBe(hash)
    expect(validateReview({...review,claims:['joint_conclusion']},hash).claims).toEqual(['joint_conclusion'])
    expect(()=>validateReview(review,'b'.repeat(64))).toThrow('BUNDLE_REVIEW_INVALID_OR_EXPIRED')
    expect(()=>validateReview({...review,claims:['unknown_claim']},hash)).toThrow('BUNDLE_REVIEW_INVALID_OR_EXPIRED')
  })
  it('rejects broken golden expectations, selectors and incompatible units',()=>{
    const p=scaffoldPackage('unknown_package');verifyPackageFixtures(p)
    p.fixtures.valid.expectedRuleIds=[];expect(()=>verifyPackageFixtures(p)).toThrow('FIXTURE_MISMATCH')
    p.evidence[0].unit='seconds';expect(dependencyBlockers(p).join()).toContain('unit mismatch')
  })
  it('freezes version 2 declarative content and detects mutations without catalog lookup',()=>{
    const entry=packageEntry(scaffoldPackage('unknown_package'))
    expect(()=>new BundleDefinitionProvider([entry,entry])).toThrow()
    const frozen=freezeBundleProductionDefinition(entry,{frozenAt:'2026-09-23T00:00:00.000Z',sourceReference:'fixture'})
    expect(frozen.schemaVersion).toBe(2);expect(readFrozenBundleProductionDefinition(frozen)).toEqual(frozen)
    frozen.declarativePackage!.rules.items[0].text='Changed'
    expect(()=>readFrozenBundleProductionDefinition(frozen)).toThrow('HASH_MISMATCH')
  })
})
