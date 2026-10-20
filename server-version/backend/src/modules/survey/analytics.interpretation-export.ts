import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {surveyAttemptCode,tableToCsv} from './analytics.export-format'
import type {SurveyAttemptContentBinding} from './content-binding.service'
import type {SurveySourceProjection} from './analytics.source'
const text=z.string().min(1).max(240),hash=z.string().regex(/^[a-f0-9]{64}$/)
const finite=z.number().finite().nullable()
const interpretationSchema=z.object({schemaVersion:z.literal(1),contentBindingHash:hash,units:z.array(z.object({instrumentKey:text,
  status:z.enum(['INTERPRETED','UNAVAILABLE','REVOKED','NOT_SELECTED']),reason:text.optional(),
  references:z.array(z.object({metricKey:text,referenceKind:z.enum(['normative_distribution','criterion_threshold','descriptive_sample','theoretical_range']),
    status:z.enum(['AVAILABLE','UNAVAILABLE','REVOKED']),reason:text.optional(),values:z.object({z:finite,t:finite,
      percentile:z.object({value:z.number().finite(),estimated:z.boolean()}).strict().nullable(),meanDifference:finite,bandKey:text.nullable()}).strict().optional()}).strict()).max(1000),
  report:z.object({status:z.enum(['READY','REVOKED','NOT_SELECTED','UNAVAILABLE']),generatorVersion:text.optional()}).strict(),
}).strict()).max(30)}).strict()
export interface SurveyStoredInterpretationObservation {
  projectId:string;waveId:string;waveOrdinal:number;attemptId:string;researchCode:string|null;sourceFinalHash:string;completedAt:string;
  /** Ephemeral execution evidence from the verified FINAL, not inferred from placeholder scores. */
  finalId?:string
  unitExecution?:Array<{instrumentKey:string;notExecuted:boolean}>
  sourceVerified:true;binding:SurveyAttemptContentBinding|null;interpretation:z.infer<typeof interpretationSchema>|null
}
/** No computation or selection: validate the saved personal interpretation against its immutable receipt. */
export function checkedStoredSurveyInterpretation(raw:unknown,binding:SurveyAttemptContentBinding|null){
  if(raw===undefined)return null
  const result=interpretationSchema.parse(raw)
  if(!binding||result.contentBindingHash!==canonicalHash(binding)||result.units.length!==binding.units.length
    ||new Set(result.units.map(unit=>unit.instrumentKey)).size!==result.units.length)throw new Error('SURVEY_INTERPRETATION_BINDING_MISMATCH')
  for(const unit of result.units){
    if(unit.references.some(ref=>ref.status!=='AVAILABLE'&&ref.values!==undefined))throw new Error('SURVEY_INTERPRETATION_VALUES_INVALID')
    const bound=binding.units.find(item=>item.instrumentKey===unit.instrumentKey)
    if(!bound||unit.references.length!==bound.references.length
      ||new Set(unit.references.map(ref=>JSON.stringify([ref.metricKey,ref.referenceKind]))).size!==unit.references.length
      ||unit.references.some(ref=>!bound.references.some(slot=>slot.metricKey===ref.metricKey&&slot.referenceKind===ref.referenceKind)))
      throw new Error('SURVEY_INTERPRETATION_BINDING_MISMATCH')
  }
  return result
}
export function interpretationLongExport(projectId:string,source:SurveySourceProjection,waveId:string){
  const observations=source.interpretations??[]
  if(source.projectId!==projectId||observations.length!==source.completeAttempts||observations.some(row=>row.projectId!==projectId||row.waveId!==waveId
    ||!row.sourceVerified||!row.sourceFinalHash||(row.binding&&(row.binding.projectId!==row.projectId||row.binding.waveId!==row.waveId||row.binding.attemptId!==row.attemptId))))throw new Error('Interpretation export requires verified complete FINAL observations')
  const columns=['research_code_or_attempt','wave_id','wave_ordinal','instrument_key','interpretation_status','interpretation_reason',
    'metric_key','reference_kind','reference_status','reference_reason','z','t','percentile','percentile_estimated','mean_difference','band_key',
    'content_binding_hash','measurement_release_id','measurement_content_hash','measurement_hash','reference_release_id','reference_content_hash','reference_entry_key',
    'report_release_id','report_content_hash','report_status','report_generator_version','source_final_hash','final_completed_at_utc']
  const records:unknown[][]=[]
  for(const observation of observations){
    if(records.length>=10000)throw new Error('Interpretation export exceeds bounded rows')
    const id=observation.researchCode??surveyAttemptCode(observation.attemptId),interpretation=observation.interpretation
    if(!interpretation){records.push([id,waveId,observation.waveOrdinal,null,'LEGACY_NOT_RECORDED',null,...Array(21).fill(null),observation.sourceFinalHash,observation.completedAt]);continue}
    const verified=checkedStoredSurveyInterpretation(interpretation,observation.binding)!
    for(const unit of verified.units){
      const bound=observation.binding!.units.find(item=>item.instrumentKey===unit.instrumentKey)!
      for(const reference of unit.references.length?unit.references:[null]){
        if(records.length>=10000)throw new Error('Interpretation export exceeds bounded rows')
        const slot=reference?bound.references.find(item=>item.metricKey===reference.metricKey&&item.referenceKind===reference.referenceKind):undefined
        const pointer=slot?.status==='SELECTED'?slot:null
        records.push([id,waveId,observation.waveOrdinal,unit.instrumentKey,unit.status,unit.reason??null,
          reference?.metricKey??null,reference?.referenceKind??null,reference?.status??null,reference?.reason??null,
          reference?.values?.z??null,reference?.values?.t??null,reference?.values?.percentile?.value??null,
          reference?.values?.percentile?.estimated??null,reference?.values?.meanDifference??null,reference?.values?.bandKey??null,
          verified.contentBindingHash,bound.measurement.releaseId,bound.measurement.contentHash,bound.measurement.measurementHash,
          pointer?.releaseId??null,pointer?.contentHash??null,pointer?.entryKey??null,bound.report?.releaseId??null,bound.report?.contentHash??null,
          unit.report.status,unit.report.generatorVersion??null,observation.sourceFinalHash,observation.completedAt])
      }
    }
  }
  const csv=tableToCsv(columns,records,10000),codebook=columns.map(field=>({field,meaning:field==='interpretation_status'
    ?'Saved FINAL interpretation state; LEGACY_NOT_RECORDED never receives a new interpretation on export':field}))
  return {csv,codebook,manifest:{schemaVersion:2 as const,format:'INTERPRETATION_LONG' as const,projectId,waveIds:[waveId],cutOff:source.cutOff,
    rowCount:records.length,columnCount:columns.length,legacyFinalCount:observations.filter(row=>!row.interpretation).length,
    interpretedFinalCount:observations.filter(row=>row.interpretation).length,interpretationSemantics:'SAVED_AT_FINAL_NOT_CURRENT_RELEASE_STATUS',
    sourceDigest:canonicalHash(observations.map(row=>({final:row.sourceFinalHash,binding:row.interpretation?.contentBindingHash??null}))),
    dataDigest:canonicalHash(csv),codebookDigest:canonicalHash(codebook),formulaGuard:'EXCEL_APOSTROPHE_PREFIX' as const}}
}
export type InterpretationExport=ReturnType<typeof interpretationLongExport>
