import { describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { rethrowScaleSubmissionIdConflict, rethrowConfirmedScaleBatchSubmissionConflict, ScaleSubmissionKeyConflictError } from '../../modules/scale/scale-final-submit-conflict'

const known = (code: string, target?: unknown) => new Prisma.PrismaClientKnownRequestError(
  'private database details', { code, clientVersion: 'test', meta: { modelName: 'Assessment', target } },
)

describe('Assessment FINAL submission key conflict', () => {
  it('classifies only the single submission_id uniqueness failure as safe 409', () => {
    try { rethrowScaleSubmissionIdConflict(known('P2002', ['submission_id'])) } catch (error) {
      expect(error).toBeInstanceOf(InstrumentFinalSubmitError)
      expect(error).toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT', statusCode: 409,
        message: '提交标识已被使用，请更换提交标识后重试' })
      expect((error as Error).message).not.toContain('private')
      return
    }
    throw new Error('Expected conflict')
  })

  it.each([
    known('P2002', ['id']), known('P2002', ['submission_id', 'userId']),
    known('P2002'), known('P2002', 'submission_id'), known('P2002', ['submissionId']),
    known('P2024', ['submission_id']), known('P2010', ['submission_id']),
    { code: 'P2002', meta: { target: ['submission_id'] } }, new Error('unknown'),
  ])('preserves unknown or different failures unchanged: %#', (error) => {
    expect(() => rethrowScaleSubmissionIdConflict(error)).toThrow(error as Error)
    try { rethrowScaleSubmissionIdConflict(error) } catch (caught) { expect(caught).toBe(error) }
  })
})


describe('rolled-back batch submission-key confirmation', () => {
  const raw = () => new Prisma.PrismaClientKnownRequestError('private details', { code: 'P2010', clientVersion: 'test', meta: { code: '23505' } })
  it('confirms only an external occupied key using a boolean-only parameterized read', async () => {
    const query = vi.fn().mockResolvedValue([{ occupied: true }])
    await expect(rethrowConfirmedScaleBatchSubmissionConflict(raw(), ['key-one'], ['own-child'], { $queryRaw: query } as never)).rejects.toBeInstanceOf(ScaleSubmissionKeyConflictError)
    const [strings, keys, ids] = query.mock.calls[0]
    expect(strings.join('?')).toMatch(/SELECT EXISTS \(SELECT 1 FROM assessments/)
    expect(strings.join('?')).toContain('AND id NOT IN')
    expect(keys.values).toEqual(['key-one']); expect(ids.values).toEqual(['own-child'])
    expect(strings.join('?')).not.toMatch(/SELECT (id|user_id|result)/)
  })
  it.each([[], [{ occupied: false }], [{ occupied: 'true' }], [{ occupied: true }, { occupied: true }]])('preserves the original error for unconfirmed rows %#', async rows => {
    const error = raw(), query = vi.fn().mockResolvedValue(rows)
    await expect(rethrowConfirmedScaleBatchSubmissionConflict(error, ['key'], ['child'], { $queryRaw: query } as never)).rejects.toBe(error)
  })
  it('preserves the original technical error if confirmation itself fails', async () => {
    const error = raw(), query = vi.fn().mockRejectedValue(new Error('temporary database read failure'))
    await expect(rethrowConfirmedScaleBatchSubmissionConflict(error, ['key'], ['child'], { $queryRaw: query } as never)).rejects.toBe(error)
  })
  it.each([known('P2024'), known('P2002', ['id']), known('P2010'), { code: 'P2010', meta: { code: '23505' } }, new Error('unknown')])('does not query for non-matching errors %#', async error => {
    const query = vi.fn()
    await expect(rethrowConfirmedScaleBatchSubmissionConflict(error, ['key'], ['child'], { $queryRaw: query } as never)).rejects.toBe(error)
    expect(query).not.toHaveBeenCalled()
  })
  it.each([[[], ['child']], [['key'], []]])('does not infer a conflict from an empty scope %#', async (keys, ids) => {
    const error = raw(), query = vi.fn()
    await expect(rethrowConfirmedScaleBatchSubmissionConflict(error, keys, ids, { $queryRaw: query } as never)).rejects.toBe(error)
    expect(query).not.toHaveBeenCalled()
  })
})
