export const SIMULATED_REFERENCE_VERSION = 'sim-k12-v0.1'
export const SIMULATED_REFERENCE_SEED = 20260820
export const SIMULATED_REFERENCE_GENERATOR_VERSION = 'sim-ref-generator-v1'

export type SimulatedMetric = {
  direction: 'lower-is-better' | 'higher-is-better'
  values: number[]
}

export type SimulatedReference = {
  version: string
  synthetic: true
  seed: number
  bands: Array<{
    id: string
    sampleSize: number
    metrics: Record<string, SimulatedMetric>
  }>
  generatedAt: string
  generatorVersion: string
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

/** 固定种子生成仅供开发/内部试点的 synthetic reference fixture。 */
export const generateSimulatedReference = (
  seed = SIMULATED_REFERENCE_SEED,
): SimulatedReference => {
  const random = mulberry32(seed)
  const sampleSize = 32
  return {
    version: SIMULATED_REFERENCE_VERSION,
    synthetic: true,
    seed,
    bands: [{
      id: 'K7-9',
      sampleSize,
      metrics: {
        medianRtMs: {
          direction: 'lower-is-better',
          values: Array.from({ length: sampleSize }, () => Math.round(220 + random() * 260)),
        },
        maxSpan: {
          direction: 'higher-is-better',
          values: Array.from({ length: sampleSize }, () => 2 + Math.floor(random() * 8)),
        },
        accuracy: {
          direction: 'higher-is-better',
          values: Array.from({ length: sampleSize }, () => Math.round((0.45 + random() * 0.5) * 100) / 100),
        },
      },
    }],
    generatedAt: '2026-08-20T00:00:00.000Z',
    generatorVersion: SIMULATED_REFERENCE_GENERATOR_VERSION,
  }
}

export const getSimulatedReference = (version: string): SimulatedReference => {
  if (version !== SIMULATED_REFERENCE_VERSION) throw new Error(`Unknown simulated reference version: ${version}`)
  return generateSimulatedReference()
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(generateSimulatedReference(), null, 2)}\n`)
}
