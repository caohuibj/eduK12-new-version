import type {TaskDefinition,MetricDefinition,QualityDefinition,SessionConfigSnapshot} from '../../v2/types'
import {createSessionConfigSnapshot} from '../../v2/session-snapshot'
import {EFFORT_IDENTITY,EFFORT_PROTOCOL,effortConfig,type Profile,type EffortConfig,type EffortRaw} from './protocol'
import {effortConfigSchema,effortTrialSchema} from './schema'
import {scoreBalloonEffort} from './scorer'
import {EFFORT_REPORT_COPY} from './report'
const metrics:Record<string,MetricDefinition>={}
const labels:Record<string,string>={validChoiceCount:'有效选择次数',highEffortChoiceCount:'选择较多按压次数',highEffortChoiceRate:'本次较多按压选择比例',noChoiceCount:'未选择次数',technicalRecordCount:'技术受限记录数',receivedTrialCount:'已收到轮数',expectedTrialCount:'计划轮数',validExecutionCount:'有效执行轮数',totalPresses:'有效执行中的按压总数',knownTaskPoints:'已完成执行的任务点数',lowTargetReachedCount:'较少按压完成次数',lowTargetMissedCount:'较少按压未完成次数'}
for(const [key,label] of Object.entries(labels))metrics[key]={key,label,description:label,category:'decision',construct:'effort_reward_choice_and_execution',unit:key==='highEffortChoiceRate'?'ratio':key==='knownTaskPoints'?'score':'count',
 valueType:key==='highEffortChoiceRate'||key==='knownTaskPoints'?'number':'integer',direction:'descriptive',visibility:key==='highEffortChoiceRate'?'headline':['validChoiceCount','highEffortChoiceCount'].includes(key)?'user':'detail',role:key==='highEffortChoiceRate'?'primary':'quality',
 availableProfiles:['research','experience'],referenceEligible:false,requiresQualityFlags:key==='highEffortChoiceRate'?['noValidChoices']:[],export:{summary:true,label}}
for(const key of ['choicesByCondition','choicesByEffort','choicesByReward','choicesByProbability','executionByInput','reportBinding'])metrics[key]={key,label:key,description:'按真实分母和输入分别保留的记录，不合成能力分。',category:'decision',construct:'effort_reward_choice_and_execution',unit:'map',valueType:'object',direction:'descriptive',visibility:'research_only',role:'research_only',availableProfiles:['research','experience'],referenceEligible:false,export:{summary:false,label:key}}
const quality:Record<string,QualityDefinition>={noValidChoices:{key:'noValidChoices',label:'没有有效选择',description:'不输出偏好/执行表现结论。',effect:'invalid'},incompleteRecords:{key:'incompleteRecords',label:'轮数不完整',description:'仅描述已收到且可解释的部分。',effect:'limited'},noChoice:{key:'noChoice',label:'存在未选择轮次',description:'未选择单独列出，不补为较少按压。',effect:'limited'},technicalLoss:{key:'technicalLoss',label:'部分技术记录受限',description:'保留已完成选择，受影响执行不计入执行统计。',effect:'limited'}}
/** Exported content only: no task registry/seed/delivery/archive changes. */
export const balloonEffortDefinition:TaskDefinition<EffortConfig,EffortRaw>={schemaVersion:1,...EFFORT_IDENTITY,name:'气球努力选择',category:'decision',protocol:EFFORT_PROTOCOL,configSchema:effortConfigSchema,trialSchema:effortTrialSchema,
 scorer:scoreBalloonEffort,finalSubmission:{maxTrials:c=>c.totalTrials},metrics,quality,references:[],
 profiles:{research:{estimatedMinutes:[20,55],configPatch:effortConfig('research'),reportCaveats:['科研版72轮（18条件各4），次数/6.5秒选择对齐Culbreth2024；触控、执行计时和默认任务点数为项目变式，非论文激励等效复现。']},
 experience:{estimatedMinutes:[7,17],configPatch:effortConfig('experience'),reportCaveats:['实用版18轮，每条件1次，保留全部努力/收益/概率组合；只能描述本次取舍，不推断稳定个体偏好或工作能力。']}},
 report:{schemaVersion:1,version:'0.1.0',title:EFFORT_REPORT_COPY.zh.title,headlineMetrics:['highEffortChoiceRate'],userMetrics:['validChoiceCount','highEffortChoiceCount'],detailMetrics:['noChoiceCount','validExecutionCount','totalPresses','knownTaskPoints'],
 disclaimer:EFFORT_REPORT_COPY.zh.limit,practicalTips:[EFFORT_REPORT_COPY.zh.tip]},publication:{status:'DRAFT',referenceRequired:false,evidenceNote:'已批准的独立内容候选；产品接入与最终集中测试尚未进行。'}}
export const createBalloonEffortSnapshot=(profile:Profile,frozenAt='2026-10-27T00:00:00.000Z'):SessionConfigSnapshot<EffortConfig>=>
 createSessionConfigSnapshot({definition:balloonEffortDefinition,configVersion:EFFORT_IDENTITY.configVersion,config:effortConfig(profile),frozenAt:new Date(frozenAt)})
export {projectEffortReport} from './report'
export {balloonEffortContent} from './metadata'
