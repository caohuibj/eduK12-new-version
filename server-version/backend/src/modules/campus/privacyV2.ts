import {z} from 'zod'
import {privacyOptionsSchema,type PrivacyOptions} from '../report-privacy/schema'

/** PR3: STUDENT_WELLBEING/FAMILY_SUPPORT are always subject to existing
 * sensitive School rules. An activity purpose alone cannot declare a SCALE
 * non-sensitive; only a separately reviewed exact resource authority can.
 * The manifest is operator-managed, never user/creator input.
 */
const resourceSchema=z.object({
  family:z.enum(['SCALE','BUNDLE','SITUATIONAL']),
  key:z.string().min(1).max(240),
  version:z.string().min(1).max(160),
}).strict()
export type SchoolGeneralResource=z.infer<typeof resourceSchema>
const manifestSchema=z.array(resourceSchema).max(100)
export type SchoolActivityPurpose=
  'STUDENT_WELLBEING'|'LEARNING_ADAPTATION'|'SCHOOL_CLIMATE'|'FAMILY_SUPPORT'

export const schoolPrivacyV2Enabled=()=>(
  process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED==='true'
  &&process.env.REPORT_PRIVACY_SCHOOL_V2_ENABLED==='true'
)
/** Default-empty, exact-match allowlist. Malformed manifests fail closed. */
export function reviewedGeneralResources(raw=process.env.CAMPUS_GENERAL_REPORT_APPROVED_RESOURCES||'[]'):
  readonly SchoolGeneralResource[] {
  let value:unknown
  try{value=JSON.parse(raw)}catch{throw new Error('CAMPUS_GENERAL_RESOURCES_INVALID')}
  const parsed=manifestSchema.safeParse(value)
  if(!parsed.success)throw new Error('CAMPUS_GENERAL_RESOURCES_INVALID')
  const entries=parsed.data
  const keys=entries.map(x=>JSON.stringify([x.family,x.key,x.version]))
  if(entries.some(x=>x.key.includes('*')||x.version.includes('*')))
    throw new Error('CAMPUS_GENERAL_RESOURCES_WILDCARD_FORBIDDEN')
  if(new Set(keys).size!==keys.length)
    throw new Error('CAMPUS_GENERAL_RESOURCES_DUPLICATE')
  return entries
}
export const generalPurpose=(purpose:SchoolActivityPurpose):boolean=>
  purpose==='SCHOOL_CLIMATE'||purpose==='LEARNING_ADAPTATION'
type TrackRef=SchoolGeneralResource &{
  subjectRoles:readonly string[];respondentRoles:readonly string[];
  relationshipKinds:readonly string[];perspectives:readonly string[];
  analysisMode:string
}
const exactOne=(values:readonly string[],expected:string)=>
  values.length===1&&values[0]===expected
export function generalRunApproved(input:{
  purpose:SchoolActivityPurpose;tracks:readonly TrackRef[];
  approved:readonly SchoolGeneralResource[]
}):boolean {
  if(!generalPurpose(input.purpose)||!input.tracks.length)return false
  const approved=new Set(input.approved.map(x=>JSON.stringify([x.family,x.key,x.version])))
  return input.tracks.every(track=>
    approved.has(JSON.stringify([track.family,track.key,track.version]))
    &&exactOne(track.subjectRoles,'STUDENT')
    &&exactOne(track.respondentRoles,'STUDENT')
    &&exactOne(track.relationshipKinds,'SELF')
    &&exactOne(track.perspectives,'SELF_REPORT')
    &&track.analysisMode==='COHORT_AGGREGATE')
}
export function parseFrozenSchoolOptions(input:unknown):PrivacyOptions {
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw new Error('CAMPUS_GENERAL_POLICY_INVALID')
  const val=input as Record<string,unknown>
  if(val.schemaVersion!==1||val.product!=='HUISCHOOL'
    ||val.scenario!=='SCHOOL_GENERAL_EDUCATION_GROUP'
    ||val.source!=='APPROVED_REPORT_PREFERENCE_V1')
    throw new Error('CAMPUS_GENERAL_POLICY_INVALID')
  return privacyOptionsSchema.parse(val.options)
}
