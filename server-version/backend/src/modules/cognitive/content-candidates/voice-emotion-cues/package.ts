import type { TaskDefinition, MetricDefinition, QualityDefinition, SessionConfigSnapshot } from '../../v2/types'
import { createSessionConfigSnapshot } from '../../v2/session-snapshot'
import { IDENTITY, PROTOCOL, config, type Profile, type VoiceConfig, type Raw } from './protocol'
import { configSchema, rawSchema } from './schema'
import { scoreVoice } from './scorer'
import { COPY } from './report'
const metrics: Record<string, MetricDefinition> = {}
for (const [key, label] of Object.entries({ planned: '计划段数', received: '收到记录数', completed: '可用选择数', matched: '目标标签匹配次数', skipped: '明确跳过数', interrupted: '播放或作答中断数', unstarted: '未开始数', groups: '24条件的计划及有效分母', intensityGroups: '强度分组', confusion: '源标签与首答列联次数', observedProportion: '观察匹配比例', signedStrongMinusNormal: '较强减普通的有符号匹配比例差', medianPostPlaybackMs: '播放结束后首个完整选择用时中位数', reportBinding: '冻结报告组合' })) {
  const map = ['groups', 'intensityGroups', 'confusion', 'reportBinding'].includes(key)
  metrics[key] = { key, label, description: label, category: 'emotion_classification', construct: 'acted_voice_label_matching', unit: map ? 'map' : key.endsWith('Ms') ? 'ms' : ['observedProportion', 'signedStrongMinusNormal'].includes(key) ? 'ratio' : 'count', valueType: map ? 'object' : ['observedProportion', 'signedStrongMinusNormal', 'medianPostPlaybackMs'].includes(key) ? 'number' : 'integer', direction: 'descriptive', visibility: 'research_only', role: 'research_only', availableProfiles: ['research', 'experience'], referenceEligible: false, export: { summary: false, label } }
}
const quality: Record<string, QualityDefinition> = {
  noUsableFormal: { key: 'noUsableFormal', label: '没有可用正式观察', description: '仅保存事实，无表现结论。', effect: 'invalid' },
  incompleteConditions: { key: 'incompleteConditions', label: '部分条件不完整', description: '隐藏总体及受影响条件，不把未开始或中断算错。', effect: 'limited' },
  skipped: { key: 'skipped', label: '有明确跳过', description: '不同于有效的不贴切选择。', effect: 'limited' },
  interrupted: { key: 'interrupted', label: '有实际中断', description: '不自动重曝部分听到的录音。', effect: 'limited' },
}
export const voiceDefinition: TaskDefinition<VoiceConfig, Raw> = {
  schemaVersion: 1, ...IDENTITY, name: '语音情绪线索辨认', category: 'emotion_classification', protocol: PROTOCOL,
  configSchema, trialSchema: rawSchema, scorer: scoreVoice, finalSubmission: { maxTrials: c => c.totalTrials }, metrics, quality, references: [],
  profiles: {
    research: { estimatedMinutes: [18, 28], configPatch: config('research'), reportCaveats: ['96次，24条件每格4位演员；持续聆听负担明显。项目子集变式，不是原版效度保证。'] },
    experience: { estimatedMinutes: [6, 10], configPatch: config('experience'), reportCaveats: ['24次，每条件仅一条；不能给精细稳定个人能力分。中文人群的英语/文化解释影响未验证。'] },
  },
  report: { schemaVersion: 1, version: '0.1.0', title: COPY.zh.title, headlineMetrics: [], userMetrics: [], detailMetrics: [], disclaimer: COPY.zh.limit, practicalTips: [COPY.zh.tip] },
  publication: { status: 'DRAFT', referenceRequired: false, evidenceNote: '图审96/24及3练习已获批准；内容候选，未DOT复核、未接入、未正式验收。使用projectReport公开白名单，不暴露原始研究指标。' },
}
export const createVoiceSnapshot = (profile: Profile, frozenAt = '2026-10-27T00:00:00.000Z'): SessionConfigSnapshot<VoiceConfig> => createSessionConfigSnapshot({ definition: voiceDefinition, configVersion: IDENTITY.configVersion, config: config(profile), frozenAt: new Date(frozenAt) })
export { projectReport, reportText } from './report'
