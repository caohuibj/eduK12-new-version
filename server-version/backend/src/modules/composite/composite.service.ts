import { randomBytes } from 'crypto'
import { nanoid } from 'nanoid'
import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { config } from '../../config'
import { MAX_TOKEN_USES } from '../../constants'
import { encryptField, safeDecrypt } from '../../utils/encryption'
import { createAccessToken, createRecoveryCredential, hashRecoveryToken } from '../../services/anonymousAccess'
import {
  decryptPublicAccessToken,
  encryptPublicAccessToken,
  hashPublicAccessToken,
} from '../../services/publicAccessTokenCrypto'
import { encryptCognitivePayload, decryptCognitivePayload, getParticipantKey } from '../cognitive/cognitive.security'
import { requireCognitiveRegistryEntry } from '../cognitive/cognitive.registry'
import * as cognitiveSessionService from '../cognitive/session.service'
import { parseCognitiveResultSnapshot, referencesForCognitiveResult } from '../cognitive/v2/result-snapshot'
import { resolveCognitiveReferenceForResult } from '../cognitive/reference'
import { readFrozenReport } from '../cognitive/profile-freeze'
import { buildCognitiveSingleTaskReport } from '../cognitive/single-task-report'
import { buildFormBackgroundReport, buildScaleUnitReport, SCALE_REPORT_DEFINITION_VERSION, SCALE_REPORT_DISCLAIMER } from '../reporting/scale-unit-report'
import {
  buildScaleResultForRecord,
  encryptScaleAnswers,
  encryptScaleResult,
  readScaleAnswers,
  scaleDefinitionFromRecord,
  scaleRunnerFromRecord,
} from '../scale/scale-workflow.service'
import { validateScaleDefinition } from '../scale/scale-definition'
import { missingRequiredScaleItemCodes, ScaleAnswerValidationError, validateScaleAnswer } from '../scale/scale-scoring'
import { readContextFormAnswers, validateContextAnswer, validateContextFormItem, validateContextFormItems, writeContextFormAnswer } from '../assessment-context'
import {
  freezeCompositeAttemptContext,
  isAssessmentContextServiceError,
  readCompositeAttemptContext,
  assertContextMutable,
} from '../../services/assessmentContextService'
import { logger } from '../../utils/logger'
import { canUseReportPackage, canUseScale } from '../../services/materialGrant'
import {
  CompositeServiceError,
  compositeBadRequest,
  compositeConflict,
  compositeForbidden,
  compositeNotFound,
} from './composite.errors'
import type {
  AddCompositeItemInput,
  CopyCompositeInput,
  CreateCompositeInput,
  SetCompositeAnalysisProtocolInput,
  SetCompositeReportPackageInput,
  UpdateCompositeInput,
} from './composite.schema'
import { ensureTeacherPublishedAssignment } from '../cognitive/assignment.service'
import { assertTaskCanPublish, assertTaskContractValid } from '../cognitive/v2/publication-gate'
import { getCognitiveV2TaskDefinition } from '../cognitive/v2/registry'
import {
  buildFrozenAnalysisProtocolSnapshot,
  encryptFrozenAnalysisProtocolSnapshot,
  buildFrozenReportPackageSnapshot,
  buildFrozenMentalHealthBundlePackageSnapshot,
  encryptFrozenReportPackageSnapshot,
  getReportPackageDefinition,
  readFrozenReportPackageSnapshot,
  validateFrozenReportPackageSnapshot,
  getAnalysisProtocolDefinition,
  readFrozenAnalysisProtocolSnapshot,
  validateFrozenAnalysisProtocolSnapshot,
} from '../cognitive-analysis'
import type {
  AnalysisProtocolDefinition,
  CognitiveAnalysisProfile,
  ReportPackageDefinition,
} from '../cognitive-analysis'
import {
  getFrozenPackageSlotLabels,
  resolveCompositeItemLabel,
  resolveLibraryItemLabel,
} from './report-package-label'
import {
  buildPackageAnalysisForAttempt,
  buildCompletionSnapshotExpectation,
  listPackageAnalysisSnapshotMetadata,
  persistOrGetPackageAnalysisSnapshot,
  readCompletionPackageAnalysisSnapshot,
  readPackageAnalysisSnapshot,
} from './composite-analysis-snapshot.service'
import {
  projectCompositeCollectionReport,
  projectCompositeReport,
} from './composite-report.projector'
import type {
  CompositeReportAudience,
  CompositeSnapshotMetadata,
} from './composite-report.types'
import type { CompositeAnalysisExportContext } from './composite-analysis-export.service'

type Db = any

const reportPackageSummary = (row: {
  reportPackageKey?: string | null
  reportPackageVersion?: string | null
  reportPackageProfile?: string | null
  reportPackageSnapshotEncrypted?: string | null
}) => row.reportPackageKey && row.reportPackageVersion
  ? {
      key: row.reportPackageKey,
      version: row.reportPackageVersion,
      profile: row.reportPackageProfile,
      frozen: Boolean(row.reportPackageSnapshotEncrypted),
    }
  : null

const withoutAnalysisProtocolCipher = <T extends Record<string, unknown>>(row: T) => {
  const {
    analysisProtocolSnapshotEncrypted: _ignoredProtocol,
    reportPackageSnapshotEncrypted: _ignoredPackage,
    analysisProtocolKey: _ignoredProtocolKey,
    analysisProtocolVersion: _ignoredProtocolVersion,
    reportPackageKey: _ignoredPackageKey,
    reportPackageVersion: _ignoredPackageVersion,
    reportPackageProfile: _ignoredPackageProfile,
    ...safe
  } = row
  return { ...safe, reportPackage: reportPackageSummary(row) }
}

const isTeacherOrAdmin = (role: UserRole) => role === UserRole.TEACHER || role === UserRole.ADMIN

const assertTeacher = (role: UserRole) => {
  if (!isTeacherOrAdmin(role)) throw compositeForbidden('需要教师权限')
}

const assertOwner = (resource: { createdBy: string | null }, userId: string, role: UserRole) => {
  if (role === UserRole.ADMIN) return
  if (role !== UserRole.TEACHER || resource.createdBy !== userId) {
    throw compositeForbidden()
  }
}

const parseDate = (value: string | null | undefined) => (value ? new Date(value) : null)

const loadComposite = async (id: string, includeItems = false) => {
  const composite = await prisma.compositeAssessment.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, role: true } },
      course: { select: { id: true, title: true, courseCode: true, isLibrary: true } },
      ...(includeItems
        ? {
            items: {
              orderBy: { position: 'asc' as const },
              include: {
                scale: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    description: true,
                    status: true,
                    instrumentClass: true,
                    instrumentVersion: true,
                    definition: true,
                  },
                },
                cognitiveAssignment: { include: { config: true } },
              },
            },
          }
        : {}),
    },
  })
  if (!composite) throw compositeNotFound()
  return composite as any
}

const validateCourse = async (
  courseId: string | null | undefined,
  userId: string,
  role: UserRole,
  options: { allowLibrary?: boolean; requireOwnCourse?: boolean } = {},
) => {
  if (!courseId) return null
  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course) throw compositeNotFound('课程不存在')
  if (course.isLibrary && !options.allowLibrary) {
    throw compositeBadRequest('不能绑定库课程')
  }
  if ((options.requireOwnCourse || role === UserRole.TEACHER) && course.creatorId !== userId) {
    throw compositeForbidden('只能在自己创建的课程中发布综合测评')
  }
  return course
}

const isAdminLibraryTemplate = (composite: {
  copyable?: boolean
  status?: string
  courseId?: string | null
  creator?: { role?: UserRole | string } | null
  course?: { isLibrary?: boolean } | null
}) =>
  Boolean(
    composite.copyable
    && composite.status === 'PUBLISHED'
    && composite.creator?.role === UserRole.ADMIN
    && composite.courseId
    && composite.course?.isLibrary === true,
  )

const canSetCopyableFor = (composite: { status?: string; creator?: { role?: UserRole | string } | null; course?: { isLibrary?: boolean } | null }, role: UserRole) =>
  role === UserRole.ADMIN
  && composite.status === 'PUBLISHED'
  && composite.creator?.role === UserRole.ADMIN
  && composite.course?.isLibrary === true

const assertNotLibraryComposite = (composite: { course?: { isLibrary?: boolean } | null }, message: string) => {
  if (composite.course?.isLibrary) throw compositeBadRequest(message)
}

const assertDraft = (composite: { status: string }) => {
  if (composite.status !== 'DRAFT') throw compositeConflict('只有草稿状态的综合测评可以修改')
}

const assertCollectionOnlyEditing = (composite: {
  analysisProtocolKey?: string | null
  reportPackageKey?: string | null
}) => {
  if (composite.analysisProtocolKey || composite.reportPackageKey) {
    throw compositeConflict('固定分析协议的模块不能单独添加、移除或排序')
  }
}

const assertCognitiveModuleEnabled = () => {
  if (!config.cognitiveModuleEnabled) throw compositeBadRequest('认知模块未启用')
}

const assertSupportedComposite = (composite: { items?: Array<{ type: string }> }) => {
  if (!config.cognitiveModuleEnabled && composite.items?.some((item) => item.type === 'COGNITIVE')) {
    throw compositeBadRequest('认知模块未启用')
  }
}

const requirePublishedAnalysisProtocol = (key: string, version: string) => {
  const protocol = getAnalysisProtocolDefinition(key, version)
  if (!protocol || protocol.status !== 'PUBLISHED') {
    throw compositeBadRequest('综合分析协议不存在或尚未发布')
  }
  return protocol
}

const requirePublishedReportPackage = (key: string, version: string) => {
  const definition = getReportPackageDefinition(key, version)
  if (!definition || definition.status !== 'PUBLISHED') {
    throw compositeBadRequest('报告包不存在或尚未发布')
  }
  return definition
}

export const materializeAnalysisProtocol = async (
  db: Db,
  input: {
    compositeId: string
    courseId: string
    userId: string
    profile: CognitiveAnalysisProfile
    protocol: AnalysisProtocolDefinition
  },
) => {
  if (input.protocol.status !== 'PUBLISHED') throw compositeBadRequest('只能使用已发布的综合分析协议')
  if (!input.protocol.profiles.includes(input.profile)) throw compositeBadRequest('综合分析协议不支持该 Profile')

  for (const slot of [...input.protocol.cognitiveSlots].sort((a, b) => a.position - b.position)) {
    const taskConfig = await db.cognitiveTestConfig.findUnique({
      where: { testType_configVersion: { testType: slot.testType, configVersion: slot.configVersion } },
    })
    if (
      !taskConfig ||
      taskConfig.status !== 'PUBLISHED' ||
      taskConfig.engineVersion !== slot.engineVersion ||
      taskConfig.scoringVersion !== slot.scoringVersion
    ) {
      throw compositeBadRequest(`协议任务配置不可用：${slot.label}`)
    }
    const assignment = await ensureTeacherPublishedAssignment(db, {
      userId: input.userId,
      courseId: input.courseId,
      configId: taskConfig.id,
      title: slot.label,
      instruction: taskConfig.instruction ?? null,
      profile: input.profile,
    })
    await db.compositeAssessmentItem.create({
      data: {
        compositeAssessmentId: input.compositeId,
        type: 'COGNITIVE',
        position: slot.position,
        required: true,
        cognitiveAssignmentId: assignment.id,
      },
    })
  }

  for (const slot of [...input.protocol.scaleSlots].sort((a, b) => a.position - b.position)) {
    const scale = await db.scale.findUnique({
      where: { code: slot.expectedScaleCode },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        instrumentClass: true,
        instrumentVersion: true,
        definition: true,
      },
    })
    if (!scale || scale.status !== 'PUBLISHED') {
      throw compositeBadRequest(`协议量表不可用：${slot.label}`)
    }
    const validation = validateScaleDefinition(scale.definition, { instrumentClass: scale.instrumentClass })
    if (!validation.definition || validation.issues.some((issue) => issue.severity === 'error')) {
      throw compositeBadRequest(`协议量表 definition 不可用：${slot.label}`)
    }
    if (!validation.definition.scoring.scores.some((score) => score.key === slot.expectedDimensionCode)) {
      throw compositeBadRequest(`协议量表维度不可用：${slot.label}`)
    }
    await db.compositeAssessmentItem.create({
      data: {
        compositeAssessmentId: input.compositeId,
        type: 'SCALE',
        position: slot.position,
        required: true,
        scaleId: scale.id,
      },
    })
  }
}

export const materializeReportPackage = async (
  db: Db,
  input: {
    compositeId: string
    courseId?: string | null
    userId: string
    profile: CognitiveAnalysisProfile
    packageDefinition: ReportPackageDefinition
  },
) => {
  if (input.packageDefinition.analysisEngineKey === 'mental-health-rule-v1') {
    const bundle = input.packageDefinition.bundleDefinition as {
      scaleSlots?: Array<{
        key: string
        label: string
        position: number
        expectedScaleCode: string
        expectedInstrumentVersion?: string
        mappings: Array<{ scoreKey: string }>
      }>
    } | undefined
    if (!bundle?.scaleSlots?.length) throw compositeBadRequest('Mental health 报告包缺少 Scale slots')
    for (const slot of [...bundle.scaleSlots].sort((left, right) => left.position - right.position)) {
      const scale = await db.scale.findUnique({
        where: { code: slot.expectedScaleCode },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          instrumentClass: true,
          instrumentVersion: true,
          definition: true,
          definitionHash: true,
        },
      })
      if (!scale || scale.status !== 'PUBLISHED') throw compositeBadRequest(`Bundle 量表不可用：${slot.label}`)
      if (slot.expectedInstrumentVersion && scale.instrumentVersion !== slot.expectedInstrumentVersion) {
        throw compositeBadRequest(`Bundle 量表 instrumentVersion 不匹配：${slot.label}`)
      }
      const definition = scaleDefinitionFromRecord(scale)
      const scoreKeys = new Set(definition.scoring.scores.map((score) => score.key))
      if (slot.mappings.some((mapping) => !scoreKeys.has(mapping.scoreKey))) {
        throw compositeBadRequest(`Bundle 量表 score key 不可用：${slot.label}`)
      }
      await db.compositeAssessmentItem.create({
        data: {
          compositeAssessmentId: input.compositeId,
          type: 'SCALE',
          position: slot.position,
          required: true,
          scaleId: scale.id,
        },
      })
    }
    return
  }
  const protocol = requirePublishedAnalysisProtocol(
    input.packageDefinition.analysisProtocolKey,
    input.packageDefinition.analysisProtocolVersion,
  )
  await materializeAnalysisProtocol(db, {
    compositeId: input.compositeId,
    courseId: input.courseId as string,
    userId: input.userId,
    profile: input.profile,
    protocol,
  })
}

