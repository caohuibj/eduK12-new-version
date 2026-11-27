import { renderGovernedFormCompletion } from '../form/disclosure'
import { reportTemplateSchema } from '../measurement-content/report-template'
import {blockedSurveyNativeInstruments} from '../bundle-product/survey-native-admission'
import {savedSurveyNativeFeedback} from '../bundle-product/survey-native'
import type {FrozenGovernedPackage} from './publication.service'
import type {ResearchFrozenUnit} from './publication.service'
import type {SurveyComputedFinal} from './final.compute'
import {rawParticipantFeedback} from './participant-feedback'
import {cognitiveParticipantFeedback} from './measurement.result'

import type { SurveyRenderedDeclaredReport } from './participant-declared-report'

type RawFeedback = Exclude<NonNullable<ReturnType<typeof rawParticipantFeedback>>, { pending: true }> & {
  declaredReport?: SurveyRenderedDeclaredReport
}
type CognitiveFeedback = Exclude<NonNullable<ReturnType<typeof cognitiveParticipantFeedback>>, { pending: true }>
type Feedback = RawFeedback | CognitiveFeedback
type FormCompletion = { instrumentKey: string; title: string; report: SurveyRenderedDeclaredReport }
export function mayShowSurveyFormCompletion(unit: ResearchFrozenUnit) {
  return unit.kind==='FORM' && unit.sourceProvenance?.formCompletionTemplate!==undefined
}
export type SurveyParticipantFeedbackProjection =
  | { kind: 'GENERAL_ONLY' }
  | { kind: 'DESCRIPTIVE'; measurements: Feedback[]; pending: boolean; nativeBundles?: ReturnType<typeof savedSurveyNativeFeedback>; formCompletions?: FormCompletion[] }

/** The same existing disclosure projectors for a freshly accepted result and
 * an independently authorized saved-result read. No scoring, DB or authority
 * cache; callers must establish their own current authorization boundary. */
export function projectSurveyParticipantFeedback(units:readonly ResearchFrozenUnit[],result:SurveyComputedFinal,collectionClosed:boolean,packages:readonly FrozenGovernedPackage[]=[]):SurveyParticipantFeedbackProjection|null{
  const measurements:Feedback[]=[];let pending=false
  const blocked=blockedSurveyNativeInstruments(packages,result)
  for(const unit of units.filter(unit=>!blocked.has(unit.instrumentKey)&&(unit.kind==='COGNITIVE'||unit.participantFeedback?.mode==='DESCRIPTIVE'))){
    const stored=result.units.find(candidate=>candidate.instrumentKey===unit.instrumentKey)
    if(!stored)return null
    const feedback=unit.kind==='COGNITIVE'?cognitiveParticipantFeedback(unit,stored,collectionClosed):
      rawParticipantFeedback(unit,stored,collectionClosed)
    if(feedback?.pending)pending=true
    else if(feedback)measurements.push(feedback)
  }
  const formCompletions:FormCompletion[]=[]
  for(const unit of units.filter(mayShowSurveyFormCompletion)){
    if(blocked.has(unit.instrumentKey))continue
    const stored=result.units.find(candidate=>candidate.instrumentKey===unit.instrumentKey)
    if(!stored||stored.kind!=='FORM'||stored.sourceDigest!==unit.sourceDigest)return null
    if(stored.notExecuted)continue
    const template=reportTemplateSchema.parse(unit.sourceProvenance!.formCompletionTemplate)
    const report=renderGovernedFormCompletion(template,unit.sourceProvenance,'respondent')
    if(report)formCompletions.push({instrumentKey:unit.instrumentKey,title:unit.title,report})
  }
  const nativeBundles=savedSurveyNativeFeedback(packages,result,new Map(measurements.map(m=>[m.instrumentKey,new Set(m.metrics.map(v=>v.key))])))
  return measurements.length||pending||formCompletions.length?{kind:'DESCRIPTIVE' as const,measurements,pending,...(nativeBundles.length?{nativeBundles}:{}),...(formCompletions.length?{formCompletions}:{})}:{kind:'GENERAL_ONLY' as const}
}
