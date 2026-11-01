import type {DeclarativePackage} from '../assessment-bundle/onboarding/contract'
import {resolveScalePolicyRespondentType} from '../scale/scale-admission.service'

/** Product display lanes are not subject/respondent relationships or grants.
 * Reuse the existing admission resolver, including its legacy SELF surface.
 * Explicit proxy relationships and asymmetric identities never become SELF. */
export function isFrozenAdultSelfReport(input:{pack:DeclarativePackage|undefined;slotKey:string;audience:string;
 contract:{respondent?:string;audience?:string}|undefined;sourceRespondentType:string|undefined;
 relationship?:{respondentType?:string|null;subjectUserId?:string|null;respondentUserId?:string|null}}){
 const {pack,contract,relationship}=input
 return pack?.schemaVersion===3&&pack.report.narrativeContent==='BUNDLE_OWNED_SELF'&&input.audience==='student'
  &&pack.manifest.definition.population.subjectPopulation==='adult'
  &&pack.manifest.definition.respondentTypes.length===1&&pack.manifest.definition.respondentTypes[0]==='SELF'
  &&pack.manifest.definition.slots.find(s=>s.slotKey===input.slotKey)?.respondentType==='SELF'
  &&contract?.respondent==='ADULT_SELF'&&['student','parent','teacher'].includes(contract.audience??'')
  &&['participant_self_report','student_self_report','teacher_self_report'].includes(input.sourceRespondentType??'')
  &&resolveScalePolicyRespondentType(relationship??{})==='SELF'
  &&(relationship?.subjectUserId??null)===(relationship?.respondentUserId??null)
}
