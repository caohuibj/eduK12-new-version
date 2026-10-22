import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {RelationalActorRoleV1,RelationalPerspectiveV1,RelationalRelationshipKindV1} from '../assessment-relational/types'

/** Author-facing pairs, not independent role lists: combining student SELF and
 * teacher SELF must never imply that students may rate teachers, or vice versa.
 * This declaration is approved in the existing immutable library submission.
 * It conveys content applicability only, never an entitlement or report right.
 */
const administrationSchema=z.object({
  population:z.enum(['STUDENT','TEACHER']),
  responseMode:z.enum(['SELF','PARENT_REPORT','TEACHER_REPORT','STUDENT_REPORT']),
}).strict()
export const educationApplicabilitySchema=z.object({
  schemaVersion:z.literal(1),
  administrations:z.array(administrationSchema).min(1).max(5),
}).strict().superRefine((value,ctx)=>{
  const seen=new Set<string>()
  value.administrations.forEach((administration,index)=>{
    const {population,responseMode}=administration
    const valid=responseMode==='SELF'
      ||population==='STUDENT'&&(responseMode==='PARENT_REPORT'||responseMode==='TEACHER_REPORT')
      ||population==='TEACHER'&&responseMode==='STUDENT_REPORT'
    if(!valid)ctx.addIssue({code:'custom',path:['administrations',index],message:'作答方式与测量对象不匹配'})
    const key=population+':'+responseMode
    if(seen.has(key))ctx.addIssue({code:'custom',path:['administrations',index],message:'适用人群和作答方式组合不能重复'})
    seen.add(key)
  })
}).transform(value=>({...value,administrations:[...value.administrations].sort((a,b)=>
  (a.population+':'+a.responseMode).localeCompare(b.population+':'+b.responseMode))}))
export type EducationApplicability=z.infer<typeof educationApplicabilitySchema>
export type EducationAdministration=EducationApplicability['administrations'][number]

export type EducationApplicabilityVariant={
  variantKey:string
  population:EducationAdministration['population']
  responseMode:EducationAdministration['responseMode']
  subjectRole:RelationalActorRoleV1
  respondentRole:RelationalActorRoleV1
  relationshipKinds:RelationalRelationshipKindV1[]
  perspective:RelationalPerspectiveV1
}

/** Versioned compiler of explicit applicability facts only. Selection of actual
 * related users, target modes, disclosure and current authority is a separate
 * existing Run policy boundary. No entry/product name is used as a population.
 */
export function compileEducationApplicability(raw:unknown){
  const declaration=educationApplicabilitySchema.parse(raw)
  const variants:EducationApplicabilityVariant[]=declaration.administrations.map(({population,responseMode})=>({
    variantKey:population+':'+responseMode,population,responseMode,subjectRole:population,
    respondentRole:responseMode==='SELF'?population:responseMode==='PARENT_REPORT'?'PARENT':responseMode==='TEACHER_REPORT'?'TEACHER':'STUDENT',
    relationshipKinds:responseMode==='SELF'?['SELF']:responseMode==='PARENT_REPORT'?['PARENT_CHILD']:['CLASS_TEACHER_STUDENT','COURSE_TEACHER_STUDENT'],
    perspective:responseMode==='SELF'?'SELF_REPORT':'OBSERVER_REPORT',
  }))
  const compilerVersion='EDUCATION_APPLICABILITY_V1' as const
  return {declaration,compilerVersion,contractHash:canonicalHash({compilerVersion,declaration,variants}),variants,
    status:'DECLARED_CONTENT_ONLY' as const,canPublish:false as const}
}

export type FrozenEducationApplicability={
  educationApplicability?:EducationApplicability
  educationApplicabilityHash?:string
  educationApplicabilityCompilerVersion?:'EDUCATION_APPLICABILITY_V1'
}

/** Verify the approved snapshot's own compiler/hash binding. A later compiler
 * cannot silently reinterpret an existing library version. Old absence remains
 * absence, not a default population or a freshly generated authority token.
 */
export function readFrozenEducationApplicability(snapshot:FrozenEducationApplicability){
  const {educationApplicability:declaration,educationApplicabilityHash:hash,educationApplicabilityCompilerVersion:version}=snapshot
  if(declaration===undefined&&hash===undefined&&version===undefined)return null
  const compiled=compileEducationApplicability(declaration)
  if(compiled.contractHash!==hash||compiled.compilerVersion!==version)
    throw new Error('EDUCATION_APPLICABILITY_FROZEN_CONTRACT_MISMATCH')
  return compiled
}
