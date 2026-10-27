import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'
import {PVT_IDENTITY} from './protocol'
import {pvtDefinition as d} from './package'
export function createPvtPresentation():CognitiveParticipantPresentationV1{
  const hidden=Object.keys(d.metrics)
  return {schemaVersion:1,presentationVersion:'0.1.0',testType:PVT_IDENTITY.testType,engineVersion:PVT_IDENTITY.engineVersion,scoringVersion:PVT_IDENTITY.scoringVersion,title:d.report.title,metrics:{},hiddenMetrics:hidden,singleHiddenMetrics:[...hidden],disclaimer:d.report.disclaimer,suppressTips:false,practicalTips:[...d.report.practicalTips],protocols:{research:{tier:'PILOT',profileLabel:'科研版',participantConclusion:'600秒随机等待中的本次回应描述，无诊断或常模推断。',reportCaveats:[...d.profiles.research!.reportCaveats]},experience:{tier:'PILOT',profileLabel:'实用版',participantConclusion:'180秒自定义短版，采样少，不代表稳定能力。',reportCaveats:[...d.profiles.experience!.reportCaveats]}}}
}
