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
import { hashScaleDefinition, validateScaleDefinition } from '../scale/scale-definition'
import { ensureScaleAdmissionAtDelivery } from '../scale/scale-admission.service'
import { ensureCognitiveAdmissionAtDelivery } from '../cognitive/cognitive-admission.service'
import { ensureCompositeFormAdmissionAtDelivery } from '../assessment-runtime/form-admission.service'
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
import { computeSubmissionPayloadHash, isInstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import {
  withFinalOnlyCompletionTransaction,
  withQuestionnaireCompletionTransaction,
} from '../../services/questionnaireProgressService'
import { measureRequestPhase, measureRequestPhaseSync } from '../../services/runtimeObservability'
import {
  buildFrozenAnalysisProtocolSnapshot,
  encryptFrozenAnalysisProtocolSnapshot,
  buildFrozenReportPackageSnapshot,
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
import {
  formSectionIdentityHash,
  freezeCompositeActiveSlotSet,
} from '../assessment-runtime/attempt-runtime'
import {
  decryptFrozenScaleRuntimeSnapshot,
  encryptFrozenScaleRuntimeSnapshot,
  freezeScaleRuntimeAtAttemptStart,
} from '../assessment-runtime/runtime-snapshot'
import { compiledBundleRuntimeHashForSnapshot, evaluateCompleteness, type AggregateSnapshotHeader } from '../assessment-runtime/unified-aggregate'
import {
  compositeItemSlotKey,
  decryptFrozenActiveSlotSet,
  encryptFrozenActiveSlotSet,
  formSectionSlotKey,
  type FrozenActiveSlotV1,
} from '../assessment-runtime/slot-set'
import { runnerDefinition } from '../scale/scale-definition'
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
            formSections: {
              orderBy: { position: 'asc' as const },
              include: { items: { orderBy: [{ formSectionPosition: 'asc' as const }, { position: 'asc' as const }] } },
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
    courseId: string
    userId: string
    profile: CognitiveAnalysisProfile
    packageDefinition: ReportPackageDefinition
  },
) => {
  const protocol = requirePublishedAnalysisProtocol(
    input.packageDefinition.analysisProtocolKey,
    input.packageDefinition.analysisProtocolVersion,
  )
  await materializeAnalysisProtocol(db, {
    compositeId: input.compositeId,
    courseId: input.courseId,
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
  const protocol = packageDefinition
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
        analysisProtocolKey: protocol?.key ?? null,
        analysisProtocolVersion: protocol?.version ?? null,
        analysisProtocolSnapshotEncrypted: null,
        reportPackageKey: packageDefinition?.key ?? null,
        reportPackageVersion: packageDefinition?.version ?? null,
        reportPackageProfile: packageSelection?.profile ?? null,
        reportPackageSnapshotEncrypted: null,
      },
    })
    if (packageDefinition && packageSelection && input.courseId) {
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
  const { ensureCompositeFormSections, listCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(id)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role)
  const counts = await loadAttemptCountsByCompositeIds([composite.id])
  const [contentUnits, formSections] = await Promise.all([
    listCompositeContentUnits(composite.id),
    listCompositeFormSections(composite.id),
  ])
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
    deliveryMode: 'FINAL_ONLY' as const,
    formSections,
    units: contentUnits,
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
      const protocol = requirePublishedAnalysisProtocol(
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
      validateFrozenAnalysisProtocolSnapshot(
        snapshot,
        source.analysisProtocolKey as string,
        source.analysisProtocolVersion as string,
        source.items,
      )
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

  assertCognitiveModuleEnabled()
  if (!composite.courseId) throw compositeBadRequest('报告包必须绑定课程')
  const definition = requirePublishedReportPackage(selection.key, selection.version)
  if (!definition.profiles.includes(selection.profile)) throw compositeBadRequest('报告包不支持该 Profile')
  if (!await canUseReportPackage(userId, role, definition.key, definition.version)) {
    throw compositeForbidden('没有该报告包的授权')
  }
  if (!composite.reportPackageKey && composite.items.length > 0) {
    throw compositeConflict('请选择空白草稿启用报告包，或先移除现有模块')
  }

  const protocol = requirePublishedAnalysisProtocol(
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
        analysisProtocolKey: protocol.key,
        analysisProtocolVersion: protocol.version,
        analysisProtocolSnapshotEncrypted: null,
      },
    })
    await materializeReportPackage(tx, {
      compositeId: id,
      courseId: composite.courseId as string,
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

type CompositeContentUnitInput = {
  type: 'scale' | 'cognitive' | 'form-section' | 'SCALE' | 'COGNITIVE' | 'FORM_SECTION'
  id: string
  position: number
}

const canonicalCompositeContentUnitType = (type: CompositeContentUnitInput['type']) => {
  if (type === 'scale' || type === 'SCALE') return 'scale' as const
  if (type === 'cognitive' || type === 'COGNITIVE') return 'cognitive' as const
  return 'form-section' as const
}

const compositeSectionHasContext = (section: any) => (
  Boolean(section.contextSection) || Boolean(section.items?.some((item: any) => item.contextKey))
)

const compositeFormSectionRuntimeDefinition = (section: any) => {
  const items = [...(section.items ?? [])]
    .sort((left: any, right: any) => (left.formSectionPosition ?? left.position) - (right.formSectionPosition ?? right.position))
    .map((item: any) => ({
      id: item.id,
      formType: item.formType,
      formLabel: item.formLabel,
      placeholder: item.formPlaceholder ?? null,
      required: item.required !== false,
      formOptions: item.formOptions,
      contextKey: item.contextKey ?? null,
      position: item.position,
      formSectionPosition: item.formSectionPosition ?? null,
    }))
  return {
    id: section.id,
    title: section.title,
    description: section.description ?? null,
    position: section.position,
    contextSection: compositeSectionHasContext(section),
    items,
  }
}

const assertCompositeContentUnitOrder = (units: Array<{ type: string; id: string }>, sections: any[]) => {
  const contextSections = sections.filter(compositeSectionHasContext)
  if (contextSections.length > 1) throw compositeBadRequest('同一综合测评只能有一个上下文区段')
  if (contextSections[0] && (units[0]?.type !== 'form-section' || units[0].id !== contextSections[0].id)) {
    throw compositeBadRequest('人口学上下文区段必须是第一个内容单元')
  }
}

export const listCompositeContentUnits = async (compositeId: string) => {
  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(compositeId)
  const composite = await loadComposite(compositeId, true)
  const packageSlotLabels = getFrozenPackageSlotLabels(composite)
  return [
    ...composite.items
      .filter((item: any) => item.type !== 'FORM')
      .map((item: any) => ({
        type: item.type === 'SCALE' ? 'scale' as const : 'cognitive' as const,
        id: item.id,
        position: item.position,
        label: resolveCompositeItemLabel(item, packageSlotLabels),
        itemCount: 1,
        contextSection: false,
      })),
    ...(composite.formSections ?? []).map((section: any) => ({
      type: 'form-section' as const,
      id: section.id,
      position: section.position,
      label: section.title,
      itemCount: section.items.length,
      contextSection: compositeSectionHasContext(section),
    })),
  ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
}

export const reorderCompositeContentUnits = async (
  userId: string,
  role: UserRole,
  compositeId: string,
  input: CompositeContentUnitInput[],
) => {
  assertTeacher(role)
  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(compositeId)
  const composite = await loadComposite(compositeId, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  assertCollectionOnlyEditing(composite)

  const sections = composite.formSections ?? []
  const childItems = composite.items.filter((item: any) => item.type !== 'FORM')
  const expected = new Map<string, string>([
    ...childItems.map((item: any) => [
      `${item.type === 'SCALE' ? 'scale' : 'cognitive'}:${item.id}`,
      item.type === 'SCALE' ? 'scale' : 'cognitive',
    ] as const),
    ...sections.map((section: any) => [`form-section:${section.id}`, 'form-section'] as const),
  ])
  if (input.length !== expected.size) throw compositeBadRequest('必须同时提交全部内容单元的排序')
  if (input.some((item) => !Number.isInteger(item.position) || item.position < 0)) {
    throw compositeBadRequest('内容排序位置必须是非负整数')
  }
  const ordered = [...input].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
  if (new Set(ordered.map((item) => item.position)).size !== ordered.length) throw compositeBadRequest('内容排序位置不能重复')
  const seen = new Set<string>()
  const normalized = ordered.map((item) => {
    const type = canonicalCompositeContentUnitType(item.type)
    const key = `${type}:${item.id}`
    if (seen.has(key) || expected.get(key) !== type) throw compositeBadRequest('内容单元排序数据无效')
    seen.add(key)
    return { type, id: item.id }
  })
  if (seen.size !== expected.size || [...expected.keys()].some((key) => !seen.has(key))) {
    throw compositeBadRequest('内容单元排序列表与综合测评内容不一致')
  }
  assertCompositeContentUnitOrder(normalized, sections)

  // Form item positions remain frozen for legacy report/package label reads.
  // New free-composition units use an isolated position range shared by child
  // modules and sections, so a section can move across a Scale/Cognitive item
  // without colliding with the physical FORM rows.
  const unitBase = Math.max(
    1000,
    ...composite.items.map((item: any) => item.position),
    ...sections.map((section: any) => section.position),
    ...input.map((item) => item.position),
  ) + expected.size + 1
  const itemTemporaryBase = unitBase + expected.size + composite.items.length + 1
  const sectionTemporaryBase = unitBase + expected.size + sections.length + 1
  await prisma.$transaction(async (tx) => {
    for (const [index, item] of childItems.entries()) {
      await tx.compositeAssessmentItem.update({ where: { id: item.id }, data: { position: itemTemporaryBase + index } })
    }
    for (const [index, section] of sections.entries()) {
      await tx.compositeFormSection.update({ where: { id: section.id }, data: { position: sectionTemporaryBase + index } })
    }
    for (const [index, unit] of normalized.entries()) {
      const position = unitBase + index
      if (unit.type === 'form-section') {
        await tx.compositeFormSection.update({ where: { id: unit.id }, data: { position } })
      } else {
        await tx.compositeAssessmentItem.update({ where: { id: unit.id }, data: { position } })
      }
    }
  })
  return listCompositeContentUnits(compositeId)
}

export const reorderItems = async (userId: string, role: UserRole, compositeId: string, items: Array<{ id: string; position: number }>) => {
  assertTeacher(role)
  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(compositeId)
  const composite = await loadComposite(compositeId, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  assertCollectionOnlyEditing(composite)
  if (items.length !== composite.items.length) throw compositeBadRequest('必须同时提交全部模块的排序')
  const known = new Map(composite.items.map((item: any) => [item.id, item]))
  const itemIds = new Set<string>()
  const positions = new Set<number>()
  for (const item of items) {
    if (!known.has(item.id) || itemIds.has(item.id) || positions.has(item.position) || item.position < 0) {
      throw compositeBadRequest('模块排序数据无效')
    }
    itemIds.add(item.id)
    positions.add(item.position)
  }
  if (itemIds.size !== known.size) throw compositeBadRequest('模块排序数据无效')

  const ordered = [...items].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
  const sectionIds = new Set<string>()
  const seenSections = new Set<string>()
  const unitInputs: CompositeContentUnitInput[] = []
  let activeSectionId: string | null = null
  for (const entry of ordered) {
    const item = known.get(entry.id) as any
    if (item.type === 'FORM') {
      if (!item.formSectionId) throw compositeBadRequest('表单字段尚未分配到区段')
      if (activeSectionId !== item.formSectionId) {
        if (seenSections.has(item.formSectionId)) throw compositeBadRequest('同一区段的字段必须连续排列')
        activeSectionId = item.formSectionId
        seenSections.add(item.formSectionId)
        sectionIds.add(item.formSectionId)
        unitInputs.push({ type: 'form-section', id: item.formSectionId, position: entry.position })
      }
      continue
    }
    activeSectionId = null
    unitInputs.push({ type: item.type === 'SCALE' ? 'scale' : 'cognitive', id: item.id, position: entry.position })
  }
  for (const section of composite.formSections ?? []) {
    if (!sectionIds.has(section.id)) unitInputs.push({ type: 'form-section', id: section.id, position: section.position })
  }
  return reorderCompositeContentUnits(userId, role, compositeId, unitInputs)
}

export const publishComposite = async (userId: string, role: UserRole, id: string) => {
  assertTeacher(role)
  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(id)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  if (composite.items.length === 0) throw compositeBadRequest('综合测评至少需要一个模块')
  await validateCourse(composite.courseId, userId, role, { allowLibrary: role === UserRole.ADMIN })
  if (composite.publicEnabled && !composite.expiresAt) throw compositeBadRequest('公开链接必须设置有效期')

  const contextSections = (composite.formSections ?? []).filter(compositeSectionHasContext)
  if (contextSections.length > 1) throw compositeBadRequest('同一综合测评只能有一个上下文区段')
  const contentUnits = [
    ...composite.items
      .filter((item: any) => item.type !== 'FORM')
      .map((item: any) => ({ type: item.type === 'SCALE' ? 'scale' : 'cognitive', id: item.id, position: item.position })),
    ...(composite.formSections ?? []).map((section: any) => ({ type: 'form-section', id: section.id, position: section.position })),
  ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
  if (contextSections[0] && (
    contentUnits[0]?.type !== 'form-section' || contentUnits[0].id !== contextSections[0].id
  )) {
    throw compositeBadRequest('人口学上下文区段必须是第一个内容单元')
  }
  const sectionByItem = new Map<string, any>(
    (composite.formSections ?? []).flatMap((section: any) => section.items.map((item: any) => [item.id, section] as const)),
  )
  const contextIssues = validateContextFormItems(
    composite.items.filter((item: any) => item.type === 'FORM').map((item: any) => ({
      id: item.id,
      type: item.formType,
      label: item.formLabel,
      required: item.required,
      position: sectionByItem.get(item.id)?.position ?? item.position,
      contextKey: item.contextKey,
      options: item.formOptions,
    })),
    contentUnits
      .filter((unit) => !(contextSections[0]?.id === unit.id && unit.type === 'form-section'))
      .map((unit) => unit.position),
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
      const protocol = requirePublishedAnalysisProtocol(
        definition.analysisProtocolKey,
        definition.analysisProtocolVersion,
      )
      const packageSnapshot = hasPackageSnapshot
        ? readFrozenReportPackageSnapshot(composite.reportPackageSnapshotEncrypted as string)
        : buildFrozenReportPackageSnapshot(definition, protocol, composite.items)
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
    include: {
      course: { select: { id: true, title: true, courseCode: true, isLibrary: true } },
      items: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          type: true,
          position: true,
          scale: { select: { name: true } },
          cognitiveAssignment: { select: { title: true } },
          formLabel: true,
        },
      },
      formSections: {
        orderBy: { position: 'asc' },
        include: { items: { select: { id: true, contextKey: true } } },
      },
    },
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
    const sections = item.formSections ?? []
    const units = [
      ...item.items
        .filter((child: any) => child.type !== 'FORM')
        .map((child: any) => ({
          type: child.type === 'SCALE' ? 'scale' as const : 'cognitive' as const,
          id: child.id,
          position: child.position,
          label: resolveCompositeItemLabel(child, getFrozenPackageSlotLabels(item)),
          itemCount: 1,
          contextSection: false,
        })),
      ...sections.map((section: any) => ({
        type: 'form-section' as const,
        id: section.id,
        position: section.position,
        label: section.title,
        itemCount: section.items.length,
        contextSection: compositeSectionHasContext(section),
      })),
    ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      instruction: item.instruction,
      deliveryMode: 'FINAL_ONLY' as const,
      estimatedModules: units.length,
      course: item.course,
      opensAt: item.opensAt,
      expiresAt: item.expiresAt,
      maxAttempts: item.maxAttempts,
      attemptsUsed,
      availability,
      canStartNewAttempt: availability === 'OPEN' && !canContinue && attemptsUsed < item.maxAttempts,
      canContinue,
      items: item.items.map((child: any) => ({ type: child.type, position: child.position, label: resolveCompositeItemLabel(child, getFrozenPackageSlotLabels(item)) })),
      units,
      formSections: sections,
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
  const unifiedSnapshot = attempt.runtimeGeneration === 'UNIFIED_V1'
    ? await cognitiveSessionService.createUnifiedCognitiveSessionConfigSnapshot({
        db,
        testType: config.testType,
        configVersion: config.configVersion,
        engineVersion: config.engineVersion,
        scoringVersion: config.scoringVersion,
        config: sessionConfig,
      })
    : null
  const configSnapshotEncrypted = unifiedSnapshot?.encrypted ?? cognitiveSessionService.createCognitiveSessionConfigSnapshot({
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
      attemptNo: attempt.attemptEpoch ?? 1,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      configVersion: config.configVersion,
      configSnapshotEncrypted,
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
      randomSeed: randomBytes(16).toString('hex'),
      anonymousCode: anonymous ? attempt.anonymousCode : null,
      ...(unifiedSnapshot ? {
        runtimeGeneration: 'UNIFIED_V1' as const,
        compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
      } : {}),
    },
  })
}

const createChildRecords = async (db: Db, attempt: any, items: any[], userId: string | null) => {
  const runtime = {
    scales: [] as Array<{ compositeItemId: string; code: string; instrumentVersion: string; sourceDefinitionHash: string; compiledRuntimeHash: string }>,
    cognitive: [] as Array<{ compositeItemId: string; testType: string; instrumentVersion: string; sourceDefinitionHash: string; compiledRuntimeHash: string }>,
  }
  for (const item of items) {
    if (!item.required) continue
    if (item.type === 'SCALE') {
      const frozenScale = attempt.runtimeGeneration === 'UNIFIED_V1'
        ? await freezeScaleRuntimeAtAttemptStart(db, {
            instrumentKey: item.scale.code,
            instrumentVersion: item.scale.instrumentVersion,
            definition: scaleDefinitionFromRecord(item.scale),
          })
        : null
      await db.assessment.create({
        data: {
          scaleId: item.scaleId,
          userId,
          status: 'IN_PROGRESS',
          deliveryMode: 'FINAL_ONLY',
          attemptEpoch: attempt.attemptEpoch ?? 1,
          progress: 0,
          answers: encryptScaleAnswers([]),
          compositeAttemptId: attempt.id,
          compositeItemId: item.id,
          ...(frozenScale ? {
            runtimeGeneration: 'UNIFIED_V1' as const,
            runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(frozenScale),
            compiledRuntimeHash: frozenScale.compiledRuntime.compiledRuntimeHash,
          } : {}),
        },
      })
      if (frozenScale) {
        runtime.scales.push({
          compositeItemId: item.id,
          code: item.scale.code,
          instrumentVersion: item.scale.instrumentVersion,
          sourceDefinitionHash: frozenScale.sourceDefinitionHash,
          compiledRuntimeHash: frozenScale.compiledRuntime.compiledRuntimeHash,
        })
      }
    } else if (item.type === 'COGNITIVE') {
      const session = await createCognitiveChild(db, attempt, item, userId)
      if (attempt.runtimeGeneration === 'UNIFIED_V1') {
        const snapshot = cognitiveSessionService.readCognitiveSessionConfig(session.configSnapshotEncrypted).snapshot
        if (!snapshot?.compiledRuntime) throw new Error('Unified Cognitive session runtime snapshot is missing')
        runtime.cognitive.push({
          compositeItemId: item.id,
          testType: item.cognitiveAssignment.config.testType,
          instrumentVersion: snapshot.compiledRuntime.instrumentVersion,
          sourceDefinitionHash: snapshot.compiledRuntime.sourceDefinitionHash,
          compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
        })
      }
    }
  }
  return runtime
}

const createAttempt = async (
  db: Db,
  composite: any,
  userId: string | null,
  accessTokenId: string | null,
  credential?: ReturnType<typeof createRecoveryCredential>,
  attemptNo = 1,
  attemptEpoch = 1,
) => {
  const finalOnly = composite.deliveryMode !== 'LEGACY'
  const formSections = finalOnly ? (composite.formSections ?? []) : []
  const packageFields = finalOnly
    ? [composite.reportPackageKey, composite.reportPackageVersion, composite.reportPackageProfile, composite.reportPackageSnapshotEncrypted]
    : []
  if (packageFields.some((value: unknown) => value !== null && value !== undefined) && packageFields.some((value: unknown) => value === null || value === undefined)) {
    throw compositeBadRequest('综合测评报告包冻结信息不完整')
  }
  const packageSnapshot = finalOnly && composite.reportPackageSnapshotEncrypted
    ? readFrozenReportPackageSnapshot(composite.reportPackageSnapshotEncrypted)
    : null
  if (packageSnapshot && (
    packageSnapshot.packageKey !== composite.reportPackageKey
    || packageSnapshot.packageVersion !== composite.reportPackageVersion
    || packageSnapshot.profile !== composite.reportPackageProfile
  )) throw compositeBadRequest('综合测评报告包实例与冻结快照不匹配')
  const totalUnits = finalOnly
    ? composite.items.filter((item: any) => item.type !== 'FORM' && item.required).length + formSections.length
    : composite.items.length
  const completedItems = finalOnly
    ? 0
    : composite.items.filter((item: any) => !item.required && !item.contextKey).length
  const progress = totalUnits === 0
    ? 100
    : Math.round((completedItems / totalUnits) * 100)
  const attempt = await db.compositeAssessmentAttempt.create({
    data: {
      compositeAssessmentId: composite.id,
      userId,
      accessTokenId,
      recoveryTokenHash: credential?.hash ?? null,
      participantKey: credential?.participantKey ?? `user:${userId}`,
      anonymousCode: credential?.anonymousCode ?? null,
      attemptNo,
      deliveryMode: finalOnly ? 'FINAL_ONLY' : 'LEGACY',
      runtimeGeneration: finalOnly ? 'UNIFIED_V1' : null,
      compiledBundleRuntimeHash: packageSnapshot ? compiledBundleRuntimeHashForSnapshot(packageSnapshot) : null,
      attemptEpoch,
      completedItems,
      progress,
    },
  })
  if (finalOnly && formSections.length > 0) {
    await db.compositeFormSectionAttempt.createMany({
      data: formSections.map((section: any) => ({
        attemptId: attempt.id,
        sectionId: section.id,
        attemptEpoch,
      })),
    })
  }
  const runtime = await createChildRecords(db, attempt, composite.items, userId)
  if (finalOnly) {
    const frozenActiveSlotSet = freezeCompositeActiveSlotSet({
      attemptEpoch,
      scales: runtime.scales,
      cognitive: runtime.cognitive,
      formSections: formSections.map((section: any) => ({
        sectionId: section.id,
        definitionHash: formSectionIdentityHash(compositeFormSectionRuntimeDefinition(section)),
      })),
    })
    await db.compositeAssessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozenActiveSlotSet),
        frozenActiveSlotSetHash: frozenActiveSlotSet.snapshotHash,
      },
    })
  }
  return attempt
}

export const startUserAttempt = async (userId: string, compositeId: string) => {
  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(compositeId)
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

/**
 * Replace an in-progress Composite attempt with a clean final-only attempt.
 * The retired attempt remains available to reporting/audit code; its child
 * rows are never deleted.
 */
export const restartUserAttempt = async (userId: string, attemptId: string) => {
  const existing = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, userId: true, compositeAssessmentId: true },
  })
  if (!existing) throw compositeNotFound('综合测评记录不存在')
  if (existing.userId !== userId) throw compositeForbidden('无权限重启此综合测评')

  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(existing.compositeAssessmentId)
  const composite = await loadComposite(existing.compositeAssessmentId, true)
  assertSupportedComposite(composite)
  await assertStudentEligibility(composite, userId)

  const next = await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        compositeAssessmentId: true,
        status: true,
        attemptNo: true,
        attemptEpoch: true,
      },
    })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.userId !== userId) throw compositeForbidden('无权限重启此综合测评')
    if (current.status !== 'IN_PROGRESS') throw compositeConflict('只有进行中的综合测评可以重启')
    await tx.compositeAssessmentAttempt.update({
      where: { id: current.id },
      data: { status: 'ABANDONED', completedAt: new Date() },
    })
    return createAttempt(
      tx,
      composite,
      userId,
      null,
      undefined,
      current.attemptNo + 1,
      current.attemptEpoch + 1,
    )
  })
  return { attempt: await getAttemptState(next.id, { userId }), recoveryToken: null }
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
          formSections: {
            orderBy: { position: 'asc' },
            include: { items: { orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }] } },
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
            formSections: {
              orderBy: { position: 'asc' },
              include: { items: { orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }] } },
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
  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(composite.id)
  const current = await loadComposite(composite.id, true)
  const packageSlotLabels = getFrozenPackageSlotLabels(current)
  const units = [
    ...current.items
      .filter((item: any) => item.type !== 'FORM')
      .map((item: any) => ({
        type: item.type === 'SCALE' ? 'scale' as const : 'cognitive' as const,
        id: item.id,
        position: item.position,
        label: resolveCompositeItemLabel(item, packageSlotLabels),
        itemCount: 1,
        contextSection: false,
      })),
    ...(current.formSections ?? []).map((section: any) => ({
      type: 'form-section' as const,
      id: section.id,
      position: section.position,
      label: section.title,
      itemCount: section.items.length,
      contextSection: compositeSectionHasContext(section),
    })),
  ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
  return {
    id: current.id,
    name: current.name,
    description: current.description,
    instruction: current.instruction,
    expiresAt: token.expiresAt,
    maxUses: token.maxUses,
    usedCount: token.usedCount,
    deliveryMode: 'FINAL_ONLY' as const,
    attemptEpoch: 1,
    items: current.items.map((item: any) => ({ type: item.type, position: item.position, label: resolveCompositeItemLabel(item, packageSlotLabels) })),
    units,
    formSections: (current.formSections ?? []).map((section: any) => ({
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      position: section.position,
      contextSection: compositeSectionHasContext(section),
      items: section.items ?? [],
    })),
  }
}

