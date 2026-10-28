import type {ResearchFrozenUnit} from './publication.service'
import type {SurveyComputedFinal} from './final.compute'
import {rawParticipantFeedback} from './participant-feedback'
import {cognitiveParticipantFeedback} from './measurement.result'

type Feedback=Exclude<NonNullable<ReturnType<typeof rawParticipantFeedback>|ReturnType<typeof cognitiveParticipantFeedback>>,{pending:true}>
type FeedbackProjection={kind:'GENERAL_ONLY'}|{kind:'DESCRIPTIVE';measurements:Feedback[];pending:boolean}

/** The same existing disclosure projectors for a freshly accepted result and
 * an independently authorized saved-result read. No scoring, DB or authority
 * cache; callers must establish their own current authorization boundary. */
export function projectSurveyParticipantFeedback(units:readonly ResearchFrozenUnit[],result:SurveyComputedFinal,collectionClosed:boolean):FeedbackProjection|null{
  const measurements:Feedback[]=[];let pending=false
  for(const unit of units.filter(unit=>unit.kind==='COGNITIVE'||unit.participantFeedback?.mode==='DESCRIPTIVE')){
    const stored=result.units.find(candidate=>candidate.instrumentKey===unit.instrumentKey)
    if(!stored)return null
    const feedback=unit.kind==='COGNITIVE'?cognitiveParticipantFeedback(unit,stored,collectionClosed):
      rawParticipantFeedback(unit,stored,collectionClosed)
    if(feedback?.pending)pending=true
    else if(feedback)measurements.push(feedback)
  }
  return measurements.length||pending?{kind:'DESCRIPTIVE' as const,measurements,pending}:{kind:'GENERAL_ONLY' as const}
}
