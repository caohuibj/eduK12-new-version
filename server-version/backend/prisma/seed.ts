import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function seedAdmin() {
  // 检查是否已有管理员账号
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN }
  })

  if (existingAdmin) {
    console.log('管理员账号已存在，跳过创建')
    return
  }

  // 创建默认管理员账号（凭据优先来自环境变量，便于不同部署定制）
  const adminUsername = process.env.ADMIN_USERNAME || 'rateK12admin'
  const adminPassword = process.env.ADMIN_PASSWORD || '2026coding'
  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      passwordHash: hashedPassword,
      role: UserRole.ADMIN,
      nickname: '系统管理员',
    }
  })

  console.log('默认管理员账号创建成功:')
  console.log(`  用户名: ${admin.username}`)
  console.log(`  密码: ${adminPassword}`)
}

// D1.1 修正：已发布配置不可变（Published Config Immutable）。
// seed 只负责“确保存在”，绝不对已 PUBLISHED 的配置执行 UPDATE。
// 行为：
//   不存在           → create(status=PUBLISHED)
//   存在且内容一致   → no-op（幂等，可安全重复运行）
//   存在但内容不同   → FAIL（提示创建新版本 1.0.1 / 1.1.0，禁止覆盖已发布版本）
// 修复前使用 upsert(update)，会在重新 seed 时静默覆盖同一 configVersion，违反 immutability。
const FAKE_CONFIG_VERSION = '1.0.0'
const FAKE_CONFIG_EXPECTED = {
  name: 'Fake Cognitive Test v1.0.0',
  status: 'PUBLISHED' as const,
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: {
    trialCount: 3,
    trialDurationMs: 1000,
    allowPractice: false,
    maxRtMs: 60000,
  },
}

// 顺序无关的 JSON 深度相等：Postgres JSONB 不保证 key 顺序，禁止使用 JSON.stringify 直接比较。
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  const ka = Object.keys(a as Record<string, unknown>)
  const kb = Object.keys(b as Record<string, unknown>)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

async function seedFakeCognitiveConfig() {
  const existing = await prisma.cognitiveTestConfig.findUnique({
    where: { testType_configVersion: { testType: 'fake', configVersion: FAKE_CONFIG_VERSION } },
  })

  if (!existing) {
    const created = await prisma.cognitiveTestConfig.create({
      data: {
        testType: 'fake',
        configVersion: FAKE_CONFIG_VERSION,
        ...FAKE_CONFIG_EXPECTED,
      },
    })
    console.log(`Fake Cognitive 配置已创建: testType=${created.testType} configVersion=${created.configVersion} status=${created.status}`)
    return
  }

  // 已存在：校验内容是否与基线一致（PUBLISHED 不可变，禁止任何 UPDATE）
  const sameName = existing.name === FAKE_CONFIG_EXPECTED.name
  const sameStatus = existing.status === FAKE_CONFIG_EXPECTED.status
  const sameEngine = existing.engineVersion === FAKE_CONFIG_EXPECTED.engineVersion
  const sameScoring = existing.scoringVersion === FAKE_CONFIG_EXPECTED.scoringVersion
  const sameConfig = deepEqual(existing.config, FAKE_CONFIG_EXPECTED.config)
  if (sameName && sameStatus && sameEngine && sameScoring && sameConfig) {
    console.log(`Fake Cognitive 配置已存在且一致，跳过（幂等）: testType=${existing.testType} configVersion=${existing.configVersion} status=${existing.status}`)
    return
  }

  // 内容不一致 → 明确失败，禁止覆盖已发布配置
  console.error('❌ Fake Cognitive 配置已存在但内容与基线不一致，拒绝 UPDATE（PUBLISHED 配置不可变）。')
  console.error('   如需变更，请创建新版本（如 1.0.1 / 1.1.0），并在 seed 中新增对应写入逻辑。')
  console.error(`   当前: name=${existing.name} status=${existing.status} engineVersion=${existing.engineVersion} scoringVersion=${existing.scoringVersion}`)
  throw new Error(`cognitiveTestConfig fake/${FAKE_CONFIG_VERSION} already PUBLISHED with divergent content; create a new configVersion instead of mutating it`)
}

