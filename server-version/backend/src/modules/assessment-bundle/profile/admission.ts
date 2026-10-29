import type { BundleContextFieldDefinitionV1 } from '../context'
import type { DeclarativePackage } from '../onboarding/contract'
/** One declared Bundle grade answer also feeds the existing unit eligibility context.
 * This is collection metadata, never a grant or participant-data read permission. */
export function profileGradeForm(pack:DeclarativePackage|undefined,field:BundleContextFieldDefinitionV1){
  if(pack?.schemaVersion!==2)return null
  const grade=pack.evidence.find(e=>e.evidenceKey===pack.profile.applicability.gradeEvidenceKey)
  if(grade?.selector!==field.contextKey)return null
  return {formType:'single_choice',formLabel:'年级',contextKey:'gradeLevel',
    formOptions:Array.from({length:12},(_,i)=>({value:String(i+1),label:i<6?'小学'+(i+1)+'年级':i<9?'初中'+(i-5)+'年级':'高中'+(i-8)+'年级'}))}
}
