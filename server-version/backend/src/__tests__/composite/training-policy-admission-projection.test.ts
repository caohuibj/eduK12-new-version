import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const { db, state, inserted } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(), $queryRaw: vi.fn(), $queryRawUnsafe: vi.fn(),
    compositeAssessment: { findUnique: vi.fn() }, courseStudent: { findFirst: vi.fn() },
    compositeAssessmentAttempt: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
  state: { publication: {} as Record<string, any>, locked: {} as Record<string, any>, order: [] as string[] },
  inserted: new Error('fixture stops at the atomic insert boundary'),
}))
vi.mock('../../config/database', () => ({ prisma: db }))
import { startUserAttempt } from '../../modules/composite/composite.service'

// Generated Prisma model metadata, rather than an invented fixture field list.
const definitionFields = new Set(Prisma.dmmf.datamodel.models.find(model => model.name === 'CompositeAssessment')!.fields.map(field => field.name))
const immediate = { schemaVersion: 1, mode: 'IMMEDIATE' }
const retention = { schemaVersion: 1, checkpoint: { enabled: true, ttlHours: 6 }, localCognitive: null }
function configure(feedback: boolean, persistence: boolean) {
  Object.assign(state.publication, {
    trainingFeedbackPolicy: feedback ? immediate : null,
    trainingFeedbackPolicyHash: feedback ? canonicalHash(immediate) : null,
    trainingPersistencePolicy: persistence ? retention : null,
    trainingPersistencePolicyHash: persistence ? canonicalHash(retention) : null,
  })
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64)); vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
  state.order = []; state.locked = {}
  state.publication = {
    id: 'publication', status: 'PUBLISHED', productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE',
    publicEnabled: true, opensAt: null, expiresAt: null, publishedAt: new Date('2026-10-01T00:00:00Z'),
    createdBy: 'teacher', questionnaireCourses: [{ courseId: 'training' }], maxAttempts: 2,
    trainingFlowDigest: null, trainingVariantDigest: null, trainingFlowDraft: null, trainingFlowFrozen: null,
    trainingVariantDraft: null, trainingVariantFrozen: null, reportPackageKey: null, analysisProtocolKey: null,
    items: [], formSections: [], trainingTimingPolicy: null,
  }
  configure(true, false)
  db.$transaction.mockImplementation(async callback => callback(db))
  db.$queryRawUnsafe.mockImplementation(async () => { state.order.push('publication-lock'); return [{ id: 'publication' }] })
  db.$queryRaw.mockImplementation(async (query: TemplateStringsArray) => {
    if (query.join('').includes('FOR SHARE OF c,u')) { state.order.push('course-lock'); return [{ id: 'training', endedAt: null }] }
    return [{ id: 'publication' }]
  })
  db.compositeAssessment.findUnique.mockImplementation(async ({ select }) => {
    if (!select) return { ...state.publication }
    state.order.push(select.questionnaireCourses ? 'configured-select' : 'header-select')
    const row = { ...state.publication, ...state.locked }
    const result: Record<string, unknown> = {}
    for (const field of Object.keys(select)) {
      if (!definitionFields.has(field)) throw new Error(`Unknown CompositeAssessment select field: ${field}`)
      result[field] = row[field]
    }
    return result
  })
  db.courseStudent.findFirst.mockResolvedValue({ courseId: 'training', status: 'ACTIVE' })
  db.compositeAssessmentAttempt.findFirst.mockResolvedValue(null)
  db.compositeAssessmentAttempt.count.mockResolvedValue(0)
  db.compositeAssessmentAttempt.create.mockImplementation(async () => { state.order.push('insert'); throw inserted })
})
afterEach(() => vi.unstubAllEnvs())

