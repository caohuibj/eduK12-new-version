import type { TaskDefinition, MetricDefinition, QualityDefinition, SessionConfigSnapshot } from '../../v2/types'
import { createSessionConfigSnapshot } from '../../v2/session-snapshot'
import { IDENTITY, PROTOCOL, config, type Profile, type Config, type Raw } from './protocol'
import { configSchema, rawSchema } from './schema'
import { score } from './scorer'
import { COPY } from './report'
const metrics: Record<string, MetricDefinition> = {}
for (const [key, label] of Object.entries({ planned: '计划选择数', presented: '真实呈现数', summary: '真实早晚选择及分母', conditions: '36条件的真实覆盖与选择', contrasts: '预定等待对的有符号晚选比例差', observations: '内部权威逐题重放', reportBinding: '冻结报告身份' })) {
 const map = !['planned', 'presented'].includes(key)
 metrics[key] = { key, label, description: label, category: 'decision', construct: 'decision_learning', unit: map ? 'map' : 'count', valueType: map ? 'object' : 'integer', direction: 'descriptive', visibility: 'research_only', role: 'research_only', availableProfiles: ['research', 'experience'], referenceEligible: false, export: { summary: false, label } }
}
const quality: Record<string, QualityDefinition> = { noChoices: { key: 'noChoices', label: '无可解释选择', description: '无表现图或下载，不是0能力。', effect: 'invalid' }, incompleteConditions: { key: 'incompleteConditions', label: '条件未完成', description: '只描述实际选择与覆盖。', effect: 'limited' }, interrupted: { key: 'interrupted', label: '存在中断', description: '保留已有选择，不补未执行。', effect: 'limited' } }
export const definition: TaskDefinition<Config, Raw> = { schemaVersion: 1, ...IDENTITY, name: '延迟选择', category: 'decision', protocol: PROTOCOL, configSchema, trialSchema: rawSchema, scorer: score, finalSubmission: { maxTrials: c => c.totalTrials }, metrics, quality, references: [], profiles: { research: { estimatedMinutes: [6, 10], configPatch: config('research'), reportCaveats: ['72次，36条件各2；假想点数、固定基准、移动界面与重复为项目变式。'] }, experience: { estimatedMinutes: [4, 7], configPatch: config('experience'), reportCaveats: ['36次，全部条件各1；只减重复，不证明短版信效度或个体参数。'] } }, report: { schemaVersion: 1, version: '0.1.0', title: COPY.zh.title, headlineMetrics: [], userMetrics: [], detailMetrics: [], disclaimer: COPY.zh.limit, practicalTips: [COPY.zh.tip] }, publication: { status: 'DRAFT', referenceRequired: false, evidenceNote: '用户已批准72/36完整36条件、2练习+2理解题图审；未DOT复核、未接入。' } }
export const createSnapshot = (profile: Profile, frozenAt = '2026-10-27T00:00:00.000Z'): SessionConfigSnapshot<Config> => createSessionConfigSnapshot({ definition, configVersion: IDENTITY.configVersion, config: config(profile), frozenAt: new Date(frozenAt) })
export { projectReport } from './report'
export { content } from './metadata'
