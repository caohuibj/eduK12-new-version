const DAY = 24 * 60 * 60 * 1000
/** Fixed elapsed intervals: one day is 24 hours. Never flood recovery with old tasks. */
export function dueCheckinSlot(first: Date, next: Date, intervalDays: number, durationHours: number, endsAt: Date | null, now: Date) {
  if (next > now) return null
  const interval = intervalDays * DAY
  const latestTime = Math.min(now.getTime(), endsAt?.getTime() ?? Infinity)
  const latest = new Date(first.getTime() + Math.floor((latestTime - first.getTime()) / interval) * interval)
  const following = new Date(latest.getTime() + interval)
  return {
    publishAt: latest >= next && latest.getTime() + durationHours * 3600000 > now.getTime() ? latest : null,
    nextPublishAt: endsAt && following > endsAt ? null : following,
  }
}
