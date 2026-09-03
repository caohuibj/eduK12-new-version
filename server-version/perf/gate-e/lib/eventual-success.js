import { Counter, Rate, Trend } from 'k6/metrics';

/**
 * Gate-E primary KPIs: eventual successful students/sec is derived from
 * eventual_success count / wall duration in the summary; success rate is the Rate.
 * Intentional capacity 503 may still be retried by the scenario; 429 is never
 * treated as eventual success (FinalDraft does not retry 429).
 */
export const eventualSuccess = new Counter('gate_e_eventual_success');
export const eventualFailure = new Counter('gate_e_eventual_failure');
export const rateLimited429 = new Counter('gate_e_rate_limited_429');
export const capacityBusy503 = new Counter('gate_e_capacity_busy_503');
export const eventualSuccessRate = new Rate('gate_e_eventual_success_rate');
export const eventualLatency = new Trend('gate_e_eventual_latency_ms', true);

export function recordEventualOutcome(options) {
  const {
    ok,
    latencyMs = 0,
    status = 0,
    tags = {},
  } = options;
  eventualLatency.add(latencyMs, tags);
  if (ok) {
    eventualSuccess.add(1, tags);
    eventualSuccessRate.add(1, tags);
    return;
  }
  eventualFailure.add(1, tags);
  eventualSuccessRate.add(0, tags);
  if (Number(status) === 429) rateLimited429.add(1, tags);
  if (Number(status) === 503) capacityBusy503.add(1, tags);
}

/** Durable success statuses for a single logical submit (no 429). */
export function isDurableSuccessStatus(status) {
  return Number(status) === 200 || Number(status) === 201;
}