export const startPublicAttempt = async (tokenValue: string, recoveryToken?: string) => {
  const token = await findPublicToken(tokenValue)
  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(token.compositeAssessment.id)
  const composite = await loadComposite(token.compositeAssessment.id, true)
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
    return createAttempt(tx, composite, null, token.id, credential)
  })
  return { attempt: await getAttemptState(attempt.id, { recoveryTokenHash: credential.hash }), recoveryToken: credential.token }
}

/** Restart an anonymous attempt using only the server-issued recovery hash. */
export const restartPublicAttempt = async (attemptId: string, recoveryTokenHash: string) => {
  const existing = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      recoveryTokenHash: true,
      accessTokenId: true,
      compositeAssessmentId: true,
    },
  })
  if (!existing) throw compositeNotFound('综合测评记录不存在')
  if (existing.userId !== null || existing.recoveryTokenHash !== recoveryTokenHash) {
    throw compositeForbidden('恢复凭证无权重启此综合测评')
  }
  const accessToken = existing.accessTokenId
    ? await prisma.compositeAssessmentAccessToken.findUnique({
        where: { id: existing.accessTokenId },
        select: { isActive: true, expiresAt: true },
      })
    : null
  if (!accessToken || !accessToken.isActive || accessToken.expiresAt.getTime() <= Date.now()) {
    throw compositeForbidden('公开链接已失效')
  }

  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(existing.compositeAssessmentId)
  const composite = await loadComposite(existing.compositeAssessmentId, true)
  assertSupportedComposite(composite)
  if (!composite.publicEnabled || composite.status !== 'PUBLISHED') throw compositeForbidden('综合测评未开放公开参与')
  const credential = createRecoveryCredential()

  const next = await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        recoveryTokenHash: true,
        accessTokenId: true,
        status: true,
        attemptNo: true,
        attemptEpoch: true,
        compositeAssessmentId: true,
      },
    })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.userId !== null || current.recoveryTokenHash !== recoveryTokenHash) {
      throw compositeForbidden('恢复凭证无权重启此综合测评')
    }
    if (current.status !== 'IN_PROGRESS') throw compositeConflict('只有进行中的综合测评可以重启')
    await tx.compositeAssessmentAttempt.update({
      where: { id: current.id },
      data: { status: 'ABANDONED', completedAt: new Date() },
    })
    return createAttempt(
      tx,
      composite,
      null,
      current.accessTokenId,
      credential,
      current.attemptNo + 1,
      current.attemptEpoch + 1,
    )
  })
  return { attempt: await getAttemptState(next.id, { recoveryTokenHash: credential.hash }), recoveryToken: credential.token }
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
          formSections: {
            orderBy: { position: 'asc' as const },
            include: { items: { orderBy: [{ formSectionPosition: 'asc' as const }, { position: 'asc' as const }] } },
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
      formSectionAttempts: true,
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
          formSections: {
            orderBy: { position: 'asc' as const },
            include: { items: true },
          },
        },
      },
      scaleAssessments: true,
      cognitiveSessions: true,
      formAnswers: true,
      formSectionAttempts: true,
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

