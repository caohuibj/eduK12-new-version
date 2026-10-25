import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import type { TrainingPersistencePolicy } from '../../modules/composite/training-persistence.policy'

const { db, state, inserted } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(), $queryRaw: vi.fn(), $queryRawUnsafe: vi.fn(),
    compositeAssessment: { findUnique: vi.fn() }, courseStudent: { findFirst: vi.fn() },
    compositeAssessmentAttempt: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
  state: { publication: {} as Record<string, any>, runtimeOverrides: {} as Record<string, unknown>, locked: {} as Record<string, any>, order: [] as string[] },
  inserted: new Error('fixture stops at the atomic insert boundary'),
}))
vi.mock('../../config/database', () => ({ prisma: db }))
import { startUserAttempt } from '../../modules/composite/composite.service'

// Generated Prisma model metadata, rather than an invented fixture field list.
const definitionFields = new Set(Prisma.dmmf.datamodel.models.find(model => model.name === 'CompositeAssessment')!.fields.map(field => field.name))
function configure(checkpoint: boolean, localCognitive: boolean) {
  const policy: TrainingPersistencePolicy | null = checkpoint || localCognitive ? {
    schemaVersion: 1,
    checkpoint: checkpoint ? { enabled: true, ttlHours: 6 } : null,
    localCognitive: localCognitive ? { enabled: true, ttlHours: 12 } : null,
  } : null
  Object.assign(state.publication, {
    trainingPersistencePolicy: policy,
    trainingPersistencePolicyHash: policy ? canonicalHash(policy) : null,
  })
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64)); vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
  state.order = []; state.locked = {}; state.runtimeOverrides = {}
  state.publication = {
    id: 'publication', status: 'PUBLISHED', productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE',
    publicEnabled: true, opensAt: null, expiresAt: null, publishedAt: new Date('2026-10-01T00:00:00Z'),
    createdBy: 'teacher', questionnaireCourses: [{ courseId: 'training' }], maxAttempts: 2,
    trainingFlowDigest: null, trainingVariantDigest: null, trainingFlowDraft: null, trainingFlowFrozen: null,
    trainingVariantDraft: null, trainingVariantFrozen: null, reportPackageKey: null, analysisProtocolKey: null,
    items: [], formSections: [], trainingTimingPolicy: null,
    // Isolate persistence modes while retaining the integrated shared header.
    trainingFeedbackPolicy: null, trainingFeedbackPolicyHash: null,
  }
  configure(true, false)
  db.$transaction.mockImplementation(async callback => callback(db))
  db.$queryRawUnsafe.mockImplementation(async () => { state.order.push('publication-lock'); return [{ id: 'publication' }] })
  db.$queryRaw.mockImplementation(async (query: TemplateStringsArray) => {
    if (query.join('').includes('FOR SHARE OF c,u')) { state.order.push('course-lock'); return [{ id: 'training', endedAt: null }] }
    return [{ id: 'publication' }]
  })
  db.compositeAssessment.findUnique.mockImplementation(async ({ select }) => {
    if (!select) return { ...state.publication, ...state.runtimeOverrides }
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

describe('C23 persistence admission projection (schema-aware mock DB, actual start service)', () => {
  it.each([
    ['checkpoint only', true, false], ['local cognitive only', false, true], ['both', true, true], ['policy off', false, false],
  ] as const)('admits %s with schema-shaped publication and default FINAL_ONLY', async (_name, checkpoint, localCognitive) => {
    configure(checkpoint, localCognitive)
    expect(definitionFields.has('deliveryMode')).toBe(false)
    expect(state.publication).not.toHaveProperty('deliveryMode')
    await expect(startUserAttempt('student', 'publication')).rejects.toBe(inserted)
    const data = db.compositeAssessmentAttempt.create.mock.calls[0][0].data
    expect(data).toMatchObject({ deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', userId: 'student', deliveryCourseId: 'training', attemptEpoch: 1 })
    const enabled = checkpoint || localCognitive
    expect(Boolean(data.trainingPersistenceSnapshot)).toBe(enabled)
    if (enabled) {
      const snapshot = data.trainingPersistenceSnapshot
      expect(snapshot).toMatchObject({
        attemptId: data.id, attemptEpoch: 1, compositeId: 'publication', courseId: 'training', roundId: null,
        frozenCutoff: null, policy: state.publication.trainingPersistencePolicy,
        policyHash: canonicalHash(state.publication.trainingPersistencePolicy),
        publicationIdentity: { compositeId: 'publication', courseId: 'training', publishedAt: '2026-10-01T00:00:00.000Z' },
      })
      expect(snapshot.publicationHash).toBe(canonicalHash(snapshot.publicationIdentity))
      expect(data.trainingPersistenceSnapshotHash).toBe(canonicalHash(snapshot))
    } else {
      expect(data).not.toHaveProperty('trainingPersistenceSnapshot')
      expect(data).not.toHaveProperty('trainingPersistenceSnapshotHash')
    }
    const selected = db.compositeAssessment.findUnique.mock.calls.filter(([args]) => args.select)
    expect(selected).toHaveLength(enabled ? 2 : 1)
    for (const [args] of selected) expect(args.select).not.toHaveProperty('deliveryMode')
    expect(Object.keys(selected[0][0].select).sort()).toEqual([
      'status', 'publicEnabled', 'opensAt', 'expiresAt', 'trainingPersistencePolicy', 'trainingPersistencePolicyHash',
      'trainingFeedbackPolicy', 'trainingFeedbackPolicyHash', 'trainingContentSnapshot', 'trainingContentSnapshotHash',
    ].sort())
    if (!enabled) expect(db.$queryRaw.mock.calls.some(([query]) => query.join('').includes('FOR SHARE OF c,u'))).toBe(false)
    expect(state.order).toEqual(enabled
      ? ['publication-lock', 'header-select', 'configured-select', 'course-lock', 'insert']
      : ['publication-lock', 'header-select', 'insert'])
  })
  it.each([[true, false], [false, true], [true, true]])('retains explicit runtime LEGACY rejection (checkpoint=%s localCognitive=%s)', async (checkpoint, localCognitive) => {
    configure(checkpoint, localCognitive)
    // Legacy is a runtime-context override, never a selected publication column.
    state.runtimeOverrides = { deliveryMode: 'LEGACY' }
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
