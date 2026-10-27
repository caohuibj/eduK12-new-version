import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { ANT_GUIDED_IDENTITY } from './protocol'
import { antGuidedDefinition } from './package'

/** New exact teaching identity only; historical ANT reports keep their original frozen wording. */
export function createAntGuidedPresentation():CognitiveParticipantPresentationV1 {
  const metrics=Object.fromEntries(Object.entries(antGuidedDefinition.metrics).map(([key,value])=>[key,{label:value.label,
    explanation:key==='accuracy'?'本次正式作答中答对的比例，练习不计入。':key.includes('MeanRt')
      ?`${value.label}，仅使用答对且技术记录完整的正式回应；条件差值保留正负号。`
      :`${value.label}，按本次正式记录及该条件的实际分母展示，练习不计入。` }]))
  return {schemaVersion:1,presentationVersion:'1.0.0',testType:ANT_GUIDED_IDENTITY.testType,
    engineVersion:ANT_GUIDED_IDENTITY.engineVersion,scoringVersion:ANT_GUIDED_IDENTITY.scoringVersion,
    title:antGuidedDefinition.report.title,metrics,hiddenMetrics:[],singleHiddenMetrics:[],
    disclaimer:antGuidedDefinition.report.disclaimer,suppressTips:false,practicalTips:[...antGuidedDefinition.report.practicalTips],
    protocols:{research:{tier:'PILOT',profileLabel:'科研版',participantConclusion:'以下为本次正式条件记录，可结合研究设计用于分析；本项目实现、人群及设备的适用证据需分别说明。',reportCaveats:[...antGuidedDefinition.profiles.research!.reportCaveats]},
      experience:{tier:'PILOT',profileLabel:'实用版',participantConclusion:'以下为本次精简测量的正式记录，可供实际工作中的观察与交流；具体用途所需的精度与适用证据应一并考虑。',reportCaveats:[...antGuidedDefinition.profiles.experience!.reportCaveats]}},
  }
}
