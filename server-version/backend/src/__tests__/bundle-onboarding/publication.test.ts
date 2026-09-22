import {describe,it,expect} from 'vitest'
import {createHmac} from 'node:crypto'
import {canonicalJsonString} from '../../modules/assessment-runtime/canonical'
import {validateReview} from '../../modules/bundle-product/package-release'
import {verifyPackageFixtures} from '../../modules/assessment-bundle/onboarding/fixtures'
import {scaffoldPackage} from '../../modules/assessment-bundle/onboarding/template'
import {dependencyBlockers} from '../../modules/assessment-bundle/onboarding/dependencies'
import {BundleDefinitionProvider,freezeBundleProductionDefinition,readFrozenBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
describe('content-bound publication and immutable freeze',()=>{
  it('rejects unsigned, expired, substituted and wrong-key review material',()=>{
    const secret='fixture-only-key-12345678901234567890',hash='a'.repeat(64)
    const m={contentHash:hash,reviewerId:'fixture',expiresAt:'2030-01-01T00:00:00.000Z',claims:['independent_summary'],scientific:true,rights:true,language:true,report:true}
    const review={...m,signature:createHmac('sha256',secret).update(canonicalJsonString(m)).digest('hex')}
    expect(validateReview(review,hash,secret,0).contentHash).toBe(hash)
    expect(()=>validateReview(review,hash,undefined,0)).toThrow()
    expect(()=>validateReview(review,'b'.repeat(64),secret,0)).toThrow()
    expect(()=>validateReview(review,hash,secret,Date.parse('2031-01-01'))).toThrow()
    expect(()=>validateReview({...review,claims:['joint_conclusion']},hash,secret,0)).toThrow()
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
