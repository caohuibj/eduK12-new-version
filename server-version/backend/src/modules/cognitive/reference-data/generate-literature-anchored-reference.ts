import type { ProtocolConstraint } from '../reference-protocol'

export const LITERATURE_ANCHORED_SIM_VERSION = 'lit-sim-k12-v0.2'
export const LITERATURE_ANCHORED_DEFINITION_VERSION = 'lit-sim-def-v1'
export const LITERATURE_ANCHORED_SIM_SEED = 20260823
export const LITERATURE_ANCHORED_GENERATOR_VERSION = 'lit-sim-generator-v1'

export type MetricDirection = 'lower-is-better' | 'higher-is-better'

export type AnchoredMetric = {
  direction: MetricDirection
  distribution: 'lognormal' | 'beta' | 'truncated-discrete'
  params: Record<string, number>
  mean: number
  sd: number
  values: number[]
}

export type AnchoredBand = {
  id: string
  ageRange: string
  sampleSize: number
  metrics: Record<string, AnchoredMetric>
}

export type LiteratureAnchoredSimulatedReference = {
  version: string
  referenceSetVersion: string
  referenceDefinitionVersion: string
  synthetic: true
  seed: number
  generatorVersion: string
  generatedAt: string
  protocol: ProtocolConstraint
  metricKey: string
  bands: AnchoredBand[]
  disclaimer: string
}

