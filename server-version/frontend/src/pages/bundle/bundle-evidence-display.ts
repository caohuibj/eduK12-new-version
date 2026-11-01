import { CHILD_BUNDLE_DISPLAYS } from './bundle-child-evidence-display'

export type BundleEvidence = {
  evidenceKey: string
  constructKey: string
  sourceKind: string
  quality: string
  value: { state: string; value?: unknown }
}
type MetricDisplay = { label: string; sourceKind: string; range?: { min: number; max: number }; ratio?: boolean; note: string; denominator?: string }

// Display vocabulary only: exact constructs identify the original measure and
// scale. Never infer ranges from a package name, a value or an arbitrary suffix.
const displays: Record<string, MetricDisplay> = {
  ...CHILD_BUNDLE_DISPLAYS,
  'gonogo.commission_rate': { label: 'Go/No-Go · No-Go 误按率', sourceKind: 'COGNITIVE_METRIC', range: { min: 0, max: 1 }, ratio: true, denominator: 'gonogo.nogo_trial_count', note: '分母是不应按键的 No-Go 试次。' },
  'gonogo.omission_rate': { label: 'Go/No-Go · Go 遗漏率', sourceKind: 'COGNITIVE_METRIC', range: { min: 0, max: 1 }, ratio: true, denominator: 'gonogo.go_trial_count', note: '分母是应按键的 Go 试次。' },
  'gonogo.d_prime': { label: 'Go/No-Go · 辨别敏感度 d′', sourceKind: 'COGNITIVE_METRIC', note: '本次信号辨别指标，保留负值；无常模等级。' },
  'cpt.omission_rate': { label: 'CPT-X · 目标遗漏率', sourceKind: 'COGNITIVE_METRIC', range: { min: 0, max: 1 }, ratio: true, denominator: 'cpt.target_count', note: '分母是需要按键的目标试次。' },
  'cpt.commission_rate': { label: 'CPT-X · 非目标误报率', sourceKind: 'COGNITIVE_METRIC', range: { min: 0, max: 1 }, ratio: true, note: '分母是非目标试次；当前投影不含其计数，不反推误报次数。' },
  'cpt.d_prime': { label: 'CPT-X · 目标辨别 d′', sourceKind: 'COGNITIVE_METRIC', note: '同时考虑命中与误报的辨别指标，保留负值。' },
  'cpt.rt_icv': { label: 'CPT-X · 命中反应时变异系数', sourceKind: 'COGNITIVE_METRIC', note: '正确命中反应时的标准差／均值，没有 0–1 上限。' },
  'flanker.flanker_effect_ms': { label: 'Flanker · 干扰效应（ms）', sourceKind: 'COGNITIVE_METRIC', note: '不一致条件减一致条件的正确有效反应中位时差，单位为毫秒，保留负值；需结合两条件准确率阅读。' },
  'flanker.congruent_accuracy': { label: 'Flanker · 一致条件准确率', sourceKind: 'COGNITIVE_METRIC', range: { min: 0, max: 1 }, ratio: true, note: '该条件正确有效反应次数／该条件试次数；原值为 0–1 比例，显示为百分比。' },
  'flanker.incongruent_accuracy': { label: 'Flanker · 不一致条件准确率', sourceKind: 'COGNITIVE_METRIC', range: { min: 0, max: 1 }, ratio: true, note: '该条件正确有效反应次数／该条件试次数；原值为 0–1 比例，显示为百分比。' },
  'texi.working_memory_mean': { label: 'TEXI · 工作记忆相关困难（自评均分）', sourceKind: 'SCALE_SCORE', range: { min: 1, max: 5 }, note: '9 题原始均分，高分表示报告的日常困难更多；不是能力分或同龄排名。' },
  'texi.inhibition_mean': { label: 'TEXI · 抑制与自我调节相关困难（自评均分）', sourceKind: 'SCALE_SCORE', range: { min: 1, max: 5 }, note: '11 题原始均分，高分表示报告的日常困难更多；不是能力分或同龄排名。' },
  'adexi_v1.working_memory_sum': { label: 'ADEXI · 工作记忆相关困难（自评）', sourceKind: 'SCALE_SCORE', range: { min: 9, max: 45 }, note: '项目中文适配，9 题合计分；高分表示报告的困难更多。' },
  'adexi_v1.inhibition_sum': { label: 'ADEXI · 抑制相关困难（自评）', sourceKind: 'SCALE_SCORE', range: { min: 5, max: 25 }, note: '项目中文适配，5 题合计分；高分表示报告的困难更多。' },
}

export function displayFor(item: BundleEvidence) {
  const display = displays[item.constructKey]
  return display?.sourceKind === item.sourceKind ? display : undefined
}
export function hasCrossMethodEvidence(evidence: BundleEvidence[]): boolean {
  return ['COGNITIVE_METRIC', 'SCALE_SCORE'].every(kind => evidence.some(item => item.sourceKind === kind && displayFor(item)))
}
export function bundleEvidenceLabel(item: BundleEvidence): string {
  return item.value.state === 'present' && ['interpretable', 'limited'].includes(item.quality) ? displayFor(item)?.label ?? item.constructKey : item.constructKey
}
export function numeric(item: BundleEvidence | undefined): number | null {
  return item && ['interpretable', 'limited'].includes(item.quality) && item.value.state === 'present'
    && typeof item.value.value === 'number' && Number.isFinite(item.value.value) ? item.value.value : null
}
export function bundleEvidenceValue(item: BundleEvidence): string {
  if (!['interpretable', 'limited'].includes(item.quality) || item.value.state !== 'present') return '暂无可展示结果'
  return String(item.value.value)
}
