import type { TaskDefinition,MetricDefinition,QualityDefinition } from '../../v2/types'
import { createSessionConfigSnapshot } from '../../v2/session-snapshot'
import { ANT_IDENTITY,ANT_PROTOCOL,CUES,FLANKERS,antConfig,type AntConfig,type AntTrial,type AntProfile,type NeutralVariant } from './protocol'
import { antConfigSchema,antTrialSchema } from './schema'
import { scoreAnt } from './scorer'
const metric=(key:string,label:string,unit:MetricDefinition['unit'],role:MetricDefinition['role'],
  gates:string[]=[],valueType:MetricDefinition['valueType']='number'):MetricDefinition=>({
  key,label,category:'attention',construct:'cue_flanker_condition_record',description:label,unit,valueType,
  direction:'descriptive',visibility:role==='primary'?'headline':role==='research_only'?'research_only':'detail',
  role,availableProfiles:['research','experience'],referenceEligible:false,requiresQualityFlags:gates,
  export:{summary:role!=='research_only',label},
})
const metrics:Record<string,MetricDefinition>={
  accuracy:metric('accuracy','本轮正式试次正确比例','ratio','primary',['noInterpretableCondition','incompleteAccuracy']),
  expectedTrialCount:metric('expectedTrialCount','计划正式次数','count','quality'),
  receivedTrialCount:metric('receivedTrialCount','已收到正式次数','count','quality'),
  validTrialCount:metric('validTrialCount','技术合格正式次数','count','quality'),
  excludedTrialCount:metric('excludedTrialCount','技术排除次数','count','quality'),
}
for(const [key,label,type] of [
  ['cueRecords','线索条件原始汇总','object'],['flankerRecords','侧翼条件原始汇总','object'],
  ['inputSourcesObserved','实际响应输入来源','array'],['correctRtByInput','按输入分开的正确反应均值','object'],
  ['differencesByInput','按输入分开的有符号条件差值','object'],['excludedTrialReasons','技术排除原因','object'],
] as const)metrics[key]=metric(key,label,'map','research_only',[],type)
const nativeConditionKeys:string[]=[],nativeDenominatorKeys:string[]=[]
const cueLabels:Record<string,string>={none:'无提示',central:'中央提示',double:'双位置提示',spatial_valid:'空间提示'}
const flankerLabels:Record<string,string>={congruent:'两侧方向相同',incongruent:'两侧方向相反',neutral:'两侧无方向提示'}
for(const [group,keys,labels] of [['cue',CUES,cueLabels],['flanker',FLANKERS,flankerLabels]] as const)
  for(const condition of keys){
    const gate=(group==='cue'?'incompleteCue_':'incompleteFlanker_')+condition
    for(const [part,label,unit] of [
      ['Accuracy','正确比例','ratio'],['CorrectMeanRtMs','答对时平均用时','ms'],
    ] as const){
      const key=`${group}${part}_${condition}`
      metrics[key]=metric(key,labels[condition]+'：'+label,unit,'secondary',
        ['noInterpretableCondition',gate,...(part==='CorrectMeanRtMs'?['mixedInput']:[])])
      metrics[key].visibility='user';nativeConditionKeys.push(key)
    }
    for(const [part,label] of [['CorrectCount','答对次数'],['ValidCount','有效次数'],['ExpectedCount','计划次数'],['CorrectRtCount','用于平均用时的正确回应次数']] as const){
      const key=`${group}${part}_${condition}`
      metrics[key]=metric(key,labels[condition]+'：'+label,'count','quality',['noInterpretableCondition',gate])
      nativeDenominatorKeys.push(key)
    }
  }
