import { Prisma, PrismaClient } from '@prisma/client'

type CognitiveSeed = {
  testType: string
  configVersion: string
  name: string
  status: 'DRAFT' | 'PUBLISHED'
  engineVersion: string
  scoringVersion: string
  config: Record<string, unknown>
}

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
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

const COGNITIVE_SEEDS: CognitiveSeed[] = [
  {
    testType: 'fake',
    configVersion: '1.0.0',
    name: 'Fake Cognitive Test v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
  },
  {
    testType: 'reaction',
    configVersion: '1.0.1',
    name: 'Reaction Time v1.0.1 [INTERNAL PILOT]',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 20, foreperiodMinMs: 700, foreperiodMaxMs: 1500, timeoutMs: 2000, readyDurationMs: 1000, report: SIMULATED_REPORT_V1 },
  },
  {
    testType: 'memory',
    configVersion: '1.0.1',
    name: 'Working Memory Span v1.0.1 [INTERNAL PILOT]',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { startLength: 2, maxLength: 11, trialsPerLevel: 2, digitDisplayMs: 800, digitIntervalMs: 200, readyDurationMs: 1000, inactivityGuardMs: 30000, report: SIMULATED_REPORT_V1 },
  },
  {
    testType: 'stroop',
    configVersion: '1.0.1',
    name: 'Color-Word Stroop v1.0.1 [INTERNAL PILOT]',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 24, congruentRatio: 0.5, fixationMs: 500, stimulusDurationMs: 2000, isiMs: 500, validRtFloorMs: 200, report: SIMULATED_REPORT_V1 },
  },
  {
    testType: 'reaction',
    configVersion: '1.1.0',
    name: 'Reaction Time v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: { totalTrials: 20, foreperiodMinMs: 700, foreperiodMaxMs: 1500, timeoutMs: 2000, readyDurationMs: 1000, report: SIMULATED_REPORT_V2 },
  },
  {
    testType: 'memory',
    configVersion: '1.1.0',
    name: 'Working Memory Span v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: { startLength: 3, maxLength: 9, trialsPerLevel: 2, digitDisplayMs: 800, digitIntervalMs: 200, readyDurationMs: 1000, inactivityGuardMs: 30000, report: SIMULATED_REPORT_V2 },
  },
  {
    testType: 'stroop',
    configVersion: '1.1.0',
    name: 'Color-Word Stroop v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: { totalTrials: 40, congruentRatio: 0.5, fixationMs: 500, stimulusDurationMs: 2000, isiMs: 500, validRtFloorMs: 200, report: SIMULATED_REPORT_V2 },
  },
  {
    testType: 'gonogo',
    configVersion: '1.0.0',
    name: 'Go/No-Go v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 120, nogoRatio: 0.25, stimulusMs: 800, isiMs: 500, validRtFloorMs: 100, report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'cpt',
    configVersion: '1.0.0',
    name: 'CPT-X v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 180, targetRatio: 0.2, blockCount: 3, stimulusMs: 500, isiMs: 1000, validRtFloorMs: 100, perseverationRtMs: 100, report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'nback',
    configVersion: '1.0.0',
    name: 'N-Back v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { nLevels: [1, 2], trialCountByN: [40, 60], blockCountByN: [1, 1], targetRatio: 0.3, stimulusMs: 500, isiMs: 2000, validRtFloorMs: 150, report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'sst',
    configVersion: '1.0.0',
    name: 'Stop-Signal Task v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 96, stopRatio: 0.25, ssdStartMs: 250, ssdMinMs: 50, ssdMaxMs: 800, ssdStepMs: 50, goTimeoutMs: 1000, isiMs: 500, validRtFloorMs: 100, report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'taskswitch',
    configVersion: '1.0.0',
    name: 'Task Switching v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 128, switchRatio: 0.5, blockCount: 4, includePureBlocks: false, cueMs: 400, stimulusMs: 2000, isiMs: 400, validRtFloorMs: 200, report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'corsi',
    configVersion: '1.0.0',
    name: 'Corsi Block-Tapping v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { startSpan: 3, maxSpan: 8, trialsPerLevel: 2, boardSize: 9, highlightMs: 500, intervalMs: 250, readyDurationMs: 800, inactivityGuardMs: 30000, report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'patterncompare',
    configVersion: '1.0.0',
    name: 'Pattern Comparison Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { durationSec: 60, trialTimeoutMs: 2500, isiMs: 250, validRtFloorMs: 150, stimulusSetVersion: 'geometric-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'flanker',
    configVersion: '1.0.0',
    name: 'Flanker Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 80, congruentRatio: 0.5, stimulusMs: 1800, isiMs: 400, validRtFloorMs: 150, stimulusSetVersion: 'arrows-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'cardsort',
    configVersion: '1.0.0',
    name: 'Rule Card Sort Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 72, switchRatio: 0.33, blockCount: 3, cueMs: 500, stimulusMs: 2000, isiMs: 350, validRtFloorMs: 150, stimulusSetVersion: 'geometric-cards-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'digitbackward',
    configVersion: '1.0.0',
    name: 'Digit Span Backward Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { startSpan: 2, maxSpan: 7, trialsPerLevel: 2, digitDisplayMs: 800, digitIntervalMs: 200, readyDurationMs: 800, inactivityGuardMs: 30000, stimulusSetVersion: 'digits-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'picturesequence',
    configVersion: '1.0.0',
    name: 'Picture Sequence Learning Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { itemCount: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 0, studyMsPerItem: 900, inactivityGuardMs: 60000, stimulusSetVersion: 'daily-scenes-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'pairedassociate',
    configVersion: '1.0.0',
    name: 'Paired Associate Learning Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { pairCount: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 0, studyDurationMs: 12000, inactivityGuardMs: 90000, stimulusSetVersion: 'nonverbal-pairs-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'matrix',
    configVersion: '1.0.0',
    name: 'Matrix Reasoning Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { itemCount: 16, optionCount: 4, itemTimeoutMs: 30000, validRtFloorMs: 300, stimulusSetVersion: 'matrix-generator-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'mentalrotation',
    configVersion: '1.0.0',
    name: 'Mental Rotation Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 40, stimulusMs: 5000, isiMs: 400, validRtFloorMs: 200, stimulusSetVersion: 'rotation-objects-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'tower',
    configVersion: '1.0.0',
    name: 'Three-Peg Tower Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { problemCount: 10, maxMovesFactor: 3, inactivityGuardMs: 90000, stimulusSetVersion: 'three-peg-tower-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'trailmaking',
    configVersion: '1.0.0',
    name: 'Trail Making Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { form: 'AB', partAItemCount: 12, partBItemCount: 12, stepTimeoutMs: 15000, stimulusSetVersion: 'trailmaking-generated-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'reversallearning',
    configVersion: '1.0.0',
    name: 'Probabilistic Reversal Learning Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 120, acquisitionTrials: 60, reversalTrials: 60, criterionConsecutiveCorrect: 6, rewardProbability: 0.8, trialTimeoutMs: 3000, stimulusSetVersion: 'reversal-symbols-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'bart',
    configVersion: '1.0.0',
    name: 'Balloon Pumping Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { balloonCount: 30, maxPumps: 12, trialTimeoutMs: 15000, pumpAnimationMs: 200, stimulusSetVersion: 'bart-generated-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'wordlist',
    configVersion: '1.0.0',
    name: 'Chinese Wordlist Free Recall Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { listLength: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 60000, studyMsPerWord: 800, recallTimeoutMs: 60000, inactivityGuardMs: 120000, inputMode: 'typed-free-recall', normalizationVersion: 'wordlist-normalization-v1.0.0', stimulusSetVersion: 'chinese-wordlist-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'lexicaldecision',
    configVersion: '1.0.0',
    name: 'Chinese Lexical Decision Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 100, realWordRatio: 0.5, stimulusMs: 1200, trialTimeoutMs: 3000, isiMs: 300, validRtFloorMs: 150, stimulusSetVersion: 'zh-lexical-v1.0.0', pseudowordGeneratorVersion: 'zh-pseudoword-generator-v1.0.0', report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'emotionrecognition',
    configVersion: '1.0.0',
    name: 'Six Basic Emotion Face Classification Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 60, stimulusMs: 3000, trialTimeoutMs: 5000, isiMs: 300, validRtFloorMs: 200, emotionCategoryVersion: 'basic-emotion-6-v1.0.0', stimulusSetVersion: 'emotion-faces-ai-zh-v1.0.0', report: NO_REFERENCE_REPORT },
  },
]

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => deepEqual(value, b[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => deepEqual(left[key], right[key]))
}

