import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

const { db } = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    compositeAssessmentAttempt: { findUnique: vi.fn() },
    compositeAssessmentAccessToken: { findUnique: vi.fn() },
    compositeAssessment: { findUnique: vi.fn() },
  },
}))
vi.mock('../../config/database', () => ({ prisma: db }))

import { restartPublicAttempt } from '../../modules/composite/composite.service'
import { AssessmentStartBusyError } from '../../modules/composite/start-transient'
import { hashRecoveryToken } from '../../services/anonymousAccess'

const text = (q: unknown): string => {
  const query = q as { strings?: ArrayLike<string> }
  return Array.from(query.strings ?? (q as string)).join('')
}

const p2028 = () =>
  new Prisma.PrismaClientKnownRequestError(
    'Transaction API error: Unable to start a transaction in the given time.',
    { code: 'P2028', clientVersion: '5.22.0' },
  )

describe('restartPublicAttempt transient mapping (anonymous restart)', () => {
  const recoveryToken = 'test-recovery-token'
  const recoveryTokenHash = hashRecoveryToken(recoveryToken)
  const attempt = {
    id: 'attempt-1',
    userId: null,
    recoveryTokenHash,
    accessTokenId: 'token-1',
    participantKey: 'pk-1',
    anonymousCode: 'CODE-1',
    compositeAssessmentId: 'composite-1',
  }
  const composite = {
    id: 'composite-1',
    status: 'PUBLISHED',
    publicEnabled: true,
    items: [],
    trainingVariantFrozen: null,
    trainingFlowFrozen: null,
    maxAttempts: 1,
  }

  beforeEach(() => {
    vi.resetAllMocks()
    db.compositeAssessmentAttempt.findUnique.mockResolvedValue(attempt)
    db.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
    })
    db.compositeAssessment.findUnique.mockResolvedValue(composite)
    // No study binding and no accepted whole questionnaire: both raw reads
    // return no rows, so the restart reaches its transaction.
    db.$queryRaw.mockImplementation(() => Promise.resolve([]))
  })

  it('maps a P2028 pool-wait inside the restart transaction to retryable 503', async () => {
    db.$transaction.mockRejectedValue(p2028())
    await expect(
      restartPublicAttempt(attempt.id, recoveryTokenHash),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AssessmentStartBusyError &&
        err.code === 'ASSESSMENT_START_BUSY' &&
        err.statusCode === 503 &&
        err.retryAfterSeconds === 1
      )
    })
  })

  it('maps a P2024 pool timeout inside the restart transaction to retryable 503', async () => {
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Timed out fetching a new connection', {
        code: 'P2024',
        clientVersion: '5.22.0',
      }),
    )
    await expect(
      restartPublicAttempt(attempt.id, recoveryTokenHash),
    ).rejects.toBeInstanceOf(AssessmentStartBusyError)
  })

  it('lets non-transient errors pass through unmapped', async () => {
    db.$transaction.mockRejectedValue(new Error('boom'))
    await expect(
      restartPublicAttempt(attempt.id, recoveryTokenHash),
    ).rejects.toThrow('boom')
  })

  it('keeps the study-bound 409 before the transaction (no transaction opened)', async () => {
    db.$queryRaw.mockImplementation((q: unknown) =>
      Promise.resolve(
        text(q).includes('FROM anonymous_study_attempts') ? [{ id: attempt.id }] : [],
      ),
    )
    await expect(
      restartPublicAttempt(attempt.id, recoveryTokenHash),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
