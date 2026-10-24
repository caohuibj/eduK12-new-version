import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { checkinAccessToken: { findUnique } } }))
vi.mock('../../utils/logger', () => ({ logger: { info: vi.fn() } }))

import { checkinTokenService } from '../../services/checkinTokenService'

const bearer = 'ck_projection-test'
const select = { id: true, courseId: true, allowAnonymous: true, endTime: true }
const checkin = { id: 'checkin-1', courseId: 'course-1', allowAnonymous: true, endTime: null }
const makeRow = (overrides = {}) => ({
  id: 'token-1', checkinId: checkin.id, token: null,
  tokenHash: checkinTokenService.hashToken(bearer), tokenEncrypted: null,
  createdBy: 'teacher-1', createdAt: new Date('2026-01-01'),
  expiresAt: new Date('2099-01-01'), maxUses: 1, usedCount: 0,
  isActive: true, checkin, ...overrides,
})

describe('check-in token validation projection', () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([false, true])('projects only authorization fields on legacy=%s without extra reads', async (legacy) => {
    const fullCheckin = {
      ...checkin, title: 'Example check-in', description: 'd'.repeat(2048),
      creatorId: 'teacher-1', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
      content: 'c'.repeat(32768), images: Array.from({ length: 20 }, (_, i) => ({ assetId: `image-${i}`, url: `https://example.test/${'a'.repeat(128)}/${i}` })),
      documents: [{ assetId: 'document-1' }], videos: [{ assetId: 'video-1' }],
      allowViewOthers: false, tags: ['example'], scheduleId: null, scheduledFor: null,
    }
    findUnique.mockImplementation(async (args) => {
      expect(args.include).toEqual({ checkin: { select } })
      if (legacy && args.where.tokenHash) return null
      return { ...makeRow(legacy ? { token: bearer, tokenHash: null } : {}), checkin: Object.fromEntries(
        Object.keys(args.include.checkin.select).map((key) => [key, fullCheckin[key as keyof typeof fullCheckin]]),
      ) }
    })
    const validation = await checkinTokenService.validateToken(bearer)
    expect(validation).toMatchObject({ valid: true, expired: false, disabled: false, overLimit: false, checkin })
    expect(validation.token.checkin).toEqual(checkin)
    expect(findUnique).toHaveBeenCalledTimes(legacy ? 2 : 1)
    expect(findUnique.mock.calls[0][0].where).toEqual({ tokenHash: checkinTokenService.hashToken(bearer) })
    if (legacy) expect(findUnique.mock.calls[1][0].where).toEqual({ token: bearer })
    const fullBytes = Buffer.byteLength(JSON.stringify(fullCheckin))
    const projectedBytes = Buffer.byteLength(JSON.stringify(validation.checkin))
    expect(projectedBytes).toBeLessThan(fullBytes)
    console.log(JSON.stringify({ fixture: 'synthetic-checkin-relation', legacy, fullBytes, projectedBytes, removedBytes: fullBytes - projectedBytes }))
  })

  it('rejects a legacy row whose stored hash conflicts', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(makeRow({ tokenHash: 'different-hash' }))
    expect(await checkinTokenService.validateToken(bearer)).toEqual({ valid: false, expired: false, overLimit: false, disabled: false })
  })

  it('keeps the missing-token result after both lookups', async () => {
    findUnique.mockResolvedValue(null)
    expect(await checkinTokenService.validateToken(bearer)).toEqual({ valid: false, expired: false, overLimit: false, disabled: false })
    expect(findUnique).toHaveBeenCalledTimes(2)
  })

  it.each([
    { name: 'disabled before expiry and quota', overrides: { isActive: false, expiresAt: new Date(0), usedCount: 1 }, options: {}, flags: { disabled: true, expired: false, overLimit: false, valid: false } },
    { name: 'expiry before quota', overrides: { expiresAt: new Date(0), usedCount: 1 }, options: {}, flags: { disabled: false, expired: true, overLimit: false, valid: false } },
    { name: 'quota before anonymous access', overrides: { usedCount: 1, checkin: { ...checkin, allowAnonymous: false } }, options: {}, flags: { disabled: false, expired: false, overLimit: true, valid: false } },
    { name: 'anonymous disabled even when ignoring quota', overrides: { usedCount: 1, checkin: { ...checkin, allowAnonymous: false } }, options: { ignoreUsageLimit: true }, flags: { disabled: false, expired: false, overLimit: false, valid: false } },
    { name: 'resume ignores exhausted quota', overrides: { usedCount: 1 }, options: { ignoreUsageLimit: true }, flags: { disabled: false, expired: false, overLimit: false, valid: true } },
    { name: 'unlimited quota', overrides: { usedCount: 100, maxUses: 0 }, options: {}, flags: { disabled: false, expired: false, overLimit: false, valid: true } },
  ])('preserves $name', async ({ overrides, options, flags }) => {
    const row = makeRow(overrides)
    findUnique.mockResolvedValue(row)
    const validation = await checkinTokenService.validateToken(bearer, options)
    expect(validation).toMatchObject({ ...flags, token: row })
    expect(validation.checkin).toEqual(flags.valid ? row.checkin : undefined)
    expect(findUnique).toHaveBeenCalledTimes(1)
  })
})
