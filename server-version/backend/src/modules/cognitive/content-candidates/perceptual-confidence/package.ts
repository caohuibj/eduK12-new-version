import type { TaskDefinition, MetricDefinition, QualityDefinition, SessionConfigSnapshot } from '../../v2/types'
import { createSessionConfigSnapshot } from '../../v2/session-snapshot'
import { IDENTITY, PROTOCOL, config, type Profile, type Config, type Raw } from './protocol'
import { configSchema, rawSchema } from './schema'
import { score } from './scorer'
import { COPY } from './report'
const metrics: Record<string, MetricDefinition> = {}
for (const [key, label] of Object.entries({ planned: '计划题数', started: '真实开始题数', presented: '真实绘制图案数', summary: '判断与信心的真实分母', conditions: '6条件真实覆盖', strongMinusWeakAccuracy: '强减弱匹配判断正确率差', observations: '内部权威逐题重放', reportBinding: '冻结报告身份' })) {
 const map = !['planned', 'started', 'presented', 'strongMinusWeakAccuracy'].includes(key)
 metrics[key] = { key, label, description: label, category: 'decision', construct: 'confidence_monitoring', unit: map ? 'map' : 'count', valueType: map ? 'object' : key === 'strongMinusWeakAccuracy' ? 'number' : 'integer', direction: 'descriptive', visibility: 'research_only', role: 'research_only', availableProfiles: ['research', 'experience'], referenceEligible: false, export: { summary: false, label } }
}
const quality: Record<string, QualityDefinition> = { noJudgments: { key: 'noJudgments', label: '无可核判断', description: '不补0能力或表现图。', effect: 'invalid' }, incompletePairs: { key: 'incompletePairs', label: '配对未完成', description: '保留判断，只描述真实配对。', effect: 'limited' }, interrupted: { key: 'interrupted', label: '存在中断', description: '不补未执行。', effect: 'limited' } }
export const definition: TaskDefinition<Config, Raw> = { schemaVersion: 1, ...IDENTITY, name: '知觉判断与信心', category: 'decision', protocol: PROTOCOL, configSchema, trialSchema: rawSchema, scorer: score, finalSubmission: { maxTrials: c => c.totalTrials }, metrics, quality, references: [], profiles: { research: { estimatedMinutes: [24, 35], configPatch: config('research'), reportCaveats: ['300次，6条件各50；固定信号混合与200ms是独立变式，次数沿公开代码而非最低要求。'] }, experience: { estimatedMinutes: [7, 11], configPatch: config('experience'), reportCaveats: ['60次，6条件各10；项目短版，没有已验证信效度，不估元认知能力参数。'] } }, report: { schemaVersion: 1, version: '0.1.0', title: COPY.zh.title, headlineMetrics: [], userMetrics: [], detailMetrics: [], disclaimer: COPY.zh.limit, practicalTips: [COPY.zh.tip] }, publication: { status: 'DRAFT', referenceRequired: false, evidenceNote: '用户已了解题数来源并批准原计划300/60、4题练习与两阶段回应；未DOT复核、未接入。' } }
export const createSnapshot = (profile: Profile, frozenAt = '2026-10-27T00:00:00.000Z'): SessionConfigSnapshot<Config> => createSessionConfigSnapshot({ definition, configVersion: IDENTITY.configVersion, config: config(profile), frozenAt: new Date(frozenAt) })
export { projectReport } from './report'
export { content } from './metadata'
