import { beforeAll, describe, expect, it } from 'vitest'
import { buildCognitiveResearchPackage } from '../../modules/cognitive/export.service'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import {
  freezeAssignmentProfile,
  mergeProfileConfig,
  readFrozenReport,
} from '../../modules/cognitive/profile-freeze'

const reportNone = { reportVersion: '1.0.0', referenceMode: 'none' as const }
const reportLiteratureSim = {
  reportVersion: '1.1.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'lit-sim-k12-v0.2',
  referenceBand: 'K7-9',
}

const baseConfigs: Record<string, Record<string, unknown>> = {
  reaction: {
    totalTrials: 20,
    foreperiodMinMs: 700,
    foreperiodMaxMs: 1500,
    timeoutMs: 2000,
    readyDurationMs: 1000,
    report: reportLiteratureSim,
  },
  memory: {
    startLength: 3,
    maxLength: 9,
    trialsPerLevel: 2,
    digitDisplayMs: 800,
    digitIntervalMs: 200,
    readyDurationMs: 1000,
    inactivityGuardMs: 30000,
    report: reportLiteratureSim,
  },
  stroop: {
    totalTrials: 40,
    congruentRatio: 0.5,
    fixationMs: 500,
    stimulusDurationMs: 2000,
    isiMs: 500,
    validRtFloorMs: 200,
    report: reportLiteratureSim,
  },
  gonogo: {
    totalTrials: 120,
    nogoRatio: 0.25,
    stimulusMs: 800,
    isiMs: 500,
    validRtFloorMs: 100,
    report: reportNone,
  },
  cpt: {
    totalTrials: 180,
    targetRatio: 0.2,
    blockCount: 3,
    stimulusMs: 500,
    isiMs: 1000,
    validRtFloorMs: 100,
    perseverationRtMs: 100,
    report: reportNone,
  },
  nback: {
    nLevels: [1, 2],
    trialCountByN: [40, 60],
    blockCountByN: [1, 1],
    targetRatio: 0.3,
    stimulusMs: 500,
    isiMs: 2000,
    validRtFloorMs: 150,
    report: reportNone,
  },
  corsi: {
    startSpan: 3,
    maxSpan: 8,
    trialsPerLevel: 2,
    boardSize: 9,
    highlightMs: 500,
    intervalMs: 250,
    readyDurationMs: 800,
    inactivityGuardMs: 30000,
    report: reportNone,
  },
  sst: {
    totalTrials: 96,
    stopRatio: 0.25,
    ssdStartMs: 250,
    ssdMinMs: 50,
    ssdMaxMs: 800,
    ssdStepMs: 50,
    goTimeoutMs: 1000,
    isiMs: 500,
    validRtFloorMs: 100,
    report: reportNone,
  },
  taskswitch: {
    totalTrials: 128,
    switchRatio: 0.5,
    blockCount: 4,
    includePureBlocks: false,
    cueMs: 400,
    stimulusMs: 2000,
    isiMs: 400,
    validRtFloorMs: 200,
    report: reportNone,
  },
}

const ROUND1_TASKS = new Set([
  'corsi',
  'cpt',
  'gonogo',
  'memory',
  'nback',
  'reaction',
  'sst',
  'stroop',
  'taskswitch',
])

const round1Entries = () => listCognitiveRegistryEntries()
  .filter((entry) => ROUND1_TASKS.has(entry.testType) && entry.recommendedForCreate)
  .sort((left, right) => left.testType.localeCompare(right.testType))

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
})

