import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'
import {RECOGNITION_GUIDED_IDENTITY} from './practice'
import {guidedRecognitionDefinition} from './package'
/** New exact identity only; names and caveats freeze with the assignment, not on historical reads. */
export function createRecognitionGuidedPresentation():CognitiveParticipantPresentationV1 {
  return {schemaVersion:1,presentationVersion:'1.0.0',testType:RECOGNITION_GUIDED_IDENTITY.testType,engineVersion:RECOGNITION_GUIDED_IDENTITY.engineVersion,scoringVersion:RECOGNITION_GUIDED_IDENTITY.scoringVersion,title:guidedRecognitionDefinition.report.title,
    metrics:Object.fromEntries(Object.entries(guidedRecognitionDefinition.metrics).map(([key,m])=>[key,{label:m.label,explanation:m.description}])),
    hiddenMetrics:[],singleHiddenMetrics:[],disclaimer:guidedRecognitionDefinition.report.disclaimer,
    suppressTips:false,practicalTips:[...guidedRecognitionDefinition.report.practicalTips],protocols:{
      research:{tier:'PILOT',profileLabel:'科研版',participantConclusion:'以下为本次正式图片识别记录；研究与发表应结合实际研究设计和适用证据。',reportCaveats:[...guidedRecognitionDefinition.profiles.research!.reportCaveats]},
      experience:{tier:'PILOT',profileLabel:'实用版',participantConclusion:'以下为本次精简测量的图片识别记录；工作用途需同时考虑相应精度与适用证据。',reportCaveats:[...guidedRecognitionDefinition.profiles.experience!.reportCaveats]}}}
}