const cognitiveRunnerPayload = (session: any, contextSnapshotHash?: string | null) => {
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
    attemptEpoch: session.attemptNo,
    deliveryMode: session.deliveryMode ?? 'FINAL_ONLY',
    definitionHash: storedConfig.snapshot?.configHash ?? null,
    contextSnapshotHash: contextSnapshotHash ?? session.compositeAttempt?.contextSnapshotHash ?? null,
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
  sectionMap: new Map<string, any>((attempt.formSectionAttempts ?? []).map((section: any) => [section.sectionId, section])),
})

const isAttemptItemCompleted = (
  item: any,
  maps: ReturnType<typeof attemptCompletedItemMaps>,
  finalOnly = false,
) => {
  if (!item.required && !item.contextKey) return true
  if (item.type === 'SCALE') return maps.scaleMap.get(item.id)?.status === 'COMPLETED'
  if (item.type === 'COGNITIVE') return maps.cognitiveMap.get(item.id)?.status === 'COMPLETED'
  if (finalOnly) return maps.sectionMap.get(item.formSectionId)?.status === 'COMPLETED'
  return maps.formMap.get(item.id)?.completed !== false && maps.formMap.has(item.id)
}

const countAttemptCompletedItems = (attempt: any, maps = attemptCompletedItemMaps(attempt)) =>
  attempt.deliveryMode === 'FINAL_ONLY'
    ? attempt.compositeAssessment.items.filter((item: any) => item.type !== 'FORM' && isAttemptItemCompleted(item, maps)).length
      + (attempt.formSectionAttempts ?? []).filter((section: any) => section.status === 'COMPLETED').length
    : attempt.compositeAssessment.items.filter((item: any) => isAttemptItemCompleted(item, maps)).length

