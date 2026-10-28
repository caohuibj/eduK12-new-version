import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'
import {SPATIAL_IDENTITY} from './protocol'
import {spatialMemoryDefinition as d} from './package'
/** Factory supplied with the content package; product factory registration is intentionally deferred. */
export function createSpatialMemoryPresentation():CognitiveParticipantPresentationV1{return {schemaVersion:1,presentationVersion:'0.1.1',testType:SPATIAL_IDENTITY.testType,
  engineVersion:SPATIAL_IDENTITY.engineVersion,scoringVersion:SPATIAL_IDENTITY.scoringVersion,title:d.report.title,
  metrics:Object.fromEntries(Object.entries(d.metrics).map(([key,m])=>[key,{label:m.label,explanation:m.description}])),metricFormats:Object.fromEntries([1,5].flatMap(size=>['MeanAbsoluteErrorDeg','MedianAbsoluteErrorDeg'].map(suffix=>['set'+size+suffix,{kind:'quantity' as const,unit:'deg' as const,suffix:'°' as const}]))),hiddenMetrics:[],singleHiddenMetrics:[],
  disclaimer:d.report.disclaimer,suppressTips:false,practicalTips:[...d.report.practicalTips],protocols:{
    research:{tier:'PILOT',profileLabel:'科研版',participantConclusion:'本次正式位置再现记录，可结合研究设计分析；不提供容量或人群排名。',reportCaveats:[...d.profiles.research!.reportCaveats]},
    experience:{tier:'PILOT',profileLabel:'实用版',participantConclusion:'本次精简位置记录，可供观察与交流；工作用途需考虑精度与适用证据。',reportCaveats:[...d.profiles.experience!.reportCaveats]}}}}
