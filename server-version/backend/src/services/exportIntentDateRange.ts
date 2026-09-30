/** Normalize inclusive date-only ends before capping at the durable request time. */
export const exportIntentDateRange = (createdAt: Date, range?: { start?: string; end?: string }) => {
  const requested = range?.end
  const normalized = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? `${requested}T23:59:59.999Z` : requested
  const end = normalized ? new Date(normalized) : createdAt
  if (!Number.isFinite(end.getTime())) throw new Error('Invalid export end date')
  return { ...range, end: new Date(Math.min(createdAt.getTime(), end.getTime())).toISOString() }
}
