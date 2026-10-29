import {z} from 'zod'

/** A new education-only source contract. V1 relational applicability and its
 * respondent/relationship vocabulary remain unchanged. */
export const expertTargetKindSchema=z.enum(['PERSON','TEAM','ORGANIZATION','ACTIVITY','ARTIFACT','PROJECT'])
export const expertCompositionAdministrationSchema=z.object({population:z.literal('TEACHER'),responseMode:z.literal('EXPERT_REPORT'),targetKind:expertTargetKindSchema}).strict()
export const EXPERT_COMPOSITION_ADAPTER='2.0.0' as const
export const isExpertComposition=(value:{variantKey?:string;administration?:{responseMode:string}})=>value.variantKey==='TEACHER:EXPERT_REPORT'||value.administration?.responseMode==='EXPERT_REPORT'
