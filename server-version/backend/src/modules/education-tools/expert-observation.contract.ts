import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'

/** A new education-only source contract. V1 relational applicability and its
 * respondent/relationship vocabulary remain unchanged. */
export const expertTargetKindSchema=z.enum(['PERSON','TEAM','ORGANIZATION','ACTIVITY','ARTIFACT','PROJECT'])
export const expertCompositionAdministrationSchema=z.object({population:z.literal('TEACHER'),responseMode:z.literal('EXPERT_REPORT'),targetKind:expertTargetKindSchema}).strict()
export const EXPERT_COMPOSITION_ADAPTER='2.0.0' as const
export const isExpertComposition=(value:{variantKey?:string;administration?:{responseMode:string}})=>value.variantKey==='TEACHER:EXPERT_REPORT'||value.administration?.responseMode==='EXPERT_REPORT'

/** Explicit new source declaration; absence never inherits V1 SELF/relational
 * meaning. Public approval/registry and library snapshot hashes freeze it. */
export const expertSourceApplicabilitySchema=z.object({schemaVersion:z.literal(2),
 administrations:z.array(expertCompositionAdministrationSchema).min(1).max(6),
}).strict().superRefine((value,ctx)=>{
 if(new Set(value.administrations.map(a=>a.targetKind)).size!==value.administrations.length)ctx.addIssue({code:'custom',message:'专家观察目标声明不能重复'})
})
export type ExpertSourceApplicability=z.infer<typeof expertSourceApplicabilitySchema>
export function supportsExpertSource(raw:unknown,administration:z.infer<typeof expertCompositionAdministrationSchema>){
 const parsed=expertSourceApplicabilitySchema.safeParse(raw)
 return parsed.success&&parsed.data.administrations.some(a=>a.targetKind===administration.targetKind)
}
export function compileExpertSourceApplicability(raw:unknown){
 const declaration=expertSourceApplicabilitySchema.parse(raw),compilerVersion='EDUCATION_EXPERT_APPLICABILITY_V2' as const
 return {declaration,compilerVersion,contractHash:canonicalHash({compilerVersion,declaration})}
}
export type FrozenExpertApplicability={educationExpertApplicability?:ExpertSourceApplicability;educationExpertApplicabilityHash?:string;educationExpertApplicabilityCompilerVersion?:'EDUCATION_EXPERT_APPLICABILITY_V2'}
export function readFrozenExpertApplicability(snapshot:FrozenExpertApplicability){
 const {educationExpertApplicability,educationExpertApplicabilityHash,educationExpertApplicabilityCompilerVersion}=snapshot
 if(educationExpertApplicability===undefined&&educationExpertApplicabilityHash===undefined&&educationExpertApplicabilityCompilerVersion===undefined)return null
 const compiled=compileExpertSourceApplicability(educationExpertApplicability)
 if(compiled.contractHash!==educationExpertApplicabilityHash||compiled.compilerVersion!==educationExpertApplicabilityCompilerVersion)throw Error('EDUCATION_EXPERT_APPLICABILITY_FROZEN_CONTRACT_MISMATCH')
 return compiled
}
export const isNativeExpertObserver=(respondentType:unknown)=>respondentType==='expert_report'||respondentType==='observer_report'
