import { IST_IDENTITY, type Profile, type Rule } from './protocol'
export interface IstCondition { majorityCount: number; planned: number; presented: number; decided: number; correct: number; completed: number; omissions: number; interruptions: number; meanReveals: number | null; medianReveals: number | null; medianDecisionMs: number | null; points: number | null }
export interface IstGroup extends Omit<IstCondition, 'majorityCount'> { conditions: IstCondition[] }
export interface IstReport {
  testType: 'information-sampling'; engineVersion: '0.1.0'; scoringVersion: '0.1.0'; configVersion: '0.1.0'; reportDefinitionVersion: '0.1.0'; presentationVersion: '0.1.0'; parameterExplanationVersion: '0.1.0';
  configHash: string; protocolSignature: string; profile: Profile; state: 'interpretable' | 'limited' | 'invalid'; planned: number; presented: number; completed: number; groups: Record<Rule, IstGroup> | null; decreasingMinusFixedReveals: number | null
}
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const nullableRange = (n: unknown, lo: number, hi: number) => n === null || finite(n) && n >= lo && n <= hi
export function comparableDelta(groups: Record<Rule, IstGroup>): number | null {
  const a = groups.fixed, b = groups.decreasing
  if (a.decided !== a.planned || b.decided !== b.planned || a.meanReveals === null || b.meanReveals === null || a.conditions.some((x, i) => x.decided !== x.planned || b.conditions[i]?.decided !== x.decided)) return null
  return b.meanReveals - a.meanReveals
}
function validSummary(g: Omit<IstCondition, 'majorityCount'>) {
  return [g.planned, g.presented, g.decided, g.correct, g.completed, g.omissions, g.interruptions].every(integer) && g.presented <= g.planned && g.decided <= g.presented && g.correct <= g.decided && g.completed <= g.decided && g.omissions === g.presented - g.decided && g.interruptions === g.presented - g.completed && nullableRange(g.meanReveals, 0, 25) && nullableRange(g.medianReveals, 0, 25) && nullableRange(g.medianDecisionMs, 0, Number.MAX_VALUE) && (g.decided === 0 ? g.meanReveals === null && g.medianReveals === null && g.medianDecisionMs === null && g.points === null : g.meanReveals !== null && g.medianReveals !== null && g.medianDecisionMs !== null && finite(g.points) && Number.isInteger(g.points) && g.points >= -100 * g.decided && g.points <= 250 * g.decided)
}
export function isIstReport(value: unknown, expected?: { configHash: string; protocolSignature: string; profile: Profile; presented?: number }): value is IstReport {
  if (!value || typeof value !== 'object') return false
  const r = value as IstReport, hex = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
  if (r.testType !== IST_IDENTITY.testType || [r.engineVersion, r.scoringVersion, r.configVersion, r.reportDefinitionVersion, r.presentationVersion, r.parameterExplanationVersion].some(x => x !== '0.1.0') || !hex(r.configHash) || !hex(r.protocolSignature) || !['research', 'experience'].includes(r.profile) || !['interpretable', 'limited', 'invalid'].includes(r.state) || ![r.planned, r.presented, r.completed].every(integer) || r.planned !== (r.profile === 'research' ? 20 : 10) || r.presented > r.planned || r.completed > r.presented) return false
  if (expected && (r.configHash !== expected.configHash || r.protocolSignature !== expected.protocolSignature || r.profile !== expected.profile || expected.presented !== undefined && r.presented !== expected.presented)) return false
  if (r.state === 'invalid') return r.groups === null && r.decreasingMinusFixedReveals === null && r.completed === 0
  if (!r.groups || Object.keys(r.groups).length !== 2) return false
  let presented = 0, completed = 0, decided = 0
  for (const rule of ['fixed', 'decreasing'] as const) {
    const g = r.groups[rule]
    if (!g || !validSummary(g) || g.planned !== r.planned / 2 || !Array.isArray(g.conditions) || g.conditions.length !== 5) return false
    for (const [i, cell] of g.conditions.entries()) if (!cell || cell.majorityCount !== 13 + i || cell.planned !== r.planned / 10 || !validSummary(cell)) return false
    for (const k of ['planned', 'presented', 'decided', 'correct', 'completed', 'omissions', 'interruptions'] as const) if (g[k] !== g.conditions.reduce((n, x) => n + x[k], 0)) return false
    if (g.points !== (g.decided ? g.conditions.reduce((n, x) => n + (x.points ?? 0), 0) : null)) return false
    if (rule === 'fixed' && g.points !== (g.decided ? 100 * g.correct - 100 * (g.decided - g.correct) : null)) return false
    presented += g.presented; completed += g.completed; decided += g.decided
  }
  return presented === r.presented && completed === r.completed && decided > 0 && r.decreasingMinusFixedReveals === comparableDelta(r.groups) && (r.state !== 'interpretable' || completed === r.planned)
}
function publicSummary(g: IstGroup): IstGroup {
  const pick = (x: Omit<IstCondition, 'majorityCount'>) => ({ planned: x.planned, presented: x.presented, decided: x.decided, correct: x.correct, completed: x.completed, omissions: x.omissions, interruptions: x.interruptions, meanReveals: x.meanReveals, medianReveals: x.medianReveals, medianDecisionMs: x.medianDecisionMs, points: x.points })
  return { ...pick(g), conditions: g.conditions.map(x => ({ ...pick(x), majorityCount: x.majorityCount })) }
}
function publicCopy(r: IstReport): IstReport { return { testType: r.testType, engineVersion: r.engineVersion, scoringVersion: r.scoringVersion, configVersion: r.configVersion, reportDefinitionVersion: r.reportDefinitionVersion, presentationVersion: r.presentationVersion, parameterExplanationVersion: r.parameterExplanationVersion, configHash: r.configHash, protocolSignature: r.protocolSignature, profile: r.profile, state: r.state, planned: r.planned, presented: r.presented, completed: r.completed, groups: r.state === 'invalid' || !r.groups ? null : { fixed: publicSummary(r.groups.fixed), decreasing: publicSummary(r.groups.decreasing) }, decreasingMinusFixedReveals: r.state === 'invalid' ? null : r.decreasingMinusFixedReveals } }
/** Explicit whitelist: internal observations and quality reasons never escape into public JSON/images. */
export function projectIstReport(score: { metrics: Record<string, unknown>; quality: { state: string }; audit: { scorerVersion: string } }): IstReport {
  const m = score.metrics, b = m.reportBinding as Record<string, unknown> | undefined
  if (!b || b.testType !== IST_IDENTITY.testType || score.audit.scorerVersion !== '0.1.0' || b.engineVersion !== '0.1.0' || b.scoringVersion !== '0.1.0' || b.configVersion !== '0.1.0' || b.reportDefinitionVersion !== '0.1.0' || b.presentationVersion !== '0.1.0' || b.parameterExplanationVersion !== '0.1.0') throw Error('Unsupported IST report binding')
  const r: unknown = { ...IST_IDENTITY, reportDefinitionVersion: '0.1.0', presentationVersion: '0.1.0', parameterExplanationVersion: '0.1.0', configHash: b.configHash, protocolSignature: b.protocolSignature, profile: b.profile, state: score.quality.state, planned: m.planned, presented: m.presented, completed: m.completed, groups: score.quality.state === 'invalid' ? null : structuredClone(m.groups), decreasingMinusFixedReveals: score.quality.state === 'invalid' ? null : m.decreasingMinusFixedReveals }
  if (!isIstReport(r)) throw Error('Inconsistent IST public report')
  return publicCopy(r)
}
export const IST_COPY = {
  zh: { title: '这次，你在两种奖励规则下看了多少信息？', explanation: '下面只描述本次判断前揭开的不同格子数与全盘多数判断。多看或少看没有通用的更好方向；没有要求偏好的采样量。', tip: '下次核查信息时，可以先想清楚：“还缺什么证据？”“继续查看有什么成本？”再选择是否继续。', limit: '棋盘、规则先后、熟悉程度、输入和疲劳都可能影响记录。短版、中文与设备等效尚未验证；不推断稳定倾向、人格、IQ、诊断、同龄排名或岗位匹配。', invalid: '本次尚无可解释的多数判断记录。未判断不算答错或0分；这不是对能力的判断。请先了解说明，方便时再参与。' },
  en: { title: 'How much information did you open under each reward rule?', explanation: 'This describes distinct tiles opened before each judgment and whole-board majority choices in this session. More or less sampling is not universally better; there is no required sampling preference.', tip: 'When checking information, ask “What evidence is still missing?” and “What would it cost to look further?” before deciding whether to continue.', limit: 'Boards, rule order, familiarity, input method and fatigue may affect this record. Short-version, Chinese-language and device equivalence are unvalidated. No stable trait, personality, IQ, diagnosis, age ranking or job match is inferred.', invalid: 'No interpretable majority judgment is available yet. An unanswered round is not a wrong answer or zero points, and this is not an ability judgment. Review the instructions and participate again when convenient.' },
} as const
export function istDownload(r: IstReport) { if (!isIstReport(r) || r.state === 'invalid') return null; return JSON.stringify(publicCopy(r), null, 2) }
export function istTakeHomeSvg(r: IstReport, language: 'zh' | 'en' = 'zh'): string | null {
  if (!isIstReport(r) || r.state === 'invalid' || !r.groups) return null
  const en = language === 'en', fmt = (n: number | null) => n === null ? '—' : new Intl.NumberFormat(en ? 'en' : 'zh-CN', { maximumFractionDigits: 2 }).format(n)
  const a = r.groups.fixed, b = r.groups.decreasing
  return `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="190" viewBox="0 0 620 190"><rect width="620" height="190" fill="#FFFFFF"/><g fill="#1F2937" font-family="sans-serif" font-size="18"><text x="20" y="30">${en ? 'This session · mean tiles / valid judgments' : '本次记录 · 平均揭格 / 有效判断'}</text><text x="20" y="67">${en ? 'Fixed' : '固定'}: ${fmt(a.meanReveals)} · ${a.decided}/${a.planned}</text><text x="20" y="104">${en ? 'Decreasing' : '递减'}: ${fmt(b.meanReveals)} · ${b.decided}/${b.planned}</text><text x="20" y="141">${en ? 'Decreasing − fixed' : '递减 − 固定'}: ${fmt(r.decreasingMinusFixedReveals)}</text><text x="20" y="175" font-size="13">${r.state === 'limited' ? (en ? 'Partial record · ' : '部分记录 · ') : ''}${en ? 'Descriptive, no job prediction · ' : '仅本次描述，无岗位预测 · '}EDUK12.TOP</text></g></svg>`
}