// Milestone E Session 2 — Reaction：INTERNAL PILOT 配置（§7）。
// 命名明确标注 INTERNAL PILOT / NOT COMMERCIAL DEFAULT；不使用新增的 PILOT ConfigStatus，
// 也不使用 DRAFT（D3 publish contract 要求 Published Config 才能进入 Assignment）。
const REACTION_CONFIG_VERSION = '1.0.1'
const REACTION_CONFIG_EXPECTED = {
  name: 'Reaction Time v1.0.1 [INTERNAL PILOT]',
  status: 'PUBLISHED' as const,
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: {
    totalTrials: 20,
    foreperiodMinMs: 700,
    foreperiodMaxMs: 1500,
    timeoutMs: 2000,
    readyDurationMs: 1000,
    report: {
      reportVersion: '1.0.0',
      referenceMode: 'simulated',
      referenceVersion: 'sim-k12-v0.1',
      referenceBand: 'K7-9',
    },
  },
}

async function seedReactionCognitiveConfig() {
  const existing = await prisma.cognitiveTestConfig.findUnique({
    where: { testType_configVersion: { testType: 'reaction', configVersion: REACTION_CONFIG_VERSION } },
  })

  if (!existing) {
    const created = await prisma.cognitiveTestConfig.create({
      data: {
        testType: 'reaction',
        configVersion: REACTION_CONFIG_VERSION,
        ...REACTION_CONFIG_EXPECTED,
      },
    })
    console.log(`Reaction Cognitive 配置已创建: testType=${created.testType} configVersion=${created.configVersion} status=${created.status}`)
    return
  }

  const sameName = existing.name === REACTION_CONFIG_EXPECTED.name
  const sameStatus = existing.status === REACTION_CONFIG_EXPECTED.status
  const sameEngine = existing.engineVersion === REACTION_CONFIG_EXPECTED.engineVersion
  const sameScoring = existing.scoringVersion === REACTION_CONFIG_EXPECTED.scoringVersion
  const sameConfig = deepEqual(existing.config, REACTION_CONFIG_EXPECTED.config)
  if (sameName && sameStatus && sameEngine && sameScoring && sameConfig) {
    console.log(`Reaction Cognitive 配置已存在且一致，跳过（幂等）: testType=${existing.testType} configVersion=${existing.configVersion} status=${existing.status}`)
    return
  }

  console.error('❌ Reaction Cognitive 配置已存在但内容与基线不一致，拒绝 UPDATE（PUBLISHED 配置不可变）。')
  console.error('   如需变更，请创建新版本（如 1.0.1 / 1.1.0），并在 seed 中新增对应写入逻辑。')
  throw new Error(`cognitiveTestConfig reaction/${REACTION_CONFIG_VERSION} already PUBLISHED with divergent content; create a new configVersion instead of mutating it`)
}

// Milestone E Session 3 — Memory：数字广度 Forward Span 配置。
const MEMORY_CONFIG_VERSION = '1.0.1'
const MEMORY_CONFIG_EXPECTED = {
  name: 'Working Memory Span v1.0.1 [INTERNAL PILOT]',
  status: 'PUBLISHED' as const,
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: {
    startLength: 2,
    maxLength: 11,
    trialsPerLevel: 2,
    digitDisplayMs: 800,
    digitIntervalMs: 200,
    readyDurationMs: 1000,
    inactivityGuardMs: 30000,
    report: {
      reportVersion: '1.0.0',
      referenceMode: 'simulated',
      referenceVersion: 'sim-k12-v0.1',
      referenceBand: 'K7-9',
    },
  },
}