const validateCognitiveConfig = (config: any, requirePublication = false) => {
  try {
    const entry = requireCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion)
    const parsed = entry.configSchema.safeParse(config.config)
    if (!parsed.success) throw compositeBadRequest('认知任务配置不符合当前版本规范')
    const definition = getCognitiveV2TaskDefinition(
      config.testType,
      config.engineVersion,
      config.scoringVersion,
    )
    if (!definition) throw compositeBadRequest('认知任务缺少 Cognitive v2 definition')
    try {
      if (requirePublication) assertTaskCanPublish(definition)
      else assertTaskContractValid(definition)
    } catch {
      throw compositeBadRequest(requirePublication
        ? '认知任务未通过 Cognitive v2 publication gate'
        : '认知任务不符合 Cognitive v2 contract')
    }
    return parsed.data
  } catch (err) {
    if (err instanceof CompositeServiceError) throw err
    throw compositeBadRequest('认知任务配置版本不可用')
  }
}

const assertCognitiveAssignmentOnCompositeCourse = (
  assignment: { courseId: string | null },
  composite: { courseId: string | null },
) => {
  if (!composite.courseId) throw compositeBadRequest('含认知模块的综合测评必须绑定课程')
  if (assignment.courseId !== composite.courseId) {
    throw compositeBadRequest('认知任务必须与综合测评属于同一课程')
  }
}

const assertValidItem = async (
  input: AddCompositeItemInput,
  userId: string,
  role: UserRole,
  composite: { courseId: string | null },
) => {
  if (input.required === false && (input.type !== 'FORM' || !input.contextKey)) {
    throw compositeBadRequest('只有 context 表单可以设置为非必填')
  }
  const supplied = [input.scaleId, input.cognitiveAssignmentId, input.formLabel].filter(Boolean).length
  if (input.type === 'SCALE') {
    if (!input.scaleId || supplied !== 1) throw compositeBadRequest('量表模块必须提供 scaleId')
    const scale = await prisma.scale.findUnique({ where: { id: input.scaleId } })
    if (!scale) throw compositeNotFound('量表不存在')
    if (!(await canUseScale(userId, role, scale))) throw compositeForbidden('无权限使用此量表')
    if (scale.status !== 'PUBLISHED') throw compositeBadRequest('只能添加已发布量表')
    if (!scale.definition) throw compositeBadRequest('只能添加已安装 v2 definition 的量表')
    const definitionValidation = validateScaleDefinition(scale.definition)
    if (!definitionValidation.definition || definitionValidation.issues.some((issue) => issue.severity === 'error')) {
      throw compositeBadRequest('量表 definition 不可用')
    }
    return
  }

  if (input.type === 'COGNITIVE') {
    assertCognitiveModuleEnabled()
    if (!input.cognitiveAssignmentId || supplied !== 1) throw compositeBadRequest('认知模块必须提供 cognitiveAssignmentId')
    const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: input.cognitiveAssignmentId }, include: { config: true } })
    if (!assignment) throw compositeNotFound('认知任务不存在')
    if (assignment.status !== 'PUBLISHED' || assignment.config.status !== 'PUBLISHED') {
      throw compositeBadRequest('只能添加已发布认知任务')
    }
    if (assignment.listedStandalone === false) {
      throw compositeForbidden('报告包内部认知任务不能用于仅收集综合测评')
    }
    validateCognitiveConfig(assignment.config)
    if (role !== UserRole.ADMIN && assignment.createdBy !== userId) {
      throw compositeForbidden('无权限使用此认知任务')
    }
    assertCognitiveAssignmentOnCompositeCourse(assignment, composite)
    return
  }

  if (input.type === 'FORM') {
    if (!input.formType || !input.formLabel || supplied !== 1) {
      throw compositeBadRequest('表单模块必须提供 formType 和 formLabel')
    }
    if (input.formType === 'single_choice' || input.formType === 'multiple_choice') {
      const options = input.formOptions ?? []
      const values = options.map((option) => option.value)
      if (values.length === 0) throw compositeBadRequest('选择题必须提供至少一个选项')
      if (new Set(values).size !== values.length) throw compositeBadRequest('表单选项不能重复')
    }
    const contextIssues = validateContextFormItem({
      id: 'new',
      type: input.formType,
      label: input.formLabel,
      required: input.required,
      position: input.position,
      contextKey: input.contextKey,
      options: input.formOptions,
    })
    if (contextIssues.length > 0) throw compositeBadRequest(contextIssues[0].message)
    return
  }

  throw compositeBadRequest('不支持的综合测评模块类型')
}

const mapItemForTeacher = (item: any, packageSlotLabels = new Map<number, string>()) => ({
  id: item.id,
  type: item.type,
  position: item.position,
  required: item.required,
  scale: item.scale ? { id: item.scale.id, code: item.scale.code, name: packageSlotLabels.get(item.position) ?? item.scale.name } : null,
  cognitiveAssignment: item.cognitiveAssignment
    ? {
        id: item.cognitiveAssignment.id,
        title: packageSlotLabels.get(item.position) ?? item.cognitiveAssignment.title,
        status: item.cognitiveAssignment.status,
        profile: item.cognitiveAssignment.profile ?? null,
        config: {
          id: item.cognitiveAssignment.config.id,
          testType: item.cognitiveAssignment.config.testType,
          configVersion: item.cognitiveAssignment.config.configVersion,
          name: item.cognitiveAssignment.config.name,
          engineVersion: item.cognitiveAssignment.config.engineVersion,
          scoringVersion: item.cognitiveAssignment.config.scoringVersion,
        },
      }
    : null,
  form: item.type === 'FORM'
    ? {
        type: item.formType,
        label: packageSlotLabels.get(item.position) ?? item.formLabel,
        placeholder: item.formPlaceholder,
        options: item.formOptions,
        contextKey: item.contextKey ?? null,
      }
    : null,
})

type AttemptCounts = {
  started: number
  inProgress: number
  completed: number
  abandoned: number
}

const emptyAttemptCounts = (): AttemptCounts => ({
  started: 0,
  inProgress: 0,
  completed: 0,
  abandoned: 0,
})

const loadAttemptCountsByCompositeIds = async (ids: string[]): Promise<Map<string, AttemptCounts>> => {
  const byId = new Map<string, AttemptCounts>()
  if (ids.length === 0) return byId
  const grouped = await prisma.compositeAssessmentAttempt.groupBy({
    by: ['compositeAssessmentId', 'status'],
    where: { compositeAssessmentId: { in: ids } },
    _count: { _all: true },
  })
  for (const row of grouped) {
    const current = byId.get(row.compositeAssessmentId) ?? emptyAttemptCounts()
    const n = row._count._all
    if (row.status === 'IN_PROGRESS') current.inProgress += n
    else if (row.status === 'COMPLETED') current.completed += n
    else if (row.status === 'ABANDONED') current.abandoned += n
    current.started = current.inProgress + current.completed + current.abandoned
    byId.set(row.compositeAssessmentId, current)
  }
  return byId
}

const mapAttemptRowForTeacher = (attempt: {
  id: string
  status: string
  progress: number
  completedItems: number
  startedAt: Date
  lastSavedAt: Date
  completedAt: Date | null
  totalTime: number | null
  anonymousCode: string | null
  userId: string | null
  user: { id: string; nickname: string | null; username: string } | null
}) => {
  const base = {
    id: attempt.id,
    status: attempt.status,
    progress: attempt.progress,
    completedItems: attempt.completedItems,
    startedAt: attempt.startedAt,
    lastSavedAt: attempt.lastSavedAt,
    completedAt: attempt.completedAt,
    totalTime: attempt.totalTime,
    userId: attempt.userId,
  }
  if (attempt.anonymousCode) {
    return {
      ...base,
      isAnonymous: true,
      anonymousCode: attempt.anonymousCode,
      nickname: null,
      username: null,
      displayName: attempt.anonymousCode,
    }
  }
  if (!attempt.user) {
    return {
      ...base,
      isAnonymous: false,
      anonymousCode: null,
      nickname: null,
      username: null,
      displayName: '已删除用户',
    }
  }
  return {
    ...base,
    isAnonymous: false,
    anonymousCode: null,
    nickname: attempt.user.nickname,
    username: attempt.user.username,
    displayName: attempt.user.nickname,
    userId: attempt.user.id,
  }
}

export const createComposite = async (userId: string, role: UserRole, input: CreateCompositeInput) => {
  assertTeacher(role)
  // A bare analysis protocol is a legacy persisted-data concept, not a
  // creation mode. The controller schema rejects it; keep this guard here as
  // defense-in-depth for internal callers that might bypass the controller.
  if (Object.prototype.hasOwnProperty.call(input, 'analysisProtocol')) {
    throw compositeBadRequest('固定报告必须从获授权报告包创建')
  }
  await validateCourse(input.courseId, userId, role, { allowLibrary: role === UserRole.ADMIN })
  if (input.publicEnabled && !input.expiresAt) {
    throw compositeBadRequest('公开链接必须设置有效期')
  }
  const existing = await prisma.compositeAssessment.findUnique({ where: { code: input.code } })
  if (existing) throw compositeConflict('综合测评编码已存在')

  const packageSelection = input.reportPackage ?? null
  const packageDefinition = packageSelection
    ? requirePublishedReportPackage(packageSelection.key, packageSelection.version)
    : null
  if (packageDefinition) {
    if (!await canUseReportPackage(userId, role, packageDefinition.key, packageDefinition.version)) {
      throw compositeForbidden('没有该报告包的授权')
    }
    if (!packageSelection || !packageDefinition.profiles.includes(packageSelection.profile)) {
      throw compositeBadRequest('报告包不支持该 Profile')
    }
  }
  const isMentalHealthPackage = packageDefinition?.analysisEngineKey === 'mental-health-rule-v1'
  const protocol = packageDefinition && !isMentalHealthPackage
    ? requirePublishedAnalysisProtocol(packageDefinition.analysisProtocolKey, packageDefinition.analysisProtocolVersion)
    : null
  if (protocol) {
    assertCognitiveModuleEnabled()
    if (!input.courseId) throw compositeBadRequest('综合分析协议必须绑定课程')
  }

  return prisma.$transaction(async (tx: Db) => {
    const composite = await tx.compositeAssessment.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        instruction: input.instruction ?? null,
        courseId: input.courseId ?? null,
        createdBy: userId,
        opensAt: parseDate(input.opensAt),
        expiresAt: parseDate(input.expiresAt),
        maxAttempts: input.maxAttempts,
        publicEnabled: input.publicEnabled,
        analysisProtocolKey: packageDefinition?.analysisProtocolKey ?? null,
        analysisProtocolVersion: packageDefinition?.analysisProtocolVersion ?? null,
        analysisProtocolSnapshotEncrypted: null,
        analysisEngineKey: packageDefinition?.analysisEngineKey ?? null,
        reportPackageKey: packageDefinition?.key ?? null,
        reportPackageVersion: packageDefinition?.version ?? null,
        reportPackageProfile: packageSelection?.profile ?? null,
        reportPackageSnapshotEncrypted: null,
      },
    })
    if (packageDefinition && packageSelection) {
      await materializeReportPackage(tx, {
        compositeId: composite.id,
        courseId: input.courseId,
        userId,
        profile: packageSelection.profile,
        packageDefinition,
      })
    }
    return withoutAnalysisProtocolCipher(composite)
  })
}

export const listComposites = async (userId: string, role: UserRole) => {
  assertTeacher(role)
  const where = role === UserRole.ADMIN ? {} : { createdBy: userId }
  const list = await prisma.compositeAssessment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      creator: { select: { id: true, role: true } },
      course: { select: { id: true, title: true, courseCode: true, isLibrary: true } },
      items: {
        orderBy: { position: 'asc' },
        include: {
          scale: { select: { id: true, name: true } },
          cognitiveAssignment: {
            select: {
              id: true,
              title: true,
              status: true,
              profile: true,
              config: {
                select: {
                  id: true,
                  testType: true,
                  configVersion: true,
                  name: true,
                  engineVersion: true,
                  scoringVersion: true,
                },
              },
            },
          },
        },
      },
    },
  })
  const supportedList = config.cognitiveModuleEnabled
    ? list
    : list.filter((item: any) => !item.items.some((child: any) => child.type === 'COGNITIVE'))
  const counts = await loadAttemptCountsByCompositeIds(supportedList.map((item: any) => item.id))
  return supportedList.map((item: any) => {
    const {
      _count: _ignoredCount,
      analysisProtocolSnapshotEncrypted: _ignoredProtocolSnapshot,
      analysisProtocolKey: _ignoredProtocolKey,
      analysisProtocolVersion: _ignoredProtocolVersion,
      reportPackageSnapshotEncrypted: _ignoredPackageSnapshot,
      reportPackageKey: _ignoredPackageKey,
      reportPackageVersion: _ignoredPackageVersion,
      reportPackageProfile: _ignoredPackageProfile,
      ...rest
    } = item
    return {
      ...rest,
      reportPackage: reportPackageSummary(item),
      copyable: Boolean(item.copyable),
      createdBy: item.createdBy,
      creator: item.creator ? { id: item.creator.id, role: item.creator.role } : null,
      course: item.course
        ? { id: item.course.id, title: item.course.title, courseCode: item.course.courseCode, isLibrary: item.course.isLibrary }
        : null,
      canSetCopyable: canSetCopyableFor(item, role),
      itemCount: item.items.length,
      items: item.items.map((child: any) => mapItemForTeacher(child, getFrozenPackageSlotLabels(item))),
      attemptCounts: counts.get(item.id) ?? emptyAttemptCounts(),
    }
  })
}

export const getCompositeForTeacher = async (userId: string, role: UserRole, id: string) => {
  assertTeacher(role)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role)
  const counts = await loadAttemptCountsByCompositeIds([composite.id])
  return {
    id: composite.id,
    code: composite.code,
    name: composite.name,
    description: composite.description,
    instruction: composite.instruction,
    status: composite.status,
    courseId: composite.courseId,
    opensAt: composite.opensAt,
    expiresAt: composite.expiresAt,
    maxAttempts: composite.maxAttempts,
    publicEnabled: composite.publicEnabled,
    copyable: Boolean(composite.copyable),
    createdBy: composite.createdBy,
    creator: composite.creator ? { id: composite.creator.id, role: composite.creator.role } : null,
    course: composite.course
      ? { id: composite.course.id, title: composite.course.title, courseCode: composite.course.courseCode, isLibrary: composite.course.isLibrary }
      : null,
    canSetCopyable: canSetCopyableFor(composite, role),
    publishedAt: composite.publishedAt,
    reportPackage: reportPackageSummary(composite),
    // Legacy protocol metadata is retained only for historical composites that
    // predate PR6B; new package instances expose package semantics instead.
    analysisProtocol: !composite.reportPackageKey && composite.analysisProtocolKey
      ? {
          key: composite.analysisProtocolKey,
          version: composite.analysisProtocolVersion,
          profile:
            composite.items.find((item: any) => item.type === 'COGNITIVE')?.cognitiveAssignment?.profile
            ?? null,
          frozen: Boolean(composite.analysisProtocolSnapshotEncrypted),
        }
      : null,
    items: composite.items.map((item: any) => mapItemForTeacher(item, getFrozenPackageSlotLabels(composite))),
    attemptCounts: counts.get(composite.id) ?? emptyAttemptCounts(),
  }
}

