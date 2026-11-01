import b10 from './fixtures/b10-age.json'
import b15 from './fixtures/b15-reader.json'
import {parseDeclarativePackage,type DerivedPackage} from '../../modules/assessment-bundle/onboarding/contract'

/** Public candidate declarations only, with no third-party item text. These are
 * test inputs, never registered production packages. See the integration note. */
export function runtimePackageFixture(key:'B10'|'B15',withSyntheticDob=false):DerivedPackage{
 const raw=structuredClone(key==='B10'?b10:b15)
 if(withSyntheticDob){
  // The real B15 candidate still lacks this context; the reader positive case
  // explicitly supplies a synthetic complete contract rather than bypassing age.
  raw.context.fields.push({contextKey:'birth_year_month',valueType:'string',required:true})
  Object.assign(raw.manifest.definition.slots.find(s=>s.unitType==='SCALE')!,{admissionContext:{assessmentContext:'adult_working_memory_reflection',requirements:[{contextKey:'birth_year_month'}],birthYearMonthContextKey:'birth_year_month'}})
 }
 return parseDeclarativePackage(raw) as DerivedPackage
}