async function seedMemoryCognitiveConfig() {
  const existing = await prisma.cognitiveTestConfig.findUnique({
    where: { testType_configVersion: { testType: 'memory', configVersion: MEMORY_CONFIG_VERSION } },
  })
  if (!existing) {
    const created = await prisma.cognitiveTestConfig.create({
      data: { testType: 'memory', configVersion: MEMORY_CONFIG_VERSION, ...MEMORY_CONFIG_EXPECTED },
    })
    console.log(`Memory Cognitive 配置已创建: testType=${created.testType} configVersion=${created.configVersion} status=${created.status}`)
    return
  }
  const same =
    existing.name === MEMORY_CONFIG_EXPECTED.name &&
    existing.status === MEMORY_CONFIG_EXPECTED.status &&
    existing.engineVersion === MEMORY_CONFIG_EXPECTED.engineVersion &&
    existing.scoringVersion === MEMORY_CONFIG_EXPECTED.scoringVersion &&
    deepEqual(existing.config, MEMORY_CONFIG_EXPECTED.config)
  if (same) {
    console.log(`Memory Cognitive 配置已存在且一致，跳过（幂等）: testType=${existing.testType} configVersion=${existing.configVersion} status=${existing.status}`)
    return
  }
  throw new Error(`cognitiveTestConfig memory/${MEMORY_CONFIG_VERSION} already PUBLISHED with divergent content; create a new configVersion instead of mutating it`)
}

// Milestone E Session 4 — Stroop：色词干扰抑制配置。
const STROOP_CONFIG_VERSION = '1.0.1'
const STROOP_CONFIG_EXPECTED = {
  name: 'Color-Word Stroop v1.0.1 [INTERNAL PILOT]',
  status: 'PUBLISHED' as const,
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: {
    totalTrials: 24,
    congruentRatio: 0.5,
    fixationMs: 500,
    stimulusDurationMs: 2000,
    isiMs: 500,
    validRtFloorMs: 200,
    report: {
      reportVersion: '1.0.0',
      referenceMode: 'simulated',
      referenceVersion: 'sim-k12-v0.1',
      referenceBand: 'K7-9',
    },
  },
}

async function seedStroopCognitiveConfig() {
  const existing = await prisma.cognitiveTestConfig.findUnique({
    where: { testType_configVersion: { testType: 'stroop', configVersion: STROOP_CONFIG_VERSION } },
  })
  if (!existing) {
    const created = await prisma.cognitiveTestConfig.create({
      data: { testType: 'stroop', configVersion: STROOP_CONFIG_VERSION, ...STROOP_CONFIG_EXPECTED },
    })
    console.log(`Stroop Cognitive 配置已创建: testType=${created.testType} configVersion=${created.configVersion} status=${created.status}`)
    return
  }
  const same =
    existing.name === STROOP_CONFIG_EXPECTED.name &&
    existing.status === STROOP_CONFIG_EXPECTED.status &&
    existing.engineVersion === STROOP_CONFIG_EXPECTED.engineVersion &&
    existing.scoringVersion === STROOP_CONFIG_EXPECTED.scoringVersion &&
    deepEqual(existing.config, STROOP_CONFIG_EXPECTED.config)
  if (same) {
    console.log(`Stroop Cognitive 配置已存在且一致，跳过（幂等）: testType=${existing.testType} configVersion=${existing.configVersion} status=${existing.status}`)
    return
  }
  throw new Error(`cognitiveTestConfig stroop/${STROOP_CONFIG_VERSION} already PUBLISHED with divergent content; create a new configVersion instead of mutating it`)
}

const LIT_SIM_REPORT = {
  reportVersion: '1.1.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'lit-sim-k12-v0.2',
  referenceBand: 'K7-9',
}

