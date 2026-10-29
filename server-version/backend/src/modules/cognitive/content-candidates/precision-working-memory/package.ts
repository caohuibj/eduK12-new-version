import type {TaskDefinition,MetricDefinition,QualityDefinition,SessionConfigSnapshot} from '../../v2/types'
import {createSessionConfigSnapshot} from '../../v2/session-snapshot'
import {SPATIAL_IDENTITY,SPATIAL_PROTOCOL,spatialConfig,type SpatialConfig,type SpatialRaw,type Profile} from './protocol'
import {spatialConfigSchema,spatialTrialSchema} from './schema'
import {scoreSpatialMemory} from './scorer'
import {SPATIAL_REPORT_COPY} from './report'
const metric=(key:string,label:string,unit:MetricDefinition['unit'],role:MetricDefinition['role']):MetricDefinition=>({key,label,description:label,category:'memory',construct:'colour_cued_spatial_position_estimation',
  unit,valueType:'number',direction:'descriptive',visibility:role==='primary'?'headline':role==='secondary'?'user':'detail',role,availableProfiles:['research','experience'],referenceEligible:false,
  requiresQualityFlags:role==='primary'||role==='secondary'?['noValidRecords']:[],export:{summary:true,label}})
const metrics:Record<string,MetricDefinition>={}
for(const size of [1,5]){
  for(const [suffix,label,unit,role] of [['MeanAbsoluteErrorDeg','平均位置偏差','map','primary'],['MedianAbsoluteErrorDeg','位置偏差中位数','map','secondary'],['ValidCount','有效次数','count','quality'],['ExpectedCount','计划次数','count','quality']] as const){
    const key='set'+size+suffix;metrics[key]={...metric(key,`记${size}个位置：${label}${unit==='map'?'（度）':''}`,unit,role),valueType:unit==='map'?'object':'integer'}
  }
}
for(const key of ['receivedTrialCount','expectedTrialCount','validTrialCount','excludedTrialCount','lateResponseCount'])metrics[key]=metric(key,key,'count','quality')
for(const [key,type] of [['inputSourcesObserved','array'],['reportBinding','object'],['exclusionReasons','object']] as const)metrics[key]={...metric(key,key,'map','research_only'),valueType:type,visibility:'research_only',export:{summary:false,label:key}}
const quality:Record<string,QualityDefinition>={noValidRecords:{key:'noValidRecords',label:'无有效位置记录',description:'没有可解释的正式位置回应，不输出表现结论。',effect:'invalid'},
  incompleteRecords:{key:'incompleteRecords',label:'本轮未完整完成',description:'只描述已完成且有效的条件记录，不推断完整表现。',effect:'limited'},
  technicalLoss:{key:'technicalLoss',label:'部分记录中断',description:'受影响的试次不计入平均；分母如实保留。',effect:'limited'}}
/** Content-only executable candidate. Deliberately NOT added to task-resource/native registry, delivery, seed or archive. */
export const spatialMemoryDefinition:TaskDefinition<SpatialConfig,SpatialRaw>={schemaVersion:1,...SPATIAL_IDENTITY,name:'空间位置精度工作记忆',category:'memory',
  protocol:SPATIAL_PROTOCOL,configSchema:spatialConfigSchema,trialSchema:spatialTrialSchema,scorer:scoreSpatialMemory,finalSubmission:{maxTrials:c=>c.totalTrials},metrics,quality,references:[],
  profiles:{research:{estimatedMinutes:[30,50],configPatch:spatialConfig('research'),reportCaveats:['科研版400正式（两条件各200），次数对齐CNTRACS官方研究实现；颜色、CSS几何与触控确认是项目变式，并非论文等效复现。']},
    experience:{estimatedMinutes:[5,9],configPatch:spatialConfig('experience'),reportCaveats:['实用版40正式（两条件各20），单题协议与科研版相同；工作用途的精度与适用性未验证，不承诺与长版等值。']}},
  report:{schemaVersion:1,version:'0.1.0',title:SPATIAL_REPORT_COPY.zh.title,headlineMetrics:['set1MeanAbsoluteErrorDeg','set5MeanAbsoluteErrorDeg'],
    userMetrics:['set1MedianAbsoluteErrorDeg','set5MedianAbsoluteErrorDeg'],detailMetrics:['set1ValidCount','set1ExpectedCount','set5ValidCount','set5ExpectedCount'],
    disclaimer:SPATIAL_REPORT_COPY.zh.limit,practicalTips:[SPATIAL_REPORT_COPY.zh.tip]},publication:{status:'DRAFT',referenceRequired:false,evidenceNote:'已批准的独立浏览器内容候选；未注册、导入或接入产品。'}}
export const createSpatialMemorySnapshot=(profile:Profile,frozenAt='2026-10-27T00:00:00.000Z'):SessionConfigSnapshot<SpatialConfig>=>
  createSessionConfigSnapshot({definition:spatialMemoryDefinition,configVersion:SPATIAL_IDENTITY.configVersion,config:spatialConfig(profile),frozenAt:new Date(frozenAt)})
export {projectSpatialReport} from './report'
export {spatialMemoryContent} from './metadata'
