import {it,expect} from 'vitest'
import path from 'node:path'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {parseDeclarativePackage,hashDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {verifyPackageFixtures} from '../../modules/assessment-bundle/onboarding/fixtures'
const pack=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.0'))
it('bounds static model reuse through immutable content and rejects incomplete fixture sets',()=>{
  expect(pack.schemaVersion).toBe(2)
  const before=hashDeclarativePackage(pack)
  const cached=parseDeclarativePackage(structuredClone(pack))
  expect(cached).toBe(pack)
  expect(Object.isFrozen(cached)).toBe(true)
  if(cached.schemaVersion!==2)throw new Error()
  expect(Object.isFrozen(cached.profile.bindings[0])).toBe(true)
  expect(()=>{cached.profile.bindings[0].weight=100}).toThrow()
  expect(hashDeclarativePackage(pack)).toBe(before)
  const missing=structuredClone(pack);delete (missing.fixtures as Record<string,unknown>).invalid
  expect(()=>parseDeclarativePackage(missing)).toThrow('exactly four')
})
it('verifies the new typed package2 fixture branch after its compiler repair',()=>{
  expect(verifyPackageFixtures(pack)).toHaveLength(4)
})