async function seedCognitiveConfig(
  testType: string,
  configVersion: string,
  expected: {
    name: string
    status: 'DRAFT' | 'PUBLISHED'
    engineVersion: string
    scoringVersion: string
    config: Record<string, unknown>
  },
) {
  const existing = await prisma.cognitiveTestConfig.findUnique({
    where: { testType_configVersion: { testType, configVersion } },
  })
  if (!existing) {
    const created = await prisma.cognitiveTestConfig.create({
      data: { testType, configVersion, ...expected },
    })
    console.log(`${testType} Cognitive 配置已创建: configVersion=${created.configVersion} scoringVersion=${created.scoringVersion}`)
    return
  }
  const same =
    existing.name === expected.name &&
    existing.status === expected.status &&
    existing.engineVersion === expected.engineVersion &&
    existing.scoringVersion === expected.scoringVersion &&
    deepEqual(existing.config, expected.config)
  if (same) {
    console.log(`${testType} Cognitive 配置已存在且一致，跳过（幂等）: configVersion=${existing.configVersion}`)
    return
  }
  throw new Error(`cognitiveTestConfig ${testType}/${configVersion} already exists with divergent content; create a new configVersion instead of mutating it`)
}

const seedPublishedCognitiveConfig = seedCognitiveConfig
const seedDraftCognitiveConfig = seedCognitiveConfig

async function seedRound1P0Configs() {
  await seedPublishedCognitiveConfig('reaction', '1.1.0', {
    name: 'Reaction Time v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: {
      totalTrials: 20,
      foreperiodMinMs: 700,
      foreperiodMaxMs: 1500,
      timeoutMs: 2000,
      readyDurationMs: 1000,
      report: LIT_SIM_REPORT,
    },
  })
  await seedPublishedCognitiveConfig('memory', '1.1.0', {
    name: 'Working Memory Span v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: {
      startLength: 3,
      maxLength: 9,
      trialsPerLevel: 2,
      digitDisplayMs: 800,
      digitIntervalMs: 200,
      readyDurationMs: 1000,
      inactivityGuardMs: 30000,
      report: LIT_SIM_REPORT,
    },
  })
  await seedPublishedCognitiveConfig('stroop', '1.1.0', {
    name: 'Color-Word Stroop v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: {
      totalTrials: 40,
      congruentRatio: 0.5,
      fixationMs: 500,
      stimulusDurationMs: 2000,
      isiMs: 500,
      validRtFloorMs: 200,
      report: LIT_SIM_REPORT,
    },
  })
}

