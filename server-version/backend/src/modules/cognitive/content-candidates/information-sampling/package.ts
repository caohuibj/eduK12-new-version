import type { TaskDefinition, MetricDefinition, QualityDefinition, SessionConfigSnapshot } from '../../v2/types'
import { createSessionConfigSnapshot } from '../../v2/session-snapshot'
import { IST_IDENTITY, IST_PROTOCOL, istConfig, type Profile, type IstConfig, type IstRaw } from './protocol'
import { istConfigSchema, istRawSchema } from './schema'
import { scoreIst } from './scorer'
import { IST_COPY } from './report'
const metrics: Record<string, MetricDefinition> = {}
for (const [key, label] of Object.entries({ planned: '计划局数', presented: '实际呈现局数', completed: '完成反馈的局数', decided: '真实多数判断数', groups: '奖励及多数强度条件的真实分母与数据', decreasingMinusFixedReveals: '递减减固定平均揭格差，有符号', observations: '内部逐局权威重放记录', reportBinding: '冻结报告身份' })) {
  const map = ['groups', 'observations', 'reportBinding'].includes(key)
  metrics[key] = { key, label, description: label, category: 'decision', construct: 'information_seeking', unit: map ? 'map' : 'count', valueType: map ? 'object' : key === 'decreasingMinusFixedReveals' ? 'number' : 'integer', direction: 'descriptive', visibility: 'research_only', role: 'research_only', availableProfiles: ['research', 'experience'], referenceEligible: false, export: { summary: false, label } }
}
const quality: Record<string, QualityDefinition> = { noJudgments: { key: 'noJudgments', label: '尚无可解释判断', description: '不给表现数字或表现下载，不是能力判断。', effect: 'invalid' }, incompleteRecords: { key: 'incompleteRecords', label: '记录不完整', description: '只描述实际判断和条件覆盖。', effect: 'limited' }, interrupted: { key: 'interrupted', label: '存在中断', description: '保留中断前已作判断，未作判断不补零。', effect: 'limited' } }
export const istDefinition: TaskDefinition<IstConfig, IstRaw> = { schemaVersion: 1, ...IST_IDENTITY, name: '信息采样', category: 'decision', protocol: IST_PROTOCOL, configSchema: istConfigSchema, trialSchema: istRawSchema, scorer: scoreIst, finalSubmission: { maxTrials: c => c.totalTrials }, metrics, quality, references: [], profiles: { research: { estimatedMinutes: [6, 10], configPatch: istConfig('research'), reportCaveats: ['20轮沿公开参考实现总数，两规则各10；多数13–17各2轮。原创色形、平衡、输入、教学与无补齐等待是项目变式。'] }, experience: { estimatedMinutes: [4, 6], configPatch: istConfig('experience'), reportCaveats: ['10轮项目短版，两规则各5；保留多数13–17各1轮。次数减少不证明信度、效度或长短版等值。'] } }, report: { schemaVersion: 1, version: '0.1.0', title: IST_COPY.zh.title, headlineMetrics: [], userMetrics: [], detailMetrics: [], disclaimer: IST_COPY.zh.limit, practicalTips: [IST_COPY.zh.tip] }, publication: { status: 'DRAFT', referenceRequired: false, evidenceNote: '用户已批准20/10轮与2易练习+3理解题；内容候选，未DOT复核、未接入或最终集中验收。' } }
export const createIstSnapshot = (profile: Profile, frozenAt = '2026-10-27T00:00:00.000Z'): SessionConfigSnapshot<IstConfig> => createSessionConfigSnapshot({ definition: istDefinition, configVersion: IST_IDENTITY.configVersion, config: istConfig(profile), frozenAt: new Date(frozenAt) })
export { projectIstReport } from './report'
export { istContent } from './metadata'