export const listLibraryTemplates = async (userId: string, role: UserRole) => {
  assertTeacher(role)
  const list = await prisma.compositeAssessment.findMany({
    where: { copyable: true, status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    include: {
      creator: { select: { id: true, role: true } },
      course: { select: { id: true, isLibrary: true, title: true } },
      items: {
        orderBy: { position: 'asc' },
        include: {
          scale: { select: { name: true } },
          cognitiveAssignment: { select: { title: true, config: { select: { name: true } } } },
        },
      },
    },
  })
  const templates = list.filter(isAdminLibraryTemplate)
  const supported = config.cognitiveModuleEnabled
    ? templates
    : templates.filter((item) => !item.items.some((child) => child.type === 'COGNITIVE'))
  return supported.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    items: item.items.map((child) => ({
      type: child.type,
      position: child.position,
      label: resolveLibraryItemLabel(child, getFrozenPackageSlotLabels(item)),
    })),
  }))
}

export const copyComposite = async (userId: string, role: UserRole, sourceId: string, input: CopyCompositeInput) => {
  assertTeacher(role)
  const source = await prisma.compositeAssessment.findUnique({
    where: { id: sourceId },
    include: {
      creator: { select: { id: true, role: true } },
      course: { select: { id: true, isLibrary: true, title: true } },
      items: {
        orderBy: { position: 'asc' },
        include: {
          scale: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              status: true,
              instrumentClass: true,
              instrumentVersion: true,
              definition: true,
            },
          },
          cognitiveAssignment: { include: { config: true } },
        },
      },
    },
  })
  if (!source) throw compositeNotFound()
  const selfCopy = source.createdBy === userId
  const libraryCopy = isAdminLibraryTemplate(source)
  if (!selfCopy && !libraryCopy) throw compositeForbidden('不能复制此综合测评')

  const hasPackageKey = Boolean(source.reportPackageKey)
  const hasPackageVersion = Boolean(source.reportPackageVersion)
  const hasPackageProfile = Boolean(source.reportPackageProfile)
  const hasPackageSnapshot = Boolean(source.reportPackageSnapshotEncrypted)
  if (
    hasPackageKey !== hasPackageVersion
    || hasPackageKey !== hasPackageProfile
    || (hasPackageSnapshot && !hasPackageKey)
    || (source.status === 'PUBLISHED' && hasPackageKey && !hasPackageSnapshot)
  ) {
    throw compositeBadRequest('来源综合测评的报告包冻结信息不完整')
  }
  const packageDefinition = hasPackageKey && hasPackageVersion
    ? requirePublishedReportPackage(source.reportPackageKey as string, source.reportPackageVersion as string)
    : null
  if (packageDefinition && !await canUseReportPackage(userId, role, packageDefinition.key, packageDefinition.version)) {
    throw compositeForbidden('没有该报告包的授权，不能创建新的包实例')
  }
  if (packageDefinition && hasPackageSnapshot) {
    try {
      const protocol = packageDefinition.analysisEngineKey === 'mental-health-rule-v1'
        ? undefined
        : requirePublishedAnalysisProtocol(
          packageDefinition.analysisProtocolKey,
          packageDefinition.analysisProtocolVersion,
        )
      validateFrozenReportPackageSnapshot(
        readFrozenReportPackageSnapshot(source.reportPackageSnapshotEncrypted as string),
        packageDefinition,
        protocol,
        source.items,
      )
      const frozenPackage = readFrozenReportPackageSnapshot(source.reportPackageSnapshotEncrypted as string)
      if (frozenPackage.profile !== source.reportPackageProfile) {
        throw new Error('来源报告包快照 Profile 与实例不匹配')
      }
    } catch (err) {
      throw compositeBadRequest(err instanceof Error ? err.message : '来源报告包快照不可用')
    }
  }

  const hasProtocolKey = Boolean(source.analysisProtocolKey)
  const hasProtocolVersion = Boolean(source.analysisProtocolVersion)
  const hasProtocolSnapshot = Boolean(source.analysisProtocolSnapshotEncrypted)
  if (
    hasProtocolKey !== hasProtocolVersion ||
    (hasProtocolSnapshot && !hasProtocolKey) ||
    (source.status === 'PUBLISHED' && hasProtocolKey && !hasProtocolSnapshot)
  ) {
    throw compositeBadRequest('来源综合测评的分析协议冻结信息不完整')
  }
  if (hasPackageKey && (!hasProtocolKey || !hasProtocolVersion)) {
    throw compositeBadRequest('来源综合测评的报告包内部协议引用不完整')
  }
  if (!hasPackageKey && (hasProtocolKey || hasProtocolVersion || hasProtocolSnapshot)) {
    throw compositeBadRequest('旧版固定协议实例不能复制，请从获授权报告包创建')
  }
  if (hasProtocolSnapshot) {
    try {
      const snapshot = readFrozenAnalysisProtocolSnapshot(source.analysisProtocolSnapshotEncrypted as string)
      if (packageDefinition?.analysisEngineKey === 'mental-health-rule-v1') {
        const packageSnapshot = readFrozenReportPackageSnapshot(source.reportPackageSnapshotEncrypted as string)
        if (JSON.stringify(snapshot) !== JSON.stringify(packageSnapshot.analysisProtocolSnapshot)) {
          throw new Error('来源报告包内部冻结协议与 Bundle 快照不一致')
        }
      } else {
        validateFrozenAnalysisProtocolSnapshot(
          snapshot,
          source.analysisProtocolKey as string,
          source.analysisProtocolVersion as string,
          source.items,
        )
      }
    } catch (err) {
      throw compositeBadRequest(err instanceof Error ? err.message : '来源综合分析协议快照不可用')
    }
  }

  const hasCognitive = source.items.some((item) => item.type === 'COGNITIVE')
  if (hasCognitive) assertCognitiveModuleEnabled()
  if (libraryCopy && !input.courseId) throw compositeBadRequest('复制管理员模板必须选择自己的授课课')

  const targetCourseId = libraryCopy ? input.courseId : (input.courseId === undefined ? source.courseId : input.courseId)
  if (hasCognitive && !targetCourseId) throw compositeBadRequest('含认知模块的模板必须绑定课程')
  await validateCourse(targetCourseId, userId, role, { allowLibrary: false, requireOwnCourse: true })

  let code = input.code ?? `${source.code}_copy_${nanoid(8)}`
  const name = input.name ?? `${source.name}（副本）`

  return prisma.$transaction(async (tx) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const taken = await tx.compositeAssessment.findUnique({ where: { code } })
      if (!taken) break
      if (input.code || attempt === 3) throw compositeConflict('综合测评编码已存在')
      code = `${source.code}_copy_${nanoid(8)}`
    }

    const itemData: Array<Record<string, unknown>> = []
    for (const item of source.items) {
      if (item.type === 'SCALE') {
        if (!item.scaleId || item.scale?.status !== 'PUBLISHED') throw compositeBadRequest('综合测评包含未发布量表')
        itemData.push({ type: 'SCALE', position: item.position, required: item.required, scaleId: item.scaleId })
      } else if (item.type === 'FORM') {
        itemData.push({
          type: 'FORM',
          position: item.position,
          required: item.required,
          formType: item.formType,
          formLabel: item.formLabel,
          formPlaceholder: item.formPlaceholder,
          formOptions: item.formOptions ?? undefined,
          contextKey: item.contextKey ?? undefined,
        })
      } else if (item.type === 'COGNITIVE') {
        const assignment = item.cognitiveAssignment
        if (!assignment?.configId || !targetCourseId) throw compositeBadRequest('认知任务配置不存在')
        const ensured = await ensureTeacherPublishedAssignment(tx, {
          userId,
          courseId: targetCourseId,
          configId: assignment.configId,
          title: assignment.title || assignment.config.name,
          instruction: assignment.instruction ?? assignment.config.instruction ?? null,
          sourceFreeze: {
            profile: assignment.profile ?? null,
            profileDefinitionVersion: assignment.profileDefinitionVersion ?? null,
            resolvedConfigSnapshotEncrypted: assignment.resolvedConfigSnapshotEncrypted ?? null,
            resolvedConfigHash: assignment.resolvedConfigHash ?? null,
            resolvedReportSnapshotEncrypted: assignment.resolvedReportSnapshotEncrypted ?? null,
          },
        })
        itemData.push({
          type: 'COGNITIVE',
          position: item.position,
          required: item.required,
          cognitiveAssignmentId: ensured.id,
        })
      }
    }

    const copied = await tx.compositeAssessment.create({
      data: {
        code,
        name,
        description: source.description,
        instruction: source.instruction,
        status: 'DRAFT',
        courseId: targetCourseId,
        createdBy: userId,
        maxAttempts: source.maxAttempts,
        publicEnabled: false,
        copyable: false,
        copiedFromId: source.id,
        analysisProtocolKey: source.analysisProtocolKey ?? null,
        analysisProtocolVersion: source.analysisProtocolVersion ?? null,
        analysisProtocolSnapshotEncrypted: source.analysisProtocolSnapshotEncrypted ?? null,
        reportPackageKey: source.reportPackageKey ?? null,
        reportPackageVersion: source.reportPackageVersion ?? null,
        reportPackageProfile: source.reportPackageProfile ?? null,
        reportPackageSnapshotEncrypted: source.reportPackageSnapshotEncrypted ?? null,
        analysisEngineKey: source.analysisEngineKey ?? null,
        items: { create: itemData as any },
      },
      include: { items: { orderBy: { position: 'asc' } } },
    })
    return withoutAnalysisProtocolCipher(copied)
  })
}

export const listAttemptsForTeacher = async (
  userId: string,
  role: UserRole,
  compositeId: string,
  query: {
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'
    q?: string
    page: number
    pageSize: number
  },
) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)

  const where: Record<string, unknown> = { compositeAssessmentId: compositeId }
  if (query.status) where.status = query.status
  const q = query.q?.trim()
  if (q) {
    where.OR = [
      { anonymousCode: { contains: q, mode: 'insensitive' } },
      { user: { is: { nickname: { contains: q, mode: 'insensitive' } } } },
      { user: { is: { username: { contains: q, mode: 'insensitive' } } } },
    ]
  }

  const [attempts, total, counts] = await Promise.all([
    prisma.compositeAssessmentAttempt.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: [
        { completedAt: { sort: 'desc', nulls: 'last' } },
        { startedAt: 'desc' },
      ],
      select: {
        id: true,
        status: true,
        progress: true,
        completedItems: true,
        startedAt: true,
        lastSavedAt: true,
        completedAt: true,
        totalTime: true,
        anonymousCode: true,
        userId: true,
        user: { select: { id: true, nickname: true, username: true } },
      },
    }),
    prisma.compositeAssessmentAttempt.count({ where }),
    loadAttemptCountsByCompositeIds([compositeId]),
  ])

  const totalPages = Math.ceil(total / query.pageSize)
  return {
    assessment: {
      id: composite.id,
      name: composite.name,
      code: composite.code,
      status: composite.status,
      courseId: composite.courseId,
    },
    attemptCounts: counts.get(compositeId) ?? emptyAttemptCounts(),
    list: attempts.map(mapAttemptRowForTeacher),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages,
    hasMore: query.page < totalPages,
  }
}

export const updateComposite = async (userId: string, role: UserRole, id: string, input: UpdateCompositeInput) => {
  assertTeacher(role)
  const existing = await loadComposite(id, true)
  assertOwner(existing, userId, role)
  const providedKeys = (Object.keys(input) as Array<keyof UpdateCompositeInput>).filter((key) => input[key] !== undefined)
  if (input.copyable !== undefined) {
    if (role !== UserRole.ADMIN) throw compositeForbidden('只有管理员可以把综合测评标为库模板')
    if (existing.status !== 'PUBLISHED') throw compositeBadRequest('只有已发布的综合测评可以设为库模板')
    if (existing.creator?.role !== UserRole.ADMIN) throw compositeForbidden('只能把管理员创建的综合测评标为库模板')
    if (existing.course?.isLibrary !== true) throw compositeBadRequest('只有绑定库课程的综合测评可以设为模板')
  }
  const publicWindowKeys = role === UserRole.ADMIN
    ? (['expiresAt', 'publicEnabled', 'copyable'] as const)
    : (['expiresAt', 'publicEnabled'] as const)
  const publicWindowOnly = providedKeys.length > 0 && providedKeys.every((key) => (publicWindowKeys as readonly string[]).includes(key))
  if (existing.status !== 'DRAFT' && !publicWindowOnly) {
    throw compositeConflict('已发布的综合测评只能调整公开有效期')
  }
  const nextCourseId = input.courseId === undefined ? existing.courseId : input.courseId
  if (existing.status === 'DRAFT') {
    await validateCourse(nextCourseId, userId, role, { allowLibrary: role === UserRole.ADMIN })
    if (
      input.courseId !== undefined &&
      input.courseId !== existing.courseId &&
      existing.items.some((item: { type: string }) => item.type === 'COGNITIVE')
    ) {
      throw compositeBadRequest('请先移除认知模块，或复制到目标课程')
    }
  }
  const nextOpensAt = input.opensAt === undefined ? existing.opensAt : parseDate(input.opensAt)
  const nextExpiresAt = input.expiresAt === undefined ? existing.expiresAt : parseDate(input.expiresAt)
  if (nextOpensAt && nextExpiresAt && nextExpiresAt.getTime() < nextOpensAt.getTime()) {
    throw compositeBadRequest('expiresAt 必须晚于或等于 opensAt')
  }
  if ((input.publicEnabled ?? existing.publicEnabled) && !nextExpiresAt) {
    throw compositeBadRequest('公开链接必须设置有效期')
  }
  const updated = await prisma.compositeAssessment.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
      ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
      ...(input.opensAt !== undefined ? { opensAt: parseDate(input.opensAt) } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: parseDate(input.expiresAt) } : {}),
      ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
      ...(input.publicEnabled !== undefined ? { publicEnabled: input.publicEnabled } : {}),
      ...(input.copyable !== undefined ? { copyable: input.copyable } : {}),
    },
  })
  return withoutAnalysisProtocolCipher(updated)
}