async function seedOneCognitiveConfig(prisma: PrismaClient, expected: CognitiveSeed): Promise<void> {
  const existing = await prisma.cognitiveTestConfig.findUnique({
    where: { testType_configVersion: { testType: expected.testType, configVersion: expected.configVersion } },
  })

  if (!existing) {
    await prisma.cognitiveTestConfig.create({
      data: {
        testType: expected.testType,
        configVersion: expected.configVersion,
        name: expected.name,
        status: expected.status,
        engineVersion: expected.engineVersion,
        scoringVersion: expected.scoringVersion,
        config: expected.config as Prisma.InputJsonValue,
      },
    })
    console.log(`${expected.testType} Cognitive 配置已创建: configVersion=${expected.configVersion} status=${expected.status}`)
    return
  }

  const same =
    existing.name === expected.name &&
    existing.status === expected.status &&
    existing.engineVersion === expected.engineVersion &&
    existing.scoringVersion === expected.scoringVersion &&
    deepEqual(existing.config, expected.config)
  if (same) {
    console.log(`${expected.testType} Cognitive 配置已存在且一致，跳过（幂等）: configVersion=${expected.configVersion}`)
    return
  }

  throw new Error(`cognitiveTestConfig ${expected.testType}/${expected.configVersion} already exists with divergent content; create a new configVersion instead of mutating it`)
}

export async function seedCognitiveConfigs(prisma: PrismaClient): Promise<void> {
  for (const expected of COGNITIVE_SEEDS) {
    await seedOneCognitiveConfig(prisma, expected)
  }
}
