import type {FormQuestion} from './types'
import {visibleFormKeys} from './form-visibility'
export type TrainingFormPolicy={version:3;requiredRefusal:'BLOCK_SUBMIT'|'ALLOW_SUBMIT';hiddenRequired:'EXEMPT'|'NOT_SATISFIED'}
export type TrainingFormField={formItemId:string;formDefinition?:FormQuestion<never>|null;formPolicy?:TrainingFormPolicy|null}
/** Adapt only identities; shared visibility owns condition evaluation. */
export const trainingVisibleFields = <T extends TrainingFormField>(fields:T[],values:Record<string,unknown>):T[] => {
 const questions=fields.flatMap(f=>f.formDefinition?[f.formDefinition]:[])
 const answers=Object.fromEntries(fields.flatMap(f=>f.formDefinition?[[f.formDefinition.itemKey,values[f.formItemId]]]:[]))
 const visible=visibleFormKeys(questions,answers)
 return fields.filter(f=>!f.formDefinition||visible.has(f.formDefinition.itemKey))
}
export const sanitizeTrainingFormValues = <T>(fields:TrainingFormField[],values:Record<string,T>):Record<string,T> => {
 const visible=new Set(trainingVisibleFields(fields,values).map(f=>f.formItemId));const cleaned={...values}
 for(const f of fields){
  if(!visible.has(f.formItemId)){delete cleaned[f.formItemId];delete cleaned[f.formItemId+':other'];continue}
  const q=f.formDefinition
  if(q?.otherOptionKey){const v=cleaned[f.formItemId];if(v!==q.otherOptionKey&&!(Array.isArray(v)&&v.includes(q.otherOptionKey)))delete cleaned[f.formItemId+':other']}
 }
 return cleaned
}
