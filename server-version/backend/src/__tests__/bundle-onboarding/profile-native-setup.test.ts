import {it,expect} from 'vitest'
import path from 'node:path'
import {UserRole} from '@prisma/client'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {previewPackage} from '../../modules/bundle-product/admin-authoring'
import {profileGradeForm} from '../../modules/assessment-bundle/profile/admission'
import {parseBundleContextDefinition} from '../../modules/assessment-bundle/context'
it('exposes the native model and required theory claim through the existing setup preview',()=>{
  const pack=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.1'))
  const preview=previewPackage({userId:'synthetic-author',role:UserRole.ADMIN},pack)
  expect(preview.blockers).toEqual([])
  expect(preview.requiredClaims).toEqual(['cross_source_condition'])
  expect(preview.profile).toMatchObject({key:'learning_motivation_math_support',version:'0.1.0',mappingVersion:'0.1.1',maturity:'EXPERIMENTAL'})
  expect(preview.scenarios.map(s=>s.profile?.state)).toEqual(['MATCHED','INSUFFICIENT','INVALID','NOT_APPLICABLE'])
  const field=parseBundleContextDefinition(pack.context).fields[0]
  expect(profileGradeForm(pack,field)).toMatchObject({contextKey:'gradeLevel',formType:'single_choice',formLabel:'年级'})
})