export const setCompositeAnalysisProtocol = async (
  userId: string,
  role: UserRole,
  id: string,
  input: SetCompositeAnalysisProtocolInput,
) => {
  assertTeacher(role)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  if (composite.reportPackageKey) {
    throw compositeConflict('报告包实例不能通过旧版分析协议接口修改')
  }

  const hasKey = Boolean(composite.analysisProtocolKey)
  const hasVersion = Boolean(composite.analysisProtocolVersion)
  const hasSnapshot = Boolean(composite.analysisProtocolSnapshotEncrypted)
  if (hasKey !== hasVersion || (hasSnapshot && !hasKey)) {
    throw compositeBadRequest('综合测评的分析协议冻结信息不完整')
  }

  const selection = input.analysisProtocol
  if (!selection) {
    const updated = await prisma.compositeAssessment.update({
      where: { id },
      data: {
        analysisProtocolKey: null,
        analysisProtocolVersion: null,
        analysisProtocolSnapshotEncrypted: null,
        ...(composite.analysisEngineKey ? { analysisEngineKey: null } : {}),
      },
    })
    return withoutAnalysisProtocolCipher(updated)
  }

  assertCognitiveModuleEnabled()
  if (!composite.courseId) throw compositeBadRequest('综合分析协议必须绑定课程')
  const protocol = requirePublishedAnalysisProtocol(selection.key, selection.version)
  if (!hasKey && composite.items.length > 0) {
    throw compositeConflict('请选择空白草稿启用固定分析协议，或先移除现有模块')
  }

  return prisma.$transaction(async (tx: Db) => {
    if (hasKey) {
      await tx.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: id } })
    }
    const updated = await tx.compositeAssessment.update({
      where: { id },
      data: {
        analysisProtocolKey: protocol.key,
        analysisProtocolVersion: protocol.version,
        analysisProtocolSnapshotEncrypted: null,
        analysisEngineKey: 'cognitive-v1',
      },
    })
    await materializeAnalysisProtocol(tx, {
      compositeId: id,
      courseId: composite.courseId,
      userId,
      profile: selection.profile,
      protocol,
    })
    return withoutAnalysisProtocolCipher(updated)
  })
}

export const setCompositeReportPackage = async (
  userId: string,
  role: UserRole,
  id: string,
  input: SetCompositeReportPackageInput,
) => {
  assertTeacher(role)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)

  const selection = input.reportPackage
  if (!selection) {
    if (composite.reportPackageKey) {
      throw compositeConflict('已配置的报告包只能通过复制创建新的 collection-only 草稿')
    }
    return withoutAnalysisProtocolCipher(composite)
  }

  const definition = requirePublishedReportPackage(selection.key, selection.version)
  if (!definition.profiles.includes(selection.profile)) throw compositeBadRequest('报告包不支持该 Profile')
  if (!await canUseReportPackage(userId, role, definition.key, definition.version)) {
    throw compositeForbidden('没有该报告包的授权')
  }
  const isMentalHealthPackage = definition.analysisEngineKey === 'mental-health-rule-v1'
  if (!isMentalHealthPackage) {
    assertCognitiveModuleEnabled()
    if (!composite.courseId) throw compositeBadRequest('报告包必须绑定课程')
  }
  if (!composite.reportPackageKey && composite.items.length > 0) {
    throw compositeConflict('请选择空白草稿启用报告包，或先移除现有模块')
  }

  const protocol = isMentalHealthPackage
    ? null
    : requirePublishedAnalysisProtocol(
      definition.analysisProtocolKey,
      definition.analysisProtocolVersion,
    )
  return prisma.$transaction(async (tx: Db) => {
    if (composite.reportPackageKey) {
      await tx.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: id } })
    }
    const updated = await tx.compositeAssessment.update({
      where: { id },
      data: {
        reportPackageKey: definition.key,
        reportPackageVersion: definition.version,
        reportPackageProfile: selection.profile,
        reportPackageSnapshotEncrypted: null,
        // Keep the internal protocol reference for the existing frozen task
        // machinery; it is never exposed as the teacher-facing mode.
        analysisProtocolKey: definition.analysisProtocolKey,
        analysisProtocolVersion: definition.analysisProtocolVersion,
        analysisProtocolSnapshotEncrypted: null,
        analysisEngineKey: definition.analysisEngineKey ?? 'cognitive-v1',
      },
    })
    await materializeReportPackage(tx, {
      compositeId: id,
      courseId: composite.courseId,
      userId,
      profile: selection.profile,
      packageDefinition: definition,
    })
    return withoutAnalysisProtocolCipher(updated)
  })
}

export const addItem = async (userId: string, role: UserRole, compositeId: string, input: AddCompositeItemInput) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  assertCollectionOnlyEditing(composite)
  if (input.required !== true) throw compositeBadRequest('新增加的综合测评模块必须为必答模块')
  await assertValidItem(input, userId, role, composite)
  const position = input.position ?? (composite.items.length ? Math.max(...composite.items.map((item: any) => item.position)) + 1 : 0)
  if (composite.items.some((item: any) => item.position === position)) {
    throw compositeConflict('模块排序位置已存在')
  }
  return prisma.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: compositeId,
      type: input.type,
      position,
      required: input.required,
      scaleId: input.type === 'SCALE' ? input.scaleId : null,
      cognitiveAssignmentId: input.type === 'COGNITIVE' ? input.cognitiveAssignmentId : null,
      formType: input.type === 'FORM' ? input.formType : null,
      formLabel: input.type === 'FORM' ? input.formLabel : null,
      formPlaceholder: input.type === 'FORM' ? input.formPlaceholder ?? null : null,
      formOptions: input.type === 'FORM' ? (input.formOptions as any) ?? null : null,
      contextKey: input.type === 'FORM' ? input.contextKey ?? null : null,
    },
  })
}

export const removeItem = async (userId: string, role: UserRole, compositeId: string, itemId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  assertCollectionOnlyEditing(composite)
  const item = await prisma.compositeAssessmentItem.findUnique({ where: { id: itemId } })
  if (!item || item.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评模块不存在')
  await prisma.compositeAssessmentItem.delete({ where: { id: itemId } })
}

export const reorderItems = async (userId: string, role: UserRole, compositeId: string, items: Array<{ id: string; position: number }>) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  assertCollectionOnlyEditing(composite)
  if (items.length !== composite.items.length) throw compositeBadRequest('必须同时提交全部模块的排序')
  const known = new Set(composite.items.map((item: any) => item.id))
  const itemIds = new Set<string>()
  const positions = new Set<number>()
  for (const item of items) {
    if (!known.has(item.id) || itemIds.has(item.id) || positions.has(item.position)) throw compositeBadRequest('模块排序数据无效')
    itemIds.add(item.id)
    positions.add(item.position)
  }
  if (itemIds.size !== known.size || positions.size !== composite.items.length) throw compositeBadRequest('模块排序数据无效')

  // position 有唯一索引，直接交换两个位置会在事务中途碰撞。先整体移到临时区，再写入最终位置。
  const temporaryStart = Math.max(
    0,
    ...composite.items.map((item: any) => item.position),
    ...items.map((item) => item.position),
  ) + composite.items.length + 1
  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < composite.items.length; index += 1) {
      await tx.compositeAssessmentItem.update({
        where: { id: composite.items[index].id },
        data: { position: temporaryStart + index },
      })
    }
    for (const item of items) {
      await tx.compositeAssessmentItem.update({ where: { id: item.id }, data: { position: item.position } })
    }
  })
}

export const publishComposite = async (userId: string, role: UserRole, id: string) => {
  assertTeacher(role)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  if (composite.items.length === 0) throw compositeBadRequest('综合测评至少需要一个模块')
  await validateCourse(composite.courseId, userId, role, { allowLibrary: role === UserRole.ADMIN })
  if (composite.publicEnabled && !composite.expiresAt) throw compositeBadRequest('公开链接必须设置有效期')

  const contextIssues = validateContextFormItems(
    composite.items.filter((item: any) => item.type === 'FORM').map((item: any) => ({
      id: item.id,
      type: item.formType,
      label: item.formLabel,
      required: item.required,
      position: item.position,
      contextKey: item.contextKey,
      options: item.formOptions,
    })),
    composite.items.filter((item: any) => item.type !== 'FORM').map((item: any) => item.position),
  )
  if (contextIssues.length > 0) throw compositeBadRequest(contextIssues[0].message)

  for (const item of composite.items) {
    if (item.type === 'COGNITIVE') assertCognitiveModuleEnabled()
    if (item.type === 'SCALE' && (!item.scale || item.scale.status !== 'PUBLISHED')) {
      throw compositeBadRequest('综合测评包含未发布量表')
    }
    if (item.type === 'COGNITIVE' && (!item.cognitiveAssignment || item.cognitiveAssignment.status !== 'PUBLISHED' || item.cognitiveAssignment.config.status !== 'PUBLISHED')) {
      throw compositeBadRequest('综合测评包含未发布认知任务')
    }
    if (item.type === 'COGNITIVE') {
      assertCognitiveAssignmentOnCompositeCourse(item.cognitiveAssignment, composite)
      if (!composite.reportPackageKey && item.cognitiveAssignment.listedStandalone === false) {
        throw compositeBadRequest('报告包内部认知任务不能用于仅收集综合测评')
      }
      validateCognitiveConfig(item.cognitiveAssignment.config, true)
    }
    if (item.type === 'FORM') {
      if (!item.formType || !item.formLabel) {
        throw compositeBadRequest('综合测评包含未配置完成的表单')
      }
      if (item.formType === 'single_choice' || item.formType === 'multiple_choice') {
        const options = Array.isArray(item.formOptions) ? item.formOptions as Array<{ value: string }> : []
        const values = options.map((option) => option.value)
        if (values.length === 0 || new Set(values).size !== values.length) {
          throw compositeBadRequest('综合测评包含无效的表单选项')
        }
      }
    }
  }

  const hasPackageKey = Boolean(composite.reportPackageKey)
  const hasPackageVersion = Boolean(composite.reportPackageVersion)
  const hasPackageProfile = Boolean(composite.reportPackageProfile)
  const hasPackageSnapshot = Boolean(composite.reportPackageSnapshotEncrypted)
  if (
    hasPackageKey !== hasPackageVersion
    || hasPackageKey !== hasPackageProfile
    || (hasPackageSnapshot && !hasPackageKey)
    || (hasPackageKey && !composite.analysisProtocolKey)
  ) {
    throw compositeBadRequest('综合测评的报告包冻结信息不完整')
  }

  let reportPackageSnapshotEncrypted: string | null = null
  let packageAnalysisProtocolSnapshotEncrypted: string | null = null
  if (hasPackageKey && hasPackageVersion && hasPackageProfile) {
    try {
      const definition = requirePublishedReportPackage(
        composite.reportPackageKey as string,
        composite.reportPackageVersion as string,
      )
      if (!definition.profiles.includes(composite.reportPackageProfile as CognitiveAnalysisProfile)) {
        throw compositeBadRequest('报告包 Profile 不匹配')
      }
      const isMentalHealthPackage = definition.analysisEngineKey === 'mental-health-rule-v1'
      const protocol = isMentalHealthPackage
        ? undefined
        : requirePublishedAnalysisProtocol(
          definition.analysisProtocolKey,
          definition.analysisProtocolVersion,
        )
      const packageSnapshot = hasPackageSnapshot
        ? readFrozenReportPackageSnapshot(composite.reportPackageSnapshotEncrypted as string)
        : isMentalHealthPackage
          ? buildFrozenMentalHealthBundlePackageSnapshot(
            definition,
            composite.items,
            composite.reportPackageProfile as CognitiveAnalysisProfile,
          )
          : buildFrozenReportPackageSnapshot(definition, protocol as AnalysisProtocolDefinition, composite.items)
      validateFrozenReportPackageSnapshot(packageSnapshot, definition, protocol, composite.items)
      if (packageSnapshot.profile !== composite.reportPackageProfile) {
        throw compositeBadRequest('报告包快照 Profile 与实例不匹配')
      }
      reportPackageSnapshotEncrypted = hasPackageSnapshot
        ? composite.reportPackageSnapshotEncrypted as string
        : encryptFrozenReportPackageSnapshot(packageSnapshot)
      packageAnalysisProtocolSnapshotEncrypted = encryptFrozenAnalysisProtocolSnapshot(
        packageSnapshot.analysisProtocolSnapshot,
      )
    } catch (err) {
      if (err instanceof CompositeServiceError) throw err
      throw compositeBadRequest(err instanceof Error ? err.message : '报告包冻结校验失败')
    }
  }

  const hasProtocolKey = Boolean(composite.analysisProtocolKey)
  const hasProtocolVersion = Boolean(composite.analysisProtocolVersion)
  const hasProtocolSnapshot = Boolean(composite.analysisProtocolSnapshotEncrypted)
  if (hasProtocolKey !== hasProtocolVersion || (hasProtocolSnapshot && !hasProtocolKey)) {
    throw compositeBadRequest('综合测评的分析协议冻结信息不完整')
  }

  let analysisProtocolSnapshotEncrypted: string | null = packageAnalysisProtocolSnapshotEncrypted
  if (hasProtocolKey && hasProtocolVersion) {
    try {
      if (hasPackageKey && packageAnalysisProtocolSnapshotEncrypted) {
        // The package snapshot above is authoritative; this internal copy is
        // retained solely for the existing task-freeze machinery.
        analysisProtocolSnapshotEncrypted = packageAnalysisProtocolSnapshotEncrypted
      } else if (hasProtocolSnapshot) {
        const snapshot = readFrozenAnalysisProtocolSnapshot(
          composite.analysisProtocolSnapshotEncrypted as string,
        )
        validateFrozenAnalysisProtocolSnapshot(
          snapshot,
          composite.analysisProtocolKey as string,
          composite.analysisProtocolVersion as string,
          composite.items,
        )
        analysisProtocolSnapshotEncrypted = composite.analysisProtocolSnapshotEncrypted
      } else {
        const protocol = requirePublishedAnalysisProtocol(
          composite.analysisProtocolKey as string,
          composite.analysisProtocolVersion as string,
        )
        const snapshot = buildFrozenAnalysisProtocolSnapshot(protocol, composite.items)
        analysisProtocolSnapshotEncrypted = encryptFrozenAnalysisProtocolSnapshot(snapshot)
      }
    } catch (err) {
      if (err instanceof CompositeServiceError) throw err
      throw compositeBadRequest(err instanceof Error ? err.message : '综合分析协议校验失败')
    }
  }

  const published = await prisma.compositeAssessment.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      analysisProtocolSnapshotEncrypted,
      reportPackageSnapshotEncrypted,
    },
  })
  return withoutAnalysisProtocolCipher(published)
}