for(const [cost,label] of [['alerting','无提示−双位置提示'],['orienting','中央−空间提示'],['conflict','两侧方向相反−相同']] as const){
  const gates=['noInterpretableCondition','mixedInput','unavailable_'+cost],key=cost+'MeanRtDifferenceMs'
  metrics[key]=metric(key,label+'：正确反应平均用时差','ms','secondary',gates)
  metrics[key].direction='signed';metrics[key].visibility='user';nativeConditionKeys.push(key)
  for(const [part,name] of [['FirstCorrectCount','前项正确回应次数'],['SecondCorrectCount','后项正确回应次数']] as const){
    const countKey=cost+part;metrics[countKey]=metric(countKey,label+'：'+name,'count','quality',gates)
    nativeDenominatorKeys.push(countKey)
  }
}
const quality:Record<string,QualityDefinition>={
  noInterpretableCondition:{key:'noInterpretableCondition',label:'无完整线索条件',description:'至少一个线索条件须达到冻结计划中的全部有效次数；这是项目保守完整性规则。',effect:'invalid'},
  incompleteRecords:{key:'incompleteRecords',label:'正式记录不完整',description:'收到的正式次数不足计划。',effect:'limited'},
  incompleteAccuracy:{key:'incompleteAccuracy',label:'全局准确率受限',description:'全局分母未达到完整冻结计划，隐藏全局准确率。',effect:'limited'},
  mixedInput:{key:'mixedInput',label:'输入来源混用',description:'触控、鼠标与键盘RT不合并；本轮隐藏条件RT比较。',effect:'limited'},
}
for(const [prefix,values] of [['incompleteCue_',CUES],['incompleteFlanker_',FLANKERS]] as const)
  for(const value of values){const key=prefix+value;quality[key]={key,label:'条件记录不足',description:'该条件未达到冻结计划的技术有效次数，隐藏相关指标。',effect:'limited'}}
for(const cost of ['alerting','orienting','conflict']){const key='unavailable_'+cost;quality[key]={key,label:'差值不可用',description:'组成条件不完整、无正确响应或混合输入，隐藏有符号差值。',effect:'limited'}}
/** Deliberately unregistered. No standard alias or legacy numeric score is invented. */
export const antDefinition:TaskDefinition<AntConfig,AntTrial>={
  schemaVersion:1,testType:'ant',name:'线索与箭头注意任务',category:'attention',
  engineVersion:ANT_IDENTITY.engineVersion,scoringVersion:ANT_IDENTITY.scoringVersion,
  configSchema:antConfigSchema as TaskDefinition<AntConfig,AntTrial>['configSchema'],
  trialSchema:antTrialSchema as TaskDefinition<AntConfig,AntTrial>['trialSchema'],protocol:ANT_PROTOCOL,
  scorer:scoreAnt,finalSubmission:{maxTrials:config=>config.totalTrials},metrics,quality,references:[],
  profiles:{
    research:{estimatedMinutes:[23,30],configPatch:{...antConfig('research')},
      reportCaveats:['288正式＋24练习，正式试次最短19.2分钟；是本项目协议变式，无中文/移动端适用常模。']},
    experience:{estimatedMinutes:[6,10],configPatch:{...antConfig('experience')},
      reportCaveats:['48正式＋24练习，理论最短4.8分钟另加指导和休息；每完整条件只有1次，不推断稳定网络能力。']},
  },
  report:{schemaVersion:1,version:ANT_IDENTITY.reportDefinitionVersion,title:'这次的线索与箭头记录',
    headlineMetrics:['accuracy'],userMetrics:nativeConditionKeys,detailMetrics:['validTrialCount','excludedTrialCount',...nativeDenominatorKeys],
    disclaimer:'记录描述本轮操作，不代表日常注意能力或诊断；体验版没有稳定性或招聘预测证据。',
    practicalTips:['把设备放稳，关闭通知，让视线留在中央注视点。']},
  publication:{status:'DRAFT',referenceRequired:false,evidenceNote:'ANT内容候选已含任务前端与native描述性报告合同；未正式注册、入库或接产品保存。standard与legacy准入仍需平台明确处理。'},
}
export const createAntSnapshot=(profile:AntProfile,neutralVariant:NeutralVariant='absent',frozenAt='2026-10-26T00:00:00.000Z')=>
  createSessionConfigSnapshot({definition:antDefinition,configVersion:ANT_IDENTITY.configVersion,
    config:antConfig(profile,neutralVariant),frozenAt:new Date(frozenAt)})
export { antTrialEnvelope } from './protocol'
export { projectAntReport } from './scorer'

export { antContent } from './metadata'
