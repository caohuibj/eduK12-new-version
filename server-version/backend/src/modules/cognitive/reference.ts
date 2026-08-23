import simulatedReferenceJson from './reference-data/simulated/sim-k12-v0.1.json'
import literatureAnchoredJson from './reference-data/simulated/lit-sim-k12-v0.2.json'
import {
  SIMULATED_REFERENCE_VERSION,
  type SimulatedReference,
} from './reference-data/generate-simulated-reference'
import {
  LITERATURE_ANCHORED_SIM_VERSION,
  type LiteratureAnchoredSimulatedReference,
} from './reference-data/generate-literature-anchored-reference'
import { LITERATURE_REFERENCE_SETS, literatureSetIsEnabled } from './reference-data/literature/sets'
import { matchProtocol, type ObservedProtocol } from './reference-protocol'

export interface CognitiveReferenceComparison {
  metricKey: string
  observed: number
  referenceMean: number
  referenceSd: number
  sdDelta: number | null
  rangeLabel: string
  meanLabel: string
}

export interface CognitiveReference {
  mode: 'none' | 'simulated' | 'literature'
  status: 'not_requested' | 'provisional' | 'unavailable'
  available: boolean
  label: string
  version: string | null
  band: string | null
  /** 不再计算百分位位置；保留字段以免旧客户端读取崩溃，恒为 null。 */
  referencePosition: null
  comparison: CognitiveReferenceComparison | null
  protocolMatched: boolean
  disclaimer: string
  sources?: Array<{ doi?: string; citation: string }>
}

const simulatedReference = simulatedReferenceJson as SimulatedReference
const literatureAnchoredSets = literatureAnchoredJson as Record<string, LiteratureAnchoredSimulatedReference>

const LEGACY_METRIC_BY_TEST: Record<string, string> = {
  reaction: 'medianRtMs',
  memory: 'maxSpan',
  stroop: 'accuracy',
}

const NONE_DISCLAIMER = '本结果不提供群体常模或诊断结论。'
const HIDDEN_DISCLAIMER = '数据质量不足，不展示群体参考。'
const PROTOCOL_DISCLAIMER = '当前任务协议尚未达到参考匹配门槛，因此不展示研究参考。'

const unavailable = (
  mode: CognitiveReference['mode'],
  version: string | null,
  band: string | null,
  label: string,
  disclaimer: string,
  protocolMatched = false,
): CognitiveReference => ({
  mode,
  status: mode === 'none' ? 'not_requested' : 'unavailable',
  available: false,
  label,
  version,
  band,
  referencePosition: null,
  comparison: null,
  protocolMatched,
  disclaimer,
})

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length

const sd = (values: number[]): number => {
  if (values.length === 0) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length)
}

export const describeRelativeSd = (
  observed: number,
  referenceMean: number,
  referenceSd: number,
  meanNoun = '参考均值',
  closeLabel = '接近该参考分布范围',
): string => {
  if (!(referenceSd > 0)) return closeLabel
  const z = (observed - referenceMean) / referenceSd
  if (Math.abs(z) < 0.5) return closeLabel
  const magnitude = Math.round(Math.abs(z) * 10) / 10
  return observed > referenceMean
    ? `高于${meanNoun}约 ${magnitude} SD`
    : `低于${meanNoun}约 ${magnitude} SD`
}

const comparisonOf = (
  metricKey: string,
  observed: number,
  referenceMean: number,
  referenceSd: number,
  meanLabel = '参考均值',
  closeLabel = '接近该参考分布范围',
): CognitiveReferenceComparison => ({
  metricKey,
  observed,
  referenceMean,
  referenceSd,
  sdDelta: referenceSd > 0 ? Math.round(((observed - referenceMean) / referenceSd) * 100) / 100 : null,
  rangeLabel: describeRelativeSd(observed, referenceMean, referenceSd, meanLabel, closeLabel),
  meanLabel,
})

const observedProtocol = (input: {
  testType: string
  profile?: string | null
  engineVersion?: string
  scoringVersion?: string
  config?: Record<string, unknown>
}): ObservedProtocol => ({
  testType: input.testType,
  profile: input.profile,
  engineVersion: input.engineVersion,
  scoringVersion: input.scoringVersion,
  config: input.config,
})

