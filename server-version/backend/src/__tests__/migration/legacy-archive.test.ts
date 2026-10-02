import { describe, it, expect, vi, afterEach } from 'vitest'
import { createCipheriv } from 'node:crypto'
vi.mock('../../middleware/auth', () => ({ authenticate: vi.fn() }))
import { decodeLegacyField } from '../../modules/legacy-archive/crypto'
import { createArchiveService, provenance } from '../../modules/legacy-archive/service'
import { parseArchiveFilter, requireArchiveAdmin } from '../../modules/legacy-archive/routes'
const key = '34'.repeat(32)
function cipher(value: unknown) {
  const iv = Buffer.alloc(16, 7), encryptor = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv)
  const encrypted = Buffer.concat([encryptor.update(JSON.stringify(value)), encryptor.final()])
  return [iv.toString('hex'), encryptor.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':')
}
afterEach(() => vi.unstubAllEnvs())
describe('historical archive', () => {
  it('uses the separate old key and preserves mixed plaintext values', () => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '56'.repeat(32))
    expect(decodeLegacyField(cipher({ raw: 4 }), key)).toEqual({ raw: 4 })
    expect(decodeLegacyField({ raw: 4 }, key)).toEqual({ raw: 4 })
    expect(decodeLegacyField('original text', key)).toBe('original text')
    expect(() => decodeLegacyField(cipher({ raw: 4 }), '56'.repeat(32))).toThrow('Archive decryption unavailable')
    expect(() => decodeLegacyField(cipher({ raw: 4 }), '')).toThrow('Archive decryption unavailable')
  })
  it.each([
    undefined, { role: 'STUDENT', platformRole: 'SYSTEM_ADMIN' },
    { role: 'TEACHER', platformRole: 'SYSTEM_ADMIN' }, { role: 'ADMIN', platformRole: 'STANDARD' },
  ])('denies archive access for insufficient current database authority: %s', user => {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn()
    requireArchiveAdmin({ user } as any, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
  it('admits only current system admin principals', () => {
    const next = vi.fn()
    requireArchiveAdmin({ user: { role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' } } as any, {} as any, next)
    expect(next).toHaveBeenCalledOnce()
  })
  it('rejects malformed/array paging and binds filters rather than interpolating SQL', async () => {
    expect(() => parseArchiveFilter({ page: '-1' })).toThrow()
    expect(() => parseArchiveFilter({ page: ['1'] })).toThrow()
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ total: 0 }] }).mockResolvedValueOnce({ rows: [] })
    const value = "' OR true --"
    const service = createArchiveService(query)
    await service.list('assessments', { page: 2, studentId: value })
    expect(query.mock.calls[0][0]).not.toContain(value)
    expect(query.mock.calls[0][1]).toEqual([value])
    expect(query.mock.calls[1][1]).toEqual([value, 25])
    expect(query.mock.calls[1][0]).not.toMatch(/a\.(answers|scores|feedback|token)/)
  })
  it('decrypts only allowed assessment fields on detail and never changes original status', async () => {
    vi.stubEnv('LEGACY_DATA_ENCRYPTION_KEY', key)
    const original = cipher({ score: 42 })
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'a1', status: 'IN_PROGRESS', answers: [], scores: original, feedback: null }] })
    const result = await createArchiveService(query).detail('assessments', 'a1')
    expect(result).toMatchObject({ status: 'IN_PROGRESS', scores: { score: 42 }, provenance })
    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0][1]).toEqual(['a1'])
  })
  it('returns null for absent IDs and fails closed on bad ciphertext', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ answers: cipher({ raw: 1 }), scores: null, feedback: null }] })
    const service = createArchiveService(query)
    expect(await service.detail('assessments', 'absent')).toBeNull()
    vi.stubEnv('LEGACY_DATA_ENCRYPTION_KEY', '56'.repeat(32))
    await expect(service.detail('assessments', 'bad')).rejects.toThrow('Archive decryption unavailable')
  })
})
