import {it,expect} from 'vitest'
import path from 'node:path'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {verifyPackageFixtures} from '../../modules/assessment-bundle/onboarding/fixtures'
import {dependencyBlockers} from '../../modules/assessment-bundle/onboarding/dependencies'

it('previews a fixed independent-only tool without making it a Profile input or rescuing missing core evidence',()=>{
  const original=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.2'))
  if(original.schemaVersion!==2)throw new Error('PROFILE_FIXTURE_REQUIRED')
  // Adapter fixture only: never a registered EVC/JD-R model or a published package.
  const p=structuredClone(original)
  p.manifest.definition.slots.push({slotKey:'independent',unitType:'SCALE',position:3,required:true,instrumentKey:'cbi_work_zh_cn',instrumentVersion:'1.0.0',respondentType:'SELF',valueSelectors:['work_related_burnout']})
  p.manifest.definition.rightsRequirements.instrumentKeys.push('cbi_work_zh_cn')
  expect(p.profile.bindings).toEqual(original.profile.bindings)
  expect(p.evidence.some(e=>e.slotKey==='independent')).toBe(false)
  expect(dependencyBlockers(p)).toEqual([])
  const previews=verifyPackageFixtures(p)
  expect(previews.map(row=>row.result)).toMatchObject([
    {payload:{profile:{state:'MATCHED',profileId:'P4'}}},
    {payload:{profile:{state:'INSUFFICIENT',profileId:null}}},
    {payload:{profile:{state:'INVALID',profileId:null}}},
    {payload:{profile:{state:'NOT_APPLICABLE',profileId:null}}},
  ])
  expect(previews.every(row=>row.result.kind==='COMPUTED'&&!JSON.stringify(row.result).includes('work_related_burnout'))).toBe(true)
})
