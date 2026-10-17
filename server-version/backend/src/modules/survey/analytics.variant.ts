import type { FrozenSurveyFlow,SurveyVariantProvenance } from './flow.definition'
import type { SurveyFlowAssignment } from './flow.assignment'
import { SurveyAnalyticsError } from './analytics.errors'
export interface SurveyVariantAudit {
  variant?:SurveyVariantProvenance
  assignmentAlgorithm?:SurveyFlowAssignment['algorithm']
  assignmentDigest?:string
  assignedAt?:string
}
export interface SurveyVariantConfiguration {
  waveId:string;allocationConfigId:string;experimentKey:string;
  mode:'QUESTIONNAIRE_VARIANTS';linkedPolicy:'RERANDOMIZE';
  groups:(SurveyVariantProvenance&{instrumentKeys:string[]})[]
}
export function frozenVariantConfiguration(flow:FrozenSurveyFlow|undefined,waveId:string):SurveyVariantConfiguration|undefined{
  if(flow?.experiment?.mode!=='QUESTIONNAIRE_VARIANTS')return undefined
  const experiment=flow.experiment,totalWeight=experiment.groups.reduce((sum,g)=>sum+g.weight,0)
  return {waveId,allocationConfigId:flow.flowDigest,experimentKey:experiment.experimentKey,
    mode:'QUESTIONNAIRE_VARIANTS',linkedPolicy:'RERANDOMIZE',groups:experiment.groups.map(g=>({
      schemaVersion:1,variantKey:g.groupKey,variantLabel:g.variantLabel!,variantDigest:g.variantDigest!,
      allocationConfigId:flow.flowDigest,weight:g.weight,totalWeight,probability:g.weight/totalWeight,
      instrumentKeys:[...g.instrumentKeys!],
    }))}
}
export const variantAuditColumns=['variant_key','variant_label','variant_digest','allocation_config_id',
  'allocation_weight','allocation_total_weight','allocation_probability','assignment_algorithm',
  'assignment_digest','assigned_at_utc']
export const variantAuditValues=(row:SurveyVariantAudit):Array<string|number|null>=>[
  row.variant?.variantKey??null,row.variant?.variantLabel??null,row.variant?.variantDigest??null,
  row.variant?.allocationConfigId??null,row.variant?.weight??null,row.variant?.totalWeight??null,
  row.variant?.probability??null,row.assignmentAlgorithm??null,row.assignmentDigest??null,row.assignedAt??null,
]
export function rejectPooledVariants(source:{variantConfigurations?:SurveyVariantConfiguration[];
  raw?:SurveyVariantAudit[];scores?:SurveyVariantAudit[];
  codebook?:{variantConfiguration?:SurveyVariantConfiguration}[];
  scoreColumns?:{measurement:{variantConfiguration?:SurveyVariantConfiguration}}[]}){
  if(source.variantConfigurations?.length||source.raw?.some(r=>r.variant)||source.scores?.some(r=>r.variant)
    ||source.codebook?.some(c=>c.variantConfiguration)||source.scoreColumns?.some(c=>c.measurement.variantConfiguration))
    throw new SurveyAnalyticsError(409,'A/B问卷子版本不可合并统计；请按冻结子版本分层导出并分析')
}
