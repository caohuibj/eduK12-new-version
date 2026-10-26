import {describe,expect,it} from 'vitest'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {validateScaleInstrumentSource} from '../../modules/scale/onboarding/validate-instrument'
import {parseScaleInstrumentSourceSchema} from '../../modules/scale/onboarding/schema'
import {validateReferenceSetDefinition,resolveAssessmentReference} from '../../modules/assessment-reference/reference'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'

// Synthetic scope transformation, never registered and never adult scientific
// evidence. Item/scorer content remains the existing fixture's exact bytes.
const school=()=>structuredClone(getScaleInstrumentSource('academic_self_concept_biology_zh_cn','1.0.0')!)
function adult(){
 const source=school()
 source.catalog.population={...source.catalog.population,minAge:18,maxAge:100}
 delete source.catalog.population.gradeRange
 source.applicability={...source.applicability!,subject:{ageMonths:{minInclusive:216,maxExclusive:1440}},requiredContextKeys:['birthYearMonth','primaryLanguage']}
 for(const set of source.executable!.references){
  // One synthetic adult stratum per score/kind, not overlapping copies of
  // the original two school stages.
  set.entries=[...new Map(set.entries.map(entry=>[entry.scoreKey+':'+entry.referenceKind,entry])).values()]
  for(const entry of set.entries){
  entry.population={language:entry.governance!.locale,match:{minAgeMonthsInclusive:216,maxAgeMonthsExclusive:1440}}
  entry.governance={...entry.governance!,schoolStage:'adult',populationKey:'synthetic-adults',crossStageReReferenceAllowed:false}
  }
 }
 return source
}
const messages=(source:ReturnType<typeof adult>)=>validateScaleInstrumentSource(source).issues.filter(i=>i.severity==='error').map(i=>i.message)

describe('adult reference onboarding scope and external-dossier boundary',()=>{
 it('accepts an explicit adult age population without grades, leaving measurement and school contracts intact',()=>{
  const original=school(),source=adult()
  expect(messages(source)).toEqual([])
  expect(messages(original)).toEqual([])
  expect(hashScaleDefinition(source.executable!.definition)).toBe(hashScaleDefinition(original.executable!.definition))
  expect(parseScaleInstrumentSourceSchema(source).applicability!.requiredContextKeys).toEqual(['birthYearMonth','primaryLanguage'])
 })
 it.each(['policy-grades','catalog-grades','policy-age','catalog-age'])('rejects an adult parameter outside the source scope: %s',kind=>{
  const source=adult()
  if(kind==='policy-grades')source.applicability!.subject!.grades=['10','11','12']
  if(kind==='catalog-grades')source.catalog.population.gradeRange={minGrade:10,maxGrade:12}
  if(kind==='policy-age')source.applicability!.subject!.ageMonths={minInclusive:144,maxExclusive:216}
  if(kind==='catalog-age')source.catalog.population.maxAge=17
  expect(messages(source)).toContain('ADULT_REFERENCE_SOURCE_SCOPE_MISMATCH')
 })
 it.each(['measurement','instrument-version','scoring-version','locale'])('preserves the exact measurement/version/locale binding for adults: %s',kind=>{
  const source=adult(),entry=source.executable!.references[0].entries[0]
  if(kind==='measurement')entry.governance!.measurementHash='0'.repeat(64)
  if(kind==='instrument-version')entry.instrumentVersion='9.0.0'
  if(kind==='scoring-version')entry.scoringVersion='9.0.0'
  if(kind==='locale')entry.governance!.locale='en'
  expect(messages(source).length).toBeGreaterThan(0)
 })
 it('matches only a frozen in-window age; grade or missing age never becomes an adult reference',()=>{
  const source=adult(),ref=source.executable!.references[0],entry=ref.entries[0]
  const input={instrumentType:'scale' as const,instrumentKey:ref.instrumentKey,instrumentVersion:source.identity.instrumentVersion,scoringVersion:entry.scoringVersion,references:[ref],selections:[{scoreKey:entry.scoreKey,referenceVersion:ref.referenceVersion,referenceKind:entry.referenceKind}],score:{key:entry.scoreKey,value:3},measurementHash:entry.governance!.measurementHash}
  expect(resolveAssessmentReference({...input,context:{ageMonthsAtFreeze:216,language:'zh-CN'}})[0].status).toBe('available')
  for(const context of [{ageMonthsAtFreeze:215,language:'zh-CN'},{ageMonthsAtFreeze:1440,language:'zh-CN'},{gradeLevel:'12' as const,language:'zh-CN'},{language:'zh-CN'}])expect(resolveAssessmentReference({...input,context})[0].status).toBe('unavailable')
 })
 it.each([
  {activationStatus:'EXTERNAL_DOCUMENTATION_ONLY_NOT_BOUND',currentTranslationValidated:false,sourceParameters:{activate:false}},
  {activationStatus:'EXTERNAL_EVIDENCE_ONLY_NOT_BOUND',runtimeSelected:false},
 ])('does not turn an external literature dossier into executable references: $activationStatus',dossier=>{
  const source=adult(),ref=source.executable!.references[0]
  expect(validateReferenceSetDefinition(dossier).definition).toBeUndefined()
  source.executable!.references=[dossier as unknown as typeof ref]
  expect(messages(source)).toContain('EXTERNAL_REFERENCE_DOSSIER_NOT_EXECUTABLE')
  expect(()=>parseScaleInstrumentSourceSchema(source)).toThrow('EXTERNAL_REFERENCE_DOSSIER_NOT_EXECUTABLE')
  for(const wrapped of [{...ref,...dossier},{...ref,entries:ref.entries.map(entry=>({...entry,...dossier}))}]){
   expect(validateReferenceSetDefinition(wrapped).issues.some(i=>i.message==='EXTERNAL_REFERENCE_DOSSIER_NOT_EXECUTABLE')).toBe(true)
   source.executable!.references=[wrapped]
   expect(messages(source)).toContain('EXTERNAL_REFERENCE_DOSSIER_NOT_EXECUTABLE')
   expect(()=>parseScaleInstrumentSourceSchema(source)).toThrow('EXTERNAL_REFERENCE_DOSSIER_NOT_EXECUTABLE')
  }
 })
})
