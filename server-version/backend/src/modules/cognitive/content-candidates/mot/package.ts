import type { TaskDefinition, MetricDefinition, QualityDefinition } from '../../v2/types'
import { createSessionConfigSnapshot } from '../../v2/session-snapshot'
import { MOT_IDENTITY, motConfig, type MotConfig, type MotProfile, type MotTrial } from './protocol'
import { motConfigSchema, motTrialSchema } from './schema'
import { scoreMot } from './scorer'

const allGates = ['unreliableSpeed1','unreliableSpeed4','unreliableSpeed8']
const metric = (key:string,label:string,unit:MetricDefinition['unit'],role:MetricDefinition['role'],
  gates:string[] = [],valueType:MetricDefinition['valueType']='number'):MetricDefinition => ({
  key,label,category:'attention',construct:'dynamic_tracking',description:label,unit,valueType,
  direction:'descriptive',visibility:role==='research_only'?'research_only':role==='primary'?'user':'detail',
  role,availableProfiles:['research','experience'],referenceEligible:false,requiresQualityFlags:gates,
  export:{summary:role!=='research_only',label},
})
const metrics:Record<string,MetricDefinition> = {
  meanTrackedTargets:metric('meanTrackedTargets','平均找回目标数','count','primary',allGates),
  trackingAccuracy:metric('trackingAccuracy','正确追踪比例','ratio','secondary',allGates),
  expectedTrialCount:metric('expectedTrialCount','计划正式次数','count','quality'),
  receivedTrialCount:metric('receivedTrialCount','已收到正式次数','count','quality'),
  validTrialCount:metric('validTrialCount','有效正式次数','count','quality'),
  excludedTrialCount:metric('excludedTrialCount','技术排除次数','count','quality'),
  excludedTrialReasons:metric('excludedTrialReasons','技术排除原因','map','research_only',[],'object'),
  excludedTrialIndices:metric('excludedTrialIndices','技术排除序号','map','research_only',[],'array'),
}
metrics.meanTrackedTargets.visibility='headline'
const quality:Record<string,QualityDefinition> = {
  noInterpretableCondition:{key:'noInterpretableCondition',label:'无可解释条件',description:'所有速度的完整有效记录均不足。',effect:'invalid'},
  incompleteRecords:{key:'incompleteRecords',label:'正式记录未完成',description:'未达到冻结的正式试次数。',effect:'limited'},
}
for (const speed of [1,4,8]) {
  const gate='unreliableSpeed'+speed
  quality[gate]={key:gate,label:'速度'+speed+'记录受限',description:'该速度的完整有效记录不足，隐藏该速度指标。',effect:'limited'}
  metrics['meanTargetsSpeed'+speed]=metric('meanTargetsSpeed'+speed,'速度'+speed+'平均找回目标数','count','primary',[gate])
  metrics['accuracySpeed'+speed]=metric('accuracySpeed'+speed,'速度'+speed+'正确追踪比例','ratio','secondary',[gate])
  for (const prefix of ['validTrialsSpeed','totalTrialsSpeed','observedTrialsSpeed'])
    metrics[prefix+speed]=metric(prefix+speed,prefix+speed,'count','quality')
}
/** Native v2 candidate only: intentionally absent from the legacy/generated registry. */
export const motDefinition:TaskDefinition<MotConfig,MotTrial> = {
  schemaVersion:1,testType:'mot',name:'多目标追踪',category:'attention',
  engineVersion:MOT_IDENTITY.engineVersion,scoringVersion:MOT_IDENTITY.scoringVersion,
  configSchema:motConfigSchema as TaskDefinition<MotConfig,MotTrial>['configSchema'],
  trialSchema:motTrialSchema as TaskDefinition<MotConfig,MotTrial>['trialSchema'],
  protocol:{schemaVersion:1,key:'mot/1.1.0/1.1.0',version:'1.1.0',clock:'performance',
    randomizationAlgorithmVersion:MOT_IDENTITY.randomizationAlgorithmVersion,trialEnvelopeVersion:1,
    phases:[{key:'test',persists:true,required:true}],measurementCriticalConfigPaths:['*']},
  scorer:scoreMot,finalSubmission:{maxTrials:config=>config.totalTrials},
  profiles:{
    research:{estimatedMinutes:[9,15],configPatch:{...motConfig('research')},
      reportCaveats:['文献对照的本项目实现；无适用常模，不生成能力等级。']},
    experience:{estimatedMinutes:[2,5],configPatch:{...motConfig('experience')},
      reportCaveats:['每速度仅3次，是项目暂定短版；记录不代表稳定能力。']},
  },
  metrics,quality,references:[],
  report:{schemaVersion:1,version:'1.1.0',title:'这次的追踪记录',
    headlineMetrics:['meanTrackedTargets'],userMetrics:[1,4,8].map(s=>'meanTargetsSpeed'+s),
    detailMetrics:['trackingAccuracy','validTrialCount','excludedTrialCount'],
    practicalTips:['把设备放稳，关闭通知，让目光能持续留在画面上。'],
    disclaimer:'这里只描述本轮任务，不代表日常最多能同时注意几件事。'},
  publication:{status:'DRAFT',referenceRequired:false,evidenceNote:'未注册候选；产品准入由平台真实生命周期决定。'},
}
export const createMotSnapshot = (profile:MotProfile,frozenAt='2026-10-26T00:00:00.000Z') =>
  createSessionConfigSnapshot({definition:motDefinition,configVersion:MOT_IDENTITY.configVersion,
    config:motConfig(profile),frozenAt:new Date(frozenAt)})

export {motContent} from './metadata'
export {motTrialEnvelope} from './trial-envelope'
export {motCatalogTags,motCatalogSearchText,motCatalogIntegration} from './catalog'
