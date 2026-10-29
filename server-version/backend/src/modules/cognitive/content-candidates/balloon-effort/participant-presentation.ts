import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'
import {EFFORT_IDENTITY} from './protocol'
import {balloonEffortDefinition as d} from './package'
/** Factory is part of the content handoff, intentionally not registered into the product. */
export function createBalloonEffortPresentation():CognitiveParticipantPresentationV1{return {schemaVersion:1,presentationVersion:'0.1.0',testType:EFFORT_IDENTITY.testType,engineVersion:EFFORT_IDENTITY.engineVersion,scoringVersion:EFFORT_IDENTITY.scoringVersion,
 title:d.report.title,metrics:Object.fromEntries(Object.entries(d.metrics).map(([key,v])=>[key,{label:v.label,explanation:v.description}])),hiddenMetrics:[],singleHiddenMetrics:[],disclaimer:d.report.disclaimer,suppressTips:false,practicalTips:[...d.report.practicalTips],
 protocols:{research:{tier:'PILOT',profileLabel:'科研版',participantConclusion:'本次条件选择及执行记录，研究解释需结合激励和设备条件；不评价动力或人格。',reportCaveats:[...d.profiles.research!.reportCaveats]},
 experience:{tier:'PILOT',profileLabel:'实用版',participantConclusion:'本次18轮条件取舍记录，可供观察交流；每条件一次不代表稳定偏好。',reportCaveats:[...d.profiles.experience!.reportCaveats]}}}}
