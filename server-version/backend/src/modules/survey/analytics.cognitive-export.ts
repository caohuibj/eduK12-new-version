import {variantAuditColumns,variantAuditValues} from './analytics.variant'
import {canonicalHash} from '../assessment-runtime/canonical'
import {surveyAttemptCode,tableToCsv} from './analytics.export-format'
import {COGNITIVE_TRIAL_PAGE_ROWS,COGNITIVE_TRIAL_PAGE_BYTES} from './analytics.cognitive'
import type {SurveySourceProjection} from './analytics.source'

export function cognitiveTrialLongExport(projectId:string,source:SurveySourceProjection,waveId:string){
  const rows=source.cognitiveTrials??[]
  if(source.projectId!==projectId||rows.some(row=>row.projectId!==projectId||row.waveId!==waveId
    ||row.sourceVerified!==true||!row.sourceFinalHash||!row.sourceResultHash))
    throw new Error('Cognitive trial export requires verified project-owned parent FINAL and child results')
  if(rows.length>COGNITIVE_TRIAL_PAGE_ROWS)throw new Error('Cognitive trial export exceeds row budget')
  const variants=!!source.variantConfigurations?.length||rows.some(r=>r.variant)
  const simon=rows.some(row=>row.simon!==undefined)
  const simonColumns=['mapping','stimulus_color','stimulus_side','required_response_side','correct','technically_valid']
  const columns=['research_code_or_attempt','wave_id','wave_ordinal','publication_id','publication_version',
    'instrument_key','epoch','completion_status','phase','trial_index','condition','stimulus_code',
    'responded','response','rt','rt_unit','rt_missing_reason','started_at_perf_ms','ended_at_perf_ms',
    'duration_ms','timeout','premature','interrupted','quality_events','quality_status','quality_flags',
    'quality_reasons','restart_count','measurement_digest','config_hash','protocol_signature',
    'engine_version','scoring_version','config_version','timing_policy','randomization_version','random_seed',
    'administration_provenance','source_final_hash','source_result_hash','child_completed_at_utc','final_completed_at_utc',...(simon?simonColumns:[]),...(variants?variantAuditColumns:[])]
  const attemptCodes=new Map<string,string>()
  const attemptCode=(id:string)=>{
    let code=attemptCodes.get(id)
    if(code===undefined){code=surveyAttemptCode(id);attemptCodes.set(id,code)}
    return code
  }
  const records=rows.map(row=>[row.researchCode??attemptCode(row.attemptId),row.waveId,row.waveOrdinal,
    row.publicationId,row.publicationVersion,row.instrumentKey,row.epoch,row.completionStatus??'COMPLETE',
    row.phase,row.trialIndex,row.condition,row.stimulusCode,row.responded,row.response,row.rtMs,'ms',row.rtMissingReason,
    row.startedAtPerfMs,row.endedAtPerfMs,row.durationMs,row.timeout,row.premature,row.interrupted,
    JSON.stringify(row.qualityEvents),row.qualityStatus,JSON.stringify(row.qualityFlags),JSON.stringify(row.qualityReasons),
    row.restartCount,row.measurementDigest,row.configHash,row.protocolSignature,row.engineVersion,row.scoringVersion,
    row.configVersion,row.timingPolicy,row.randomizationVersion,row.randomSeed,JSON.stringify(row.administrationProvenance),
    row.sourceFinalHash,row.sourceResultHash,row.childCompletedAt,row.completedAt,...(simon?[row.simon?.mapping??null,row.simon?.color??null,row.simon?.stimulusSide??null,row.simon?.requiredSide??null,row.simon?.correct??null,row.simon?.technicallyValid??null]:[]),...(variants?variantAuditValues(row):[])])
  const csv=tableToCsv(columns,records,COGNITIVE_TRIAL_PAGE_ROWS)
  const codebook=columns.map(field=>({field,
    unit:field==='rt'||field.endsWith('_perf_ms')||field==='duration_ms'?'ms':null,
    meaning:field==='rt'?'Monotonic-clock software-observed response latency; null is not zero'
      :field==='rt_missing_reason'?'NO_GO_WITHHELD is legal withholding; GO_OMISSION/OMISSION indicate missed response; TECHNICALLY_INVALID is not behavioral omission'
        :field==='phase'?'Persisted task phase; this fixed protocol stores formal test trials only; practice is not exported'
          :field==='stimulus_code'?'Frozen protocol stimulus: go/nogo class or Simon color_side; not a physical display-onset measurement'
            :field==='response'?'Go/No-Go: derived RESPONDED flag. Simon: accepted left/right response side; no physical device timestamp is claimed'
            :field==='random_seed'?'Authorized researcher-only sequence reproduction material'
              :field==='administration_provenance'?'Stored coarse device/input/timing environment, not physical timing attestation'
                :field==='completion_status'?'COMPLETE and COMPLETE_EARLY are distinct parent FINAL statuses'
                  :field.endsWith('_at_utc')?'Server UTC receipt time, not a reaction-time clock':field,
  }))
  return {csv,codebook,manifest:{schemaVersion:2 as const,format:'COGNITIVE_TRIAL_LONG' as const,
    ...(source.variantConfigurations?.length?{variantConfigurations:source.variantConfigurations}:{}),
    projectId,waveIds:[waveId],cutOff:source.cutOff,rowCount:rows.length,columnCount:columns.length,
    sourceDigest:canonicalHash(rows.map(row=>({parent:row.sourceFinalHash,child:row.sourceResultHash,
      slot:row.instrumentKey,epoch:row.epoch,phase:row.phase,index:row.trialIndex}))),
    dataDigest:canonicalHash(csv),codebookDigest:canonicalHash(codebook),formulaGuard:'EXCEL_APOSTROPHE_PREFIX' as const,
    trialPage:{offset:source.cognitivePage?.offset??0,nextOffset:source.cognitivePage?.nextOffset??null,
      maxRows:COGNITIVE_TRIAL_PAGE_ROWS,maxEstimatedBytes:COGNITIVE_TRIAL_PAGE_BYTES,
      estimatedBytes:source.cognitivePage?.estimatedBytes??0},
    authority:'IMMUTABLE_CHILD_RAW_REFERENCED_BY_ELIGIBLE_PARENT_FINAL',
    timingProvenance:'MONOTONIC_SOFTWARE_OBSERVED_MS_NOT_PHYSICAL_ONSET',
    missingRtPolicy:'NULL_WITH_REASON_NEVER_ZERO',
  }}
}
export type CognitiveTrialExport=ReturnType<typeof cognitiveTrialLongExport>