const assertTokenWindow = (token: { isActive: boolean; expiresAt: Date; maxUses: number; usedCount: number }) => {
  if (!token.isActive) throw compositeForbidden('公开链接已停用')
  if (token.expiresAt.getTime() < Date.now()) throw compositeForbidden('公开链接已过期')
  if (token.maxUses > 0 && token.usedCount >= token.maxUses) throw compositeConflict('公开链接已达到最大参与次数')
}

const assertCompositeWindow = (composite: { opensAt: Date | null; expiresAt: Date | null }) => {
  if (composite.opensAt && composite.opensAt.getTime() > Date.now()) throw compositeBadRequest('综合测评尚未开始')
  if (composite.expiresAt && composite.expiresAt.getTime() < Date.now()) throw compositeBadRequest('综合测评已过期')
}

export const createAccessTokenForComposite = async (userId: string, role: UserRole, compositeId: string, expiresAt: string, maxUses: number) => {
  assertTeacher(role)
  if (!Number.isSafeInteger(maxUses) || maxUses < 0 || maxUses > MAX_TOKEN_USES) throw compositeBadRequest('最大参与次数无效')
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  if (composite.status !== 'PUBLISHED') throw compositeBadRequest('只有已发布综合测评可以生成公开链接')
  assertNotLibraryComposite(composite, '库课程上的综合测评不能公开作答')
  const expiry = new Date(expiresAt)
  if (expiry.getTime() <= Date.now()) throw compositeBadRequest('有效期必须晚于当前时间')
  if (composite.expiresAt && expiry.getTime() > composite.expiresAt.getTime()) {
    throw compositeBadRequest('公开链接有效期不能晚于综合测评有效期')
  }
  const rawToken = createAccessToken()
  const record = await prisma.compositeAssessmentAccessToken.create({
    data: {
      compositeAssessmentId: compositeId,
      token: null,
      tokenHash: hashPublicAccessToken(rawToken),
      tokenEncrypted: encryptPublicAccessToken(rawToken),
      createdBy: userId,
      expiresAt: expiry,
      maxUses,
    },
  })
  return { id: record.id, token: rawToken, expiresAt: record.expiresAt, maxUses: record.maxUses, usedCount: record.usedCount }
}

export const listAccessTokens = async (userId: string, role: UserRole, compositeId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const records = await prisma.compositeAssessmentAccessToken.findMany({
    where: { compositeAssessmentId: compositeId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      token: true,
      tokenEncrypted: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      isActive: true,
      createdAt: true,
    },
  })
  return records.map(({ token, tokenEncrypted, ...record }) => ({
    ...record,
    // Management callers may still need to copy an existing link. Decrypt
    // only in this already-authorized owner/admin path; it is never stored in
    // the database or emitted by public resolvers.
    token: token || (tokenEncrypted ? decryptPublicAccessToken(tokenEncrypted) : null),
  }))
}

export const disableAccessToken = async (userId: string, role: UserRole, compositeId: string, tokenId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const token = await prisma.compositeAssessmentAccessToken.findUnique({ where: { id: tokenId } })
  if (!token || token.compositeAssessmentId !== compositeId) throw compositeNotFound('公开链接不存在')
  await prisma.compositeAssessmentAccessToken.update({ where: { id: tokenId }, data: { isActive: false } })
}

export const listAvailableForStudent = async (userId: string) => {
  const memberships = await prisma.courseStudent.findMany({ where: { studentId: userId, status: { in: ['ACTIVE', 'APPROVED'] } }, select: { courseId: true } })
  const courseIds = memberships.map((item) => item.courseId)
  if (!courseIds.length) return []
  const list = await prisma.compositeAssessment.findMany({
    where: { status: 'PUBLISHED', courseId: { in: courseIds }, course: { isLibrary: false } },
    orderBy: { publishedAt: 'desc' },
    include: { course: { select: { id: true, title: true, courseCode: true, isLibrary: true } }, items: { orderBy: { position: 'asc' }, select: { type: true, position: true, scale: { select: { name: true } }, cognitiveAssignment: { select: { title: true } }, formLabel: true } } },
  })
  const supportedList = config.cognitiveModuleEnabled
    ? list
    : list.filter((item: any) => !item.items.some((child: any) => child.type === 'COGNITIVE'))
  const attempts = await prisma.compositeAssessmentAttempt.findMany({ where: { userId, compositeAssessmentId: { in: supportedList.map((item) => item.id) } }, orderBy: { startedAt: 'desc' }, select: { id: true, compositeAssessmentId: true, status: true, progress: true, completedAt: true } })
  const latest = new Map<string, any>()
  for (const attempt of attempts) {
    // 查询已按 startedAt 倒序，最新的进行中记录必须优先于更早的已完成记录，保证可继续作答。
    if (!latest.has(attempt.compositeAssessmentId)) latest.set(attempt.compositeAssessmentId, attempt)
  }
  const attemptsByCompositeId = new Map<string, any[]>()
  for (const attempt of attempts) {
    const compositeAttempts = attemptsByCompositeId.get(attempt.compositeAssessmentId) || []
    compositeAttempts.push(attempt)
    attemptsByCompositeId.set(attempt.compositeAssessmentId, compositeAttempts)
  }
  const now = Date.now()
  const availabilityFor = (item: any): 'UPCOMING' | 'OPEN' | 'EXPIRED' => {
    if (item.opensAt && item.opensAt.getTime() > now) return 'UPCOMING'
    if (item.expiresAt && item.expiresAt.getTime() < now) return 'EXPIRED'
    return 'OPEN'
  }
  return supportedList.map((item: any) => {
    const compositeAttempts = attemptsByCompositeId.get(item.id) || []
    const attemptsUsed = compositeAttempts.length
    const availability = availabilityFor(item)
    const latestAttempt = latest.get(item.id) ?? null
    const canContinue = latestAttempt?.status === 'IN_PROGRESS'
    // `attempts` is ordered newest-first, so this is the most recent completed
    // attempt even when a newer attempt is currently in progress.
    const latestCompletedAttempt = compositeAttempts.find((attempt) => attempt.status === 'COMPLETED') ?? null
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      instruction: item.instruction,
      estimatedModules: item.items.length,
      course: item.course,
      opensAt: item.opensAt,
      expiresAt: item.expiresAt,
      maxAttempts: item.maxAttempts,
      attemptsUsed,
      availability,
      canStartNewAttempt: availability === 'OPEN' && !canContinue && attemptsUsed < item.maxAttempts,
      canContinue,
      items: item.items.map((child: any) => ({ type: child.type, position: child.position, label: resolveCompositeItemLabel(child, getFrozenPackageSlotLabels(item)) })),
      attempt: latestAttempt,
      latestCompletedAttempt,
    }
  })
}

const assertStudentEligibility = async (composite: any, userId: string) => {
  if (composite.status !== 'PUBLISHED') throw compositeBadRequest('综合测评尚未发布')
  if (!composite.courseId) throw compositeForbidden('该综合测评仅允许通过公开链接访问')
  if (composite.course?.isLibrary) throw compositeBadRequest('库课程上的综合测评不能作答')
  const membership = await prisma.courseStudent.findUnique({ where: { courseId_studentId: { courseId: composite.courseId, studentId: userId } } })
  if (!membership || !['ACTIVE', 'APPROVED'].includes(membership.status)) throw compositeForbidden('不是该课程的有效学生')
  if (composite.opensAt && composite.opensAt.getTime() > Date.now()) throw compositeBadRequest('综合测评尚未开始')
  if (composite.expiresAt && composite.expiresAt.getTime() < Date.now()) throw compositeBadRequest('综合测评已过期')
}

const createCognitiveChild = async (db: Db, attempt: any, item: any, userId: string | null) => {
  assertCognitiveModuleEnabled()
  const assignment = item.cognitiveAssignment
  const config = assignment?.config
  if (!assignment || !config) throw compositeBadRequest('认知任务配置不存在')
  const parsedConfig = validateCognitiveConfig(config)
  const anonymous = !userId
  let sessionConfig = parsedConfig
  if (assignment.resolvedConfigSnapshotEncrypted) {
    try {
      sessionConfig = requireCognitiveRegistryEntry(
        config.testType,
        config.engineVersion,
        config.scoringVersion,
      ).configSchema.parse(
        decryptCognitivePayload<unknown>(assignment.resolvedConfigSnapshotEncrypted),
      )
    } catch {
      throw compositeBadRequest('认知任务冻结的 Profile 配置不可用')
    }
  }
  const configSnapshotEncrypted = cognitiveSessionService.createCognitiveSessionConfigSnapshot({
    testType: config.testType,
    configVersion: config.configVersion,
    engineVersion: config.engineVersion,
    scoringVersion: config.scoringVersion,
    config: sessionConfig,
  })
  return db.cognitiveSession.create({
    data: {
      userId,
      participantKey: userId ? `${getParticipantKey(userId)}:${attempt.id}:${item.id}` : `anonymous:${attempt.id}:${item.id}`,
      participantSnapshotEncrypted: encryptCognitivePayload({ anonymousCode: attempt.anonymousCode ?? null }),
      assignmentId: assignment.id,
      compositeAttemptId: attempt.id,
      compositeItemId: item.id,
      configId: config.id,
      testType: config.testType,
      attemptNo: 1,
      status: 'IN_PROGRESS',
      configVersion: config.configVersion,
      configSnapshotEncrypted,
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
      randomSeed: randomBytes(16).toString('hex'),
      anonymousCode: anonymous ? attempt.anonymousCode : null,
    },
  })
}

const createChildRecords = async (db: Db, attempt: any, items: any[], userId: string | null) => {
  for (const item of items) {
    if (!item.required) continue
    if (item.type === 'SCALE') {
      await db.assessment.create({
        data: {
          scaleId: item.scaleId,
          userId,
          status: 'IN_PROGRESS',
          progress: 0,
          answers: encryptScaleAnswers([]),
          compositeAttemptId: attempt.id,
          compositeItemId: item.id,
        },
      })
    } else if (item.type === 'COGNITIVE') {
      await createCognitiveChild(db, attempt, item, userId)
    }
  }
}

const createAttempt = async (
  db: Db,
  composite: any,
  userId: string | null,
  accessTokenId: string | null,
  credential?: ReturnType<typeof createRecoveryCredential>,
  attemptNo = 1,
) => {
  const attempt = await db.compositeAssessmentAttempt.create({
    data: {
      compositeAssessmentId: composite.id,
      userId,
      accessTokenId,
      recoveryTokenHash: credential?.hash ?? null,
      participantKey: credential?.participantKey ?? `user:${userId}`,
      subjectUserId: userId,
      subjectKey: userId ? getParticipantKey(userId) : null,
      respondentUserId: userId,
      respondentKey: userId ? getParticipantKey(userId) : (credential?.participantKey ?? null),
      respondentType: userId ? 'participant_self_report' : 'anonymous_self_report',
      assessmentEpisodeId: null,
      anonymousCode: credential?.anonymousCode ?? null,
      attemptNo,
    },
  })
  await createChildRecords(db, attempt, composite.items, userId)
  return attempt
}

export const startUserAttempt = async (userId: string, compositeId: string) => {
  const composite = await loadComposite(compositeId, true)
  assertSupportedComposite(composite)
  await assertStudentEligibility(composite, userId)

  const isUniqueConstraintError = (err: unknown) =>
    typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'P2002'

  for (let retry = 0; retry < 2; retry += 1) {
    try {
      const attempt = await prisma.$transaction(async (tx: Db) => {
        // 所有登录学生的开始流程先锁住模板行，串行化“查询进行中记录/统计次数/创建记录”。
        // 复合唯一索引作为第二道防线，避免未来新增入口绕过该锁时产生相同序号。
        await tx.$queryRaw`SELECT "id" FROM "composite_assessments" WHERE "id" = ${compositeId} FOR UPDATE`
        const existing = await tx.compositeAssessmentAttempt.findFirst({
          where: { compositeAssessmentId: compositeId, userId, status: 'IN_PROGRESS' },
          orderBy: { startedAt: 'desc' },
        })
        if (existing) return existing

        const used = await tx.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: compositeId, userId } })
        if (used >= composite.maxAttempts) throw compositeConflict('已达到综合测评最大次数')
        const latest = await tx.compositeAssessmentAttempt.findFirst({
          where: { compositeAssessmentId: compositeId, userId },
          orderBy: { attemptNo: 'desc' },
          select: { attemptNo: true },
        })
        return createAttempt(tx, composite, userId, null, undefined, (latest?.attemptNo ?? 0) + 1)
      })
      return { attempt: await getAttemptState(attempt.id, { userId }), recoveryToken: null }
    } catch (err) {
      if (!isUniqueConstraintError(err) || retry === 1) throw err
    }
  }

  throw compositeConflict('无法创建综合测评记录，请稍后重试')
}

const findPublicToken = async (tokenValue: string) => {
  const tokenHash = hashPublicAccessToken(tokenValue)
  let token = await prisma.compositeAssessmentAccessToken.findUnique({
    where: { tokenHash },
    include: {
      compositeAssessment: {
        include: {
          course: { select: { isLibrary: true } },
          items: {
            orderBy: { position: 'asc' },
            include: {
              scale: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  description: true,
                  status: true,
                  instrumentClass: true,
                  instrumentVersion: true,
                  definition: true,
                },
              },
              cognitiveAssignment: { include: { config: true } },
            },
          },
        },
      },
    },
  })
  if (!token) {
    // Keep a bounded compatibility window for rows not yet processed by the
    // explicit backfill. New rows never use this plaintext lookup path.
    token = await prisma.compositeAssessmentAccessToken.findUnique({
      where: { token: tokenValue },
      include: {
        compositeAssessment: {
          include: {
            course: { select: { isLibrary: true } },
            items: {
              orderBy: { position: 'asc' },
              include: {
                scale: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    description: true,
                    status: true,
                    instrumentClass: true,
                    instrumentVersion: true,
                    definition: true,
                  },
                },
                cognitiveAssignment: { include: { config: true } },
              },
            },
          },
        },
      },
    })
    if (token?.tokenHash && token.tokenHash !== tokenHash) token = null
  }
  if (!token) throw compositeNotFound('公开链接不存在')
  if (!token.compositeAssessment.publicEnabled || token.compositeAssessment.status !== 'PUBLISHED') throw compositeForbidden('综合测评未开放公开参与')
  assertNotLibraryComposite(token.compositeAssessment, '库课程上的综合测评不能公开作答')
  assertSupportedComposite(token.compositeAssessment)
  return token as any
}

