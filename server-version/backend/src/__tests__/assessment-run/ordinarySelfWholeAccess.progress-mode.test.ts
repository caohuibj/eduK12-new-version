import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import {
  ordinarySelfWholeAccessQuery,
  readOrdinarySelfWholeProgress,
  resetOrdinarySelfWholeRunProductCacheForTests,
} from '../../modules/assessment-run/ordinarySelfWholeAccess'

const sqlText = (q: any): string => (Array.isArray(q?.strings) ? q.strings.join('?') : String(q?.sql ?? q))

const makeFastRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'attempt-1',
  epoch: 1,
  receiptOnly: false,
  parentStatus: 'IN_PROGRESS',
  slotHash: 'a'.repeat(64),
  assignmentRef: 'assign-1',
  jobSlot: 'a'.repeat(64),
  wholeSubmissionId: 'whole-sub-1',
  payloadHash: 'b'.repeat(64),
  acceptedAt: new Date('2026-11-23T00:00:00.000Z'),
  jobStatus: 'PENDING',
  executionStatus: 'STARTED',
  assignmentStatus: 'STARTED',
  consentId: null,
  organizationId: 'org-1',
  runId: 'run-1',
  isSelfExec: true,
  execAssignmentId: 'assign-1',
  needsStopCheck: false,
  ...overrides,
})

describe('ordinarySelfWholeAccessQuery progress fast path', () => {
  beforeEach(() => {
    resetOrdinarySelfWholeRunProductCacheForTests()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    resetOrdinarySelfWholeRunProductCacheForTests()
    vi.restoreAllMocks()
  })

  it('omits TOAST training_content_binding join predicates on read-only progress polls while retaining emergency-stop and form-section guards', () => {
    const progressSql = sqlText(ordinarySelfWholeAccessQuery('SCHOOL', 'user-1', { attemptId: 'attempt-1', mode: 'progress' }))
    expect(progressSql).toContain('assessment_run_executions')
    expect(progressSql).toContain('relational_assessment_assignments')
    expect(progressSql).toContain('composite_form_sections')
    expect(progressSql).toContain('scale_library_emergency_stops')
    expect(progressSql).toContain('p.training_content_binding_hash IS NOT NULL')
    expect(progressSql).not.toContain("p.training_content_binding#>>'{educationComposition,manifestHash}'")

    const fullSql = sqlText(ordinarySelfWholeAccessQuery('TEACHER', 'user-1', { attemptId: 'attempt-1' }))
    expect(fullSql).toContain("p.training_content_binding#>>'{educationComposition,manifestHash}'")
    expect(fullSql).toContain('scale_library_emergency_stops')
  })

  it('uses the 4-table PK/UK fast path and caches immutable run product on root prisma for steady accepted polls', async () => {
    const queryRaw = vi.spyOn(prisma, '$queryRaw')
      .mockResolvedValueOnce([makeFastRow()] as any)
      .mockResolvedValueOnce([{ hasSchool: true, hasTeacher: false }] as any)
      .mockResolvedValueOnce([makeFastRow({ parentStatus: 'COMPLETED', executionStatus: 'COMPLETED', assignmentStatus: 'COMPLETED', jobStatus: 'READY' })] as any)

    const first = await readOrdinarySelfWholeProgress(prisma, 'SCHOOL', 'user-1', 'attempt-1')
    expect(first).toEqual({
      kind: 'progress',
      id: 'attempt-1',
      epoch: 1,
      receiptOnly: false,
      parentStatus: 'IN_PROGRESS',
      wholeSubmissionId: 'whole-sub-1',
      jobStatus: 'PENDING',
      executionStatus: 'STARTED',
    })
    expect(queryRaw).toHaveBeenCalledTimes(2)

    // Second poll for the same (orgId, runId) hits immutableRunProductCache -> only 1 SQL query
    const second = await readOrdinarySelfWholeProgress(prisma, 'SCHOOL', 'user-1', 'attempt-1')
    expect(second).toMatchObject({ kind: 'progress', parentStatus: 'COMPLETED', jobStatus: 'READY', executionStatus: 'COMPLETED' })
    expect(queryRaw).toHaveBeenCalledTimes(3)
  })

  it('rejects cross-product access on the fast path without falling back', async () => {
    const db = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([makeFastRow()])
        .mockResolvedValueOnce([{ hasSchool: true, hasTeacher: false }]),
    }
    const result = await readOrdinarySelfWholeProgress(db as any, 'TEACHER', 'user-1', 'attempt-1')
    expect(result).toBeNull()
    expect(db.$queryRaw).toHaveBeenCalledTimes(2)
  })

  it('falls back to full ordinarySelfWholeAccess on pre-submit, consent-bound, transitional, or Teacher emergency-stop states', async () => {
    for (const overrides of [
      { wholeSubmissionId: null },
      { consentId: 'consent-1' },
      { executionStatus: 'STARTED', parentStatus: 'COMPLETED', assignmentStatus: 'COMPLETED' },
      { needsStopCheck: true },
    ]) {
      const db = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([makeFastRow(overrides)])
          .mockResolvedValueOnce([]),
      }
      const result = await readOrdinarySelfWholeProgress(db as any, 'TEACHER', 'user-1', 'attempt-1')
      expect(result).toBeNull()
      expect(db.$queryRaw).toHaveBeenCalledTimes(2)
      expect(sqlText(db.$queryRaw.mock.calls[1][0])).toContain('target_track AS MATERIALIZED')
    }
  })
})
