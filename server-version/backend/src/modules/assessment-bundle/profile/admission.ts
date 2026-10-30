import type { BundleContextFieldDefinitionV1 } from '../context'
import type { DeclarativePackage } from '../onboarding/contract'
/** Collection metadata, never a grant, role assignment or participant-data read permission.
 * Only the original grade answer feeds the canonical unit grade eligibility context. */
export function profileContextForm(pack:DeclarativePackage|undefined,field:BundleContextFieldDefinitionV1){
  if(pack?.schemaVersion!==2)return null
  const applicability=pack.profile.applicability
  if('kind' in applicability){
    const adult=pack.evidence.find(e=>e.evidenceKey===applicability.adultEvidenceKey)
    const teacher=pack.evidence.find(e=>e.evidenceKey===applicability.teacherEvidenceKey)
    const formLabel=adult?.selector===field.contextKey?'您是否已满18周岁？':teacher?.selector===field.contextKey?'您目前是否在中小学有实际教学职责？':null
    return formLabel?{formType:'single_choice',formLabel,formOptions:[{value:'true',label:'是'},{value:'false',label:'否'}]}:null
  }
  const grade=pack.evidence.find(e=>e.evidenceKey===applicability.gradeEvidenceKey)
  if(grade?.selector!==field.contextKey)return null
  return {formType:'single_choice',formLabel:'年级',contextKey:'gradeLevel',
    formOptions:Array.from({length:12},(_,i)=>({value:String(i+1),label:i<6?'小学'+(i+1)+'年级':i<9?'初中'+(i-5)+'年级':'高中'+(i-8)+'年级'}))}
}
/** Compatibility for existing grade-only setup consumers. */
export const profileGradeForm=profileContextForm
