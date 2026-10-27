import { IDENTITY, same, type Profile } from './protocol'
export type State = 'interpretable' | 'limited' | 'invalid'
export interface Counts { matched: number; total: number }
export interface PublicReport {
  testType: 'voice-emotion-cues'; engineVersion: '0.1.0'; scoringVersion: '0.1.0'; configVersion: '0.1.0';
  reportDefinitionVersion: '0.1.0'; parameterInterpretationVersion: '0.1.0'; presentationVersion: '0.1.0';
  configHash: string; protocolSignature: string; materialsHash: string; manifestHash: string; profile: Profile; state: State;
  planned: number; received: number; completed: number; skipped: number; interrupted: number; unstarted: number;
  overall: Counts | null; intensity: { normal: Counts | null; strong: Counts | null }
}
export const COPY = {
  zh: { title: '这次声音判断，哪些与目标表达一致？', tip: '交流时遇到不确定的语气，可以先问一句：“你的意思是……吗？”这是一条一般建议，不是对你现实沟通能力的预测。', limit: '英语表演录音受语言、口音、听力、设备和文化解释影响；目标标签不代表演员真实内心。短版每条件一条，不能给精细稳定能力分。没有EI总分、常模、IQ、排名、诊断或岗位预测。', limited: '部分记录缺失或播放中断，全局和受影响条件不作解释；下列仅保留完整条件的真实次数。', invalid: '没有可用的正式观察，暂不提供表现结论。可以保留记录，向组织者询问下一步。' },
  en: { title: 'Which choices matched the intended expression?', tip: 'When a tone is unclear, asking “Do you mean…?” can help. This is general advice, not a prediction of your everyday communication.', limit: 'English acted speech is affected by language, accent, hearing, device and cultural interpretation. Intended labels do not reveal real feelings. The short form has one item per cell and cannot give fine, stable ability scores. No overall EI score, norms, IQ, ranking, diagnosis or job prediction.', limited: 'Some observations are missing or interrupted. The overall result and affected conditions are hidden; only complete conditions remain below.', invalid: 'There are no usable formal observations, so no performance conclusion is provided. Keep the record and ask the organiser about next steps.' },
} as const
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const counts = (v: unknown, total: number) => v !== null && typeof v === 'object' && Object.keys(v).sort().join(',') === 'matched,total' && count((v as Counts).matched) && (v as Counts).total === total && (v as Counts).matched <= total
export function isPublicReport(value: unknown, binding?: { configHash: string; protocolSignature: string; materialsHash: string; manifestHash: string; profile: Profile; received?: number }): value is PublicReport {
  if (!value || typeof value !== 'object') return false
  const r = value as PublicReport
  const keys = ['testType', 'engineVersion', 'scoringVersion', 'configVersion', 'reportDefinitionVersion', 'parameterInterpretationVersion', 'presentationVersion', 'configHash', 'protocolSignature', 'materialsHash', 'manifestHash', 'profile', 'state', 'planned', 'received', 'completed', 'skipped', 'interrupted', 'unstarted', 'overall', 'intensity']
  if (!same(Object.keys(r).sort(), keys.sort()) || Object.entries(IDENTITY).some(([k, v]) => (r as unknown as Record<string, unknown>)[k] !== v) || [r.reportDefinitionVersion, r.parameterInterpretationVersion, r.presentationVersion].some(v => v !== '0.1.0') || [r.configHash, r.protocolSignature, r.materialsHash, r.manifestHash].some(v => !/^[a-f0-9]{64}$/.test(v)) || !['research', 'experience'].includes(r.profile) || !['interpretable', 'limited', 'invalid'].includes(r.state)) return false
  if (![r.planned, r.received, r.completed, r.skipped, r.interrupted, r.unstarted].every(count) || r.planned !== (r.profile === 'research' ? 96 : 24) || r.received + r.unstarted !== r.planned || r.completed + r.skipped + r.interrupted !== r.received) return false
  if (!r.intensity || !same(Object.keys(r.intensity).sort(), ['normal', 'strong'])) return false
  for (const v of Object.values(r.intensity)) if (v !== null && (!counts(v, r.planned / 2) || r.completed < r.planned / 2)) return false
  if (Object.values(r.intensity).reduce((n, v) => n + (v?.total ?? 0), 0) > r.completed) return false
  if (r.state === 'interpretable') {
    if (r.completed !== r.planned || !counts(r.overall, r.planned) || !counts(r.intensity.normal, r.planned / 2) || !counts(r.intensity.strong, r.planned / 2) || r.overall!.matched !== r.intensity.normal!.matched + r.intensity.strong!.matched) return false
  } else if (r.overall !== null || (r.state === 'invalid' ? r.completed !== 0 || Object.values(r.intensity).some(v => v !== null) : r.completed === 0 || r.completed === r.planned)) return false
  return !binding || (r.configHash === binding.configHash && r.protocolSignature === binding.protocolSignature && r.materialsHash === binding.materialsHash && r.manifestHash === binding.manifestHash && r.profile === binding.profile && (binding.received === undefined || r.received === binding.received))
}
export function projectReport(score: { metrics: Record<string, unknown>; quality: { state: string }; audit: { scorerVersion: string } }): PublicReport {
  const m = score.metrics, b = m.reportBinding as Omit<PublicReport, 'state' | 'planned' | 'received' | 'completed' | 'skipped' | 'interrupted' | 'unstarted' | 'overall' | 'intensity'>
  if (!b || score.audit.scorerVersion !== IDENTITY.scoringVersion) throw Error('Unknown voice report binding')
  const groups = m.intensityGroups as Record<'normal' | 'strong', { planned: number; valid: number; matched: number }>
  const full = score.quality.state === 'interpretable'
  const allowed = (key: 'normal' | 'strong'): Counts | null => score.quality.state !== 'invalid' && groups[key].valid === groups[key].planned ? { matched: groups[key].matched, total: groups[key].valid } : null
  const report = { ...b, state: score.quality.state, planned: m.planned, received: m.received, completed: m.completed, skipped: m.skipped, interrupted: m.interrupted, unstarted: m.unstarted, overall: full ? { matched: m.matched, total: m.completed } : null, intensity: { normal: allowed('normal'), strong: allowed('strong') } }
  if (!isPublicReport(report)) throw Error('Inconsistent voice public projection')
  return report
}
/** This same allowlisted projection is used for prose and downloadable text;
 * optional future images must consume it rather than internal scorer metrics. */