describe('Training configured-policy admission projection (mock DB, actual start service)', () => {
  it.each([
    ['feedback only', true, false], ['persistence only', false, true], ['both', true, true], ['legacy absent policy', false, false],
  ] as const)('admits %s with schema-shaped publication and default FINAL_ONLY', async (_name, feedback, persistence) => {
    configure(feedback, persistence)
    expect(definitionFields.has('deliveryMode')).toBe(false)
    expect(state.publication).not.toHaveProperty('deliveryMode')
    await expect(startUserAttempt('student', 'publication')).rejects.toBe(inserted)
    const data = db.compositeAssessmentAttempt.create.mock.calls[0][0].data
    expect(data).toMatchObject({ deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', userId: 'student', deliveryCourseId: 'training', attemptEpoch: 1 })
    expect(Boolean(data.trainingFeedbackSnapshot)).toBe(feedback)
    expect(Boolean(data.trainingPersistenceSnapshot)).toBe(persistence)
    if (feedback) {
      expect(data.trainingFeedbackSnapshot).toMatchObject({ attemptId: data.id, compositeId: 'publication', courseId: 'training', accessTokenId: null, roundId: null, policy: immediate })
      expect(data.trainingFeedbackSnapshotHash).toBe(canonicalHash(data.trainingFeedbackSnapshot))
    }
    if (persistence) expect(data.trainingPersistenceSnapshotHash).toBe(canonicalHash(data.trainingPersistenceSnapshot))
    const selected = db.compositeAssessment.findUnique.mock.calls.filter(([args]) => args.select)
    expect(selected).toHaveLength(feedback || persistence ? 2 : 1)
    for (const [args] of selected) expect(args.select).not.toHaveProperty('deliveryMode')
    expect(state.order).toEqual(feedback || persistence
      ? ['publication-lock', 'header-select', 'configured-select', 'course-lock', 'insert']
      : ['publication-lock', 'header-select', 'insert'])
  })
  it.each([[true, false], [false, true], [true, true]])('retains explicit runtime LEGACY rejection (feedback=%s persistence=%s)', async (feedback, persistence) => {
    configure(feedback, persistence)
    // Legacy is a runtime-context override, never a selected publication column.
    state.publication.deliveryMode = 'LEGACY'
    await expect(startUserAttempt('student', 'publication')).rejects.toMatchObject({ statusCode: 400, message: '此投放不支持 Training 冻结策略' })
    expect(db.compositeAssessmentAttempt.create).not.toHaveBeenCalled()
  })
  it.each([
    ['archived after initial read', { status: 'ARCHIVED' }, 403],
    ['not open after initial read', { opensAt: new Date('2099-01-01') }, 400],
    ['expired after initial read', { expiresAt: new Date('2000-01-01') }, 400],
    ['course detached after initial read', { questionnaireCourses: [] }, 400],
  ] as const)('preserves the locked %s check', async (_name, locked, statusCode) => {
    state.locked = locked
    await expect(startUserAttempt('student', 'publication')).rejects.toMatchObject({ statusCode })
    expect(db.compositeAssessmentAttempt.create).not.toHaveBeenCalled()
  })
  it('retains Training course/author lock and enrollment revalidation', async () => {
    db.$queryRaw.mockImplementation(async (query: TemplateStringsArray) => query.join('').includes('FOR SHARE OF c,u') ? [] : [{ id: 'publication' }])
    await expect(startUserAttempt('student', 'publication')).rejects.toMatchObject({ statusCode: 403, message: 'Training 课程已关闭或投放权限无效' })
    expect(db.compositeAssessmentAttempt.create).not.toHaveBeenCalled()
  })
  it('rejects enrollment lost inside admission before insertion', async () => {
    db.courseStudent.findFirst.mockResolvedValueOnce({ courseId: 'training', status: 'ACTIVE' }).mockResolvedValueOnce(null)
    await expect(startUserAttempt('student', 'publication')).rejects.toMatchObject({ statusCode: 403, message: '不是问卷投放课程的有效学生' })
    expect(db.compositeAssessmentAttempt.create).not.toHaveBeenCalled()
  })
})
