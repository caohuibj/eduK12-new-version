import type {TaskDefinition,MetricDefinition,QualityDefinition} from '../../v2/types'
import {createSessionConfigSnapshot} from '../../v2/session-snapshot'
import {NUMBER_SERIES_IDENTITY,NUMBER_SERIES_PROTOCOL,numberSeriesConfig,freeze,type Profile,type NumberSeriesConfig,type NumberSeriesRaw} from './protocol'
import {numberSeriesConfigValidator,numberSeriesRawValidator} from './validation'
import {scoreNumberSeries} from './scorer'
import {NUMBER_SERIES_COPY} from './report'
const metrics:Record<string,MetricDefinition>={}
for(const [key,label] of Object.entries({counts:'实际计划/呈现/机会/对错/跳过/中断量',conditions:'分条件实际计数与正确题用时',accuracy:'正确数/完整机会数',skipRate:'明确跳过数/完整机会数',correctRtMs:'正确题软件用时中位数',conditionRates:'分条件实际机会率',growingMinusAdditionAccuracy:'递增差值减等差正确率（有符号）',growingMinusAdditionRtMs:'递增差值减等差用时（有符号）',reportBinding:'冻结版本组合'})){
  const object=['counts','conditions','conditionRates','reportBinding'].includes(key)
  metrics[key]={key,label,description:label,category:'reasoning',construct:'taught_number_rule_application',unit:object?'map':key.endsWith('Ms')?'ms':'ratio',valueType:object?'object':'number',direction:key.startsWith('growing')?'signed':'descriptive',visibility:'research_only',role:'research_only',availableProfiles:['research','experience'],referenceEligible:false,export:{summary:false,label}}
}
const quality:Record<string,QualityDefinition>={noCompleteOpportunities:{key:'noCompleteOpportunities',label:'没有完整机会记录',description:'不把未呈现或中断当0分。',effect:'invalid'},incompletePlan:{key:'incompletePlan',label:'计划未完整完成',description:'保留原件，公开反馈限状态。',effect:'limited'},technicalInterruption:{key:'technicalInterruption',label:'存在实际中断',description:'公开正文、图片及下载同时限状态。',effect:'limited'}}
export const numberSeriesDefinition:TaskDefinition<NumberSeriesConfig,NumberSeriesRaw>={
  schemaVersion:1,...NUMBER_SERIES_IDENTITY,name:'数列规则推理',category:'reasoning',protocol:NUMBER_SERIES_PROTOCOL,
  configSchema:numberSeriesConfigValidator,trialSchema:numberSeriesRawValidator,scorer:scoreNumberSeries,finalSubmission:{maxTrials:c=>c.totalItems},metrics,quality,references:[],
  profiles:{research:{estimatedMinutes:[9,15],configPatch:numberSeriesConfig('research'),reportCaveats:['24原创题，三类各8题。先教规则再应用；科研版难度未有儿童实证标定，不继承文献信效度。']},experience:{estimatedMinutes:[6,9],configPatch:numberSeriesConfig('experience'),reportCaveats:['12原创题，每类4题，为24题库预先指定子集；短版等值性与精度未验证。']}},
  report:{schemaVersion:1,version:'0.1.0',title:NUMBER_SERIES_COPY.zh.title,headlineMetrics:[],userMetrics:[],detailMetrics:[],disclaimer:NUMBER_SERIES_COPY.zh.limit,practicalTips:[NUMBER_SERIES_COPY.zh.tip]},
  publication:{status:'DRAFT',referenceRequired:false,evidenceNote:'用户已批准24/12与3题练习图审；独立内容候选待DOT复核，未接入。所有内部指标不进入通用公开报告/导出；使用本项显式三态投影。'},
}
export function createNumberSeriesSnapshot(profile:Profile,frozenAt=new Date().toISOString()) {
  return freeze(createSessionConfigSnapshot({definition:numberSeriesDefinition,configVersion:NUMBER_SERIES_IDENTITY.configVersion,config:numberSeriesConfig(profile),frozenAt:new Date(frozenAt)}))
}
export {projectNumberSeriesReport} from './report'
export {numberSeriesContent} from './metadata'
