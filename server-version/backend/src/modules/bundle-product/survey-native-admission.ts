import {buildAssessmentContext,type AssessmentContextV1} from '../assessment-context/context'
import {buildBundleContextFactsFromValues} from '../assessment-bundle/context'
import type {BundleContextFactsV1} from '../assessment-bundle/types'
import {readFrozenBundleProductionDefinition} from './definition-provider'
import {decodeSurveyNativeContext} from './survey-native-context'
import type {FrozenGovernedPackage} from '../survey/publication.service'
import type {SurveyComputedFinal} from '../survey/final.compute'

/** Private facts saved inside the existing encrypted FINAL; not a new grant. */
export type SurveyNativeAdmission={importId:string;definitionHash:string;demographic:AssessmentContextV1|null;facts:BundleContextFactsV1}
const missing=():never=>{throw new Error('SURVEY_NATIVE_ADMISSION_REQUIRED')}
const outside=():never=>{throw new Error('SURVEY_NATIVE_AGE_OUTSIDE_POPULATION')}
export function requiresSurveyNativeAdmission(p:FrozenGovernedPackage){
 if(!p.nativeBundle)return false
 const frozen=readFrozenBundleProductionDefinition(p.nativeBundle.definition)
 // Existing V1/V2 packages retain their original contracts. New bounded-age
 // schema3 packages cannot substitute an adult checkbox or a typed age for DOB.
 const d=frozen.bundleSnapshot.bundleDefinition
 return frozen.declarativePackage?.schemaVersion===3&&(d.slots.some(s=>s.admissionContext)||d.population.subjectMinAgeYears!==undefined||d.population.subjectMaxAgeYears!==undefined)
}
function assertAge(p:FrozenGovernedPackage,demographic:AssessmentContextV1|null){
 const population=readFrozenBundleProductionDefinition(p.nativeBundle!.definition).bundleSnapshot.bundleDefinition.population
 if(population.subjectMinAgeYears===undefined&&population.subjectMaxAgeYears===undefined)return
 const months=demographic?.values.ageMonthsAtFreeze
 if(!demographic?.values.birthYearMonth||typeof months!=='number'||!Number.isInteger(months)||months<0)missing()
 if(population.subjectMinAgeYears!==undefined&&months!<population.subjectMinAgeYears*12||population.subjectMaxAgeYears!==undefined&&months!>=(population.subjectMaxAgeYears+1)*12)outside()
}
/** Called before a measurement START or FINAL scoring. The host supplies its
 * persisted Attempt.startedAt; no client clock or package publication time. */
export function prepareSurveyNativeAdmissions(packages:readonly FrozenGovernedPackage[],answers:Record<string,unknown>,frozenAt:Date|undefined,instrumentKey:string):SurveyNativeAdmission[]{
 return packages.filter(p=>requiresSurveyNativeAdmission(p)&&p.slots.some(s=>s.instrumentKey===instrumentKey&&s.kind!=='FORM')).map(p=>{
  if(!frozenAt||!Number.isFinite(frozenAt.getTime()))missing()
  const native=p.nativeBundle!,frozen=readFrozenBundleProductionDefinition(native.definition),definition=frozen.bundleSnapshot.bundleDefinition
  const values:Record<string,unknown>={}
  for(const binding of native.source.context){
   const slot=p.slots.find(s=>s.slotKey===binding.slotKey),raw=slot?answers[slot.instrumentKey]:undefined
   const field=frozen.contextDefinition?.fields.find(f=>f.contextKey===binding.contextKey)
   if(!field||!raw||typeof raw!=='object'||Array.isArray(raw))continue
   values[field.contextKey]=decodeSurveyNativeContext(field,(raw as Record<string,unknown>)[binding.itemKey])
  }
  for(const requirement of definition.slots.flatMap(s=>s.admissionContext?.requirements??[])){
   const value=values[requirement.contextKey]
   if(value===undefined||value===null||typeof value==='string'&&!value.trim()||requirement.allowedValues&&!requirement.allowedValues.includes(value as string|number|boolean))missing()
  }
  const keys=new Set(definition.slots.flatMap(s=>s.admissionContext?.birthYearMonthContextKey?[s.admissionContext.birthYearMonthContextKey]:[]))
  if(keys.size>1)missing()
  const key=[...keys][0],dob=key?values[key]:undefined
  const demographic=key?buildAssessmentContext({items:[{id:key,type:'year_month',contextKey:'birthYearMonth',required:true}],answers:typeof dob==='string'?[{formItemId:key,value:dob}]:[],frozenAt}):null
  assertAge(p,demographic)
  if(!frozen.contextDefinition)missing()
  return {importId:p.importId,definitionHash:native.source.definitionHash,demographic,facts:buildBundleContextFactsFromValues({definition:frozen.contextDefinition!,values,frozenAt})}
 })
}
/** Reads retain the accepted age/month and original fixed context time. They
 * never recompute eligibility using today's date or a current catalog. */
export function readSurveyNativeAdmission(p:FrozenGovernedPackage,result:SurveyComputedFinal):SurveyNativeAdmission|null{
 if(!requiresSurveyNativeAdmission(p))return null
 const saved=result.nativeBundleAdmissions?.find(a=>a.importId===p.importId&&a.definitionHash===p.nativeBundle!.source.definitionHash)
 if(!saved)return null
 try{assertAge(p,saved.demographic);return saved}catch{return null}
}
export function blockedSurveyNativeInstruments(packages:readonly FrozenGovernedPackage[],result:SurveyComputedFinal){
 return new Set(packages.filter(p=>requiresSurveyNativeAdmission(p)&&!readSurveyNativeAdmission(p,result)).flatMap(p=>p.slots.filter(s=>s.kind!=='FORM').map(s=>s.instrumentKey)))
}
