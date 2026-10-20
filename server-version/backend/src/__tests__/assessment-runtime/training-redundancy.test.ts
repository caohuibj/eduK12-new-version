import { beforeEach, describe, expect, it, vi } from 'vitest'
const templates = vi.hoisted(() => ({ plan: undefined as any }))
vi.mock('../../modules/assessment-runtime/public-templates', () => ({
  publicTemplates: {},
  publicTemplatesForDatabase: () => ({
    saveMany: async ([item]: any[]) => { templates.plan = item.value; return ['a'.repeat(64)] },
    loadMany: async () => [templates.plan],
  }),
}))
import { createFrozenUnitAdmission } from '../../modules/assessment-runtime/admission-snapshot'
import { canonicalHash, canonicalJsonBytes } from '../../modules/assessment-runtime/canonical'
import { decryptCompactField } from '../../modules/assessment-runtime/compact-field-codec'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { loadSharedUnitAdmission, storeSharedUnitAdmission } from '../../modules/assessment-runtime/shared-control-records'

beforeEach(() => {
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'c'.repeat(64))
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', 'true')
  vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED', 'true')
})
const admission = () => createFrozenUnitAdmission({ attemptEpoch: 1, frozenAt: new Date('2026-10-20T00:00:00Z'),
  scale: { id: 'scale', code: 'code', name: 'Name', instrumentVersion: '1' }, principal: { userId: 'student' },
  parent: { kind: 'composite', parentId: 'parent', slotKey: 'scale:item', sourceDefinitionHash: 'd'.repeat(64), compiledRuntimeHash: 'e'.repeat(64) },
})
function database(patch: (row: any) => any = row => row) {
  let stored: any
  const db: any = { $queryRaw: vi.fn(async (parts: TemplateStringsArray, ...values: any[]) => {
    if (parts.join('').includes('INSERT INTO')) {
      stored = patch({ id: 1n, bindingHash: values[0], compositeAttemptId: values[1], questionnaireAssessmentId: values[2],
        plaintextBytes: values[3], payloadEncrypted: values[4] })
    }
    return [stored]
  }) }
  return { db, row: () => stored }
}
describe('single canonical binding encoding', () => {
  it('keeps exact hash/length/encryption and round-trip admission while reusing the verified row', async () => {
    const f = database(), original = admission(), encrypted = await storeSharedUnitAdmission(original, f.db)
    const body = decryptCompactField<any>(f.row().payloadEncrypted).value.value
    expect(f.row().bindingHash.toString('hex')).toBe(canonicalHash(body))
    expect(f.row().plaintextBytes).toBe(canonicalJsonBytes(body).length)
    expect(await loadSharedUnitAdmission(encrypted, f.db)).toEqual(original)
    expect(f.db.$queryRaw).toHaveBeenCalledOnce()
  })
  it.each(['hash', 'bytes', 'parent', 'other-valid-binding'])('still rejects %s returned by the append', async kind => {
    const f = database(row => {
      if (kind === 'hash') row.bindingHash = Buffer.alloc(32)
      if (kind === 'bytes') row.plaintextBytes++
      if (kind === 'parent') row.compositeAttemptId = 'other'
      if (kind === 'other-valid-binding') {
        const envelope = decryptCompactField<any>(row.payloadEncrypted), body = envelope.value.value
        body.principal.userId = 'other'
        row.payloadEncrypted = encryptUnifiedRuntimePayload({ version: 1, value: body })
        row.bindingHash = Buffer.from(canonicalHash(body), 'hex')
        row.plaintextBytes = canonicalJsonBytes(body).length
      }
      return row
    })
    await expect(storeSharedUnitAdmission(admission(), f.db)).rejects.toThrow(/Frozen/)
  })
})
