import type { MetricDefinition, QualityDefinition, TaskDefinition } from '../../v2/types'
import { createSessionConfigSnapshot } from '../../v2/session-snapshot'
import { ENUMERATION_IDENTITY, ENUMERATION_RECIPE_IDENTITY, enumerationConfig, enumerationRecipeConfig, type EnumerationConfig, type EnumerationRecipeConfig, type EnumerationProfile,
  type EnumerationTrial } from './protocol'
import { enumerationConfigSchema, enumerationRecipeConfigSchema, enumerationTrialSchema } from './schema'
import { ENUMERATION_PROTOCOL, scoreEnumeration, scoreEnumerationRecipe } from './scorer'
const labels: Record<string, string> = { correctTrialCount: '判断正确次数', includedTrialCount: '纳入作答次数',
  overReportedTrialCount: '点数偏多次数', underReportedTrialCount: '点数偏少次数', overallAccuracy: '本次正确比例',
  signedMeanError: '平均点数偏差', meanAbsoluteError: '平均绝对偏差', byQuantity: '各点数的作答记录' }
const metric = (key: string, unit: MetricDefinition['unit'], description: string,
  valueType: MetricDefinition['valueType'] = 'number', direction: MetricDefinition['direction'] = 'descriptive'): MetricDefinition => ({
  key, label: labels[key] ?? key, category: 'attention', construct: 'brief_numerosity_report', description,
  unit, valueType, direction, visibility: ['correctTrialCount', 'includedTrialCount'].includes(key) ? 'headline'
    : ['overallAccuracy', 'overReportedTrialCount', 'underReportedTrialCount'].includes(key) ? 'user'
    : ['byQuantity', 'signedMeanError', 'meanAbsoluteError'].includes(key) ? 'detail' : 'research_only',
  role: key === 'reportBinding' ? 'research_only' : 'secondary',
  availableProfiles: ['research', 'experience'], referenceEligible: false,
  requiresQualityFlags: ['noIncludedRecords'],
  export: { summary: ['overallAccuracy', 'correctTrialCount', 'includedTrialCount', 'overReportedTrialCount', 'underReportedTrialCount'].includes(key), label: key },
})
const metrics: Record<string, MetricDefinition> = {
  reportBinding: metric('reportBinding', 'map', 'Frozen candidate/config/scorer dependencies and seed for compatible report projection; never participant output.', 'object'),
  byQuantity: metric('byQuantity', 'map', 'Session descriptive per-target counts and arithmetic. Each included denominator is explicit; zero denominator yields null.', 'array'),
  overallAccuracy: metric('overallAccuracy', 'ratio', 'Exact matches / technically included formal records; session-only pooled descriptive arithmetic.'),
  signedMeanError: metric('signedMeanError', 'count', 'Mean(responseValue - targetValue) over technically included formal records; negative values preserved.', 'number', 'signed'),
  meanAbsoluteError: metric('meanAbsoluteError', 'count', 'Mean absolute quantity error over technically included formal records; null if none.'),
  medianReportOperationMs: metric('medianReportOperationMs', 'ms', 'Median(confirmation - response phase onset); includes slider operation, not perceptual speed.'),
  excludedTrialIndices: metric('excludedTrialIndices', 'map', 'Excluded formal indices, without deleting original raw records.', 'array'),
  excludedTrialReasons: metric('excludedTrialReasons', 'map', 'Explicit per-trial technical missingness/interruption reasons; technical factual exclusions; no exposure-duration cutoff.', 'object'),
}
for (const key of ['expectedTrialCount', 'receivedTrialCount', 'includedTrialCount', 'excludedTrialCount', 'correctTrialCount', 'overReportedTrialCount', 'underReportedTrialCount'])
  metrics[key] = metric(key, 'count', key, 'integer')
const quality: Record<string, QualityDefinition> = {
  descriptiveOnly: { key: 'descriptiveOnly', label: '本次描述', description: '仅描述本次作答，无常模或诊断推断；物理时序尚未验证不单独关闭反馈。', effect: 'none' },
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
      reportCaveats: ['100正式/3练习；仅本次描述，耗时为规划估计，物理时序和人群效度未验证。'] },
    experience: { estimatedMinutes: [2, 5], configPatch: { ...enumerationConfig('experience') },
      reportCaveats: ['25正式/3练习已获设计批准；短版未经精度/效度验证，不与长版混常模。耗时为规划估计。'] },
  }, metrics, quality, references: [],
  report: { schemaVersion: 1, version: ENUMERATION_IDENTITY.reportDefinitionVersion, title: '这次的点数判断记录',
    headlineMetrics: ['correctTrialCount', 'includedTrialCount'],
    userMetrics: ['overReportedTrialCount', 'underReportedTrialCount'], detailMetrics: ['byQuantity', 'signedMeanError', 'meanAbsoluteError'],
    disclaimer: '仅描述本次作答；无适用常模，不提供排名、能力等级或诊断结论。',
    practicalTips: ['把设备放稳，减少通知干扰，并保持观看位置。'] },
  publication: { status: 'DRAFT', referenceRequired: false,
    evidenceNote: '内部内容候选；未注册、候选runner未接真实平台、未入库，DRAFT不是权限控制。' },
}
export function createEnumerationSnapshot(profile: EnumerationProfile, frozenAt = '2026-10-26T00:00:00.000Z') {
  return createSessionConfigSnapshot({ definition: enumerationDefinition,
    configVersion: ENUMERATION_IDENTITY.configVersion, config: enumerationConfig(profile), frozenAt: new Date(frozenAt) })
}
/** Complete-recipe identity: same arithmetic/protocol/report; distinct frozen configuration and engine. */
export const enumerationRecipeDefinition: TaskDefinition<EnumerationRecipeConfig, EnumerationTrial> = {
  ...enumerationDefinition, engineVersion: ENUMERATION_RECIPE_IDENTITY.engineVersion,
  configSchema: enumerationRecipeConfigSchema, scorer: scoreEnumerationRecipe,
  profiles: {
    research: { ...enumerationDefinition.profiles.research!, configPatch: { ...enumerationRecipeConfig('research') } },
    experience: { ...enumerationDefinition.profiles.experience!, configPatch: { ...enumerationRecipeConfig('experience') } },
  },
  publication: { ...enumerationDefinition.publication, evidenceNote: '完整配方已接精确native定义、DRAFT seed及authenticated宿主候选；不代表运行系统已导入、发布或部署。' },
}
export function createEnumerationRecipeSnapshot(profile: EnumerationProfile, frozenAt = '2026-10-26T00:00:00.000Z') {
  return createSessionConfigSnapshot({ definition: enumerationRecipeDefinition,
    configVersion: ENUMERATION_RECIPE_IDENTITY.configVersion, config: enumerationRecipeConfig(profile), frozenAt: new Date(frozenAt) })
}
export { enumerationContent, enumerationRecipeContent } from './metadata'
export { enumerationTrialEnvelope } from './trial-envelope'
export { projectEnumerationReport, projectStoredEnumerationReport } from './report'

export { enumerationCatalogTags, enumerationCatalogSearchText, enumerationCatalogIntegration } from './catalog'
