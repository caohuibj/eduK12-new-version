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
        tokenHash: 'stale-hash',
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

  it('re-encrypts plaintext even when a legacy ciphertext is already present', async () => {
    const staleCiphertext = checkinTokenService.encryptToken('ck_different-token')
    const update = vi.fn().mockResolvedValue({})
    const findFirst = vi.fn()
      .mockResolvedValueOnce({
        id: 'legacy-token-with-ciphertext',
        token: 'ck_current-token',
        tokenHash: 'stale-hash',
        tokenEncrypted: staleCiphertext,
      })
      .mockResolvedValueOnce(null)
    const count = vi.fn().mockResolvedValue(0)
    const db = { checkinAccessToken: { findFirst, update, count } } as any

    await expect(backfillCheckinTokens(db)).resolves.toEqual({ processed: 1, remaining: 0 })

    const data = update.mock.calls[0][0].data
    expect(data.tokenEncrypted).not.toBe(staleCiphertext)
    expect(checkinTokenService.decryptToken(data.tokenEncrypted)).toBe('ck_current-token')
  })

  it('validates every installed token protection constraint after the backfill', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const count = vi.fn().mockResolvedValue(0)
    const queryRaw = vi.fn().mockResolvedValue([
      { conname: 'checkin_access_tokens_token_must_be_null' },
      { conname: 'checkin_access_tokens_protected_fields_present' },
    ])
    const executeRawUnsafe = vi.fn().mockResolvedValue(0)
    const db = { checkinAccessToken: { findFirst, count }, $queryRaw: queryRaw, $executeRawUnsafe: executeRawUnsafe } as any

    await expect(backfillCheckinTokens(db)).resolves.toEqual({ processed: 0, remaining: 0 })
    expect(executeRawUnsafe).toHaveBeenCalledTimes(2)
    expect(executeRawUnsafe.mock.calls.map(([sql]) => sql)).toEqual([
      'ALTER TABLE "checkin_access_tokens" VALIDATE CONSTRAINT "checkin_access_tokens_token_must_be_null"',
      'ALTER TABLE "checkin_access_tokens" VALIDATE CONSTRAINT "checkin_access_tokens_protected_fields_present"',
    ])
  })
})
