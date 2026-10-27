import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'
import {SART_IDENTITY} from './protocol'
import {sartDefinition as d} from './package'
/** Generic consumers must not reveal audit/research fields. SART uses its whitelisted public report projection. */
export function createSartPresentation():CognitiveParticipantPresentationV1{
  const hidden=Object.keys(d.metrics)
  return {schemaVersion:1,presentationVersion:'0.1.0',testType:SART_IDENTITY.testType,engineVersion:SART_IDENTITY.engineVersion,scoringVersion:SART_IDENTITY.scoringVersion,title:d.report.title,metrics:{},hiddenMetrics:hidden,singleHiddenMetrics:[...hidden],disclaimer:d.report.disclaimer,suppressTips:false,practicalTips:[...d.report.practicalTips],protocols:{research:{tier:'PILOT',profileLabel:'科研版',participantConclusion:'225次连续数字回应的本次记录，不作诊断或常模推断。',reportCaveats:[...d.profiles.research!.reportCaveats]},experience:{tier:'PILOT',profileLabel:'体验版',participantConclusion:'90次短版仅描述本次，No-Go计划10次，短版精度未核。',reportCaveats:[...d.profiles.experience!.reportCaveats]}}}
}
