import type { TaskDefinition, MetricDefinition } from '../../v2/types'
import { simonConfigSchema, simonTrialSchema, type SimonConfig, type SimonTrial } from './schema'
import { scoreSimon } from './scorer'
export { SIMON_CONFIG } from './schema'
const metric = (key: string, label: string, unit: MetricDefinition['unit'], direction: MetricDefinition['direction'] = 'descriptive'): MetricDefinition => ({ key, label, category: 'interference', construct: 'spatial-response compatibility', description: label + '；仅描述本次任务，无常模或诊断含义。', unit, valueType: unit === 'map' ? 'object' : 'number', direction, visibility: key === 'simonEffectMeanMs' ? 'headline' : ['conditions', 'accuracyCostRatio', 'timeoutCount', 'interruptedCount'].includes(key) ? 'detail' : 'user', role: key === 'simonEffectMeanMs' ? 'primary' : 'secondary', availableProfiles: ['standard'], referenceEligible: false, export: { summary: true, label } })
export const simonDefinition: TaskDefinition<SimonConfig, SimonTrial> = {
 schemaVersion: 1, testType: 'simon', name: 'Simon 空间干扰任务（研究工作译稿）', category: 'attention', engineVersion: '1.0.0', scoringVersion: '1.0.0',
 configSchema: simonConfigSchema, trialSchema: simonTrialSchema, scorer: scoreSimon, finalSubmission: { maxTrials: config => config.totalTrials },
 protocol: { schemaVersion: 1, key: 'simon-native', version: '1.0.0', clock: 'performance', randomizationAlgorithmVersion: 'simon-fnv1a-mulberry32-v1', trialEnvelopeVersion: 1, phases: [{ key: 'test', persists: true, required: true }], measurementCriticalConfigPaths: ['totalTrials', 'practiceTrials', 'responseWindowMs', 'feedbackMs', 'isiMinMs', 'isiMaxMs'] },
 profiles: { standard: { estimatedMinutes: [5, 8], configPatch: {}, reportCaveats: ['PILOT；中文研究工作译稿；限桌面物理方向键；软件计时未经硬件校准。'] } },
 metrics: Object.fromEntries([
 metric('simonEffectMeanMs', '不相容减相容平均用时差', 'ms', 'signed'), metric('accuracyCostRatio', '相容减不相容正确率差', 'ratio', 'signed'), metric('accuracy', '正确率', 'ratio'), metric('meanRtMs', '正确响应平均用时', 'ms'), metric('congruentMeanRtMs', '相容条件平均用时', 'ms'), metric('incongruentMeanRtMs', '不相容条件平均用时', 'ms'), metric('conditions', '各条件描述统计', 'map'), ...['totalTrials', 'validTrialCount', 'congruentValidCount', 'incongruentValidCount', 'timeoutCount', 'interruptedCount'].map(k => metric(k, k, 'count'))
 ].map(m => [m.key, m])),
 quality: { incomplete: { key: 'incomplete', label: '正式试次不足', description: '未完成100正式试次。', effect: 'invalid' }, interrupted: { key: 'interrupted', label: '中断', description: '技术中断试次已排除行为分母。', effect: 'limited' }, noValidRt: { key: 'noValidRt', label: '无有效正确反应时', description: '无法计算反应时。', effect: 'invalid' }, missingCondition: { key: 'missingCondition', label: '条件反应时不足', description: '至少一个条件无有效正确反应时，不计算差值。', effect: 'limited' } },
 references: [], report: { schemaVersion: 1, version: '1.0.0', title: 'Simon 任务描述性结果', headlineMetrics: ['simonEffectMeanMs'], userMetrics: ['accuracy', 'congruentMeanRtMs', 'incongruentMeanRtMs'], detailMetrics: ['conditions', 'accuracyCostRatio', 'timeoutCount', 'interruptedCount'], disclaimer: 'PILOT 中文研究工作译稿；无人口常模、百分位或诊断效力。差值较小或为负不自动代表更好；需并读速度与准确率。软件时间戳不等于物理时序校准。', practicalTips: [] },
 publication: { status: 'DRAFT', referenceRequired: false, evidenceNote: 'Native pilot; no legacy score; generated stimuli.' },
}
export const nativeDefinitions = [simonDefinition] as unknown as TaskDefinition<unknown, unknown>[]