async function main() {
  console.log('开始初始化数据库...')
  await seedAdmin()
  await seedFakeCognitiveConfig()
  await seedReactionCognitiveConfig()
  await seedMemoryCognitiveConfig()
  await seedStroopCognitiveConfig()
  await seedRound1P0Configs()
  const NONE_REPORT = { reportVersion: '1.0.0', referenceMode: 'none' as const }
  await seedPublishedCognitiveConfig('gonogo', '1.0.0', {
    name: 'Go/No-Go v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      totalTrials: 120,
      nogoRatio: 0.25,
      stimulusMs: 800,
      isiMs: 500,
      validRtFloorMs: 100,
      report: NONE_REPORT,
    },
  })
  await seedPublishedCognitiveConfig('cpt', '1.0.0', {
    name: 'CPT-X v1.0.0',
    status: 'PUBLISHED',
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
      report: NONE_REPORT,
    },
  })
  await seedPublishedCognitiveConfig('nback', '1.0.0', {
    name: 'N-Back v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      nLevels: [1, 2],
      trialCountByN: [40, 60],
      blockCountByN: [1, 1],
      targetRatio: 0.3,
      stimulusMs: 500,
      isiMs: 2000,
      validRtFloorMs: 150,
      report: NONE_REPORT,
    },
  })
  await seedPublishedCognitiveConfig('sst', '1.0.0', {
    name: 'Stop-Signal Task v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      totalTrials: 96,
      stopRatio: 0.25,
      ssdStartMs: 250,
      ssdMinMs: 50,
      ssdMaxMs: 800,
      ssdStepMs: 50,
      goTimeoutMs: 1000,
      isiMs: 500,
      validRtFloorMs: 100,
      report: NONE_REPORT,
    },
  })
  await seedPublishedCognitiveConfig('taskswitch', '1.0.0', {
    name: 'Task Switching v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      totalTrials: 128,
      switchRatio: 0.5,
      blockCount: 4,
      includePureBlocks: false,
      cueMs: 400,
      stimulusMs: 2000,
      isiMs: 400,
      validRtFloorMs: 200,
      report: NONE_REPORT,
    },
  })
  await seedPublishedCognitiveConfig('corsi', '1.0.0', {
    name: 'Corsi Block-Tapping v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      startSpan: 3,
      maxSpan: 8,
      trialsPerLevel: 2,
      boardSize: 9,
      highlightMs: 500,
      intervalMs: 250,
      readyDurationMs: 800,
      inactivityGuardMs: 30000,
      report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('patterncompare', '1.0.0', {
    name: 'Pattern Comparison Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      durationSec: 60,
      trialTimeoutMs: 2500,
      isiMs: 250,
      validRtFloorMs: 150,
      stimulusSetVersion: 'geometric-v1.0.0',
      report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('flanker', '1.0.0', {
    name: 'Flanker Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      totalTrials: 80,
      congruentRatio: 0.5,
      stimulusMs: 1800,
      isiMs: 400,
      validRtFloorMs: 150,
      stimulusSetVersion: 'arrows-v1.0.0',
      report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('cardsort', '1.0.0', {
    name: 'Rule Card Sort Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      totalTrials: 72,
      switchRatio: 0.33,
      blockCount: 3,
      cueMs: 500,
      stimulusMs: 2000,
      isiMs: 350,
      validRtFloorMs: 150,
      stimulusSetVersion: 'geometric-cards-v1.0.0',
      report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('digitbackward', '1.0.0', {
    name: 'Digit Span Backward Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      startSpan: 2,
      maxSpan: 7,
      trialsPerLevel: 2,
      digitDisplayMs: 800,
      digitIntervalMs: 200,
      readyDurationMs: 800,
      inactivityGuardMs: 30000,
      stimulusSetVersion: 'digits-v1.0.0',
      report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('picturesequence', '1.0.0', {
    name: 'Picture Sequence Learning Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      itemCount: 12,
      learningRounds: 3,
      delayedEnabled: false,
      delayedDelayMs: 0,
      studyMsPerItem: 900,
      inactivityGuardMs: 60000,
      stimulusSetVersion: 'daily-scenes-v1.0.0',
      report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('pairedassociate', '1.0.0', {
    name: 'Paired Associate Learning Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      pairCount: 12,
      learningRounds: 3,
      delayedEnabled: false,
      delayedDelayMs: 0,
      studyDurationMs: 12000,
      inactivityGuardMs: 90000,
      stimulusSetVersion: 'nonverbal-pairs-v1.0.0',
      report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('matrix', '1.0.0', {
    name: 'Matrix Reasoning Pilot v1.0.0', status: 'DRAFT', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    config: { itemCount: 16, optionCount: 4, itemTimeoutMs: 30000, validRtFloorMs: 300, stimulusSetVersion: 'matrix-generator-v1.0.0', report: NONE_REPORT },
  })
  await seedDraftCognitiveConfig('mentalrotation', '1.0.0', {
    name: 'Mental Rotation Pilot v1.0.0', status: 'DRAFT', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    config: { totalTrials: 40, stimulusMs: 5000, isiMs: 400, validRtFloorMs: 200, stimulusSetVersion: 'rotation-objects-v1.0.0', report: NONE_REPORT },
  })
  await seedDraftCognitiveConfig('tower', '1.0.0', {
    name: 'Three-Peg Tower Pilot v1.0.0', status: 'DRAFT', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    config: { problemCount: 10, maxMovesFactor: 3, inactivityGuardMs: 90000, stimulusSetVersion: 'three-peg-tower-v1.0.0', report: NONE_REPORT },
  })
  console.log('数据库初始化完成。')
}

main()
  .catch((e) => {
    console.error('初始化失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