const unifiedCompositeProgressSnapshot = (
  row: { slotKey: string; terminalState: string },
  slots: Map<string, FrozenActiveSlotV1>,
  attemptEpoch: number,
): AggregateSnapshotHeader => {
  const slot = slots.get(row.slotKey)
  return {
    slotKey: row.slotKey,
    attemptEpoch,
    unitType: slot?.unitType ?? 'FORM_SECTION',
    terminalState: row.terminalState as AggregateSnapshotHeader['terminalState'],
    payloadKind: slot?.unitType === 'FORM_SECTION' ? 'COLLECTION_FACTS' : 'UNIT_RESULT',
    sourceType: 'PROGRESS_HEADER',
    sourceAttemptId: 'PROGRESS_HEADER',
  }
}

const getUnifiedCompositeAttemptState = async (
  attemptId: string,
  context: { userId?: string; recoveryTokenHash?: string },
) => {
  const attempt = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      recoveryTokenHash: true,
      status: true,
      deliveryMode: true,
      runtimeGeneration: true,
      attemptEpoch: true,
      startedAt: true,
      lastSavedAt: true,
      completedAt: true,
      anonymousCode: true,
      contextSnapshotEncrypted: true,
      contextSnapshotHash: true,
      contextFrozenAt: true,
      frozenActiveSlotSetEncrypted: true,
      frozenActiveSlotSetHash: true,
      compositeAssessment: {
        select: {
          id: true,
          name: true,
          instruction: true,
          reportPackageSnapshotEncrypted: true,
          reportPackageKey: true,
          reportPackageVersion: true,
          reportPackageProfile: true,
          items: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              type: true,
              position: true,
              required: true,
              scaleId: true,
              formSectionId: true,
              formType: true,
              formLabel: true,
              formPlaceholder: true,
              formOptions: true,
              contextKey: true,
              scale: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  description: true,
                  instruction: true,
                  instrumentClass: true,
                  instrumentVersion: true,
                },
              },
              cognitiveAssignment: { select: { id: true, title: true } },
            },
          },
          formSections: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              position: true,
              contextSection: true,
              items: {
                orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }],
                select: {
                  id: true,
                  formType: true,
                  formLabel: true,
                  formPlaceholder: true,
                  formOptions: true,
                  contextKey: true,
                  required: true,
                  position: true,
                  formSectionPosition: true,
                },
              },
            },
          },
        },
      },
      scaleAssessments: {
        orderBy: { startedAt: 'asc' },
        select: {
          id: true,
          compositeItemId: true,
          scaleId: true,
          status: true,
          progress: true,
        },
      },
      cognitiveSessions: {
        select: {
          id: true,
          assignmentId: true,
          compositeItemId: true,
          testType: true,
          attemptNo: true,
          status: true,
          configVersion: true,
          configSnapshotEncrypted: true,
          engineVersion: true,
          scoringVersion: true,
          randomSeed: true,
          deliveryMode: true,
          runtimeGeneration: true,
          compiledRuntimeHash: true,
        },
      },
    },
  }) as any
  if (!attempt) throw compositeNotFound('综合测评记录不存在')
  const authorized = context.userId
    ? attempt.userId === context.userId
    : Boolean(context.recoveryTokenHash && attempt.userId === null && attempt.recoveryTokenHash === context.recoveryTokenHash)
  if (!authorized) throw compositeForbidden('无权限查看此综合测评记录')
  if (attempt.deliveryMode !== 'FINAL_ONLY' || attempt.runtimeGeneration !== 'UNIFIED_V1') {
    throw compositeConflict('综合测评运行时版本不匹配，请重启测评')
  }
  assertSupportedComposite(attempt.compositeAssessment)

  let frozenSlotSet
  try {
    if (!attempt.frozenActiveSlotSetEncrypted || !attempt.frozenActiveSlotSetHash) throw new Error('FrozenActiveSlotSet missing')
    frozenSlotSet = decryptFrozenActiveSlotSet(attempt.frozenActiveSlotSetEncrypted)
    if (
      frozenSlotSet.snapshotHash !== attempt.frozenActiveSlotSetHash
      || frozenSlotSet.attemptEpoch !== attempt.attemptEpoch
      || frozenSlotSet.runtimeGeneration !== 'UNIFIED_V1'
    ) throw new Error('FrozenActiveSlotSet identity mismatch')
  } catch {
    throw compositeConflict('综合测评冻结内容不可用，请重启测评')
  }

  // Progress is closed over the frozen slot set and terminal headers only.
  // No answer, result, trial, or encrypted participant payload is selected.
  const snapshotRows = await prisma.assessmentUnitSnapshot.findMany({
    where: { compositeAttemptId: attempt.id, attemptEpoch: attempt.attemptEpoch },
    select: { slotKey: true, terminalState: true },
  })
  const slotsByKey = new Map(frozenSlotSet.slots.map((slot: FrozenActiveSlotV1) => [slot.slotKey, slot]))
  const headers = snapshotRows.map((row) => unifiedCompositeProgressSnapshot(row, slotsByKey, attempt.attemptEpoch))
  const completeness = evaluateCompleteness({ slots: frozenSlotSet.slots, snapshots: headers, attemptEpoch: attempt.attemptEpoch })
  if (completeness.invalidSlotKeys.length > 0) throw compositeBadRequest('综合测评进度快照不可用，请重启测评')
  const headerByKey = new Map(headers.map((header) => [header.slotKey, header]))
  const slotKeyForItem = (item: any): string | null => item.type === 'SCALE' || item.type === 'COGNITIVE'
    ? compositeItemSlotKey(item.id, item.type)
    : item.type === 'FORM' && item.formSectionId
      ? formSectionSlotKey(item.formSectionId)
      : null
  const completedSlot = (slotKey: string | null) => Boolean(slotKey && headerByKey.get(slotKey)?.terminalState === 'COMPLETED')
  const completedItem = (item: any) => {
    // Optional non-context modules are intentionally not materialized as
    // active slots. Preserve the legacy completion projection for them while
    // deriving every required unit exclusively from snapshot headers.
    if (!item.required && !item.contextKey) return true
    return completedSlot(slotKeyForItem(item))
  }
  const sections = (attempt.compositeAssessment.formSections ?? []).slice().sort((left: any, right: any) => left.position - right.position)
  const units = [
    ...attempt.compositeAssessment.items
      .filter((item: any) => item.type !== 'FORM' && item.required)
      .map((item: any) => ({ id: item.id, type: item.type, position: item.position, required: item.required, item })),
    ...sections.map((section: any) => ({ id: section.id, type: 'FORM_SECTION', position: section.position, required: true, section })),
  ].sort((left: any, right: any) => left.position - right.position || left.id.localeCompare(right.id))
  const unitCompleted = (unit: any) => unit.type === 'FORM_SECTION'
    ? completedSlot(formSectionSlotKey(unit.id))
    : completedItem(unit.item)
  const completedItems = units.filter(unitCompleted).length
  const currentIndex = units.findIndex((unit: any) => !unitCompleted(unit))
  const effectiveCurrentIndex = currentIndex < 0 ? units.length : currentIndex
  const currentUnit = currentIndex >= 0 ? units[currentIndex] : null
  const packageSlotLabels = getFrozenPackageSlotLabels(attempt.compositeAssessment)

  const formSections = sections.map((section: any) => {
    const sectionDefinition = compositeFormSectionRuntimeDefinition(section)
    const slot = slotsByKey.get(formSectionSlotKey(section.id))
    const sectionCompleted = completedSlot(formSectionSlotKey(section.id))
    const answers = section.items.map((item: any) => ({
      id: item.id,
      formItemId: item.id,
      type: item.formType,
      label: packageSlotLabels.get(item.position) ?? item.formLabel,
      placeholder: item.formPlaceholder,
      options: item.formOptions,
      required: item.required !== false,
      contextKey: item.contextKey ?? null,
      value: null,
    }))
    return {
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      position: section.position,
      contextSection: compositeSectionHasContext(section),
      definitionHash: slot?.sourceDefinitionIdentity.hash ?? formSectionIdentityHash(sectionDefinition),
      status: sectionCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      submittedAt: null,
      items: answers,
      answers,
    }
  })

  let currentItem: any = null
  if (currentUnit?.type === 'FORM_SECTION') {
    const section = formSections.find((candidate: any) => candidate.id === currentUnit.id)
    if (section) {
      await ensureCompositeFormAdmissionAtDelivery(attempt.id, compositeFormSectionRuntimeDefinition(currentUnit.section))
      currentItem = {
        id: section.id,
        type: 'FORM_SECTION',
        position: section.position,
        required: true,
        formSectionId: section.id,
        title: section.title,
        description: section.description,
        contextSection: section.contextSection,
        definitionHash: section.definitionHash,
        status: section.status,
        answers: section.items,
      }
    }
  } else if (currentUnit?.type === 'SCALE') {
    const item = currentUnit.item
    const child = attempt.scaleAssessments.find((candidate: any) => candidate.compositeItemId === item.id)
    const slot = slotsByKey.get(compositeItemSlotKey(item.id, 'SCALE'))
    if (!child?.id || !slot) throw compositeConflict('量表冻结运行时不可用，请重启测评')
    // Lazy current-unit: only the unfinished Scale loads its frozen runtime.
    const runtimeChild = await prisma.assessment.findUnique({
      where: { id: child.id },
      select: { id: true, runtimeSnapshotEncrypted: true, compiledRuntimeHash: true },
    })
    if (!runtimeChild?.runtimeSnapshotEncrypted) throw compositeConflict('量表冻结运行时不可用，请重启测评')
    try {
      const runtime = decryptFrozenScaleRuntimeSnapshot(runtimeChild.runtimeSnapshotEncrypted)
      if (
        runtime.instrumentKey !== item.scale?.code
        || runtime.instrumentVersion !== item.scale?.instrumentVersion
        || runtime.sourceDefinitionHash !== slot.sourceDefinitionIdentity.hash
        || runtime.compiledRuntime.compiledRuntimeHash !== runtimeChild.compiledRuntimeHash
      ) throw new Error('Scale runtime identity mismatch')
      await ensureScaleAdmissionAtDelivery(child.id)
      currentItem = {
        id: item.id,
        type: 'SCALE',
        position: item.position,
        required: item.required,
        scaleAssessmentId: child.id,
        definitionHash: runtime.legacyDefinitionHash,
        answers: [],
        scale: {
          id: item.scale.id,
          name: packageSlotLabels.get(item.position) ?? item.scale.name,
          instruction: item.scale.instruction ?? null,
          description: item.scale.description ?? null,
          instrumentVersion: item.scale.instrumentVersion,
          definition: runnerDefinition(runtime.definition),
        },
      }
    } catch (error) {
      if (isInstrumentFinalSubmitError(error)) throw error
      throw compositeConflict('量表冻结运行时不可用，请重启测评')
    }
  } else if (currentUnit?.type === 'COGNITIVE') {
    const child = attempt.cognitiveSessions.find((candidate: any) => candidate.compositeItemId === currentUnit.item.id)
    const slot = slotsByKey.get(compositeItemSlotKey(currentUnit.item.id, 'COGNITIVE'))
    if (!child || !slot || child.runtimeGeneration !== 'UNIFIED_V1' || child.compiledRuntimeHash !== (slot.sourceBinding as Record<string, unknown>).compiledRuntimeHash) {
      throw compositeConflict('认知任务冻结运行时不可用，请重启测评')
    }
    try {
      await ensureCognitiveAdmissionAtDelivery(child.id)
      currentItem = {
        id: currentUnit.item.id,
        type: 'COGNITIVE',
        position: currentUnit.item.position,
        required: currentUnit.item.required,
        cognitiveSession: cognitiveRunnerPayload(child, attempt.contextSnapshotHash),
      }
    } catch (error) {
      if (isInstrumentFinalSubmitError(error)) throw error
      throw compositeConflict('认知任务冻结运行时不可用，请重启测评')
    }
  }

  const definitionHash = computeSubmissionPayloadHash({
    assessmentId: attempt.compositeAssessment.id,
    items: attempt.compositeAssessment.items.map((item: any) => ({ id: item.id, type: item.type, position: item.position, formSectionId: item.formSectionId ?? null })),
    formSections: sections.map((section: any) => ({ id: section.id, position: section.position, itemIds: section.items.map((item: any) => item.id) })),
  })
  return {
    id: attempt.id,
    assessmentId: attempt.compositeAssessment.id,
    name: attempt.compositeAssessment.name,
    instruction: attempt.compositeAssessment.instruction,
    status: attempt.status,
    deliveryMode: attempt.deliveryMode,
    attemptEpoch: attempt.attemptEpoch,
    definitionHash,
    contextSnapshotHash: attempt.contextSnapshotHash ?? null,
    progress: attempt.status === 'COMPLETED' ? 100 : completeness.progress,
    completedItems,
    totalItems: units.length,
    currentIndex: attempt.status === 'COMPLETED' ? units.length : effectiveCurrentIndex,
    startedAt: attempt.startedAt,
    lastSavedAt: attempt.lastSavedAt,
    completedAt: attempt.completedAt,
    anonymousCode: attempt.anonymousCode,
    context: {
      status: attempt.contextSnapshotEncrypted && attempt.contextSnapshotHash ? 'frozen' as const : 'collecting' as const,
      frozenAt: attempt.contextFrozenAt?.toISOString?.() ?? null,
      snapshotHash: attempt.contextSnapshotHash ?? null,
    },
    items: attempt.compositeAssessment.items.map((item: any, index: number) => ({
      id: item.id,
      type: item.type,
      position: item.position,
      label: resolveCompositeItemLabel(item, packageSlotLabels),
      completed: completedItem(item),
      index,
    })),
    units: units.map((unit: any, index: number) => ({
      id: unit.id,
      type: unit.type,
      position: unit.position,
      required: unit.required,
      label: unit.type === 'FORM_SECTION' ? unit.section.title : resolveCompositeItemLabel(unit.item, packageSlotLabels),
      completed: unitCompleted(unit),
      index,
      ...(unit.type === 'FORM_SECTION' ? { formSectionId: unit.id } : { itemId: unit.id }),
    })),
    formSections,
    currentItem,
  }
}

