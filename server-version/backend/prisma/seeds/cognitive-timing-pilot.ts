import { Prisma, PrismaClient } from '@prisma/client'

type TimingPilotSeed = {
  testType: 'reaction' | 'gonogo' | 'cpt'
  configVersion: string
  name: string
  engineVersion: '1.0.0'
  scoringVersion: string
  config: Record<string, unknown>
}

const SIMULATED_REPORT_V2 = {
  reportVersion: '1.1.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'lit-sim-k12-v0.2',
  referenceBand: 'K7-9',
}

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.0',
  referenceMode: 'none' as const,
}

/**
 * FE-07B timing-pilot configs are deliberately DRAFT. The new configVersion is
 * the frozen admission identity for the frontend timing policy; the strict
 * config JSON, engine and scorer contracts remain unchanged.
 */
export const COGNITIVE_TIMING_PILOT_SEEDS: readonly TimingPilotSeed[] = [
  {
    testType: 'reaction',
    configVersion: '1.2.0',
    name: 'Reaction Time v1.2.0 [TIMING PILOT]',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: {
      totalTrials: 20,
      foreperiodMinMs: 700,
      foreperiodMaxMs: 1500,
      timeoutMs: 2000,
      readyDurationMs: 1000,
      report: SIMULATED_REPORT_V2,
    },
  },
  {
    testType: 'gonogo',
    configVersion: '1.1.0',
    name: 'Go/No-Go v1.1.0 [TIMING PILOT]',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      totalTrials: 120,
      nogoRatio: 0.25,
      stimulusMs: 800,
      isiMs: 500,
      validRtFloorMs: 100,
      report: NO_REFERENCE_REPORT,
    },
  },
  {
    testType: 'cpt',
    configVersion: '1.1.0',
    name: 'CPT-X v1.1.0 [TIMING PILOT]',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      totalTrials: 180,
      targetRatio: 0.2,
      blockCount: 3,
      stimulusMs: 500,
      isiMs: 1000,
      validRtFloorMs: 100,
      perseverationRtMs: 100,
      report: NO_REFERENCE_REPORT,
    },
  },
] as const

const deepEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => deepEqual(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => deepEqual(leftRecord[key], rightRecord[key]))
}

export async function seedCognitiveTimingPilotConfigs(prisma: PrismaClient): Promise<void> {
  for (const expected of COGNITIVE_TIMING_PILOT_SEEDS) {
    const existing = await prisma.cognitiveTestConfig.findUnique({
      where: {
        testType_configVersion: {
          testType: expected.testType,
          configVersion: expected.configVersion,
        },
      },
    })

    if (!existing) {
      await prisma.cognitiveTestConfig.create({
        data: {
          testType: expected.testType,
          configVersion: expected.configVersion,
          name: expected.name,
          status: 'DRAFT',
          engineVersion: expected.engineVersion,
          scoringVersion: expected.scoringVersion,
          config: expected.config as Prisma.InputJsonValue,
        },
      })
      console.log(`${expected.testType} timing-pilot Cognitive 配置已创建: configVersion=${expected.configVersion} status=DRAFT`)
      continue
    }

    const same = existing.name === expected.name
      && existing.status === 'DRAFT'
      && existing.engineVersion === expected.engineVersion
      && existing.scoringVersion === expected.scoringVersion
      && deepEqual(existing.config, expected.config)

    if (!same) {
      throw new Error(
        `cognitiveTestConfig ${expected.testType}/${expected.configVersion} already exists with divergent timing-pilot content; create a new configVersion instead of mutating it`,
      )
    }
  }
}
