import type { TaskDefinition, MetricDefinition, QualityDefinition, SessionConfigSnapshot } from '../../v2/types'
import { createSessionConfigSnapshot } from '../../v2/session-snapshot'
import { IDENTITY, type Profile } from './protocol'
import { nativeConfig,nativeConfigSchema,nativeTrialSchema,NATIVE_IDENTITY,NATIVE_PROTOCOL,scoreNativeRecognition,
  type NativeConfig,type NativeTrial,type AssetManifestBinding,NATIVE_QUALITY_RULE } from './native'
const gate=['assetAuthorizationMissing','noValidTargetPairs','incompleteRecords','technicalLoss','incompleteTargetPairs']
function metric(key:string,label:string,role:MetricDefinition['role'],unit:MetricDefinition['unit']='ratio',
  valueType:MetricDefinition['valueType']='number'):MetricDefinition {
  return {key,label,description:label,category:'memory',construct:'continuous_image_recognition',unit,valueType,
    direction:key==='correctedRecognitionRate'?'signed':'descriptive',role,
    visibility:role==='quality'?'detail':role==='research_only'?'research_only':'user',availableProfiles:['research','experience'],referenceEligible:false,
    requiresQualityFlags:role==='quality'?[]:gate,export:{summary:role!=='research_only',label}}
}
const metrics:Record<string,MetricDefinition>={
  hitRate:metric('hitRate','本轮目标重复识别率','primary'),falseAlarmRate:metric('falseAlarmRate','对应目标首次误报率','secondary'),
  correctedRecognitionRate:metric('correctedRecognitionRate','识别率减误报率','primary'),
  targetHits:metric('targetHits','有效配对目标命中数','research_only','count'),
  targetFalseAlarms:metric('targetFalseAlarms','有效配对目标首次误报数','research_only','count'),
  fillerFalseAlarmRate:metric('fillerFalseAlarmRate','首次填充误报率','research_only'),
  vigilanceMissRate:metric('vigilanceMissRate','警觉重复漏认率','research_only'),
  reportPolicy:metric('reportPolicy','冻结报告与素材绑定','research_only','map','object'),
  candidateAudit:metric('candidateAudit','候选原始归属审计','research_only','map','object'),
  nativeExclusionReasons:metric('nativeExclusionReasons','原生封套技术排除来源','research_only','map','object')}
for(const key of ['completeTargetPairs','plannedTargetPairs','receivedTrialCount','expectedTrialCount','validTrialCount'])
  metrics[key]=metric(key,key,'quality','count','integer')
for(const key of ['fillerFalseAlarms','validFillerFirst','vigilanceMisses','validVigilancePairs'])
  metrics[key]=metric(key,key,'research_only','count','integer')
metrics.hitRate.visibility='headline'
const quality:Record<string,QualityDefinition>={
  assetAuthorizationMissing:{key:'assetAuthorizationMissing',label:'正式图片授权未确认',description:'冻结的图片清单尚无正式权利证据；不输出表现结论。',effect:'limited'},
  noValidTargetPairs:{key:'noValidTargetPairs',label:'没有完整有效目标配对',description:'无法形成同分母的目标首次/重复记录。',effect:'invalid'},
  incompleteRecords:{key:'incompleteRecords',label:'正式记录不完整',description:'收到的呈现次数少于冻结profile。',effect:'limited'},
  technicalLoss:{key:'technicalLoss',label:'技术质量受限',description:'呈现或封套存在技术失败/中断/提前输入/恢复/溢出。',effect:'limited'},
  incompleteTargetPairs:{key:'incompleteTargetPairs',label:'有效目标配对不完整',description:'受影响的整对从HR与FAR共同排除。',effect:'limited'}}
/** Exported executable definition only. No legacy/native registry mutation or product availability claim. */
export const recognitionDefinition:TaskDefinition<NativeConfig,NativeTrial>={schemaVersion:1,
  testType:NATIVE_IDENTITY.testType,name:'连续图像再认',category:'memory',engineVersion:NATIVE_IDENTITY.engineVersion,
  scoringVersion:NATIVE_IDENTITY.scoringVersion,configSchema:nativeConfigSchema,trialSchema:nativeTrialSchema,
  protocol:NATIVE_PROTOCOL,scorer:scoreNativeRecognition,finalSubmission:{maxTrials:c=>c.profile==='research'?260:100},
  profiles:{research:{estimatedMinutes:[7,10],configPatch:{profile:'research',imageMs:750,isiMs:800,
    responseRule:IDENTITY.responseRule,generatorVersion:IDENTITY.generatorVersion,qualityRule:NATIVE_QUALITY_RULE,assetManifestBinding:{status:'pending',manifestHash:null,evidenceRef:null}},
    reportCaveats:['上游示例参数260呈现，并非已核实的原论文等效版；正式有权资产池须另行提供。']},
  experience:{estimatedMinutes:[3,5],configPatch:{profile:'experience',imageMs:750,isiMs:800,
    responseRule:IDENTITY.responseRule,generatorVersion:IDENTITY.generatorVersion,qualityRule:NATIVE_QUALITY_RULE,assetManifestBinding:{status:'pending',manifestHash:null,evidenceRef:null}},
    reportCaveats:['100呈现；目标重复占比及起始/尾部比例改变，不承诺与长版等值。']}},
  metrics,quality,references:[],report:{schemaVersion:1,version:'0.2.0',title:'这次的图像识别记录',
    headlineMetrics:['hitRate'],userMetrics:['falseAlarmRate','correctedRecognitionRate'],detailMetrics:['receivedTrialCount','expectedTrialCount','completeTargetPairs','plannedTargetPairs'],
    disclaimer:'仅描述本轮图片识别与误认，短版单列；没有同龄排名、诊断或稳定记忆能力结论。',
    practicalTips:['下次请将设备放稳，关闭通知，确保图片加载完成后再开始。']},
  publication:{status:'DRAFT',referenceRequired:false,evidenceNote:'未注册的原生v2候选；产品生命周期仍由平台真实配置决定。'}}
export function createRecognitionSnapshot(profile:Profile,formalAssetIds:string[],practiceAssetIds:string[],
  frozenAt='2026-10-26T00:00:00.000Z',assetManifestBinding:AssetManifestBinding={status:'pending',manifestHash:null,evidenceRef:null}):SessionConfigSnapshot<NativeConfig> {
  return createSessionConfigSnapshot({definition:recognitionDefinition,configVersion:NATIVE_IDENTITY.configVersion,
    config:nativeConfig(profile,formalAssetIds,practiceAssetIds,assetManifestBinding),frozenAt:new Date(frozenAt)})
}
export { RECOGNITION_METADATA } from './metadata'
export { recognitionTrialEnvelope, projectNativeRecognitionReport } from './native'