const markCompositeItemCompleted = async (tx: Db, attemptId: string, increment: boolean) => {
  const current = await tx.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { status: true, completedItems: true, compositeAssessmentId: true },
  })
  if (!current || current.status !== 'IN_PROGRESS') return false
  const totalItems = await tx.compositeAssessmentItem.count({ where: { compositeAssessmentId: current.compositeAssessmentId } })
  const completedItems = increment
    ? Math.min(totalItems, current.completedItems + 1)
    : current.completedItems
  if (increment) {
    await tx.compositeAssessmentAttempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS' },
      data: {
        completedItems,
        progress: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100,
        lastSavedAt: new Date(),
      },
    })
  }
  return totalItems > 0 && completedItems >= totalItems
}

/**
 * Parent Attempt finalization and reanalysis are serialized on the Attempt
 * row. Child modules commit their own frozen result rows first; this check
 * only promotes the parent after it sees those committed rows. Package
 * analysis and its immutable snapshot are written before the parent status
 * changes, so any analysis/encryption/DB failure rolls completion back as one
 * transaction.
 */
const finalizeCompositeAttemptLegacyIfReady = async (attemptId: string) => withQuestionnaireCompletionTransaction(async (tx) => {
  await lockCompositeAttempt(tx, attemptId)
  const attempt = await loadAttemptForFinalization(tx, attemptId)
  const maps = attemptCompletedItemMaps(attempt)
  const completedItems = countAttemptCompletedItems(attempt, maps)
  const totalItems = attempt.deliveryMode === 'FINAL_ONLY'
    ? attempt.compositeAssessment.items.filter((item: any) => item.type !== 'FORM').length
      + (attempt.compositeAssessment.formSections ?? []).length
    : attempt.compositeAssessment.items.length
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

type CompositeCompletionCandidate = {
  id: string
  status: string
  deliveryMode: string
  progress: number
  completedItems: number
  attemptEpoch: number
  startedAt: Date
  completedAt: Date | null
  contextSnapshotHash: string | null
  compositeAssessment: {
    items: Array<{ id: string; type: string; required: boolean; contextKey: string | null }>
    formSections: Array<{ id: string }>
  }
  scaleAssessments: Array<{
    id: string
    compositeItemId: string | null
    status: string
    attemptEpoch: number
    submissionId: string | null
    submissionPayloadHash: string | null
  }>
  cognitiveSessions: Array<{
    id: string
    compositeItemId: string | null
    status: string
    attemptNo: number
    submissionId: string | null
    submissionPayloadHash: string | null
  }>
  formSectionAttempts: Array<{
    id: string
    sectionId: string
    status: string
    attemptEpoch: number
    submissionId: string | null
    submissionPayloadHash: string | null
  }>
}

const compositeCompletionCandidateSelect = {
  id: true,
  status: true,
  deliveryMode: true,
  progress: true,
  completedItems: true,
  attemptEpoch: true,
  startedAt: true,
  completedAt: true,
  contextSnapshotHash: true,
  compositeAssessment: {
    select: {
      items: { select: { id: true, type: true, required: true, contextKey: true } },
      formSections: { select: { id: true } },
    },
  },
  scaleAssessments: {
    select: { id: true, compositeItemId: true, status: true, attemptEpoch: true, submissionId: true, submissionPayloadHash: true },
  },
  cognitiveSessions: {
    select: { id: true, compositeItemId: true, status: true, attemptNo: true, submissionId: true, submissionPayloadHash: true },
  },
  formSectionAttempts: {
    select: { id: true, sectionId: true, status: true, attemptEpoch: true, submissionId: true, submissionPayloadHash: true },
  },
} as const

const loadCompositeCompletionCandidate = async (attemptId: string) => measureRequestPhase(
  'final_submit_db_query',
  () => prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: compositeCompletionCandidateSelect,
  }) as Promise<CompositeCompletionCandidate | null>,
)