/** 结果完成后解析参考层；scorer 不调用此函数。 */
export const resolveCognitiveReference = (input: {
  testType: string
  metrics: Record<string, unknown>
  score: number
  referenceMode: CognitiveReference['mode']
  referenceVersion?: string | null
  referenceBand?: string | null
  interpretable?: boolean
  profile?: string | null
  engineVersion?: string
  scoringVersion?: string
  configVersion?: string
  config?: Record<string, unknown>
}): CognitiveReference => {
  const version = input.referenceVersion ?? null
  const band = input.referenceBand ?? null
  if (input.referenceMode === 'none') {
    return unavailable('none', null, null, '未启用群体参考', NONE_DISCLAIMER)
  }
  if (input.interpretable === false) {
    return unavailable(input.referenceMode, version, band, '参考已隐藏', HIDDEN_DISCLAIMER)
  }

  const protocol = observedProtocol(input)

  if (input.referenceMode === 'literature') {
    const sets = LITERATURE_REFERENCE_SETS.filter((set) => set.testType === input.testType)
    const selected = version ? sets.find((set) => set.version === version) : sets.find((set) => matchProtocol(set.protocol, protocol))
    if (!selected || !matchProtocol(selected.protocol, protocol) || !literatureSetIsEnabled(selected)) {
      return unavailable(
        'literature',
        version ?? selected?.version ?? null,
        band,
        '研究参考暂不可用',
        selected && !literatureSetIsEnabled(selected)
          ? selected.disclaimer
          : PROTOCOL_DISCLAIMER,
        Boolean(selected && matchProtocol(selected.protocol, protocol)),
      )
    }
    if (!band) {
      return unavailable('literature', selected.version, null, '研究参考暂不可用', '未指定参考年龄带，不展示研究参考。', true)
    }
    const bandData = selected.bands.find((candidate) => candidate.id === band)
    const value = input.metrics[selected.metricKey]
    if (!bandData || typeof value !== 'number' || !Number.isFinite(value)) {
      return unavailable('literature', selected.version, band, '研究参考暂不可用', '参考年龄带不匹配或指标不可用。', true)
    }
    return {
      mode: 'literature',
      status: 'provisional',
      available: true,
      label: '文献锚定研究参考',
      version: selected.version,
      band: bandData.id,
      referencePosition: null,
      comparison: comparisonOf(
        selected.metricKey,
        value,
        bandData.mean,
        bandData.sd,
        '文献参考均值',
        '接近该研究样本报告范围',
      ),
      protocolMatched: true,
      disclaimer: selected.disclaimer,
      sources: selected.sources,
    }
  }

  if (version === LITERATURE_ANCHORED_SIM_VERSION) {
    const set = literatureAnchoredSets[input.testType]
    if (!set || !matchProtocol(set.protocol, protocol)) {
      return unavailable('simulated', version, band, '模拟参考不可用', PROTOCOL_DISCLAIMER)
    }
    if (!band) {
      return unavailable('simulated', version, null, '模拟参考不可用', '未指定参考年龄带，不展示模拟参考。', true)
    }
    const bandData = set.bands.find((candidate) => candidate.id === band)
    const metric = bandData?.metrics[set.metricKey]
    const value = input.metrics[set.metricKey]
    if (!bandData || !metric || typeof value !== 'number' || !Number.isFinite(value)) {
      return unavailable('simulated', version, band, '模拟参考不可用', '参考年龄带不匹配或没有匹配的模拟参考指标。', true)
    }
    return {
      mode: 'simulated',
      status: 'provisional',
      available: true,
      label: '内部模拟参考',
      version,
      band,
      referencePosition: null,
      comparison: comparisonOf(
        set.metricKey,
        value,
        metric.mean,
        metric.sd,
        '内部模拟参考均值',
        '接近该模拟参考范围',
      ),
      protocolMatched: true,
      disclaimer: set.disclaimer,
    }
  }

  if (version !== SIMULATED_REFERENCE_VERSION || !band) {
    return unavailable('simulated', version, band, '模拟参考不可用', '当前没有匹配的模拟参考版本或参考区间。')
  }

  const bandData = simulatedReference.bands.find((candidate) => candidate.id === band)
  const metricKey = LEGACY_METRIC_BY_TEST[input.testType]
  const metric = metricKey ? bandData?.metrics[metricKey] : undefined
  const value = metricKey ? input.metrics[metricKey] : undefined
  if (!bandData || !metric || typeof value !== 'number' || !Number.isFinite(value) || metric.values.length === 0) {
    return unavailable('simulated', version, band, '模拟参考不可用', '当前任务没有匹配的模拟参考指标。')
  }

  const referenceMean = mean(metric.values)
  const referenceSd = sd(metric.values)
  return {
    mode: 'simulated',
    status: 'provisional',
    available: true,
    label: '历史模拟参考',
    version,
    band,
    referencePosition: null,
    comparison: comparisonOf(
      metricKey,
      value,
      referenceMean,
      referenceSd,
      '历史模拟参考均值',
      '接近该历史模拟分布范围',
    ),
    protocolMatched: true,
    disclaimer: '由固定种子开发模拟数据生成，不代表真实样本或文献样本；仅保留用于历史结果兼容。',
  }
}

export const resolveCognitiveReferenceForResult = (input: {
  testType: string
  metrics: Record<string, unknown>
  score: number
  qualityFlags?: Record<string, unknown>
  config: Record<string, unknown>
  profile?: string | null
  engineVersion?: string
  scoringVersion?: string
  configVersion?: string
}): CognitiveReference => {
  const report = (input.config.report ?? {}) as Record<string, unknown>
  return resolveCognitiveReference({
    testType: input.testType,
    metrics: input.metrics,
    score: input.score,
    interpretable: input.qualityFlags?.interpretable !== false,
    profile: input.profile,
    engineVersion: input.engineVersion,
    scoringVersion: input.scoringVersion,
    configVersion: input.configVersion,
    config: input.config,
    referenceMode: (report.referenceMode as CognitiveReference['mode'] | undefined) ?? 'none',
    referenceVersion: report.referenceVersion as string | undefined,
    referenceBand: report.referenceBand as string | undefined,
  })
}