describe('Round 1 P0/P1 regression gate', () => {
  it('has exactly one recommended create version for every P0/P1 task', () => {
    expect(round1Entries().map((entry) => entry.testType)).toEqual([
      'corsi',
      'cpt',
      'gonogo',
      'memory',
      'nback',
      'reaction',
      'sst',
      'stroop',
      'taskswitch',
    ])
  })

  it.each(['experience', 'standard', 'research'] as const)(
    'validates the %s profile config for every P0/P1 task',
    (profile) => {
      for (const entry of round1Entries()) {
        const resolved = mergeProfileConfig(entry, baseConfigs[entry.testType], profile)
        expect(entry.configSchema.safeParse(resolved).success, `${entry.testType}/${profile}`).toBe(true)
      }
    },
  )

  it('keeps metric, quality, report, and randomization contracts complete', () => {
    for (const entry of round1Entries()) {
      const primaryMetrics = Object.values(entry.metricDefinitions)
        .filter((definition) => definition.role === 'primary')
      expect(primaryMetrics.length, `${entry.testType} primary metrics`).toBeGreaterThanOrEqual(2)
      expect(entry.qualityDefinitions.interpretable, `${entry.testType} interpretable quality`).toBeDefined()
      expect(entry.randomizationAlgorithmVersion, `${entry.testType} randomization version`).toBeTruthy()

      for (const key of [
        ...entry.reportDefinition.primaryMetrics,
        ...entry.reportDefinition.secondaryMetrics,
      ]) {
        expect(entry.metricDefinitions[key], `${entry.testType} report metric ${key}`).toBeDefined()
      }
      for (const definition of Object.values(entry.metricDefinitions)) {
        expect(definition.export.label, `${entry.testType} export label ${definition.key}`).toBeTruthy()
      }
    }
  })

  it('freezes profile and randomization provenance and keeps dictionary keys in Registry', () => {
    for (const entry of round1Entries()) {
      const frozen = freezeAssignmentProfile({
        entry,
        baseConfig: baseConfigs[entry.testType],
        profile: 'research',
      })
      const report = readFrozenReport(frozen.resolvedReportSnapshotEncrypted)
      expect(report?.profile, entry.testType).toBe('research')
      expect(report?.randomizationAlgorithmVersion, entry.testType)
        .toBe(entry.randomizationAlgorithmVersion)

      const metrics = Object.fromEntries(Object.keys(entry.metricDefinitions).map((key) => [key, 0]))
      const qualityFlags = Object.fromEntries(Object.keys(entry.qualityDefinitions).map((key) => [key, false]))
      qualityFlags.interpretable = true
      const assignment = {
        id: `assignment-${entry.testType}`,
        title: `Round 1 ${entry.testType}`,
        courseId: 'course-1',
        listedStandalone: true,
        course: { id: 'course-1', title: 'Round 1 Gate', courseCode: 'R1' },
        profile: 'research',
        profileDefinitionVersion: entry.profileDefinitionVersion,
        resolvedReportSnapshotEncrypted: frozen.resolvedReportSnapshotEncrypted,
        config: {
          testType: entry.testType,
          configVersion: 'gate',
          engineVersion: entry.engineVersion,
          scoringVersion: entry.scoringVersion,
        },
      }
      const pack = buildCognitiveResearchPackage(assignment as never, [{
        id: `session-${entry.testType}`,
        userId: 'student-1',
        anonymousCode: null,
        attemptNo: 1,
        testType: entry.testType,
        configVersion: 'gate',
        engineVersion: entry.engineVersion,
        scoringVersion: entry.scoringVersion,
        startedAt: new Date('2026-08-23T00:00:00.000Z'),
        finishedAt: new Date('2026-08-23T00:10:00.000Z'),
        user: { id: 'student-1', nickname: 'Gate', username: 'gate' },
        score: 50,
        metrics,
        qualityFlags,
        trials: [],
      }] as never, true)

      const registryKeys = new Set([
        ...Object.keys(entry.metricDefinitions),
        ...Object.keys(entry.qualityDefinitions),
      ])
      expect(pack.dictionaryRows.every((row) => registryKeys.has(String(row.key))), entry.testType)
        .toBe(true)
      expect(pack.manifest.randomizationAlgorithmVersion, entry.testType)
        .toBe(entry.randomizationAlgorithmVersion)
      expect(pack.sessionRows[0].A_randomization_algorithm_version, entry.testType)
        .toBe(entry.randomizationAlgorithmVersion)
    }
  })

  it('contains no percentile/rank-position copy in the authoritative Registry', () => {
    const copy = JSON.stringify(round1Entries())
    expect(copy).not.toMatch(/参考位置\s*\d|百分位|percentile|超过全国\s*\d+%/i)
  })

  it('keeps SST stability caveats on experience and standard profiles', () => {
    const sst = round1Entries().find((entry) => entry.testType === 'sst')!
    expect(sst.profiles.experience.reportCaveats.join('')).toMatch(/试次过少|不得/)
    expect(sst.profiles.standard.reportCaveats.join('')).toMatch(/稳定性受限|不是临床/)
  })
})
