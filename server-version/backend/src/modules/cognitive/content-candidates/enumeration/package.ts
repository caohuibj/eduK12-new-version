import type { MetricDefinition, QualityDefinition, TaskDefinition } from '../../v2/types'
import { createSessionConfigSnapshot } from '../../v2/session-snapshot'
import { ENUMERATION_IDENTITY, enumerationConfig, type EnumerationConfig, type EnumerationProfile,
  type EnumerationTrial } from './protocol'
import { enumerationConfigSchema, enumerationTrialSchema } from './schema'
import { ENUMERATION_PROTOCOL, scoreEnumeration } from './scorer'
const metric = (key: string, unit: MetricDefinition['unit'], description: string,
  valueType: MetricDefinition['valueType'] = 'number', direction: MetricDefinition['direction'] = 'descriptive'): MetricDefinition => ({
  key, label: key, category: 'attention', construct: 'brief_numerosity_report', description,
  unit, valueType, direction, visibility: 'research_only', role: 'research_only',
  availableProfiles: ['research', 'experience'], referenceEligible: false,
  requiresQualityFlags: ['protocolValidationPending', 'individualInterpretationBlocked'],
  export: { summary: false, label: key },
})
const metrics: Record<string, MetricDefinition> = {
  byQuantity: metric('byQuantity', 'map', 'Research-only per-target counts and arithmetic. Each included denominator is explicit; zero denominator yields null.', 'array'),
  overallAccuracy: metric('overallAccuracy', 'ratio', 'Exact matches / technically included formal records; research-only pooled descriptive arithmetic.'),
  signedMeanError: metric('signedMeanError', 'count', 'Mean(responseValue - targetValue) over technically included formal records; negative values preserved.', 'number', 'signed'),
  meanAbsoluteError: metric('meanAbsoluteError', 'count', 'Mean absolute quantity error over technically included formal records; null if none.'),
  medianReportOperationMs: metric('medianReportOperationMs', 'ms', 'Median(confirmation - response phase onset); includes slider operation, not perceptual speed.'),
  excludedTrialIndices: metric('excludedTrialIndices', 'map', 'Excluded formal indices, without deleting original raw records.', 'array'),
  excludedTrialReasons: metric('excludedTrialReasons', 'map', 'Explicit per-trial technical missingness/interruption reasons; research_provisional rules.', 'object'),
}
for (const key of ['expectedTrialCount', 'receivedTrialCount', 'includedTrialCount', 'excludedTrialCount'])
  metrics[key] = metric(key, 'count', key, 'integer')
const quality: Record<string, QualityDefinition> = {
  protocolValidationPending: { key: 'protocolValidationPending', label: '协议质量待验证', description: '真实时序、校准和遮罩尚未验证；默认拒绝个人结论。', effect: 'invalid' },
  individualInterpretationBlocked: { key: 'individualInterpretationBlocked', label: '个人解释未开放', description: '研究暂定规则，无已批准的个体解释门槛。', effect: 'invalid' },
  noIncludedRecords: { key: 'noIncludedRecords', label: '没有可纳入记录', description: '缺失分母保留null。', effect: 'invalid' },
  incompleteRecords: { key: 'incompleteRecords', label: '记录未完成', description: '收到正式记录少于冻结数量。', effect: 'limited' },
  technicalExclusions: { key: 'technicalExclusions', label: '存在技术排除', description: '保留排除原因，不用正确率排除作答。', effect: 'limited' },
}
/** Inject directly in isolated tests only; absent from every product registry. */
export const enumerationDefinition: TaskDefinition<EnumerationConfig, EnumerationTrial> = {
  schemaVersion: 1, testType: ENUMERATION_IDENTITY.testType, name: '短时点数判断', category: 'attention',
  engineVersion: ENUMERATION_IDENTITY.engineVersion, scoringVersion: ENUMERATION_IDENTITY.scoringVersion,
  configSchema: enumerationConfigSchema, trialSchema: enumerationTrialSchema,
  protocol: ENUMERATION_PROTOCOL, scorer: scoreEnumeration,
  finalSubmission: { maxTrials: config => config.totalTrials },
  profiles: {
    research: { estimatedMinutes: [6, 12], configPatch: { ...enumerationConfig('research') },
      reportCaveats: ['100正式/3练习已获设计批准；耗时为规划估计，协议呈现与个体解释未验证。'] },
    experience: { estimatedMinutes: [2, 5], configPatch: { ...enumerationConfig('experience') },
      reportCaveats: ['25正式/3练习已获设计批准；短版未经精度/效度验证，不与长版混常模。耗时为规划估计。'] },
  }, metrics, quality, references: [],
  report: { schemaVersion: 1, version: '0.1.0', title: '短时点数判断候选状态',
    headlineMetrics: [], userMetrics: [], detailMetrics: [],
    disclaimer: '此内部候选尚未获准提供个人表现结论，无常模、排名或能力等级。',
    practicalTips: ['等待完成呈现、校准与技术质量验证后再进行正式施测。'] },
  publication: { status: 'DRAFT', referenceRequired: false,
    evidenceNote: '内部纯逻辑候选；未注册、未接runner、未入库，DRAFT不是权限控制。' },
}
export function createEnumerationSnapshot(profile: EnumerationProfile, frozenAt = '2026-10-26T00:00:00.000Z') {
  return createSessionConfigSnapshot({ definition: enumerationDefinition,
    configVersion: ENUMERATION_IDENTITY.configVersion, config: enumerationConfig(profile), frozenAt: new Date(frozenAt) })
}
export { enumerationContent } from './metadata'
export { enumerationTrialEnvelope } from './trial-envelope'
export { projectEnumerationReport } from './scorer'