export const getPublicCompositeInfo = async (tokenValue: string) => {
  const token = await findPublicToken(tokenValue)
  assertTokenWindow(token)
  const composite = token.compositeAssessment
  assertCompositeWindow(composite)
  const packageSlotLabels = getFrozenPackageSlotLabels(composite)
  return {
    id: composite.id,
    name: composite.name,
    description: composite.description,
    instruction: composite.instruction,
    expiresAt: token.expiresAt,
    maxUses: token.maxUses,
    usedCount: token.usedCount,
    items: composite.items.map((item: any) => ({ type: item.type, position: item.position, label: resolveCompositeItemLabel(item, packageSlotLabels) })),
  }
}

export const startPublicAttempt = async (tokenValue: string, recoveryToken?: string) => {
  const token = await findPublicToken(tokenValue)
  if (recoveryToken) {
    const recoveryTokenHash = hashRecoveryToken(recoveryToken)
    const existing = await prisma.compositeAssessmentAttempt.findFirst({ where: { accessTokenId: token.id, recoveryTokenHash } })
    if (existing) return { attempt: await getAttemptState(existing.id, { recoveryTokenHash }), recoveryToken: null }
    throw compositeForbidden('恢复凭证无效')
  }
  assertTokenWindow(token)
  assertCompositeWindow(token.compositeAssessment)
  const credential = createRecoveryCredential()
  const attempt = await prisma.$transaction(async (tx) => {
    const claimed = await tx.compositeAssessmentAccessToken.updateMany({
      where: { id: token.id, isActive: true, expiresAt: { gt: new Date() }, OR: [{ maxUses: 0 }, { usedCount: { lt: token.maxUses } }] },
      data: { usedCount: { increment: 1 } },
    })
    if (claimed.count !== 1) throw compositeConflict('公开链接已达到最大参与次数')
    return createAttempt(tx, token.compositeAssessment, null, token.id, credential)
  })
  return { attempt: await getAttemptState(attempt.id, { recoveryTokenHash: credential.hash }), recoveryToken: credential.token }
}

const loadAttemptWithChildren = async (attemptId: string) => {
  const attempt = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      compositeAssessment: {
        include: {
          items: {
            orderBy: { position: 'asc' },
            include: {
              scale: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  description: true,
                  status: true,
                  instrumentClass: true,
                  instrumentVersion: true,
                  definition: true,
                },
              },
              cognitiveAssignment: { include: { config: true } },
            },
          },
        },
      },
      scaleAssessments: { include: { scale: true } },
      cognitiveSessions: {
        include: {
          trials: {
            orderBy: { trialIndex: 'desc' },
            take: 1,
            select: { trialIndex: true },
          },
        },
      },
      formAnswers: true,
    },
  })
  if (!attempt) throw compositeNotFound('综合测评记录不存在')
  return attempt as any
}