const mulberry32 = (seed: number): (() => number) => {
  let value = seed | 0
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const gaussian = (random: () => number): number => {
  const u1 = Math.max(random(), 1e-12)
  const u2 = random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

const sampleLogNormal = (random: () => number, mu: number, sigma: number): number =>
  Math.exp(mu + sigma * gaussian(random))

const gammaMarsaglia = (random: () => number, shape: number): number => {
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x = gaussian(random)
    let v = 1 + c * x
    while (v <= 0) {
      x = gaussian(random)
      v = 1 + c * x
    }
    v = v * v * v
    const u = random()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

const sampleBeta = (random: () => number, alpha: number, beta: number): number => {
  const x = gammaMarsaglia(random, alpha)
  const y = gammaMarsaglia(random, beta)
  return x / (x + y)
}

const sampleTruncatedDiscrete = (
  random: () => number,
  min: number,
  max: number,
  mean: number,
  sd: number,
): number => Math.max(min, Math.min(max, Math.round(mean + sd * gaussian(random))))

const stats = (values: number[]): { mean: number; sd: number } => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return { mean, sd: Math.sqrt(variance) }
}

const SAMPLE_SIZE = 48

type BandSpec = {
  id: string
  ageRange: string
  seedOffset: number
  metrics: Record<string, {
    direction: MetricDirection
    distribution: AnchoredMetric['distribution']
    params: Record<string, number>
  }>
}

const buildBand = (random: () => number, spec: BandSpec): AnchoredBand => {
  const metrics: Record<string, AnchoredMetric> = {}
  for (const [key, metric] of Object.entries(spec.metrics)) {
    const values = Array.from({ length: SAMPLE_SIZE }, () => {
      if (metric.distribution === 'lognormal') {
        return Math.round(sampleLogNormal(random, metric.params.mu, metric.params.sigma))
      }
      if (metric.distribution === 'beta') {
        return Math.round(sampleBeta(random, metric.params.alpha, metric.params.beta) * 100) / 100
      }
      return sampleTruncatedDiscrete(
        random,
        metric.params.min,
        metric.params.max,
        metric.params.mean,
        metric.params.sd,
      )
    })
    const { mean, sd } = stats(values)
    metrics[key] = {
      direction: metric.direction,
      distribution: metric.distribution,
      params: metric.params,
      mean: Math.round(mean * 1000) / 1000,
      sd: Math.round(sd * 1000) / 1000,
      values,
    }
  }
  return { id: spec.id, ageRange: spec.ageRange, sampleSize: SAMPLE_SIZE, metrics }
}

const TASKS: Array<{
  testType: string
  metricKey: string
  protocol: ProtocolConstraint
  bands: BandSpec[]
}> = [
  {
    testType: 'reaction',
    metricKey: 'medianRtMs',
    protocol: {
      testType: 'reaction',
      engineVersions: ['1.0.0'],
      scoringVersions: ['1.1.0'],
      profiles: ['standard', 'research'],
      minTotalTrials: 20,
      foreperiodMinMs: 700,
      foreperiodMaxMs: 1500,
      timeoutMs: 2000,
    },
    bands: [
      {
        id: 'K7-9',
        ageRange: '7-9',
        seedOffset: 1,
        metrics: {
          medianRtMs: { direction: 'lower-is-better', distribution: 'lognormal', params: { mu: Math.log(330), sigma: 0.22 } },
        },
      },
      {
        id: 'K10-12',
        ageRange: '10-12',
        seedOffset: 2,
        metrics: {
          medianRtMs: { direction: 'lower-is-better', distribution: 'lognormal', params: { mu: Math.log(290), sigma: 0.2 } },
        },
      },
    ],
  },
  {
    testType: 'memory',
    metricKey: 'maxSpan',
    protocol: {
      testType: 'memory',
      engineVersions: ['1.0.0'],
      scoringVersions: ['1.1.0'],
      profiles: ['standard', 'research'],
      startLength: 3,
      minMaxLength: 8,
    },
    bands: [
      {
        id: 'K7-9',
        ageRange: '7-9',
        seedOffset: 11,
        metrics: {
          maxSpan: { direction: 'higher-is-better', distribution: 'truncated-discrete', params: { min: 3, max: 9, mean: 5.2, sd: 1.1 } },
        },
      },
      {
        id: 'K10-12',
        ageRange: '10-12',
        seedOffset: 12,
        metrics: {
          maxSpan: { direction: 'higher-is-better', distribution: 'truncated-discrete', params: { min: 3, max: 9, mean: 6.1, sd: 1.0 } },
        },
      },
    ],
  },
  {
    testType: 'stroop',
    metricKey: 'stroopEffectMs',
    protocol: {
      testType: 'stroop',
      engineVersions: ['1.0.0'],
      scoringVersions: ['1.1.0'],
      profiles: ['standard', 'research'],
      minTotalTrials: 40,
      congruentRatio: 0.5,
      validRtFloorMs: 200,
    },
    bands: [
      {
        id: 'K7-9',
        ageRange: '7-9',
        seedOffset: 21,
        metrics: {
          stroopEffectMs: { direction: 'lower-is-better', distribution: 'lognormal', params: { mu: Math.log(180), sigma: 0.32 } },
          incongruentAccuracy: { direction: 'higher-is-better', distribution: 'beta', params: { alpha: 12, beta: 3 } },
        },
      },
      {
        id: 'K10-12',
        ageRange: '10-12',
        seedOffset: 22,
        metrics: {
          stroopEffectMs: { direction: 'lower-is-better', distribution: 'lognormal', params: { mu: Math.log(120), sigma: 0.28 } },
          incongruentAccuracy: { direction: 'higher-is-better', distribution: 'beta', params: { alpha: 16, beta: 2.5 } },
        },
      },
    ],
  },
]

export const generateLiteratureAnchoredSimulatedReference = (
  seed = LITERATURE_ANCHORED_SIM_SEED,
): Record<string, LiteratureAnchoredSimulatedReference> => {
  const sets: Record<string, LiteratureAnchoredSimulatedReference> = {}
  for (const task of TASKS) {
    sets[task.testType] = {
      version: LITERATURE_ANCHORED_SIM_VERSION,
      referenceSetVersion: `${LITERATURE_ANCHORED_SIM_VERSION}/${task.testType}`,
      referenceDefinitionVersion: LITERATURE_ANCHORED_DEFINITION_VERSION,
      synthetic: true,
      seed,
      generatorVersion: LITERATURE_ANCHORED_GENERATOR_VERSION,
      generatedAt: '2026-08-23T00:00:00.000Z',
      protocol: task.protocol,
      metricKey: task.metricKey,
      bands: task.bands.map((band) => buildBand(mulberry32(seed + band.seedOffset), band)),
      disclaimer: '仅为文献锚定模拟参考，不代表中国学生常模。不得解释为诊断。',
    }
  }
  return sets
}

export const getLiteratureAnchoredSimulatedReference = (
  testType: string,
  version = LITERATURE_ANCHORED_SIM_VERSION,
): LiteratureAnchoredSimulatedReference => {
  if (version !== LITERATURE_ANCHORED_SIM_VERSION) {
    throw new Error(`Unknown literature-anchored simulated reference version: ${version}`)
  }
  const set = generateLiteratureAnchoredSimulatedReference()[testType]
  if (!set) throw new Error(`No literature-anchored simulated reference for ${testType}`)
  return set
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(generateLiteratureAnchoredSimulatedReference(), null, 2)}\n`)
}
