import type {TaskDefinition,MetricDefinition,QualityDefinition} from '../../v2/types'
import {createSessionConfigSnapshot} from '../../v2/session-snapshot'
import {IDENTITY,PROTOCOL,configFor,freeze,type Config,type Raw,type Profile} from './protocol'
import {configValidator,rawValidator} from './validation'
import {scoreSerialReactionLearning} from './scorer'
import {COPY} from './report'
const metrics:Record<string,MetricDefinition>={}
for(const [key,label] of Object.entries({counts:'真实呈现、首答、纠正、完成与中断计数',runs:'逐轮条件分母与首答正确用时',firstAccuracy:'首答正确数/实际有首答次数',deltaMs:'对照减重复顺序的有符号毫秒差',reportBinding:'实际冻结组合'}))metrics[key]={key,label,description:label,category:'learning',construct:'serial_visuomotor_performance',unit:key==='deltaMs'?'ms':key==='firstAccuracy'?'ratio':'map',valueType:['firstAccuracy','deltaMs'].includes(key)?'number':key==='runs'?'array':'object',direction:key==='deltaMs'?'signed':'descriptive',visibility:'research_only',role:'research_only',availableProfiles:['research','experience'],referenceEligible:false,export:{summary:false,label}}
const quality:Record<string,QualityDefinition>={}
for(const [key,label] of Object.entries({noFirstResponses:'没有正式首答',incompletePlan:'计划未完整完成',technicalInterruption:'存在实际中断',lowConditionFirstAccuracy:'首答准确率不足以描述时间差',missingContrast:'必要条件没有正确首答时间'}))quality[key]={key,label,description:label+'；不是能力或年龄判断。',effect:key==='noFirstResponses'?'invalid':'limited'}
export const serialReactionLearningDefinition:TaskDefinition<Config,Raw>={schemaVersion:1,...IDENTITY,name:'连续位置序列学习',category:'learning',protocol:PROTOCOL,configSchema:configValidator,trialSchema:rawValidator,scorer:scoreSerialReactionLearning,finalSubmission:{maxTrials:c=>c.totalTrials},metrics,quality,references:[],profiles:{research:{estimatedMinutes:[9,14],configPatch:configFor('research'),reportCaveats:['五轮420次，触屏改造，未继承原研究效度；先保留首答再单记纠正。']},experience:{estimatedMinutes:[4,7],configPatch:configFor('experience'),reportCaveats:['用户确认的两轮168次；保留完整条件，重复更少、等值性与个体解释效度未验证。']}},report:{schemaVersion:1,version:'0.1.0',title:COPY.zh.title,headlineMetrics:[],userMetrics:[],detailMetrics:[],disclaimer:COPY.zh.limit,practicalTips:[COPY.zh.tip]},publication:{status:'DRAFT',referenceRequired:false,evidenceNote:'用户已批准图审并确认2轮168次体验版。独立候选，未DOT复核、未接入；公开报告仅用显式三态投影。'}}
export const createSnapshot=(profile:Profile,frozenAt=new Date().toISOString())=>freeze(createSessionConfigSnapshot({definition:serialReactionLearningDefinition,configVersion:IDENTITY.configVersion,config:configFor(profile),frozenAt:new Date(frozenAt)}))
export {projectReport} from './report'
export {serialReactionLearningContent} from './metadata'
export {finalizeAttempt} from './attempt'
