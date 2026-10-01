import type { CognitiveReportReadingPolicy } from '../participant-presentation.types'
import type { CognitiveProfile, CognitiveScoreResult } from './types'

export interface ReportVisual {
  kind: 'reaction_trials' | 'memory_lengths' | 'metrics'
  title: string
  unit: string
  points: Array<{ label: string; value: number | null; status?: 'recorded' | 'missing' }>
  caption: string
}

export interface ReportReading {
  schemaVersion: 2
  reportVersion: string
  presentationVersion: string
  title: string
  introduction: string
  illustration?: 'signal' | 'sequence' | 'stop' | 'rules'
  interpretation: { state: 'available' | 'qualified' | 'withheld'; reasons: string[]; withheldMetricKeys: string[] }
  feedback: { summary: string; evidenceMetricKeys: string[]; nextStep: string }
  caveats: string[]
  methodCaveats?: string[]
  visuals: ReportVisual[]
  popular?: CognitiveReportReadingPolicy['popular']
  professional?: {
    construct: string
    procedure: string
    interpretation: string
    confounders: string[]
    parameters: Array<{ label: string; value: string }>
    metrics: Array<{ key: string; label: string; formatted: string; unit: string; definition: string; readingHint: string }>
    quality: Array<{ key: string; label: string; active: boolean; description: string; effect: string }>
    withheld: Array<{ key: string; label: string; reasons: string[] }>
  }
}

export const finiteMetric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export const readingMetricAllowed = (input: {
  key: string; policy: CognitiveReportReadingPolicy; profile: CognitiveProfile | null; score: CognitiveScoreResult
}): boolean => !input.policy.hiddenByProfile?.[input.profile ?? 'standard']?.includes(input.key)
  && !(input.policy.metricGates[input.key] ?? []).some(flag => input.score.quality.flags[flag])

/** Graphs contain a bounded, display-only projection; never sequences, responses or device IDs. */
export const buildReadingVisual = (input: {
  policy: CognitiveReportReadingPolicy
  metrics: Record<string, unknown>
  allowedKeys: Set<string>
  labels: Record<string, string>
  units: Record<string, string>
  trials?: unknown[]
  config?: Record<string, unknown>
}): ReportVisual[] => {
  const chart = input.policy.chart
  if (!chart) return []
  if (chart.kind === 'reaction_trials' && input.allowedKeys.has('medianRtMs') && input.trials?.length && finiteMetric(input.config?.timeoutMs)) {
    const formalTrials = input.trials.filter(trial => {
      if (!trial || typeof trial !== 'object') return false
      const phase = (trial as { phase?: string }).phase
      return !phase || phase === 'test'
    }).sort((a, b) => ((a as { trialIndex?: number }).trialIndex ?? 0) - ((b as { trialIndex?: number }).trialIndex ?? 0))
    const points = formalTrials.slice(0, 240).flatMap((trial, index) => {
      if (!trial || typeof trial !== 'object') return []
      const t = trial as { trialIndex?: number; phase?: string; payload?: { rtMs?: unknown; interrupted?: boolean } }
      if (t.phase && t.phase !== 'test') return []
      const rt = t.payload?.rtMs
      // The scorer admits finite responses of at least 100 ms and within the frozen timeout. Interruption remains a separate quality flag.
      const value = finiteMetric(rt) && rt >= 100 && rt <= (input.config!.timeoutMs as number) ? rt : null
      return [{ label: String((t.trialIndex ?? index) + 1), value, status: value === null ? 'missing' as const : 'recorded' as const }]
    })
    if (!points.length) return []
    return [{ kind: chart.kind, title: '每一次作答，都看得见', unit: 'ms', points,
      caption: '圆点为有效反应用时。未响应或无效记录单独标记，不对应纵轴用时；图表不填零，不推断原因。' + (formalTrials.length > 240 ? '仅展示前 240 次正式记录，核心指标仍基于完整评分结果。' : '') }]
  }
  if (chart.kind === 'memory_lengths' && input.allowedKeys.has('maxSpan') && input.trials?.length) {
    const counts = new Map<number, { correct: number; total: number }>()
    for (const trial of input.trials) {
      if (!trial || typeof trial !== 'object') continue
      const t = trial as { phase?: string; payload?: { length?: unknown; sequence?: unknown; response?: unknown; interrupted?: boolean } }
      if (t.phase && t.phase !== 'test') continue
      const p = t.payload
      if (!p || !finiteMetric(p.length) || !Array.isArray(p.sequence) || !Array.isArray(p.response)) continue
      const row = counts.get(p.length) ?? { correct: 0, total: 0 }
      row.total++
      if (p.sequence.length === p.response.length && p.sequence.every((digit, i) => digit === (p.response as unknown[])[i])) row.correct++
      counts.set(p.length, row)
    }
    if (!counts.size) return []
    return [{ kind: chart.kind, title: '不同长度，这次记住了多少？', unit: 'ratio',
      points: [...counts].sort(([a], [b]) => a - b).map(([length, row]) => ({ label: `${length} 位 · ${row.correct}/${row.total} 次`, value: row.correct / row.total })),
      caption: '每条记录显示该长度下尝试的正确比例与分母；未测量的长度不补零。最大正确长度仅描述本次任务。' }]
  }
  if (chart.pointUnit && chart.metricKeys.length === 1 && input.allowedKeys.has(chart.metricKeys[0])) {
    const value = input.metrics[chart.metricKeys[0]]
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const points = Object.entries(value).filter(([level, item]) => /^\d+$/.test(level) && finiteMetric(item))
      .sort(([a], [b]) => Number(a) - Number(b)).slice(0, 20)
      .map(([level, item]) => ({ label: `${level}-back`, value: item as number }))
    return points.length ? [{ kind: 'metrics', title: '不同回看难度，分别阅读', unit: chart.pointUnit, points,
      caption: '按回看难度呈现本次任务内的区分指标（d′），不把不同难度合成能力分或同龄排名。' }] : []
  }
  const keys = chart.metricKeys.filter(key => input.allowedKeys.has(key) && finiteMetric(input.metrics[key]))
  const units = new Set(keys.map(key => input.units[key]))
  if (!keys.length || units.size !== 1) return []
  return [{ kind: 'metrics', title: '用图看懂本次记录', unit: input.units[keys[0]],
    points: keys.map(key => ({ label: input.labels[key] ?? key, value: input.metrics[key] as number })),
    caption: '只展示同一单位的本次指标。柱条用于呈现记录，不是人口排名或能力等级。' }]
}
