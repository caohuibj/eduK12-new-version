import { expect, it } from 'vitest'
import { exportIntentDateRange } from '../../services/exportIntentDateRange'
it('caps date-only end on the intent day before downstream inclusive expansion', () => {
  expect(exportIntentDateRange(new Date('2026-09-30T10:00:00Z'), { end: '2026-09-30' }).end).toBe('2026-09-30T10:00:00.000Z')
})
it('preserves earlier whole days and precise times while capping future ends', () => {
  const date = new Date('2026-09-30T10:00:00Z')
  expect(exportIntentDateRange(date, { end: '2026-09-29' }).end).toBe('2026-09-29T23:59:59.999Z')
  expect(exportIntentDateRange(date, { end: '2026-09-30T09:00:00Z' }).end).toBe('2026-09-30T09:00:00.000Z')
  expect(exportIntentDateRange(date, { end: '2026-10-01' }).end).toBe(date.toISOString())
  expect(exportIntentDateRange(date).end).toBe(date.toISOString())
})
it('rejects invalid date metadata', () => {
  expect(() => exportIntentDateRange(new Date(), { end: 'bad' })).toThrow()
})
