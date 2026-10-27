import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'
import {numberSeriesDefinition as d} from './package'
/** Generic presentation hides all research metrics; the candidate report consumes only its explicit projection. */
export function createNumberSeriesPresentation():CognitiveParticipantPresentationV1 {
  return {schemaVersion:1,presentationVersion:'0.1.0',testType:d.testType,engineVersion:d.engineVersion,scoringVersion:d.scoringVersion,title:d.report.title,metrics:{},hiddenMetrics:Object.keys(d.metrics),singleHiddenMetrics:Object.keys(d.metrics),disclaimer:d.report.disclaimer,suppressTips:true,practicalTips:[],protocols:{research:{tier:'PILOT',profileLabel:'科研版',participantConclusion:'24题、先教规则再应用；不作智力等价判断。',reportCaveats:[...d.profiles.research!.reportCaveats]},experience:{tier:'PILOT',profileLabel:'体验版',participantConclusion:'12题精简记录，不继承长版效度。',reportCaveats:[...d.profiles.experience!.reportCaveats]}}}
}