const compositeCompletionCounts = (candidate: CompositeCompletionCandidate) => {
  const items = candidate.compositeAssessment.items.filter((item) => item.type !== 'FORM')
  const itemIds = new Set(items
    .map((item) => item.id))
  const completedItemIds = new Set([
    ...items
      .filter((item) => !item.required && !item.contextKey)
      .map((item) => item.id),
    ...candidate.scaleAssessments
      .filter((child) => itemIds.has(child.compositeItemId ?? '')
        && child.attemptEpoch === candidate.attemptEpoch
        && child.status === 'COMPLETED')
      .map((child) => child.compositeItemId as string),
    ...candidate.cognitiveSessions
      .filter((child) => itemIds.has(child.compositeItemId ?? '')
        && child.attemptNo === candidate.attemptEpoch
        && child.status === 'COMPLETED')
      .map((child) => child.compositeItemId as string),
  ])
  const sectionIds = new Set(candidate.compositeAssessment.formSections.map((section) => section.id))
  const completedSectionIds = new Set(candidate.formSectionAttempts
    .filter((section) => sectionIds.has(section.sectionId)
      && section.attemptEpoch === candidate.attemptEpoch
      && section.status === 'COMPLETED')
    .map((section) => section.sectionId))
  const totalItems = itemIds.size + sectionIds.size
  const completedItems = completedItemIds.size + completedSectionIds.size
  const progress = totalItems === 0 ? 100 : Math.min(100, Math.round((completedItems / totalItems) * 100))
  return { totalItems, completedItems, progress, ready: totalItems > 0 && completedItems >= totalItems }
}

