import { assessmentImagePresentationListSchema } from '../assessment-media/assessment-image-presentation'
import {z} from 'zod'
import type {ResearchFrozenUnit} from './publication.service'
import type {FrozenUnitResult} from './final.compute'
import {SurveyWaveError} from './waves.service'

/** Independent disclosure policy; absence on a frozen publication means GENERAL. */
export const surveyRawFeedbackSchema=z.object({
  policyVersion:z.literal('SURVEY_RAW_METRICS_V1'),
  mode:z.enum(['GENERAL','DESCRIPTIVE']).default('GENERAL'),
  metricKeys:z.array(z.string().trim().min(1).max(240)).max(128).default([]),
  release:z.enum(['AFTER_FINAL','AFTER_COLLECTION']).default('AFTER_FINAL'),
}).strict().superRefine((v,ctx)=>{
  if(new Set(v.metricKeys).size!==v.metricKeys.length||
    (v.mode==='GENERAL'?v.metricKeys.length>0:v.metricKeys.length===0))
    ctx.addIssue({code:'custom',message:'反馈指标必须唯一，且与显式反馈模式一致'})
})
export const surveyParticipantFeedbackSelectionsSchema=z.array(z.object({
  instrumentId:z.string().uuid(),feedback:surveyRawFeedbackSchema,
}).strict()).max(30).refine(v=>new Set(v.map(x=>x.instrumentId)).size===v.length)
export type SurveyParticipantFeedbackSelection=z.infer<typeof surveyParticipantFeedbackSelectionsSchema>[number]
export type SurveyRawFeedback=z.infer<typeof surveyRawFeedbackSchema>
/** Called only inside the authenticated publication freeze, using resolved
 * measurement-release metrics. Does not change measurement identity or scoring. */
export function freezeSurveyParticipantFeedback(units:ResearchFrozenUnit[],raw:unknown,
  metricsByInstrument:ReadonlyMap<string,readonly string[]>):void{
  for(const selection of surveyParticipantFeedbackSelectionsSchema.parse(raw)){
    const unit=units.find(u=>u.draftId===selection.instrumentId)
    const metrics=metricsByInstrument.get(selection.instrumentId)
    if(!unit||!['SCALE','SJT'].includes(unit.kind)||!unit.measurementRelease||!metrics||
      selection.feedback.metricKeys.some(key=>!metrics.includes(key)))
      throw new SurveyWaveError(400,'被试反馈只允许显式选择当前量表或情境测验的已发布指标')
    unit.participantFeedback=selection.feedback
  }
}
const savedFeedbackSchema=z.array(z.object({scoreKey:z.string(),rangeKey:z.string().nullable(),
  text:z.string(),images:assessmentImagePresentationListSchema.optional(),
}).strict())
const recordedScores=z.object({
  scores:z.array(z.object({key:z.string(),value:z.number().finite().nullable(),status:z.string()}).passthrough()),
  quality:z.object({status:z.string()}).passthrough(),
}).passthrough()
/** Project saved authoritative scores only. No scorer, reference resolver,
 * template rendering, population inference, or private result spreading. */
export function rawParticipantFeedback(unit:ResearchFrozenUnit,result:FrozenUnitResult,collectionClosed:boolean){
  if(!['SCALE','SJT'].includes(unit.kind)||!unit.participantFeedback||result.notExecuted)return null
  const policy=surveyRawFeedbackSchema.parse(unit.participantFeedback)
  if(policy.mode!=='DESCRIPTIVE')return null
  if(policy.release==='AFTER_COLLECTION'&&!collectionClosed)return {pending:true as const}
  if(result.instrumentKey!==unit.instrumentKey||result.kind!==unit.kind||result.sourceDigest!==unit.sourceDigest||
    result.scoringDigest!==unit.scoringDigest||!unit.measurementRelease)
    throw new Error('Stored participant score identity mismatch')
  // Recheck the frozen executable allowlist, rather than trusting arbitrary
  // keys in either the disclosure policy or stored scoring payload.
  const definition=unit.compiledDefinition as {scoring?:{scores?:Array<{key:string}>;publishedMetrics?:Array<{key:string}>}}
  const defined=unit.kind==='SCALE'?definition.scoring?.scores:definition.scoring?.publishedMetrics
  if(!defined||policy.metricKeys.some(key=>!defined.some(metric=>metric.key===key)))
    throw new Error('Frozen participant metric policy mismatch')
  const saved=result.privateScoring as {scores?:unknown;metrics?:unknown;quality?:unknown;rawScoreFeedback?:unknown}|null
  const parsed=recordedScores.safeParse({scores:unit.kind==='SCALE'?saved?.scores:saved?.metrics,quality:saved?.quality})
  if(!parsed.success||parsed.data.quality.status!=='interpretable')return null
  const scores=parsed.data.scores
  if(new Set(scores.map(score=>score.key)).size!==scores.length)return null
  const metrics=policy.metricKeys.flatMap(key=>{
    const score=scores.find(s=>s.key===key)
    return score?.status==='calculated'&&score.value!==null
      ?[{key,label:key,value:score.value,unit:null,status:'OK' as const}]:[]
  })
  if(!metrics.length)return null
  // Display only saved matches for the same already-authorized metrics. Never
  // rerender current definitions on read or disclose unselected interval rules.
  const feedback=savedFeedbackSchema.safeParse(saved?.rawScoreFeedback)
  const rawScoreFeedback=unit.kind==='SCALE'&&feedback.success
    ?feedback.data.filter(item=>metrics.some(metric=>metric.key===item.scoreKey)):[]
  return {feedbackKind:'RAW_METRICS' as const,pending:false as const,instrumentKey:unit.instrumentKey,title:unit.title,
    measurementReleaseId:unit.measurementRelease.releaseId,metrics,...(rawScoreFeedback.length?{rawScoreFeedback}:{}),quality:'interpretable' as const}
}