export function reportText(value: unknown, language: 'zh' | 'en' = 'zh'): string {
  if (!isPublicReport(value)) throw Error('Invalid frozen voice public report')
  const r = value, en = language === 'en', copy = COPY[language]
  const lines = [copy.title, en ? `Recorded ${r.received} of ${r.planned}; usable choices ${r.completed}; skipped ${r.skipped}; interrupted ${r.interrupted}; unstarted ${r.unstarted}.` : `计划${r.planned}段，已记录${r.received}段；可用选择${r.completed}，跳过${r.skipped}，中断${r.interrupted}，未开始${r.unstarted}。`]
  if (r.state === 'invalid') return [...lines, copy.invalid, copy.limit].join('\n\n')
  if (r.overall) lines.push(en ? `${r.overall.matched} of ${r.overall.total} choices matched the actor's intended label.` : `你的${r.overall.matched}/${r.overall.total}次选择与演员目标标签匹配。`)
  if (r.state === 'limited') lines.push(copy.limited)
  for (const k of ['normal', 'strong'] as const) {
    const g = r.intensity[k]
    if (g) lines.push(`${en ? (k === 'normal' ? 'Normal expression' : 'Strong expression') : (k === 'normal' ? '普通表达' : '较强表达')}：${g.matched}/${g.total}`)
  }
  if (r.intensity.normal && r.intensity.strong) lines.push(en ? 'Expression strength and the particular voices may both influence this record; these counts do not isolate a pure strength effect.' : '表达强度和具体声音都可能影响这次记录；这些次数不能单独确定纯粹的强度效应。')
  return [...lines, copy.tip, copy.limit].join('\n\n')
}
