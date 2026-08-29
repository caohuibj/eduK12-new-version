import { beforeEach, describe, expect, it, vi } from 'vitest'
import { backfillCheckinTokens } from '../../services/checkinTokenBackfillService'
import { checkinTokenService } from '../../services/checkinTokenService'

process.env.DATA_ENCRYPTION_KEY = 'b'.repeat(64)

describe('check-in token backfill', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('hashes and encrypts a legacy bearer before clearing plaintext', async () => {
    const update = vi.fn().mockResolvedValue({})
    const findFirst = vi.fn()
      .mockResolvedValueOnce({
        id: 'legacy-token',
        token: 'ck_abcdefghijklmnop',
        tokenHash: null,
        tokenEncrypted: null,
      })
      .mockResolvedValueOnce(null)
    const count = vi.fn().mockResolvedValue(0)
    const db = { checkinAccessToken: { findFirst, update, count } } as any

    await expect(backfillCheckinTokens(db)).resolves.toEqual({ processed: 1, remaining: 0 })
    expect(update).toHaveBeenCalledWith({
      where: { id: 'legacy-token' },
      data: {
        tokenHash: checkinTokenService.hashToken('ck_abcdefghijklmnop'),
        tokenEncrypted: expect.any(String),
        token: null,
      },
    })
    const encrypted = update.mock.calls[0][0].data.tokenEncrypted
    expect(checkinTokenService.decryptToken(encrypted)).toBe('ck_abcdefghijklmnop')
  })
})
