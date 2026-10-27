import type {TaskDefinition,MetricDefinition,QualityDefinition} from '../../v2/types'
import {createSessionConfigSnapshot} from '../../v2/session-snapshot'
import {SART_IDENTITY,SART_PROTOCOL,sartConfig,type SartConfig,type SartRaw,type SartProfile} from './protocol'
import {sartConfigSchema,sartRawSchema} from './schema'
import {scoreSart} from './scorer'
import {SART_COPY} from './report'
const metrics:Record<string,MetricDefinition>={}
for(const [key,label] of Object.entries({expectedTrialCount:'计划窗口数',receivedTrialCount:'实际记录窗口数',completeTrialCount:'实际完整窗口数',statistics:'按Go和No-Go实际条件分母的次数及用时',thirds:'按计划三等分的实际条件记录',differences:'后段减前段有符号差',internal:'研究内部RT波动',reportBinding:'冻结报告身份'})){
  const map=['statistics','thirds','differences','internal','reportBinding'].includes(key)
  metrics[key]={key,label,description:label,category:'attention',construct:'sustained_digit_response',unit:map?'map':'count',valueType:key==='thirds'?'array':map?'object':'integer',direction:'descriptive',visibility:'research_only',role:'research_only',availableProfiles:['research','experience'],referenceEligible:false,export:{summary:false,label}}
}
const quality:Record<string,QualityDefinition>={noCompleteWindows:{key:'noCompleteWindows',label:'无完整正式窗口',description:'不输出表现图或结论，不把未执行填零。',effect:'invalid'},incompleteStream:{key:'incompleteStream',label:'连续段未完成',description:'只描述真实完整窗口，练习不混入。',effect:'limited'},interrupted:{key:'interrupted',label:'正式段已中断',description:'保留前段完整记录；中断窗口不猜遗漏或抑制成功。',effect:'limited'}}
export const sartDefinition:TaskDefinition<SartConfig,SartRaw>={schemaVersion:1,...SART_IDENTITY,name:'SART 数字回应',category:'attention',protocol:SART_PROTOCOL,configSchema:sartConfigSchema,trialSchema:sartRawSchema,scorer:scoreSart,finalSubmission:{maxTrials:c=>c.totalTrials},metrics,quality,references:[],profiles:{research:{estimatedMinutes:[6,8],configPatch:sartConfig('research'),reportCaveats:['225次项目连续数字流，手机输入、字号和精简练习为变式；非原版测量等效或临床效度保证。']},experience:{estimatedMinutes:[3,5],configPatch:sartConfig('experience'),reportCaveats:['90次、No-Go仅10次；保留条件但减少重复，精度和短版效度未核。']}},report:{schemaVersion:1,version:'0.1.0',title:SART_COPY.zh.title,headlineMetrics:[],userMetrics:[],detailMetrics:[],disclaimer:SART_COPY.zh.limit,practicalTips:[SART_COPY.zh.tip]},publication:{status:'DRAFT',referenceRequired:false,evidenceNote:'已获225/90与9慢练习图审批准；仅内容候选，未DOT代码复核、未产品接入。'}}
export const createSartSnapshot=(profile:SartProfile,frozenAt:string)=>createSessionConfigSnapshot({definition:sartDefinition,configVersion:SART_IDENTITY.configVersion,config:sartConfig(profile),frozenAt:new Date(frozenAt)})
export {projectSartReport,sartPublic,sartDownload,sartImageData} from './report'