const lockCompositeAttempt = async (tx: Db, attemptId: string) => {
  // Keep lightweight service-test Prisma doubles usable. Real Prisma
  // transaction clients always expose $queryRaw and take the row lock.
  if (typeof tx?.$queryRaw !== 'function') return
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "composite_assessment_attempts"
    WHERE "id" = ${attemptId}
    FOR UPDATE
  `
  if (!rows?.[0]) throw compositeNotFound('综合测评记录不存在')
}

const loadAttemptForFinalization = async (tx: Db, attemptId: string) => {
  const attempt = await tx.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      compositeAssessment: {
        include: {
          items: {
            orderBy: { position: 'asc' as const },
            include: {
              cognitiveAssignment: { include: { config: true } },
              scale: { select: { id: true, code: true, status: true } },
            },
          },
        },
      },
      scaleAssessments: true,
      cognitiveSessions: true,
      formAnswers: true,
    },
  })
  if (!attempt) throw compositeNotFound('综合测评记录不存在')
  return attempt as any
}

const findAttempt = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const attempt = await loadAttemptWithChildren(attemptId)
  const authorized = context.userId
    ? attempt.userId === context.userId
    : Boolean(context.recoveryTokenHash && attempt.recoveryTokenHash === context.recoveryTokenHash && !attempt.userId)
  if (!authorized) throw compositeForbidden('无权限查看此综合测评记录')
  assertSupportedComposite(attempt.compositeAssessment)
  return attempt
}

export const freezeContext = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const authorized = await findAttempt(attemptId, context)
  if (authorized.status !== 'IN_PROGRESS') throw compositeConflict('综合测评已结束，不能冻结人口学上下文')
  return prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const current = await tx.compositeAssessmentAttempt.findUnique({ where: { id: attemptId }, select: { status: true } })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.status !== 'IN_PROGRESS') throw compositeConflict('综合测评已结束，不能冻结人口学上下文')
    const frozen = await freezeCompositeAttemptContext(tx, attemptId)
    return { status: 'frozen' as const, frozenAt: frozen.context.frozenAt }
  })
}

const cognitiveRunnerPayload = (session: any) => {
  const storedConfig = cognitiveSessionService.readCognitiveSessionConfig(session.configSnapshotEncrypted)
  const config = storedConfig.config
  const resultSnapshot = session.status === 'COMPLETED' && session.resultSnapshotEncrypted
    ? parseCognitiveResultSnapshot(decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted))
    : null
  const result = resultSnapshot
    ? {
        metrics: resultSnapshot.metrics,
        quality: resultSnapshot.quality,
        qualityFlags: resultSnapshot.quality.flags,
        references: referencesForCognitiveResult(resultSnapshot),
        report: resultSnapshot.report,
        assessmentContext: resultSnapshot.assessmentContext,
      }
    : session.status === 'COMPLETED' && session.scoreEncrypted && session.metricsEncrypted && session.qualityFlagsEncrypted
    ? {
        score: decryptCognitivePayload<number>(session.scoreEncrypted),
        metrics: decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted),
        qualityFlags: decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted),
      }
    : undefined
  return {
    sessionId: session.id,
    assignmentId: session.assignmentId,
    testType: session.testType,
    attemptNo: session.attemptNo,
    status: session.status,
    configVersion: session.configVersion,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    config,
    ...(storedConfig.snapshot ? { protocol: storedConfig.snapshot.protocol, protocolSignature: storedConfig.snapshot.protocolSignature } : {}),
    randomSeed: session.randomSeed,
    nextTrialIndex: (session.trials?.[0]?.trialIndex ?? -1) + 1,
    ...(result ? { result } : {}),
  }
}

const latestChildrenByItem = (children: any[]) => {
  const map = new Map<string, any>()
  for (const child of children) {
    const itemId = child.compositeItemId ?? child.itemId
    if (!itemId) continue
    const current = map.get(itemId)
    if (!current || (child.attemptNo ?? 0) >= (current.attemptNo ?? 0)) {
      map.set(itemId, child)
    }
  }
  return map
}

const attemptCompletedItemMaps = (attempt: any) => ({
  scaleMap: latestChildrenByItem(attempt.scaleAssessments),
  cognitiveMap: latestChildrenByItem(attempt.cognitiveSessions),
  formMap: latestChildrenByItem(attempt.formAnswers),
})

const isAttemptItemCompleted = (
  item: any,
  maps: ReturnType<typeof attemptCompletedItemMaps>,
) => {
  if (!item.required && !item.contextKey) return true
  if (item.type === 'SCALE') return maps.scaleMap.get(item.id)?.status === 'COMPLETED'
  if (item.type === 'COGNITIVE') return maps.cognitiveMap.get(item.id)?.status === 'COMPLETED'
  return maps.formMap.get(item.id)?.completed !== false && maps.formMap.has(item.id)
}

const countAttemptCompletedItems = (attempt: any, maps = attemptCompletedItemMaps(attempt)) =>
  attempt.compositeAssessment.items.filter((item: any) => isAttemptItemCompleted(item, maps)).length

/**
 * Parent Attempt finalization and reanalysis are serialized on the Attempt
 * row. Child modules commit their own frozen result rows first; this check
 * only promotes the parent after it sees those committed rows. Package
 * analysis and its immutable snapshot are written before the parent status
 * changes, so any analysis/encryption/DB failure rolls completion back as one
 * transaction.
 */
const finalizeAttemptIfReady = async (attemptId: string) => prisma.$transaction(async (tx: Db) => {
  await lockCompositeAttempt(tx, attemptId)
  const attempt = await loadAttemptForFinalization(tx, attemptId)
  const maps = attemptCompletedItemMaps(attempt)
  const completedItems = countAttemptCompletedItems(attempt, maps)
  const totalItems = attempt.compositeAssessment.items.length
  const progress = totalItems ? Math.round((completedItems / totalItems) * 100) : 100
  const shouldComplete = totalItems > 0 && completedItems === totalItems

  if (attempt.status === 'COMPLETED') {
    return {
      status: attempt.status,
      progress: attempt.progress,
      completedAt: attempt.completedAt,
    }
  }

  if (shouldComplete && attempt.status === 'IN_PROGRESS') {
    const packageAnalysis = buildPackageAnalysisForAttempt(attempt)
    if (packageAnalysis) {
      const persisted = await persistOrGetPackageAnalysisSnapshot(tx, {
        attemptId: attempt.id,
        analysis: packageAnalysis.analysis,
        inputFingerprint: packageAnalysis.inputFingerprint,
        generationReason: 'COMPLETION',
      })
      if (!persisted.created && persisted.row.generationReason !== 'COMPLETION') {
        throw new Error('综合测评完成时的分析快照已被其他生成原因占用')
      }
    }

    const completedAt = new Date()
    await tx.compositeAssessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedItems,
        completedAt,
        totalTime: completedAt.getTime() - attempt.startedAt.getTime(),
        lastSavedAt: completedAt,
      },
    })
    return { status: 'COMPLETED', progress: 100, completedAt }
  }

  if (attempt.status === 'IN_PROGRESS') {
    // Never let a stale GET lower progress or completedItems observed by a newer request.
    await tx.compositeAssessmentAttempt.updateMany({
      where: {
        id: attempt.id,
        status: 'IN_PROGRESS',
        completedItems: { lte: completedItems },
      },
      data: { progress, completedItems, lastSavedAt: new Date() },
    })
  }

  const latest = await tx.compositeAssessmentAttempt.findUnique({
    where: { id: attempt.id },
    select: { status: true, progress: true, completedAt: true },
  })
  if (!latest) throw compositeNotFound('综合测评记录不存在')
  return latest
})

export const getAttemptState = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  await findAttempt(attemptId, context)
  await finalizeAttemptIfReady(attemptId)
  const attempt = await findAttempt(attemptId, context)
  const readableFormAnswers = readContextFormAnswers(
    attempt.compositeAssessment.items
      .filter((item: any) => item.type === 'FORM')
      .map((item: any) => ({ id: item.id, contextKey: item.contextKey })),
    attempt.formAnswers,
  )
  const readableAttempt = { ...attempt, formAnswers: readableFormAnswers }
  const maps = attemptCompletedItemMaps(readableAttempt)
  const { scaleMap, cognitiveMap, formMap } = maps
  const completed = (item: any) => isAttemptItemCompleted(item, maps)
  const completedItems = countAttemptCompletedItems(attempt, maps)
  const currentIndex = attempt.compositeAssessment.items.findIndex((item: any) => !completed(item))
  const current = currentIndex >= 0 ? attempt.compositeAssessment.items[currentIndex] : null
  const packageSlotLabels = getFrozenPackageSlotLabels(attempt.compositeAssessment)
  let currentItem: any = null
  if (current?.type === 'FORM') {
    currentItem = { id: current.id, type: current.type, position: current.position, required: current.required, form: { type: current.formType, label: packageSlotLabels.get(current.position) ?? current.formLabel, placeholder: current.formPlaceholder, options: current.formOptions, contextKey: current.contextKey ?? null }, value: formMap.get(current.id)?.value ?? null }
  } else if (current?.type === 'SCALE') {
    const assessment = scaleMap.get(current.id)
    const scale = current.scale
      ? { ...current.scale, name: packageSlotLabels.get(current.position) ?? current.scale.name }
      : current.scale
    let runnerScale = scale
    if (scale) {
      try {
        const { definition: _definition, ...metadata } = scale
        runnerScale = { ...metadata, definition: scaleRunnerFromRecord(scale) }
      } catch {
        const { definition: _definition, ...metadata } = scale
        runnerScale = { ...metadata, definition: null, definitionError: true }
      }
    }
    const decodedAnswers = readScaleAnswers(assessment?.answers)
    currentItem = {
      id: current.id,
      type: current.type,
      position: current.position,
      required: current.required,
      scaleAssessmentId: assessment?.id,
      scale: runnerScale,
      answers: decodedAnswers.answers,
      ...(decodedAnswers.decryptError ? { decryptError: true } : {}),
    }
  } else if (current?.type === 'COGNITIVE') {
    const session = cognitiveMap.get(current.id)
    currentItem = { id: current.id, type: current.type, position: current.position, required: current.required, cognitiveSession: session ? cognitiveRunnerPayload(session) : null }
  }
  return {
    id: attempt.id,
    assessmentId: attempt.compositeAssessment.id,
    name: attempt.compositeAssessment.name,
    instruction: attempt.compositeAssessment.instruction,
    status: attempt.status,
    progress: attempt.progress,
    completedItems,
    totalItems: attempt.compositeAssessment.items.length,
    currentIndex: currentIndex < 0 ? attempt.compositeAssessment.items.length : currentIndex,
    startedAt: attempt.startedAt,
    lastSavedAt: attempt.lastSavedAt,
    completedAt: attempt.completedAt,
    anonymousCode: attempt.anonymousCode,
    context: {
      status: attempt.contextSnapshotEncrypted && attempt.contextSnapshotHash ? 'frozen' as const : 'collecting' as const,
      frozenAt: attempt.contextFrozenAt?.toISOString?.() ?? null,
    },
    items: attempt.compositeAssessment.items.map((item: any, index: number) => ({ id: item.id, type: item.type, position: item.position, label: resolveCompositeItemLabel(item, packageSlotLabels), completed: completed(item), index })),
    currentItem,
  }
}

const decodeJson = <T extends object>(value: unknown): T | null => {
  if (typeof value === 'string') return safeDecrypt<T>(value) ?? null
  return (value as T) ?? null
}

const getOwnedChild = async (attemptId: string, itemId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const attempt = await findAttempt(attemptId, context)
  const item = attempt.compositeAssessment.items.find((candidate: any) => candidate.id === itemId)
  if (!item) throw compositeNotFound('综合测评模块不存在')
  return { attempt, item }
}

const lockScaleAssessment = async (tx: Db, assessmentId: string) => {
  if (typeof tx?.$queryRaw !== 'function') throw compositeNotFound('量表测评记录不存在')
  const rows = await tx.$queryRaw<Array<{ status: string; answers: unknown }>>`
    SELECT "status", "answers"
    FROM "assessments"
    WHERE "id" = ${assessmentId}
    FOR UPDATE
  `
  const assessment = rows[0]
  if (!assessment) throw compositeNotFound('量表测评记录不存在')
  return assessment
}

export const saveAttempt = async (
  attemptId: string,
  context: { userId?: string; recoveryTokenHash?: string },
  draft?: { itemId: string; value: string },
) => {
  const attempt = await findAttempt(attemptId, context)
  if (attempt.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
  if (draft) {
    const item = attempt.compositeAssessment.items.find((candidate: any) => candidate.id === draft.itemId)
    if (!item || item.type !== 'FORM') throw compositeBadRequest('只能保存当前综合测评中的表单草稿')
    await prisma.$transaction(async (tx: Db) => {
      await lockCompositeAttempt(tx, attemptId)
      const current = await tx.compositeAssessmentAttempt.findUnique({
        where: { id: attemptId },
        select: { status: true, contextSnapshotEncrypted: true, contextSnapshotHash: true },
      })
      if (!current) throw compositeNotFound('综合测评记录不存在')
      if (current.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
      if (item.contextKey) {
        try {
          assertContextMutable(Boolean(current.contextSnapshotEncrypted || current.contextSnapshotHash))
        } catch (error) {
          if (isAssessmentContextServiceError(error)) throw compositeConflict(error.message)
          throw error
        }
        const validationMessage = validateContextAnswer({
          id: item.id,
          type: item.formType,
          label: item.formLabel,
          required: item.required,
          position: item.position,
          contextKey: item.contextKey,
          options: item.formOptions,
        }, draft.value)
        if (validationMessage) throw compositeBadRequest(validationMessage)
      }
      const existing = await tx.compositeFormAnswer.findUnique({ where: { attemptId_itemId: { attemptId, itemId: draft.itemId } }, select: { completed: true } })
      if (!existing || existing.completed === false) {
        const storedValue = writeContextFormAnswer(item.contextKey, draft.value)
        await tx.compositeFormAnswer.upsert({
          where: { attemptId_itemId: { attemptId, itemId: draft.itemId } },
          create: { attemptId, itemId: draft.itemId, value: storedValue, completed: false },
          update: { value: storedValue, completed: false },
        })
      }
      await tx.compositeAssessmentAttempt.update({ where: { id: attemptId }, data: { lastSavedAt: new Date() } })
    })
    return prisma.compositeAssessmentAttempt.findUnique({ where: { id: attemptId }, select: { id: true, lastSavedAt: true, status: true, progress: true } })
  }
  return prisma.compositeAssessmentAttempt.update({ where: { id: attemptId }, data: { lastSavedAt: new Date() }, select: { id: true, lastSavedAt: true, status: true, progress: true } })
}

export const saveFormAnswer = async (attemptId: string, itemId: string, value: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const { attempt, item } = await getOwnedChild(attemptId, itemId, context)
  if (item.type !== 'FORM') throw compositeBadRequest('当前模块不是表单')
  await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true, contextSnapshotEncrypted: true, contextSnapshotHash: true },
    })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
    if (item.contextKey) {
      try {
        assertContextMutable(Boolean(current.contextSnapshotEncrypted || current.contextSnapshotHash))
      } catch (error) {
        if (isAssessmentContextServiceError(error)) throw compositeConflict(error.message)
        throw error
      }
      const validationMessage = validateContextAnswer({
        id: item.id,
        type: item.formType,
        label: item.formLabel,
        required: item.required,
        position: item.position,
        contextKey: item.contextKey,
        options: item.formOptions,
      }, value)
      if (validationMessage) throw compositeBadRequest(validationMessage)
    }
    if (item.required && !value.trim()) throw compositeBadRequest('此表单项为必填项')
    if (item.formType === 'single_choice' || item.formType === 'multiple_choice') {
      const options = Array.isArray(item.formOptions) ? item.formOptions as Array<{ value: string }> : []
      const allowed = new Set(options.map((option) => option.value))
      const values = item.formType === 'multiple_choice' ? value.split(',').filter(Boolean) : (value ? [value] : [])
      if (values.some((candidate) => !allowed.has(candidate)) || new Set(values).size !== values.length) throw compositeBadRequest('表单选项无效')
    }
    const storedValue = writeContextFormAnswer(item.contextKey, value)
    await tx.compositeFormAnswer.upsert({ where: { attemptId_itemId: { attemptId, itemId } }, create: { attemptId, itemId, value: storedValue, completed: true }, update: { value: storedValue, completed: true } })
  })
  return getAttemptState(attempt.id, context)
}

export const saveScaleAnswer = async (
  attemptId: string,
  itemId: string,
  input: { itemCode: string; responseValue: string | number; responseTimeMs?: number },
  context: { userId?: string; recoveryTokenHash?: string },
) => {
  const { attempt, item } = await getOwnedChild(attemptId, itemId, context)
  if (attempt.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
  if (item.type !== 'SCALE') throw compositeBadRequest('当前模块不是量表')
  const assessment = attempt.scaleAssessments.find((candidate: any) => candidate.compositeItemId === itemId)
  if (!assessment || assessment.status !== 'IN_PROGRESS') throw compositeBadRequest('量表模块已结束')
  let definition
  try {
    const scale = item.scale
    if (!scale?.definition) throw new Error('量表尚未安装 v2 definition')
    definition = scaleDefinitionFromRecord(scale)
    validateScaleAnswer(definition, {
      itemCode: input.itemCode,
      responseValue: input.responseValue,
      responseTimeMs: input.responseTimeMs,
    })
  } catch (error) {
    if (error instanceof ScaleAnswerValidationError) throw compositeBadRequest(error.issues[0]?.message || '量表答案无效')
    throw compositeBadRequest('量表尚未安装有效的 v2 definition')
  }
  await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const locked = await lockScaleAssessment(tx, assessment.id)
    if (locked.status !== 'IN_PROGRESS') throw compositeBadRequest('量表模块已结束')
    await freezeCompositeAttemptContext(tx, attemptId)
    const decoded = readScaleAnswers(locked.answers)
    if (decoded.decryptError) throw compositeBadRequest('量表答案无法读取，请联系管理员')
    const answers = decoded.answers
    const index = answers.findIndex((candidate) => candidate.itemCode === input.itemCode)
    const answer = {
      itemCode: input.itemCode,
      responseValue: input.responseValue,
      ...(input.responseTimeMs === undefined ? {} : { responseTimeMs: input.responseTimeMs }),
      answeredAt: new Date().toISOString(),
      changeCount: index >= 0 ? (answers[index].changeCount ?? 0) + 1 : 0,
    }
    if (index >= 0) answers[index] = { ...answers[index], ...answer }
    else answers.push(answer)
    await tx.assessment.update({
      where: { id: assessment.id },
      data: {
        answers: encryptScaleAnswers(answers),
        result: null,
        progress: Math.round((answers.length / Math.max(definition.items.length, 1)) * 100),
      },
    })
  })
  return getAttemptState(attempt.id, context)
}

export const completeScale = async (attemptId: string, itemId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const { attempt, item } = await getOwnedChild(attemptId, itemId, context)
  if (item.type !== 'SCALE') throw compositeBadRequest('当前模块不是量表')
  const assessment = attempt.scaleAssessments.find((candidate: any) => candidate.compositeItemId === itemId)
  if (!assessment) throw compositeNotFound('量表测评记录不存在')
  if (assessment.status === 'COMPLETED') return getAttemptState(attempt.id, context)
  const didComplete = await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const locked = await lockScaleAssessment(tx, assessment.id)
    if (locked.status === 'COMPLETED') return false
    if (locked.status !== 'IN_PROGRESS') throw compositeBadRequest('量表模块已结束')
    if (!item.scale?.definition) throw compositeBadRequest('量表尚未安装有效的 v2 definition')
    const contextSnapshot = await freezeCompositeAttemptContext(tx, attemptId)
    const decoded = readScaleAnswers(locked.answers)
    if (decoded.decryptError) throw compositeBadRequest('量表答案无法读取，请联系管理员')
    const answers = decoded.answers
    const definition = scaleDefinitionFromRecord(item.scale)
    const missingRequiredItems = missingRequiredScaleItemCodes(definition, answers)
    if (missingRequiredItems.length > 0) throw compositeBadRequest(`还有 ${missingRequiredItems.length} 道必答题未作答`)
    const result = await buildScaleResultForRecord({
      scale: item.scale,
      answers,
      participantContext: contextSnapshot.context.values,
      participantContextHash: contextSnapshot.hash,
    })
    const completedAt = new Date()
    await tx.assessment.update({
      where: { id: assessment.id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        answers: encryptScaleAnswers(answers),
        result: encryptScaleResult(result),
        completedAt,
        totalTime: completedAt.getTime() - assessment.startedAt.getTime(),
      },
    })
    return true
  })
  if (!didComplete) return getAttemptState(attempt.id, context)
  return getAttemptState(attempt.id, context)
}

export const buildCompositeReport = (attempt: any) => {
  const scaleMap = new Map<string, any>(attempt.scaleAssessments.map((item: any) => [item.compositeItemId, item]))
  const cognitiveMap = new Map<string, any>(attempt.cognitiveSessions.map((item: any) => [item.compositeItemId, item]))
  const readableFormAnswers = readContextFormAnswers(
    attempt.compositeAssessment.items
      .filter((item: any) => item.type === 'FORM')
      .map((item: any) => ({ id: item.id, contextKey: item.contextKey })),
    attempt.formAnswers,
  )
  const formMap = new Map<string, any>(readableFormAnswers.map((item: any) => [item.itemId, item]))
  const unitReports: any[] = []
  const backgroundValues: any[] = []
  const packageSlotLabels = getFrozenPackageSlotLabels(attempt.compositeAssessment)
  const packageBased = Boolean(attempt.compositeAssessment.reportPackageKey)
  for (const item of attempt.compositeAssessment.items) {
    if (item.type === 'FORM') {
      backgroundValues.push(buildFormBackgroundReport({ itemId: item.id, label: packageSlotLabels.get(item.position) ?? item.formLabel, value: formMap.get(item.id)?.value ?? null }))
      continue
    }
    if (item.type === 'SCALE') {
      try {
        const result = scaleMap.get(item.id)
        const report = buildScaleUnitReport({
          itemId: item.id,
          scaleId: item.scaleId,
          scaleCode: item.scale?.code,
          scaleName: item.scale?.name || '未知量表',
          result: result?.result,
          completedAt: result?.completedAt,
          totalTime: result?.totalTime,
        })
        if (report.decryptError) {
          logger.warn('composite report module decrypt failed', { attemptId: attempt.id, itemId: item.id, type: item.type })
          unitReports.push(report)
          continue
        }
        unitReports.push(report)
        continue
      } catch {
        logger.warn('composite report module decrypt failed', { attemptId: attempt.id, itemId: item.id, type: item.type })
        unitReports.push({
          itemId: item.id,
          type: 'SCALE' as const,
          kind: 'scale' as const,
          scaleId: item.scaleId,
          scaleCode: item.scale?.code ?? null,
          scaleName: item.scale?.name || '未知量表',
          result: null,
          quality: null,
          scores: [],
          references: [],
          interpretations: [],
          completedAt: null,
          totalTime: null,
          method: {
            scaleId: item.scaleId,
            instrumentVersion: item.scale?.instrumentVersion ?? '',
            scoringVersion: '',
            reportVersion: SCALE_REPORT_DEFINITION_VERSION,
            definitionHash: '',
            referenceVersions: [],
            assessmentContext: null,
          },
          caveats: [],
          disclaimer: SCALE_REPORT_DISCLAIMER,
          decryptError: true,
        })
        continue
      }
    }
    try {
      const session = cognitiveMap.get(item.id)
      const config = session
        ? cognitiveSessionService.readCognitiveSessionConfig(session.configSnapshotEncrypted).config
        : {}
      const resultSnapshot = session?.resultSnapshotEncrypted
        ? parseCognitiveResultSnapshot(decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted))
        : null
      const resultReferences = resultSnapshot ? referencesForCognitiveResult(resultSnapshot) : []
      const score = resultSnapshot
        ? null
        : session?.scoreEncrypted
          ? decryptCognitivePayload<number>(session.scoreEncrypted)
          : null
      const metrics = resultSnapshot?.metrics
        ?? (session?.metricsEncrypted ? decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted) : {})
      const qualityFlags = resultSnapshot?.quality.flags
        ?? (session?.qualityFlagsEncrypted ? decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted) : {})
      const frozenReport = readFrozenReport(item.cognitiveAssignment?.resolvedReportSnapshotEncrypted)
      if (packageBased && !frozenReport) {
        throw new Error('报告包认知模块缺少冻结报告定义')
      }
      const profile = frozenReport?.profile
        ?? (item.cognitiveAssignment?.profile === 'experience'
          || item.cognitiveAssignment?.profile === 'standard'
          || item.cognitiveAssignment?.profile === 'research'
          ? item.cognitiveAssignment.profile
          : null)
      const legacyReference = session && score !== null
        ? resolveCognitiveReferenceForResult({
          testType: session.testType,
          metrics,
          score,
          qualityFlags,
          config,
          profile,
          engineVersion: session.engineVersion,
          scoringVersion: session.scoringVersion,
          configVersion: session.configVersion,
        })
        : undefined
      const reference = resultSnapshot ? resultReferences[0] : legacyReference
      const singleTaskReport = resultSnapshot
        ? resultSnapshot.report
        : session && score !== null
        ? buildCognitiveSingleTaskReport({
          testType: session.testType,
          engineVersion: session.engineVersion ?? '',
          scoringVersion: session.scoringVersion ?? '',
          configVersion: session.configVersion ?? '',
          profile,
          frozenReport,
          score,
          metrics,
          qualityFlags,
          reference: legacyReference ?? null,
        })
        : null
      const unitReport = {
        itemId: item.id,
        type: item.type,
        kind: 'cognitive' as const,
        label: resolveCompositeItemLabel(item, packageSlotLabels),
        sessionId: session?.id,
        testType: session?.testType,
        score,
        metrics,
        qualityFlags,
        quality: resultSnapshot?.quality,
        finishedAt: session?.finishedAt,
        reference,
        references: resultReferences,
        assessmentContext: resultSnapshot?.assessmentContext ?? null,
        singleTaskReport,
      }
      Object.defineProperty(unitReport, '__frozenMetricDefinitions', {
        value: frozenReport?.metricDefinitions,
        enumerable: false,
      })
      unitReports.push(unitReport)
    } catch {
      logger.warn('composite report module decrypt failed', { attemptId: attempt.id, itemId: item.id, type: item.type })
      unitReports.push({ itemId: item.id, type: item.type, kind: 'cognitive' as const, label: resolveCompositeItemLabel(item, packageSlotLabels), decryptError: true })
    }
  }
  const report = {
    id: attempt.id,
    assessmentId: attempt.compositeAssessment.id,
    name: attempt.compositeAssessment.name,
    anonymousCode: attempt.anonymousCode,
    completedAt: attempt.completedAt,
    totalTime: attempt.totalTime,
    backgroundValues,
    unitReports,
  }
  // Keep direct callers of the pre-PR6A builder source-compatible while the
  // JSON/API contract exposes only the collection-only unitReports field.
  Object.defineProperty(report, 'modules', { value: unitReports, enumerable: false })
  return report
}

const readPackageSnapshotForReport = async (attempt: any, snapshotId?: string) => {
  const packageFields = [
    attempt.compositeAssessment.reportPackageKey,
    attempt.compositeAssessment.reportPackageVersion,
    attempt.compositeAssessment.reportPackageProfile,
    attempt.compositeAssessment.reportPackageSnapshotEncrypted,
  ]
  const collectionOnly = packageFields.every((value) => value === null || value === undefined)
  if (collectionOnly) {
    if (snapshotId) throw compositeNotFound('分析快照不存在')
    return null
  }
  if (packageFields.some((value) => !value)) {
    throw compositeBadRequest('综合测评的报告包冻结信息不完整')
  }

  let packageSnapshot
  try {
    packageSnapshot = readFrozenReportPackageSnapshot(
      attempt.compositeAssessment.reportPackageSnapshotEncrypted,
    )
    if (
      packageSnapshot.packageKey !== attempt.compositeAssessment.reportPackageKey
      || packageSnapshot.packageVersion !== attempt.compositeAssessment.reportPackageVersion
      || packageSnapshot.profile !== attempt.compositeAssessment.reportPackageProfile
    ) {
      throw new Error('报告包实例与冻结快照不匹配')
    }
  } catch {
    logger.warn('composite package snapshot unavailable', {
      attemptId: attempt.id,
      snapshotId: snapshotId ?? null,
      packageKey: attempt.compositeAssessment.reportPackageKey,
      packageVersion: attempt.compositeAssessment.reportPackageVersion,
      profile: attempt.compositeAssessment.reportPackageProfile,
    })
    throw compositeBadRequest('分析快照不可用')
  }

  let snapshot
  try {
    snapshot = await readPackageAnalysisSnapshot(prisma, {
      attemptId: attempt.id,
      snapshotId,
      expected: buildCompletionSnapshotExpectation({
        attemptId: attempt.id,
        assessmentId: attempt.compositeAssessment.id,
        packageSnapshot,
      }),
    })
  } catch {
    throw compositeBadRequest('分析快照不可用')
  }
  if (!snapshot) {
    if (snapshotId) throw compositeNotFound('分析快照不存在')
    throw compositeBadRequest('综合测评缺少完成时分析快照')
  }
  return { packageSnapshot, snapshot }
}

const projectHttpReport = async (
  attempt: any,
  audience: CompositeReportAudience,
  snapshotId?: string,
) => {
  const report = buildCompositeReport(attempt)
  const packageContext = await readPackageSnapshotForReport(attempt, snapshotId)
  if (!packageContext) return projectCompositeCollectionReport(report, audience)
  return projectCompositeReport({
    report,
    packageSnapshot: packageContext.packageSnapshot,
    snapshot: packageContext.snapshot,
    audience,
  })
}

const packageAnalysisExportContextFor = async (
  attempt: any,
  audience: CompositeReportAudience,
  snapshotId?: string,
): Promise<CompositeAnalysisExportContext> => {
  const packageFields = [
    attempt.compositeAssessment.reportPackageKey,
    attempt.compositeAssessment.reportPackageVersion,
    attempt.compositeAssessment.reportPackageProfile,
    attempt.compositeAssessment.reportPackageSnapshotEncrypted,
  ]
  if (packageFields.every((value) => value === null || value === undefined)) {
    throw compositeBadRequest('collection-only 综合测评不支持综合分析导出')
  }
  if (packageFields.some((value) => !value)) {
    throw compositeBadRequest('综合测评的报告包冻结信息不完整')
  }
  // The collection-only and incomplete-package cases are rejected above;
  // the supported export path therefore always returns a package context.
  const packageContext = (await readPackageSnapshotForReport(attempt, snapshotId))!
  return {
    attemptId: attempt.id,
    assessmentId: attempt.compositeAssessment.id,
    assessmentName: attempt.compositeAssessment.name,
    audience,
    packageSnapshot: packageContext.packageSnapshot,
    snapshot: packageContext.snapshot,
  }
}

export const getReport = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const attempt = await findAttempt(attemptId, context)
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  return projectHttpReport(attempt, 'participant')
}

export const getAnalysisExportForParticipant = async (
  attemptId: string,
  context: { userId?: string; recoveryTokenHash?: string },
): Promise<CompositeAnalysisExportContext> => {
  const attempt = await findAttempt(attemptId, context)
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  return packageAnalysisExportContextFor(attempt, 'participant')
}

/**
 * Internal PR8 read path for the future package report API. The completion
 * snapshot is the participant/default history; this helper never falls back
 * to running the live analysis engine.
 */
export const getDefaultPackageAnalysisSnapshot = async (
  attemptId: string,
  context: { userId?: string; recoveryTokenHash?: string },
) => {
  const attempt = await findAttempt(attemptId, context)
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  const packageFields = [
    attempt.compositeAssessment.reportPackageKey,
    attempt.compositeAssessment.reportPackageVersion,
    attempt.compositeAssessment.reportPackageProfile,
    attempt.compositeAssessment.reportPackageSnapshotEncrypted,
  ]
  if (packageFields.every((value) => value === null || value === undefined)) return null
  if (packageFields.some((value) => !value)) {
    throw compositeBadRequest('综合测评的报告包冻结信息不完整')
  }
  const packageSnapshot = readFrozenReportPackageSnapshot(
    attempt.compositeAssessment.reportPackageSnapshotEncrypted,
  )
  if (
    packageSnapshot.packageKey !== attempt.compositeAssessment.reportPackageKey
    || packageSnapshot.packageVersion !== attempt.compositeAssessment.reportPackageVersion
    || packageSnapshot.profile !== attempt.compositeAssessment.reportPackageProfile
  ) {
    throw compositeBadRequest('综合测评报告包实例与冻结快照不匹配')
  }
  const snapshot = await readCompletionPackageAnalysisSnapshot(prisma, attemptId, {
    ...buildCompletionSnapshotExpectation({
      attemptId: attempt.id,
      assessmentId: attempt.compositeAssessment.id,
      packageSnapshot,
    }),
  })
  if (!snapshot) throw compositeBadRequest('综合测评缺少完成时分析快照')
  return snapshot
}

/**
 * Explicit administrative reanalysis. It appends an immutable row when the
 * analysis input/version differs; the unique fingerprint constraint makes a
 * repeated request idempotent and never overwrites the completion row.
 */
export const reanalyzePackageAttempt = async (
  userId: string,
  role: UserRole,
  attemptId: string,
) => {
  if (role !== UserRole.ADMIN) throw compositeForbidden('只有管理员可以重新生成综合分析')
  const existing = await loadAttemptWithChildren(attemptId)
  if (existing.status !== 'COMPLETED') throw compositeBadRequest('只有已完成综合测评可以重新分析')
  if (!existing.compositeAssessment.reportPackageKey) {
    throw compositeBadRequest('collection-only 综合测评不支持综合分析')
  }

  const snapshot = await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const attempt = await loadAttemptForFinalization(tx, attemptId)
    if (attempt.status !== 'COMPLETED') throw compositeBadRequest('只有已完成综合测评可以重新分析')
    const packageAnalysis = buildPackageAnalysisForAttempt(attempt)
    if (!packageAnalysis) throw compositeBadRequest('综合测评不包含可分析报告包')
    const persisted = await persistOrGetPackageAnalysisSnapshot(tx, {
      attemptId: attempt.id,
      analysis: packageAnalysis.analysis,
      inputFingerprint: packageAnalysis.inputFingerprint,
      generationReason: 'REANALYSIS',
      generatedBy: userId,
    })
    return { ...persisted, packageSnapshot: packageAnalysis.packageSnapshot }
  })

  const { row, created, packageSnapshot } = snapshot
  return {
    id: row.id,
    attemptId: row.attemptId,
    packageKey: row.packageKey,
    packageVersion: row.packageVersion,
    profile: packageSnapshot.profile,
    analysisDefinitionVersion: row.analysisDefinitionVersion,
    analysisProtocolKey: packageSnapshot.analysisProtocolSnapshot.protocolKey,
    analysisProtocolVersion: packageSnapshot.analysisProtocolSnapshot.protocolVersion,
    analysisVersion: row.analysisVersion,
    reportSchemaVersion: row.reportSchemaVersion,
    inputFingerprint: row.inputFingerprint,
    generationReason: row.generationReason,
    generatedBy: row.generatedBy,
    createdAt: row.createdAt.toISOString(),
    created,
  }
}

const toSnapshotMetadata = (
  row: Omit<Awaited<ReturnType<typeof listPackageAnalysisSnapshotMetadata>>[number], 'payloadEncrypted'>,
  packageSnapshot: ReturnType<typeof readFrozenReportPackageSnapshot>,
  includeSensitive: boolean,
): CompositeSnapshotMetadata => {
  return {
    id: row.id,
    attemptId: row.attemptId,
    packageKey: row.packageKey,
    packageVersion: row.packageVersion,
    profile: packageSnapshot.profile,
    analysisDefinitionVersion: row.analysisDefinitionVersion,
    analysisProtocolKey: packageSnapshot.analysisProtocolSnapshot.protocolKey,
    analysisProtocolVersion: packageSnapshot.analysisProtocolSnapshot.protocolVersion,
    analysisVersion: row.analysisVersion,
    reportSchemaVersion: row.reportSchemaVersion,
    ...(includeSensitive ? { inputFingerprint: row.inputFingerprint, generatedBy: row.generatedBy } : {}),
    generationReason: row.generationReason,
    createdAt: row.createdAt.toISOString(),
  }
}

export const listPackageAnalysisSnapshotsForTeacher = async (
  userId: string,
  role: UserRole,
  attemptId: string,
) => {
  assertTeacher(role)
  const attempt = await loadAttemptWithChildren(attemptId)
  const composite = await loadComposite(attempt.compositeAssessmentId)
  assertOwner(composite, userId, role)
  assertSupportedComposite(attempt.compositeAssessment)
  if (!attempt.compositeAssessment.reportPackageKey) return { list: [], total: 0 }
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  if (
    !attempt.compositeAssessment.reportPackageVersion
    || !attempt.compositeAssessment.reportPackageProfile
    || !attempt.compositeAssessment.reportPackageSnapshotEncrypted
  ) {
    throw compositeBadRequest('综合测评的报告包冻结信息不完整')
  }

  const rows = await listPackageAnalysisSnapshotMetadata(prisma, attemptId)
  let packageSnapshot: ReturnType<typeof readFrozenReportPackageSnapshot>
  try {
    packageSnapshot = readFrozenReportPackageSnapshot(attempt.compositeAssessment.reportPackageSnapshotEncrypted)
    if (
      packageSnapshot.packageKey !== attempt.compositeAssessment.reportPackageKey
      || packageSnapshot.packageVersion !== attempt.compositeAssessment.reportPackageVersion
      || packageSnapshot.profile !== attempt.compositeAssessment.reportPackageProfile
    ) {
      throw new Error('报告包实例与冻结快照不匹配')
    }
    buildCompletionSnapshotExpectation({
      attemptId: attempt.id,
      assessmentId: attempt.compositeAssessment.id,
      packageSnapshot,
    })
  } catch {
    logger.warn('composite package snapshot metadata unavailable', {
      attemptId: attempt.id,
      snapshotId: null,
      packageKey: attempt.compositeAssessment.reportPackageKey,
      packageVersion: attempt.compositeAssessment.reportPackageVersion,
    })
    throw compositeBadRequest('分析快照不可用')
  }
  const driftedRow = rows.find((row) => (
    row.attemptId !== attempt.id
    || row.packageKey !== packageSnapshot.packageKey
    || row.packageVersion !== packageSnapshot.packageVersion
    || row.analysisDefinitionVersion !== packageSnapshot.analysisProtocolSnapshot.protocolVersion
  ))
  if (driftedRow) {
    logger.warn('composite analysis snapshot metadata drift', {
      attemptId: attempt.id,
      snapshotId: driftedRow.id,
      packageKey: driftedRow.packageKey,
      packageVersion: driftedRow.packageVersion,
      analysisVersion: driftedRow.analysisVersion,
      reportSchemaVersion: driftedRow.reportSchemaVersion,
    })
    throw compositeBadRequest('分析快照不可用')
  }
  const list = rows.map((row) => toSnapshotMetadata(row, packageSnapshot, role === UserRole.ADMIN))
  return { list, total: list.length }
}

export const getReportForTeacher = async (
  userId: string,
  role: UserRole,
  compositeId: string,
  attemptId: string,
  snapshotId?: string,
) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const attempt = await loadAttemptWithChildren(attemptId)
  if (attempt.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评记录不存在')
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  assertSupportedComposite(attempt.compositeAssessment)
  return projectHttpReport(attempt, role === UserRole.ADMIN ? 'researcher' : 'teacher', snapshotId)
}

export const getAnalysisExportForTeacher = async (
  userId: string,
  role: UserRole,
  compositeId: string,
  attemptId: string,
  snapshotId?: string,
): Promise<CompositeAnalysisExportContext> => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const attempt = await loadAttemptWithChildren(attemptId)
  if (attempt.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评记录不存在')
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  assertSupportedComposite(attempt.compositeAssessment)
  return packageAnalysisExportContextFor(attempt, role === UserRole.ADMIN ? 'researcher' : 'teacher', snapshotId)
}

export const getExportContext = async (userId: string, role: UserRole, id: string) => {
  assertTeacher(role)
  const composite = await loadComposite(id)
  assertOwner(composite, userId, role)
  return composite
}

export const isCompositeError = (err: unknown): err is CompositeServiceError => err instanceof CompositeServiceError
