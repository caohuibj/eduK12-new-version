import simulatedReferenceJson from './reference-data/simulated/sim-k12-v0.1.json'
import {
  SIMULATED_REFERENCE_VERSION,
  type SimulatedReference,
} from './reference-data/generate-simulated-reference'

export interface CognitiveReference {
  mode: 'none' | 'simulated' | 'literature'
  status: 'not_requested' | 'provisional' | 'unavailable'
  available: boolean
  label: string
  version: string | null
  band: string | null
  referencePosition: number | null
  disclaimer: string
}

const simulatedReference = simulatedReferenceJson as SimulatedReference
const METRIC_BY_TEST: Record<string, string> = {
  reaction: 'medianRtMs',
  memory: 'maxSpan',
  stroop: 'accuracy',
}

const unavailable = (
  mode: CognitiveReference['mode'],
  version: string | null,
  band: string | null,
  label: string,
  disclaimer: string,
): CognitiveReference => ({
  mode,
  status: mode === 'none' ? 'not_requested' : 'unavailable',
  available: false,
  label,
  version,
  band,
  referencePosition: null,
  disclaimer,
})

const rankPosition = (value: number, values: number[], direction: 'lower-is-better' | 'higher-is-better') => {
  const favorable = values.filter((candidate) =>
    direction === 'lower-is-better' ? candidate >= value : candidate <= value
  ).length
  return Math.max(0, Math.min(100, Math.round((favorable / values.length) * 100)))
}

/** 结果完成后解析参考层；scorer 不调用此函数。 */
export const resolveCognitiveReference = (input: {
  testType: string
  metrics: Record<string, unknown>
  score: number
  referenceMode: CognitiveReference['mode']
  referenceVersion?: string | null
  referenceBand?: string | null
}): CognitiveReference => {
  const version = input.referenceVersion ?? null
  const band = input.referenceBand ?? null
  if (input.referenceMode === 'none') {
    return unavailable('none', null, null, '未启用群体参考', '本结果不提供群体常模、百分位或诊断结论。')
  }
  if (input.referenceMode === 'literature') {
    return unavailable(
      'literature',
      version,
      band,
      '研究参考暂不可用',
      '当前任务协议尚未达到文献参考匹配门槛，因此不展示研究常模或百分位。'
    )
  }
  if (version !== SIMULATED_REFERENCE_VERSION || !band) {
    return unavailable(
      'simulated',
      version,
      band,
      '模拟参考不可用',
      '当前没有匹配的模拟参考版本或参考区间。'
    )
  }

  const bandData = simulatedReference.bands.find((candidate) => candidate.id === band)
  const metricKey = METRIC_BY_TEST[input.testType]
  const metric = metricKey ? bandData?.metrics[metricKey] : undefined
  const value = input.metrics[metricKey]
  if (!bandData || !metric || typeof value !== 'number' || !Number.isFinite(value) || metric.values.length === 0) {
    return unavailable(
      'simulated',
      version,
      band,
      '模拟参考不可用',
      '当前任务没有匹配的模拟参考指标。'
    )
  }

  return {
    mode: 'simulated',
    status: 'provisional',
    available: true,
    label: '模拟参考位置',
    version,
    band,
    referencePosition: rankPosition(value, metric.values, metric.direction),
    disclaimer: '模拟参考用于试运行与报告体验验证，不代表真实同龄人常模。',
  }
}
