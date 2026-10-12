import {privacyOptionsSchema,type PrivacyOptions,
  type PrivacyScenario} from '../report-privacy/schema'
import {ENHANCED} from '../report-privacy/registry'

/**
 * Teacher-only feature gate. A preference is a no-op until both management
 * and reporting activation have been explicitly approved. This NEVER gates
 * School mental-health reports or changes historic V1 Run disclosure.
 */
export const teacherPrivacyV2Enabled=()=>(
  process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED==='true'
  &&process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED==='true'
)
export const TEACHER_PRIVACY_BASELINE_N=5 as const
export const TEACHER_PRIVACY_LEGACY_N=10 as const
export const teacherResourceMinimum=()=>teacherPrivacyV2Enabled()
  ?TEACHER_PRIVACY_BASELINE_N:TEACHER_PRIVACY_LEGACY_N
export function teacherReportMinimum(options:PrivacyOptions,trackMinimum:number=TEACHER_PRIVACY_BASELINE_N){
  return Math.max(TEACHER_PRIVACY_BASELINE_N,
    options.minRespondentsProfile==='N10'?10:5,trackMinimum)
}
export const teacherStudentPrivacyNotice=()=>teacherPrivacyV2Enabled()
  ?'新任务发布时自动冻结已保存的报告隐私偏好；历史任务保持原有规则。'
  :'当前使用原有的十人群体披露规则。'

/** Each frozen policy must be schema-checked before any disclosure. */
export function parseFrozenTeacherOptions(input:unknown,scenario:Extract<
 PrivacyScenario,'TEACHER_STUDENT_EVALUATION'|'TEACHER_ADULT_FORM_GROUP'>):PrivacyOptions{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('PRIVACY_FROZEN_INVALID')
  const p=input as Record<string,unknown>
  if(p.schemaVersion!==1||p.product!=='HUITEACHER'||p.scenario!==scenario
    ||p.source!=='APPROVED_REPORT_PREFERENCE_V1')throw Error('PRIVACY_FROZEN_INVALID')
  return privacyOptionsSchema.parse(p.options)
}
export function teacherFullItemDisclosure(input:{
  options:PrivacyOptions;count:number;type:string;cells:ReadonlyArray<{key:string;label:string;count:number}>;
  smallCell:boolean;nonExclusive:boolean;
}){
  if(input.options.restrictItemDistributions)return {status:'WITHHELD' as const,
    reason:'ITEM_DISTRIBUTIONS_DISABLED' as const}
  if(input.options.withholdSmallCells&&input.smallCell)return {status:'WITHHELD' as const,
    reason:'SMALL_CELL' as const}
  if(input.options.restrictedStatisticsProjection)return {
    status:'READY' as const,cells:input.cells.map(x=>({
      key:x.key,label:x.label,percentage:Number((Math.round(x.count*10/input.count)*10).toFixed(0)),
    })),
    precision:'ROUNDED_10_PERCENT' as const,
  }
  return {status:'READY' as const,cells:[...input.cells]}
}
