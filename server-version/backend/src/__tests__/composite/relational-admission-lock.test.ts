import {describe,expect,it} from 'vitest'
import {lockRelationalAdmission} from '../../modules/composite/relational-admission-lock'

type Call = { sql: string; values: unknown[] }

const captureTx = () => {
  const calls: Call[] = []
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join('?'), values })
      return []
    },
  }
  return { tx, calls }
}

describe('relational admission lock protocol', () => {
  it('takes a shared row lock on the composite before the participant advisory lock', async () => {
    const { tx, calls } = captureTx()
    await lockRelationalAdmission(tx as never, 'composite-1', 'user:student-1')
    expect(calls).toHaveLength(2)
    expect(calls[0].sql).toContain('composite_assessments')
    expect(calls[0].sql).toContain('FOR SHARE')
    expect(calls[0].sql).not.toContain('FOR UPDATE')
    expect(calls[1].sql).toContain('pg_advisory_xact_lock(')
    expect(calls[1].values[0]).toBe(JSON.stringify(['relational-admission-v1', 'composite-1', 'user:student-1']))
  })

  it('scopes the advisory lock to the participant, not the whole composite', async () => {
    const a = captureTx()
    const b = captureTx()
    await lockRelationalAdmission(a.tx as never, 'composite-1', 'user:student-1')
    await lockRelationalAdmission(b.tx as never, 'composite-1', 'user:student-2')
    expect(a.calls[1].values[0]).not.toBe(b.calls[1].values[0])
    // Same participant on a different composite must not share the key either.
    const c = captureTx()
    await lockRelationalAdmission(c.tx as never, 'composite-2', 'user:student-1')
    expect(c.calls[1].values[0]).not.toBe(a.calls[1].values[0])
  })
})
