import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { lockAnonymousAdmission, lockCompositeAdmissionShare } from '../../modules/composite/authenticated-admission-lock'

/** Fake transaction client: records the raw SQL each lock statement issues. */
const mkTx = () => ({ $queryRaw: vi.fn().mockResolvedValue([]), $queryRawUnsafe: vi.fn().mockResolvedValue([]) })
const allSql = (tx: ReturnType<typeof mkTx>): string[] => [
  ...tx.$queryRawUnsafe.mock.calls.map((call: any) => String(call[0])),
  ...tx.$queryRaw.mock.calls.map((call: any) => call[0].join('?')),
]
const advisoryCalls = (tx: ReturnType<typeof mkTx>) =>
  tx.$queryRaw.mock.calls.filter((call: any) => call[0].join('?').includes('pg_advisory_xact_lock'))

describe('anonymous START admission lock (SHARE + per-participant advisory)', () => {
  it('takes FOR SHARE (never FOR UPDATE) and a per-participant advisory lock', async () => {
    const tx = mkTx()
    await lockAnonymousAdmission(tx as any, 'composite-1', 'participant-1')

    // Composite row: SHARE via $queryRawUnsafe, exactly once, no FOR UPDATE.
    const shares = tx.$queryRawUnsafe.mock.calls
    expect(shares).toHaveLength(1)
    expect(shares[0][0]).toBe('SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR SHARE')
    expect(shares[0][1]).toBe('composite-1')
    expect(allSql(tx).join('\n')).not.toContain('FOR UPDATE')

    // Advisory: one pg_advisory_xact_lock whose identity names the anonymous
    // namespace, the composite, and the participant — never Training's.
    const advisory = advisoryCalls(tx)
    expect(advisory).toHaveLength(1)
    const identity = String(advisory[0][1])
    expect(identity).toContain('anonymous-admission-v1')
    expect(identity).toContain('composite-1')
    expect(identity).toContain('participant-1')
    expect(identity).not.toContain('training-authenticated-admission-v1')
  })

  it('takes only SHARE when there is no participant (plain anonymous token path)', async () => {
    const tx = mkTx()
    await lockAnonymousAdmission(tx as any, 'composite-1')
    expect(tx.$queryRawUnsafe.mock.calls).toHaveLength(1)
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('FOR SHARE')
    expect(advisoryCalls(tx)).toHaveLength(0)
    expect(allSql(tx).join('\n')).not.toContain('FOR UPDATE')
  })

  it('marks the tx so createAttempt skips its own FOR SHARE for the same composite', async () => {
    const tx = mkTx(), other = mkTx()
    await lockAnonymousAdmission(tx as any, 'c1', 'p1')
    await lockCompositeAdmissionShare(tx as any, 'c1')
    await lockCompositeAdmissionShare(tx as any, 'c2')
    await lockCompositeAdmissionShare(other as any, 'c1')
    const shares = (mock: ReturnType<typeof mkTx>) => mock.$queryRawUnsafe.mock.calls
    // c1 on tx: taken once by lockAnonymousAdmission, skipped by
    // lockCompositeAdmissionShare. c2 on tx and c1 on the other (unmarked)
    // client are each taken once.
    expect(shares(tx).map((call: any) => call[1])).toEqual(['c1', 'c2'])
    expect(shares(other).map((call: any) => call[1])).toEqual(['c1'])
  })

  it('startPublicAttempt calls lockAnonymousAdmission and no longer takes FOR UPDATE', () => {
    const source = readFileSync('src/modules/composite/composite.service.ts', 'utf8')
    const body = source.slice(source.indexOf('export const startPublicAttempt'), source.indexOf('export const restartPublicAttempt'))
    expect(body).toContain('lockAnonymousAdmission(tx, composite.id, study?.participantId)')
    // A FOR UPDATE statement is always a raw-SQL template ending in
    // "FOR UPDATE`"; the word also appears in explanatory comments, which
    // do not issue a lock.
    expect(body).not.toContain('FOR UPDATE`')
    // The study/participant row locks in beforeAdmission are unchanged and
    // live in the study module, not in startPublicAttempt.
    expect(body).toContain('study.beforeAdmission(tx)')
  })

  it('startStudyWave passes the pre-transaction participant id to the admission', () => {
    const source = readFileSync('src/modules/anonymous-study/service.ts', 'utf8')
    expect(source).toContain('participantId:p.id')
  })
})
