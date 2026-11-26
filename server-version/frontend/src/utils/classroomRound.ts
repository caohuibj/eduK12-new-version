export interface ClassroomRound {
  questionId: string
  startedAt?: string | null
}

const timestamp = (value: string | null | undefined): number | null => {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

const sameRound = (left: ClassroomRound, right: ClassroomRound): boolean =>
  left.questionId === right.questionId && timestamp(left.startedAt) === timestamp(right.startedAt)

/** Keeps live question events tied to the server's committed start, including after UI clear. */
export class ClassroomRoundGuard {
  private latest: ClassroomRound | null = null
  private active: ClassroomRound | null = null
  private seen = new Map<string, number | null>()
  private restarted = new Set<string>()
  private cleared = false
  private closed = false
  finished = false
  revision = 0

  receive(next: ClassroomRound, finished = false): boolean {
    if (this.closed || !next.questionId) return false
    const nextTime = timestamp(next.startedAt)
    if (next.startedAt != null && nextTime === null) return false
    const latestTime = timestamp(this.latest?.startedAt)
    if (this.latest && ((latestTime !== null && (nextTime === null || nextTime < latestTime))
      || (this.cleared && sameRound(this.latest, next)))) return false
    if (this.seen.has(next.questionId) && this.seen.get(next.questionId) !== nextTime) {
      this.restarted.add(next.questionId)
    }
    const same = this.active !== null && sameRound(this.active, next)
    if (!same) ++this.revision
    this.active = { ...next }
    this.latest = { ...next }
    this.seen.set(next.questionId, nextTime)
    this.cleared = false
    this.finished = same ? this.finished || finished : finished
    return true
  }

  matches(event: ClassroomRound | null | undefined): boolean {
    if (this.closed || !this.active || !event || event.questionId !== this.active.questionId) return false
    if (event.startedAt != null) {
      const eventTime = timestamp(event.startedAt)
      return eventTime !== null && eventTime === timestamp(this.active.startedAt)
    }
    // An older backend omits event markers. Once this question has restarted,
    // an unbound event cannot safely identify which of its rounds it belongs to.
    return !this.restarted.has(event.questionId)
  }

  finish(event: ClassroomRound): boolean {
    if (!this.matches(event)) return false
    if (!this.finished) ++this.revision
    this.finished = true
    return true
  }

  clear(event?: ClassroomRound): boolean {
    if (event && !this.matches(event)) return false
    if (this.active) ++this.revision
    this.cleared = this.cleared || this.active !== null
    this.active = null
    this.finished = false
    return true
  }

  close(): void {
    this.clear()
    this.closed = true
  }

  reset(): void {
    this.latest = null
    this.active = null
    this.seen.clear()
    this.restarted.clear()
    this.cleared = false
    this.closed = false
    this.finished = false
    ++this.revision
  }
}

export function classroomRemainingTime(question: ClassroomRound & {
  timeLimit?: number | null
  remainingTime?: number
}): number | null {
  if (!question.timeLimit || question.timeLimit <= 0) return null
  if (Number.isFinite(question.remainingTime)) return Math.max(0, Math.ceil(question.remainingTime!))
  const started = timestamp(question.startedAt)
  return started === null ? question.timeLimit
    : Math.max(0, question.timeLimit - Math.floor((Date.now() - started) / 1000))
}
