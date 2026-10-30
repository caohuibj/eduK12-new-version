import {it,expect} from 'vitest'
import {teacherJdrPackage} from './teacher-jdr.fixture'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {BundleDefinitionProvider} from '../../modules/bundle-product/definition-provider'
it('accepts the explicit 18+ teacher declarations without generalizing other numeric age constraints',()=>{
  const p=teacherJdrPackage(),blockers=(raw:typeof p)=>{const provider=new BundleDefinitionProvider([packageEntry(raw)]);return provider.publicationBlockers(p.manifest.definition.bundleKey,p.manifest.definition.bundleVersion)}
  expect(blockers(p)).toEqual(['BUNDLE_NOT_PUBLISHED'])
  const higher=structuredClone(p);higher.manifest.definition.population.subjectMinAgeYears=19
  expect(blockers(higher)).toContain('AGE_POPULATION_REQUIRES_DECLARED_CONTEXT')
  const bounded=structuredClone(p);bounded.manifest.definition.population.subjectMaxAgeYears=60
  expect(blockers(bounded)).toContain('AGE_POPULATION_REQUIRES_DECLARED_CONTEXT')
})
