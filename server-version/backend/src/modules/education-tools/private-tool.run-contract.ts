import {z} from 'zod'
import {privateFormRuntimeInput} from './private-tool.form-runtime-contracts'
import {privateScaleRuntimeInput} from './private-tool.runtime-origin'
import {privateToolFail} from './private-tool.contracts'
const ids=z.array(z.string().guid()).min(1).max(500)
export const privateRunSelector=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('ALL_CURRENT')}).strict(),
 z.object({kind:z.literal('RELATED_PARENT')}).strict(),
 z.object({kind:z.literal('MEMBERSHIP_IDS'),membershipIds:ids}).strict(),
 z.object({kind:z.literal('CLASS_UNITS'),classUnitIds:ids}).strict(),
 z.object({kind:z.literal('LABELS'),labelIds:ids,match:z.enum(['ANY','ALL'])}).strict(),
])
export const privateRunTrackInput=z.object({
 expectedVersion:z.number().int().positive(),privateScale:privateScaleRuntimeInput,
 subjectSelector:privateRunSelector,respondentSelector:privateRunSelector,
 targetPolicy:z.object({mode:z.enum(['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS']),teacherMembershipIds:ids.optional()}).strict().optional(),
}).strict()
export const privateFormRunTrackInput=privateRunTrackInput.omit({privateScale:true}).extend({privateForm:privateFormRuntimeInput}).strict()
export const privateToolRunTrackInput=z.union([privateRunTrackInput,privateFormRunTrackInput])
export type PrivateRunTrackInput=z.infer<typeof privateRunTrackInput>
export type PrivateFormRunTrackInput=z.infer<typeof privateFormRunTrackInput>
export function assertPrivateRunSelection(input:PrivateRunTrackInput|PrivateFormRunTrackInput){
 const mode=('privateScale' in input?input.privateScale:input.privateForm).administration.responseMode
 if(input.subjectSelector.kind==='RELATED_PARENT'||(mode==='PARENT_REPORT')!==(input.respondentSelector.kind==='RELATED_PARENT'))
  privateToolFail('PRIVATE_TOOL_SELECTOR_COMBINATION_INVALID',400)
 if(mode==='TEACHER_REPORT'&&!input.targetPolicy||mode!=='TEACHER_REPORT'&&input.targetPolicy)
  privateToolFail('PRIVATE_TOOL_TARGET_REQUIRED_OR_UNEXPECTED',400)
 if(input.targetPolicy){
  const selected=input.targetPolicy.mode==='SELECTED_CLASS_TEACHERS'
  if(selected!==Boolean(input.targetPolicy.teacherMembershipIds?.length))privateToolFail('PRIVATE_TOOL_TARGET_SELECTION_INVALID',400)
 }
}
