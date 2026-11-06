import { describe, expect, it } from 'vitest'
import { decodeRunTaskCursor, encodeRunTaskCursor } from '../../modules/assessment-run/productRead'

describe('run-task cursor timestamps', () => {
  it('keeps a valid six-digit microsecond cursor verbatim', () => {
    const cursor = { createdAt: '2026-11-06T12:00:00.123456Z', id: 'exec-1' }
    expect(encodeRunTaskCursor(cursor)).toBe(
      Buffer.from(JSON.stringify(cursor)).toString('base64url'),
    )
    expect(decodeRunTaskCursor(encodeRunTaskCursor(cursor))).toEqual(cursor)
  })

  it('zero-pads a legacy three-digit cursor to six digits', () => {
    expect(decodeRunTaskCursor(
      Buffer.from(JSON.stringify({ createdAt: '2026-11-06T12:00:00.123Z', id: 'exec-1' })).toString('base64url'),
    )).toEqual({ createdAt: '2026-11-06T12:00:00.123000Z', id: 'exec-1' })
  })

  it.each([
    '2026-02-28T12:00:00.123456Z',
    '2028-02-29T12:00:00.000000Z',
    '2000-02-29T23:59:59.999999Z',
    '2026-12-31T23:59:59.999999Z',
  ])('accepts a real calendar date %s', (createdAt) => {
    expect(decodeRunTaskCursor(
      Buffer.from(JSON.stringify({ createdAt, id: 'exec-1' })).toString('base64url'),
    )).toEqual({ createdAt, id: 'exec-1' })
  })

  // A forged cursor with a nonexistent date must fail at decode (HTTP 400),
  // never reach PostgreSQL's ::timestamptz (HTTP 500). `new Date()` accepts
  // all of these by normalizing them, so the canonicalizer validates the
  // components directly.
  it.each([
    '2026-02-29T12:00:00.123456Z',
    '2026-02-31T12:00:00.123456Z',
    '2026-04-31T12:00:00.123456Z',
    '2026-02-30T12:00:00.123456Z',
    '1900-02-29T12:00:00.123456Z',
    '2026-13-01T12:00:00.123456Z',
    '2026-00-10T12:00:00.123456Z',
    '2026-01-01T24:00:00.123456Z',
    '0000-01-01T00:00:00.000000Z',
  ])('rejects a nonexistent calendar date %s', (createdAt) => {
    expect(() =>
      decodeRunTaskCursor(
        Buffer.from(JSON.stringify({ createdAt, id: 'exec-1' })).toString('base64url'),
      ),
    ).toThrow('RUN_TASK_CURSOR_INVALID')
    expect(() => encodeRunTaskCursor({ createdAt, id: 'exec-1' })).toThrow('RUN_TASK_CURSOR_INVALID')
  })
})
