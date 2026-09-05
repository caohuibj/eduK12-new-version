/**
 * Derive interval event-loop utilization from cumulative Node counters.
 *
 * The backend exports cumulative active/idle seconds. A scrape is a sample,
 * not a lifetime measurement: callers must retain only the last valid sample.
 * Invalid values and counter resets fail closed and establish a new baseline.
 */

const finiteCounter = (value) => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
);

export const normalizeEventLoopCounters = (sample) => {
  const active = finiteCounter(sample?.active);
  const idle = finiteCounter(sample?.idle);
  return active === null || idle === null ? null : { active, idle };
};

export const deriveIntervalElu = (previous, current) => {
  const before = normalizeEventLoopCounters(previous);
  const after = normalizeEventLoopCounters(current);
  if (!before || !after) return null;

  const activeDelta = after.active - before.active;
  const idleDelta = after.idle - before.idle;
  if (activeDelta < 0 || idleDelta < 0) return null;

  const totalDelta = activeDelta + idleDelta;
  if (!(totalDelta > 0) || !Number.isFinite(totalDelta)) return null;

  const elu = activeDelta / totalDelta;
  return Number.isFinite(elu) && elu >= 0 && elu <= 1 ? elu : null;
};

export class IntervalEluTracker {
  #previous = null;

  observe(sample) {
    const current = normalizeEventLoopCounters(sample);
    if (!current) return { value: null, status: 'invalid' };

    if (!this.#previous) {
      this.#previous = current;
      return { value: null, status: 'baseline' };
    }

    const activeDelta = current.active - this.#previous.active;
    const idleDelta = current.idle - this.#previous.idle;
    if (activeDelta < 0 || idleDelta < 0) {
      this.#previous = current;
      return { value: null, status: 'reset' };
    }

    const totalDelta = activeDelta + idleDelta;
    const value = totalDelta > 0 && Number.isFinite(totalDelta)
      ? activeDelta / totalDelta
      : null;
    this.#previous = current;

    return {
      value: Number.isFinite(value) && value >= 0 && value <= 1 ? value : null,
      status: value === null ? 'unavailable' : 'ok',
    };
  }

  reset() {
    this.#previous = null;
  }
}