const compositeCompletionFingerprint = (
  candidate: CompositeCompletionCandidate,
  packageInputFingerprint: string | null = null,
): string => computeSubmissionPayloadHash({
  attemptEpoch: candidate.attemptEpoch,
  contextSnapshotHash: candidate.contextSnapshotHash,
  packageInputFingerprint,
  scales: candidate.scaleAssessments
    .filter((child) => child.attemptEpoch === candidate.attemptEpoch)
    .map((child) => ({
      id: child.id,
      compositeItemId: child.compositeItemId,
      attemptEpoch: child.attemptEpoch,
      status: child.status,
      submissionId: child.submissionId,
      submissionPayloadHash: child.submissionPayloadHash,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
  cognitive: candidate.cognitiveSessions
    .filter((child) => child.attemptNo === candidate.attemptEpoch)
    .map((child) => ({
      id: child.id,
      compositeItemId: child.compositeItemId,
      attemptNo: child.attemptNo,
      status: child.status,
      submissionId: child.submissionId,
      submissionPayloadHash: child.submissionPayloadHash,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
  formSections: candidate.formSectionAttempts
    .filter((section) => section.attemptEpoch === candidate.attemptEpoch)
    .map((section) => ({
      id: section.id,
      sectionId: section.sectionId,
      attemptEpoch: section.attemptEpoch,
      status: section.status,
      submissionId: section.submissionId,
      submissionPayloadHash: section.submissionPayloadHash,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
})

const finalOnlyRetryBackoff = async (retry: number): Promise<void> => {
  const delayMs = Math.min(25, 5 * (2 ** retry))
  await measureRequestPhase('final_submit_retry_backoff', () => new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs)
  }))
}

const finalizeCompositeAttemptFinalOnlyIfReady = async (attemptId: string) => {
  for (let retry = 0; retry < 3; retry += 1) {
    const candidate = await loadCompositeCompletionCandidate(attemptId)
    if (!candidate) throw compositeNotFound('综合测评记录不存在')
    if (candidate.status === 'COMPLETED' || candidate.status !== 'IN_PROGRESS') {
      return { status: candidate.status, progress: candidate.progress, completedAt: candidate.completedAt }
    }

    const counts = compositeCompletionCounts(candidate)
    if (!counts.ready) {
      const progressResult = await withFinalOnlyCompletionTransaction(async (tx) => {
        await measureRequestPhase('final_submit_row_lock_wait', () => lockCompositeAttempt(tx, attemptId))
        const current = await tx.compositeAssessmentAttempt.findUnique({
          where: { id: attemptId },
          select: compositeCompletionCandidateSelect,
        }) as CompositeCompletionCandidate | null
        if (!current) throw compositeNotFound('综合测评记录不存在')
        if (current.status !== 'IN_PROGRESS') return { status: current.status, progress: current.progress, completedAt: current.completedAt }
        const currentCounts = compositeCompletionCounts(current)
        if (currentCounts.ready) return { needsPreparation: true as const }
        await tx.compositeAssessmentAttempt.update({
          where: { id: attemptId },
          data: { completedItems: currentCounts.completedItems, progress: currentCounts.progress, lastSavedAt: new Date() },
        })
        return { status: 'IN_PROGRESS', progress: currentCounts.progress, completedAt: null }
      })
      if (progressResult && 'needsPreparation' in progressResult) {
        if (retry < 2) await finalOnlyRetryBackoff(retry)
        continue
      }
      return progressResult
    }

    // Package analysis and encryption are CPU/crypto work and must not run
    // while the parent row is locked.
    const fullAttempt = await measureRequestPhase('final_submit_db_query', () => loadAttemptForFinalization(prisma, attemptId))
    const packageAnalysis = measureRequestPhaseSync(
      'final_submit_serialization',
      () => buildPackageAnalysisForAttempt(fullAttempt),
    )
    const payloadEncrypted = packageAnalysis
      ? await measureRequestPhase('final_submit_encryption', async () => encryptCognitivePayload(packageAnalysis.analysis))
      : undefined
    const expectedFingerprint = measureRequestPhaseSync(
      'final_submit_payload_hash',
      () => compositeCompletionFingerprint(candidate, packageAnalysis?.inputFingerprint ?? null),
    )

    const completionResult = await withFinalOnlyCompletionTransaction(async (tx) => {
      await measureRequestPhase('final_submit_row_lock_wait', () => lockCompositeAttempt(tx, attemptId))
      const current = await tx.compositeAssessmentAttempt.findUnique({
        where: { id: attemptId },
        select: compositeCompletionCandidateSelect,
      }) as CompositeCompletionCandidate | null
      if (!current) throw compositeNotFound('综合测评记录不存在')
      if (current.status === 'COMPLETED' || current.status !== 'IN_PROGRESS') {
        return { status: current.status, progress: current.progress, completedAt: current.completedAt }
      }
      const currentFingerprint = measureRequestPhaseSync(
        'final_submit_payload_hash',
        () => compositeCompletionFingerprint(current, packageAnalysis?.inputFingerprint ?? null),
      )
      if (currentFingerprint !== expectedFingerprint) {
        return { retry: true as const }
      }
      const currentCounts = compositeCompletionCounts(current)
      if (!currentCounts.ready) {
        await tx.compositeAssessmentAttempt.update({
          where: { id: attemptId },
          data: { completedItems: currentCounts.completedItems, progress: currentCounts.progress, lastSavedAt: new Date() },
        })
        return { status: 'IN_PROGRESS', progress: currentCounts.progress, completedAt: null }
      }
      if (packageAnalysis) {
        const persisted = await persistOrGetPackageAnalysisSnapshot(tx, {
          attemptId,
          analysis: packageAnalysis.analysis,
          inputFingerprint: packageAnalysis.inputFingerprint,
          generationReason: 'COMPLETION',
          payloadEncrypted,
        })
        if (!persisted.created && persisted.row.generationReason !== 'COMPLETION') {
          throw new Error('综合测评完成时的分析快照已被其他生成原因占用')
        }
      }
      const completedAt = new Date()
      await tx.compositeAssessmentAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedItems: currentCounts.completedItems,
          completedAt,
          totalTime: Math.max(0, completedAt.getTime() - new Date(current.startedAt).getTime()),
          lastSavedAt: completedAt,
        },
      })
      return { status: 'COMPLETED', progress: 100, completedAt }
    })
    if (completionResult && 'retry' in completionResult) {
      if (retry < 2) await finalOnlyRetryBackoff(retry)
      continue
    }
    return completionResult
  }

  const latest = await loadCompositeCompletionCandidate(attemptId)
  if (!latest) throw compositeNotFound('综合测评记录不存在')
  return { status: latest.status, progress: latest.progress, completedAt: latest.completedAt }
}

export const finalizeCompositeAttemptIfReady = async (attemptId: string) => {
  const route = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { deliveryMode: true, runtimeGeneration: true },
  })
  if (route?.runtimeGeneration === 'UNIFIED_V1') {
    const { finalizeCompositeAttemptUnifiedIfReady } = await import('../assessment-runtime/unified-aggregate-finalizer.service')
    return finalizeCompositeAttemptUnifiedIfReady(attemptId)
  }
  if (!route || route.deliveryMode !== 'FINAL_ONLY') return finalizeCompositeAttemptLegacyIfReady(attemptId)
  return finalizeCompositeAttemptFinalOnlyIfReady(attemptId)
}


const patchCompositeStateAfterFinalize = (
  state: Awaited<ReturnType<typeof getUnifiedCompositeAttemptState>>,
  finalized: { status: string; progress: number; completedAt: Date | string | null },
) => {
  // Only promote runner 终态 fields when finalize actually completed.
  if (finalized.status !== 'COMPLETED') {
    return {
      ...state,
      status: finalized.status,
      progress: finalized.progress,
      completedAt: finalized.completedAt,
    }
  }
  return {
    ...state,
    status: finalized.status,
    progress: 100,
    completedAt: finalized.completedAt,
    currentIndex: state.totalItems,
    currentItem: null,
    completedItems: state.totalItems,
  }
}

export const getAttemptState = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const runtime = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { userId: true, recoveryTokenHash: true, deliveryMode: true, runtimeGeneration: true },
  })
  if (!runtime) throw compositeNotFound('综合测评记录不存在')
  if (runtime.runtimeGeneration === 'UNIFIED_V1') {
    const state = await getUnifiedCompositeAttemptState(attemptId, context)
    if (state.status === 'IN_PROGRESS' && state.totalItems > 0 && state.completedItems >= state.totalItems) {
      // Reconcile-once: patch parent completion fields onto the first projection.
      const finalized = await finalizeCompositeAttemptIfReady(attemptId)
      if (!finalized) return state
      return patchCompositeStateAfterFinalize(state, finalized)
    }
    return state
  }

  const attempt = await findAttempt(attemptId, context)
  const readableFormAnswers = readContextFormAnswers(
    attempt.compositeAssessment.items
      .filter((item: any) => item.type === 'FORM')
      .map((item: any) => ({ id: item.id, contextKey: item.contextKey })),
    attempt.formAnswers,
  )
  const readableAttempt = { ...attempt, formAnswers: readableFormAnswers }
  const maps = attemptCompletedItemMaps(readableAttempt)
  const { scaleMap, cognitiveMap, formMap, sectionMap } = maps
  const finalOnly = attempt.deliveryMode === 'FINAL_ONLY'
  const completed = (item: any) => isAttemptItemCompleted(item, maps, finalOnly)
  const completedItems = countAttemptCompletedItems(attempt, maps)
  const sections = (attempt.compositeAssessment.formSections ?? []).slice().sort((left: any, right: any) => left.position - right.position)
  const units = finalOnly
    ? [
        ...attempt.compositeAssessment.items
          .filter((item: any) => item.type !== 'FORM')
          .map((item: any) => ({ id: item.id, type: item.type, position: item.position, required: item.required, item })),
        ...sections.map((section: any) => ({ id: section.id, type: 'FORM_SECTION', position: section.position, required: true, section })),
      ].sort((left: any, right: any) => left.position - right.position)
    : attempt.compositeAssessment.items.map((item: any) => ({ id: item.id, type: item.type, position: item.position, required: item.required, item }))
  const currentIndex = units.findIndex((unit: any) => unit.type === 'FORM_SECTION'
    ? sectionMap.get(unit.id)?.status !== 'COMPLETED'
    : !completed(unit.item))
  const currentUnit = currentIndex >= 0 ? units[currentIndex] : null
  const current = currentUnit?.item ?? null
  const packageSlotLabels = getFrozenPackageSlotLabels(attempt.compositeAssessment)
  let currentItem: any = null
  if (currentUnit?.type === 'FORM_SECTION') {
    const section = currentUnit.section
    const sectionAnswers = section.items.map((item: any) => ({
      id: item.id,
      formItemId: item.id,
      type: item.formType,
      label: packageSlotLabels.get(item.position) ?? item.formLabel,
      placeholder: item.formPlaceholder,
      options: item.formOptions,
      required: item.required,
      contextKey: item.contextKey ?? null,
      value: formMap.get(item.id)?.value ?? null,
    }))
    currentItem = {
      id: section.id,
      type: 'FORM_SECTION',
      position: section.position,
      required: true,
      formSectionId: section.id,
      title: section.title,
      description: section.description ?? null,
      contextSection: compositeSectionHasContext(section),
      definitionHash: finalOnly && attempt.runtimeGeneration === 'UNIFIED_V1'
        ? formSectionIdentityHash(compositeFormSectionRuntimeDefinition(section))
        : computeSubmissionPayloadHash({
            sectionId: section.id,
            title: section.title,
            description: section.description ?? null,
            position: section.position,
            contextSection: compositeSectionHasContext(section),
            items: section.items.map((item: any) => ({
              id: item.id,
              formType: item.formType,
              formLabel: item.formLabel,
              placeholder: item.formPlaceholder ?? null,
              required: item.required !== false,
              formOptions: item.formOptions,
              contextKey: item.contextKey ?? null,
              position: item.position,
              formSectionPosition: item.formSectionPosition ?? null,
            })),
          }),
      status: sectionMap.get(section.id)?.status ?? 'IN_PROGRESS',
      answers: sectionAnswers,
    }
  } else if (current?.type === 'FORM') {
    currentItem = { id: current.id, type: current.type, position: current.position, required: current.required, form: { type: current.formType, label: packageSlotLabels.get(current.position) ?? current.formLabel, placeholder: current.formPlaceholder, options: current.formOptions, contextKey: current.contextKey ?? null }, value: formMap.get(current.id)?.value ?? null }
  } else if (current?.type === 'SCALE') {
    const assessment = scaleMap.get(current.id)
    const scale = current.scale
      ? { ...current.scale, name: packageSlotLabels.get(current.position) ?? current.scale.name }
      : current.scale
    let runnerScale = scale
    let definitionHash: string | undefined
    if (scale) {
      try {
        definitionHash = hashScaleDefinition(scaleDefinitionFromRecord(scale))
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
      definitionHash,
      ...(decodedAnswers.decryptError ? { decryptError: true } : {}),
    }
  } else if (current?.type === 'COGNITIVE') {
    const session = cognitiveMap.get(current.id)
    currentItem = { id: current.id, type: current.type, position: current.position, required: current.required, cognitiveSession: session ? cognitiveRunnerPayload(session, attempt.contextSnapshotHash) : null }
  }
  return {
    id: attempt.id,
    assessmentId: attempt.compositeAssessment.id,
    name: attempt.compositeAssessment.name,
    instruction: attempt.compositeAssessment.instruction,
    status: attempt.status,
    deliveryMode: attempt.deliveryMode,
    attemptEpoch: attempt.attemptEpoch,
    definitionHash: computeSubmissionPayloadHash({
      assessmentId: attempt.compositeAssessment.id,
      items: attempt.compositeAssessment.items.map((item: any) => ({ id: item.id, type: item.type, position: item.position, formSectionId: item.formSectionId ?? null })),
      formSections: sections.map((section: any) => ({ id: section.id, position: section.position, itemIds: section.items.map((item: any) => item.id) })),
    }),
    contextSnapshotHash: attempt.contextSnapshotHash ?? null,
    progress: attempt.progress,
    completedItems,
    totalItems: units.length,
    currentIndex: currentIndex < 0 ? units.length : currentIndex,
    startedAt: attempt.startedAt,
    lastSavedAt: attempt.lastSavedAt,
    completedAt: attempt.completedAt,
    anonymousCode: attempt.anonymousCode,
    context: {
      status: attempt.contextSnapshotEncrypted && attempt.contextSnapshotHash ? 'frozen' as const : 'collecting' as const,
      frozenAt: attempt.contextFrozenAt?.toISOString?.() ?? null,
      snapshotHash: attempt.contextSnapshotHash ?? null,
    },
    items: attempt.compositeAssessment.items.map((item: any, index: number) => ({ id: item.id, type: item.type, position: item.position, label: resolveCompositeItemLabel(item, packageSlotLabels), completed: completed(item), index })),
    units: units.map((unit: any, index: number) => ({
      id: unit.id,
      type: unit.type,
      position: unit.position,
      required: unit.required,
      label: unit.type === 'FORM_SECTION' ? unit.section.title : resolveCompositeItemLabel(unit.item, packageSlotLabels),
      completed: unit.type === 'FORM_SECTION' ? sectionMap.get(unit.id)?.status === 'COMPLETED' : completed(unit.item),
      index,
      ...(unit.type === 'FORM_SECTION' ? { formSectionId: unit.id } : { itemId: unit.id }),
    })),
    formSections: sections.map((section: any) => ({
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      position: section.position,
      contextSection: compositeSectionHasContext(section),
      definitionHash: finalOnly && attempt.runtimeGeneration === 'UNIFIED_V1'
        ? formSectionIdentityHash(compositeFormSectionRuntimeDefinition(section))
        : computeSubmissionPayloadHash({
            sectionId: section.id,
            title: section.title,
            description: section.description ?? null,
            position: section.position,
            contextSection: compositeSectionHasContext(section),
            items: section.items.map((item: any) => ({ id: item.id, formType: item.formType, formLabel: item.formLabel, placeholder: item.formPlaceholder ?? null, required: item.required !== false, formOptions: item.formOptions, contextKey: item.contextKey ?? null, position: item.position, formSectionPosition: item.formSectionPosition ?? null })),
          }),
      status: sectionMap.get(section.id)?.status ?? 'IN_PROGRESS',
      submittedAt: sectionMap.get(section.id)?.submittedAt ?? null,
      items: section.items.map((item: any) => ({
        id: item.id,
        type: item.formType,
        label: packageSlotLabels.get(item.position) ?? item.formLabel,
        placeholder: item.formPlaceholder,
        options: item.formOptions,
        required: item.required !== false,
        contextKey: item.contextKey ?? null,
        value: formMap.get(item.id)?.value ?? null,
      })),
    })),
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
  const shouldFinalize = await prisma.$transaction(async (tx: Db) => {
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
    const existing = await tx.compositeFormAnswer.findUnique({
      where: { attemptId_itemId: { attemptId, itemId } },
      select: { completed: true },
    })
    const storedValue = writeContextFormAnswer(item.contextKey, value)
    await tx.compositeFormAnswer.upsert({ where: { attemptId_itemId: { attemptId, itemId } }, create: { attemptId, itemId, value: storedValue, completed: true }, update: { value: storedValue, completed: true } })
    return markCompositeItemCompleted(tx, attemptId, !existing?.completed)
  })
  if (shouldFinalize) await finalizeCompositeAttemptIfReady(attempt.id)
  return { saved: true, finalized: shouldFinalize }
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
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true, contextSnapshotEncrypted: true, contextSnapshotHash: true },
    })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
    if (!current.contextSnapshotEncrypted || !current.contextSnapshotHash) {
      await freezeCompositeAttemptContext(tx, attemptId)
    }
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
  return { saved: true }
}

