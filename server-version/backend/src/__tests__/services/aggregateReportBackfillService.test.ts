import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { encryptField } from '../../utils/encryption'
import { backfillAggregateReports } from '../../services/aggregateReportBackfillService'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

describe('aggregate report backfill', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('encrypts plaintext rows and clears the legacy column', async () => {
    const report = { reportDefinitionVersion: 'collection-only-v2' }
    const update = vi.fn().mockResolvedValue({})
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ id: 'plain', aggregateReport: report, aggregateReportEncrypted: null }])
      .mockResolvedValueOnce([])
    const db = { questionnaireAssessment: { findMany, update } } as any

    await expect(backfillAggregateReports(db)).resolves.toEqual({ processed: 1, remaining: 0 })
    expect(update).toHaveBeenCalledWith({
      where: { id: 'plain' },
      data: { aggregateReportEncrypted: expect.any(String), aggregateReport: Prisma.DbNull },
    })
  })

  it('verifies an existing ciphertext before clearing a dual-written row', async () => {
    const encrypted = encryptField({ reportDefinitionVersion: 'collection-only-v2' })
    const update = vi.fn().mockResolvedValue({})
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ id: 'dual', aggregateReport: { stale: true }, aggregateReportEncrypted: encrypted }])
      .mockResolvedValueOnce([])
    const db = { questionnaireAssessment: { findMany, update } } as any

    await expect(backfillAggregateReports(db)).resolves.toEqual({ processed: 1, remaining: 0 })
    expect(update).toHaveBeenCalledWith({
      where: { id: 'dual' },
      data: { aggregateReportEncrypted: encrypted, aggregateReport: Prisma.DbNull },
    })
  })

  it('fails closed on invalid existing ciphertext', async () => {
    const update = vi.fn()
    const db = {
      questionnaireAssessment: {
        findMany: vi.fn().mockResolvedValueOnce([{ id: 'bad', aggregateReport: { stale: true }, aggregateReportEncrypted: 'invalid' }]),
        update,
      },
    } as any

    await expect(backfillAggregateReports(db)).rejects.toThrow('aggregate report ciphertext is invalid')
    expect(update).not.toHaveBeenCalled()
  })
})
