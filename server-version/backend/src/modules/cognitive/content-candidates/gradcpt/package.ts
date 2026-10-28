import type {TaskDefinition,MetricDefinition,QualityDefinition,SessionConfigSnapshot} from '../../v2/types'
import {createSessionConfigSnapshot} from '../../v2/session-snapshot'
import {GRAD_IDENTITY,GRAD_PROTOCOL,gradConfig,type Profile,type GradConfig,type GradRaw} from './protocol'
import {gradConfigSchema,gradRawSchema} from './schema'
import {scoreGrad} from './scorer'
import {GRAD_COPY} from './report'
const metrics:Record<string,MetricDefinition>={}
for(const [key,label] of Object.entries({cityOmissions:'城市漏按次数',mountainFalseAlarms:'山景误按次数',medianCorrectRT:'正确城市反应中位用时',presentedImageCount:'实际完整呈现图片数',expectedImageCount:'计划正式图片数',statistics:'分母、反应时分布和信号检测统计',inputResponses:'实际输入回应数',ignoredInput:'未计入的物理操作',reportBinding:'冻结报告身份'})){
 const map=['statistics','inputResponses','ignoredInput','reportBinding'].includes(key),ms=key==='medianCorrectRT';metrics[key]={key,label,description:map?'保留真实分母/定义，不生成能力总分。':label,category:'attention',construct:'sustained_monitoring_response_withholding',unit:map?'map':ms?'ms':'count',valueType:map?'object':ms?'number':'integer',direction:'descriptive',visibility:map?'research_only':'headline',role:map?'research_only':'primary',availableProfiles:['research','experience'],referenceEligible:false,export:{summary:!map,label}}}
const quality:Record<string,QualityDefinition>={noSettledImages:{key:'noSettledImages',label:'没有可确定的正式图片记录',description:'不输出表现结论。',effect:'invalid'},incompleteSequence:{key:'incompleteSequence',label:'序列未完整执行',description:'只解释实际呈现且晚反应窗口已关闭的部分。',effect:'limited'},technicalRecord:{key:'technicalRecord',label:'存在技术中断',description:'如实保留原件和受影响范围，不因单帧误差判定。',effect:'limited'}}
/** Content export only. No product registration, seed, DB or archival adapter. */
export const gradDefinition:TaskDefinition<GradConfig,GradRaw>={schemaVersion:1,...GRAD_IDENTITY,name:'渐变持续注意',category:'attention',protocol:GRAD_PROTOCOL,configSchema:gradConfigSchema,trialSchema:gradRawSchema,scorer:scoreGrad,
 finalSubmission:{maxTrials:()=>1},metrics,quality,references:[],profiles:{research:{estimatedMinutes:[6,9],configPatch:gradConfig('research'),reportCaveats:['300张固定序列、4分钟，对照2024官方说明；不是2015的299次身份。输入区域、尺寸和教学为项目变式。']},experience:{estimatedMinutes:[3,5],configPatch:gradConfig('experience'),reportCaveats:['100张90城市/10山景，核心80秒。10次山景中每次误按改变10个百分点，不能当作稳定能力或等值长版。']}},
 report:{schemaVersion:1,version:'0.1.0',title:GRAD_COPY.zh.title,headlineMetrics:['cityOmissions','mountainFalseAlarms'],userMetrics:['medianCorrectRT'],detailMetrics:['presentedImageCount'],disclaimer:GRAD_COPY.zh.limit,practicalTips:[GRAD_COPY.zh.tip]},publication:{status:'DRAFT',referenceRequired:false,evidenceNote:'已批准300/100张和8张练习；内容候选，未接入或最终验收。'}}
export const createGradSnapshot=(profile:Profile,frozenAt='2026-10-27T00:00:00.000Z'):SessionConfigSnapshot<GradConfig>=>createSessionConfigSnapshot({definition:gradDefinition,configVersion:GRAD_IDENTITY.configVersion,config:gradConfig(profile),frozenAt:new Date(frozenAt)})
export {projectGradReport} from './report'
export {gradContent} from './metadata'