export const completeScale = async (attemptId: string, itemId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const { attempt, item } = await getOwnedChild(attemptId, itemId, context)
  if (item.type !== 'SCALE') throw compositeBadRequest('当前模块不是量表')
  const assessment = attempt.scaleAssessments.find((candidate: any) => candidate.compositeItemId === itemId)
  if (!assessment) throw compositeNotFound('量表测评记录不存在')
  const result = await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const locked = await lockScaleAssessment(tx, assessment.id)
    if (locked.status === 'COMPLETED') {
      return { didComplete: false, shouldFinalize: await markCompositeItemCompleted(tx, attemptId, false) }
    }
    if (locked.status !== 'IN_PROGRESS') throw compositeBadRequest('量表模块已结束')
    if (!item.scale?.definition) throw compositeBadRequest('量表尚未安装有效的 v2 definition')
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true, contextSnapshotEncrypted: true, contextSnapshotHash: true },
    })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
    const contextSnapshot = current.contextSnapshotEncrypted && current.contextSnapshotHash
      ? readCompositeAttemptContext(current)
      : await freezeCompositeAttemptContext(tx, attemptId)
    if (('decryptError' in contextSnapshot && contextSnapshot.decryptError) || !contextSnapshot.context || !contextSnapshot.hash) {
      throw compositeBadRequest('人口学上下文无法读取，请联系管理员')
    }
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
    return { didComplete: true, shouldFinalize: await markCompositeItemCompleted(tx, attemptId, true) }
  })
  if (result.shouldFinalize) await finalizeCompositeAttemptIfReady(attempt.id)
  return { completed: true, finalized: result.shouldFinalize }
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
