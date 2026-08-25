import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function seedAdmin() {
  // 检查是否已有管理员账号
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN }
  })

  if (existingAdmin) {
    console.log('管理员账号已存在，跳过创建')
    return existingAdmin.id
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
  return admin.id
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
      data: { testType, configVersion, ...expected, config: expected.config as Prisma.InputJsonValue },
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

// PR10：ADEXI 参与者自评量表。
// 该量表已获得正式授权；量表本身按课程可见的 PUBLISHED 资源写入，跨来源报告包仍保持 DRAFT，等待整体发布审核。
// 学员可为青少年或成人；这里不设置年龄或角色限制，教师只负责发布和查看结果。
const ADEXI_CODE = 'adexi_v1'
const ADEXI_VERSION = '1.0.0'
const ADEXI_OPTIONS = [
  { value: 1, label: '绝对不符合' },
  { value: 2, label: '不太符合' },
  { value: 3, label: '有时符合' },
  { value: 4, label: '比较符合' },
  { value: 5, label: '非常符合' },
]
const ADEXI_SOURCE_ITEMS = [
  'I have difficulty remembering lengthy instructions',
  'I sometimes have difficulty remembering what I am doing in the middle of an activity',
  'I have a tendency to do things without first thinking about what could happen',
  'I sometimes have difficulty stopping myself from doing something that I like even though someone tells me that it is not allowed.',
  'When someone asks me to do several things, I sometimes remember only the first or last',
  'I sometimes have difficulty refraining from smiling or laughing in situations where it is inappropriate',
  'I have difficulty coming up with a different way of solving a problem when I get stuck',
  'When someone asks me to fetch something, I sometimes forget what I am supposed to fetch',
  'I have difficulty planning for an activity (e.g., remembering to bring everything necessary when going on a trip/to work/to school)',
  'I sometimes have difficulty stopping an activity that I like (e.g., I watch TV or sit in front of the computer in the evening even though it is time to go to bed)',
  'I sometimes have difficulty understanding verbal instructions unless I am also shown how to do something',
  'I have difficulties with tasks or activities that involve several steps',
  'I have difficulty thinking ahead or learning from experience',
  'People that I meet sometimes seem to think that I am more lively/wilder compared to other people my age',
]
const ADEXI_ITEMS = [
  '我难以记住较长的指令。',
  '在一项活动进行到一半时，我有时难以记住自己正在做什么。',
  '我往往会不先考虑可能发生什么就直接做事。',
  '即使别人告诉我不可以，我有时仍难以阻止自己做喜欢的事情。',
  '别人让我做几件事时，我有时只记得第一件或最后一件。',
  '在不合适的场合，我有时难以忍住不微笑或大笑。',
  '遇到困难时，我难以想出另一种解决问题的方法。',
  '别人让我去拿某样东西时，我有时会忘记自己应该拿什么。',
  '我难以为一项活动做计划（例如出行、上班或上学时记得带齐所需物品）。',
  '我有时难以停止喜欢的活动（例如晚上到了该睡觉的时间，我仍看电视或坐在电脑前）。',
  '除非同时有人示范，否则我有时难以理解口头指令。',
  '涉及多个步骤的任务或活动对我来说比较困难。',
  '我难以提前思考或从经验中学习。',
  '我遇到的人有时似乎认为，与同龄人相比，我更活跃或更“野”。',
]
const ADEXI_WORKING_MEMORY_ITEMS = new Set([1, 2, 5, 7, 8, 9, 11, 12, 13])
const ADEXI_EXPECTED = {
  name: 'ADEXI 执行功能参与者自评 v1.0.0',
  description: '14 项执行功能参与者自评，包含工作记忆与抑制两个维度；PR10 仅以描述性证据使用。',
  status: 'PUBLISHED' as const,
  visibility: 'COURSE' as const,
  estimatedTime: 5,
  instruction: '请根据你自己的日常体验作答。没有正确或错误答案；本量表不是诊断工具。',
  tags: ['PR10', 'ADEXI', 'participant-self-report', 'inhibitory-control'],
  config: {
    points: 5,
    labels: ADEXI_OPTIONS,
    respondentType: 'participant_self_report',
    source: 'ADEXI_SELFREPORT_ENG',
    sourceUrl: 'https://chexi.se/onewebmedia/ADEXI_SELFREPORT_ENG.pdf',
    licenseStatus: 'authorized',
    scoring: {
      method: 'sum',
      dimensions: {
        working_memory: { itemCodes: [1, 2, 5, 7, 8, 9, 11, 12, 13] },
        inhibition: { itemCodes: [3, 4, 6, 10, 14] },
      },
    },
    sourceItems: ADEXI_SOURCE_ITEMS,
    applicabilityNote: 'PR10 不按学员年龄或教师/学员角色限制作答；开放前仍需完成项目适用性审核。',
  },
}

const normalizeADEXI = (scale: any) => {
  const dimensionsById = new Map((scale.dimensions ?? []).map((dimension: any) => [dimension.id, dimension.code]))
  return {
    code: scale.code,
    name: scale.name,
    description: scale.description,
    status: scale.status,
    visibility: scale.visibility,
    estimatedTime: scale.estimatedTime,
    instruction: scale.instruction,
    tags: [...(scale.tags ?? [])],
    config: scale.config,
    dimensions: [...(scale.dimensions ?? [])]
      .sort((left: any, right: any) => left.code.localeCompare(right.code))
      .map((dimension: any) => ({
        code: dimension.code,
        name: dimension.name,
        description: dimension.description,
        scoringMethod: dimension.scoringMethod,
        minScore: dimension.minScore === null ? null : Number(dimension.minScore),
        maxScore: dimension.maxScore === null ? null : Number(dimension.maxScore),
      })),
    items: [...(scale.items ?? [])]
      .sort((left: any, right: any) => left.sortOrder - right.sortOrder)
      .map((item: any) => ({
        itemCode: item.itemCode,
        content: item.content,
        type: item.type,
        reverse: item.reverse,
        required: item.required,
        weight: Number(item.weight),
        sortOrder: item.sortOrder,
        options: item.options,
        randomizeOptions: item.randomizeOptions,
        dimensions: [...(item.itemDimensions ?? [])]
          .sort((left: any, right: any) => String(left.dimensionId).localeCompare(String(right.dimensionId)))
          .map((itemDimension: any) => ({
            dimensionCode: dimensionsById.get(itemDimension.dimensionId) ?? null,
            weight: Number(itemDimension.weight),
            reverse: itemDimension.reverse,
          })),
      })),
  }
}

const ADEXI_EXPECTED_SHAPE = {
  code: ADEXI_CODE,
  ...ADEXI_EXPECTED,
  dimensions: [
    {
      code: 'inhibition',
      name: '抑制（自评）',
      description: '与抑制冲动、停止偏好活动和在不合适场合抑制反应有关的参与者自评。',
      scoringMethod: 'sum',
      minScore: 5,
      maxScore: 25,
    },
    {
      code: 'working_memory',
      name: '工作记忆（自评）',
      description: '与记住、保持和处理多步骤信息有关的参与者自评。',
      scoringMethod: 'sum',
      minScore: 9,
      maxScore: 45,
    },
  ],
  items: ADEXI_ITEMS.map((content, index) => ({
    itemCode: `ADEXI-${String(index + 1).padStart(2, '0')}`,
    content,
    type: 'single',
    reverse: false,
    required: true,
    weight: 1,
    sortOrder: index,
    options: ADEXI_OPTIONS,
    randomizeOptions: false,
    dimensions: [{
      dimensionCode: ADEXI_WORKING_MEMORY_ITEMS.has(index + 1) ? 'working_memory' : 'inhibition',
      weight: 1,
      reverse: false,
    }],
  })),
}

async function seedADEXI(adminId: string) {
  const existing = await prisma.scale.findUnique({
    where: { code: ADEXI_CODE },
    include: { dimensions: true, items: { include: { itemDimensions: true } } },
  })
  if (existing) {
    const normalized = normalizeADEXI(existing)
    const same = deepEqual(normalized, ADEXI_EXPECTED_SHAPE)
    if (same) {
      console.log(`ADEXI 量表已存在且一致，跳过（幂等）: code=${ADEXI_CODE} status=${existing.status}`)
      return
    }

    // The earlier PR10 seed intentionally created a DRAFT/HIDDEN row while
    // authorization was pending. Promote only that exact content in place;
    // any other content drift still fails closed and requires a new version.
    const existingConfig = normalized.config && typeof normalized.config === 'object' && !Array.isArray(normalized.config)
      ? normalized.config as Record<string, unknown>
      : null
    const authorizedTransition = existing.status === 'DRAFT'
      && existing.visibility === 'HIDDEN'
      && existingConfig
      && deepEqual({
        ...normalized,
        status: ADEXI_EXPECTED_SHAPE.status,
        visibility: ADEXI_EXPECTED_SHAPE.visibility,
        config: {
          ...existingConfig,
          licenseStatus: ADEXI_EXPECTED_SHAPE.config.licenseStatus,
        },
      }, ADEXI_EXPECTED_SHAPE)
    if (authorizedTransition) {
      await prisma.scale.update({
        where: { id: existing.id },
        data: {
          status: ADEXI_EXPECTED.status,
          visibility: ADEXI_EXPECTED.visibility,
          config: ADEXI_EXPECTED.config,
        },
      })
      console.log(`ADEXI 量表已从旧 DRAFT/HIDDEN 基线安全升级: code=${ADEXI_CODE} status=${ADEXI_EXPECTED.status}`)
      return
    }
    throw new Error(`scale ${ADEXI_CODE} already exists with divergent content; create a new scale code/version instead of mutating it`)
  }

  await prisma.$transaction(async (tx) => {
    const scale = await tx.scale.create({
      data: {
        code: ADEXI_CODE,
        creatorId: adminId,
        ...ADEXI_EXPECTED,
      },
    })
    const dimensions = new Map<string, string>()
    for (const dimension of [
      {
        code: 'working_memory',
        name: '工作记忆（自评）',
        description: '与记住、保持和处理多步骤信息有关的参与者自评。',
        scoringMethod: 'sum',
        minScore: 9,
        maxScore: 45,
      },
      {
        code: 'inhibition',
        name: '抑制（自评）',
        description: '与抑制冲动、停止偏好活动和在不合适场合抑制反应有关的参与者自评。',
        scoringMethod: 'sum',
        minScore: 5,
        maxScore: 25,
      },
    ]) {
      const created = await tx.dimension.create({ data: { scaleId: scale.id, ...dimension } })
      dimensions.set(dimension.code, created.id)
    }
    for (const [index, content] of ADEXI_ITEMS.entries()) {
      const dimensionCode = ADEXI_WORKING_MEMORY_ITEMS.has(index + 1) ? 'working_memory' : 'inhibition'
      await tx.scaleItem.create({
        data: {
          scaleId: scale.id,
          itemCode: `ADEXI-${String(index + 1).padStart(2, '0')}`,
          content,
          type: 'single',
          reverse: false,
          required: true,
          weight: 1,
          sortOrder: index,
          options: ADEXI_OPTIONS,
          randomizeOptions: false,
          itemDimensions: {
            create: [{ dimensionId: dimensions.get(dimensionCode)!, weight: 1, reverse: false }],
          },
        },
      })
    }
  })
  console.log(`ADEXI 量表已创建为 PUBLISHED/COURSE: code=${ADEXI_CODE} version=${ADEXI_VERSION}`)
}

async function main() {
  console.log('开始初始化数据库...')
  const adminId = await seedAdmin()
  await seedADEXI(adminId)
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
  await seedDraftCognitiveConfig('trailmaking', '1.0.0', {
    name: 'Trail Making Pilot v1.0.0', status: 'DRAFT', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    config: {
      form: 'AB', partAItemCount: 12, partBItemCount: 12, stepTimeoutMs: 15000,
      stimulusSetVersion: 'trailmaking-generated-v1.0.0', report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('reversallearning', '1.0.0', {
    name: 'Probabilistic Reversal Learning Pilot v1.0.0', status: 'DRAFT', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    config: {
      totalTrials: 120, acquisitionTrials: 60, reversalTrials: 60, criterionConsecutiveCorrect: 6,
      rewardProbability: 0.8, trialTimeoutMs: 3000, stimulusSetVersion: 'reversal-symbols-v1.0.0', report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('bart', '1.0.0', {
    name: 'Balloon Pumping Pilot v1.0.0', status: 'DRAFT', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    config: {
      balloonCount: 30, maxPumps: 12, trialTimeoutMs: 15000, pumpAnimationMs: 200,
      stimulusSetVersion: 'bart-generated-v1.0.0', report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('wordlist', '1.0.0', {
    name: 'Chinese Wordlist Free Recall Pilot v1.0.0', status: 'DRAFT', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    config: {
      listLength: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 60000,
      studyMsPerWord: 800, recallTimeoutMs: 60000, inactivityGuardMs: 120000,
      inputMode: 'typed-free-recall', normalizationVersion: 'wordlist-normalization-v1.0.0',
      stimulusSetVersion: 'chinese-wordlist-v1.0.0', report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('lexicaldecision', '1.0.0', {
    name: 'Chinese Lexical Decision Pilot v1.0.0', status: 'DRAFT', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    config: {
      totalTrials: 100, realWordRatio: 0.5, stimulusMs: 1200, trialTimeoutMs: 3000, isiMs: 300,
      validRtFloorMs: 150, stimulusSetVersion: 'zh-lexical-v1.0.0',
      pseudowordGeneratorVersion: 'zh-pseudoword-generator-v1.0.0', report: NONE_REPORT,
    },
  })
  await seedDraftCognitiveConfig('emotionrecognition', '1.0.0', {
    name: 'Six Basic Emotion Face Classification Pilot v1.0.0', status: 'DRAFT', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    config: {
      totalTrials: 60, stimulusMs: 3000, trialTimeoutMs: 5000, isiMs: 300, validRtFloorMs: 200,
      emotionCategoryVersion: 'basic-emotion-6-v1.0.0', stimulusSetVersion: 'emotion-faces-ai-zh-v1.0.0', report: NONE_REPORT,
    },
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
