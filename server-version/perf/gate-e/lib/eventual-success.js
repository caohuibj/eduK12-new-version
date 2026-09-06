import { Counter, Rate, Trend } from 'k6/metrics';

/**
 * Gate-E primary KPIs: eventual successful students/sec is derived from
 * eventual_success count / wall duration in the summary; success rate is the Rate.
 * Intentional capacity 503 may still be retried by the scenario; 429 is never
 * treated as eventual success (FinalDraft does not retry 429).
 */
export const eventualSuccess = new Counter('gate_e_eventual_success');
export const eventualFailure = new Counter('gate_e_eventual_failure');
export const steadyEventualSuccess = new Counter('gate_e_steady_eventual_success');
export const steadyEventualFailure = new Counter('gate_e_steady_eventual_failure');
export const steadyEventualLatency = new Trend('gate_e_steady_eventual_latency_ms', true);
export const rateLimited429 = new Counter('gate_e_rate_limited_429');
export const capacityBusy503 = new Counter('gate_e_capacity_busy_503');
/** 503 broken down by response code (unit/aggregate/busy-unexpected). */
export const busy503Unit = new Counter('gate_e_busy_503_unit');
export const busy503Aggregate = new Counter('gate_e_busy_503_aggregate');
export const unexpected503 = new Counter('gate_e_busy_503_unexpected');
export const eventualSuccessRate = new Rate('gate_e_eventual_success_rate');
export const eventualLatency = new Trend('gate_e_eventual_latency_ms', true);
/** Number of capacity (503) retries issued for a logical submit (v3.0 §31). */
export const capacityRetries = new Counter('gate_e_capacity_retries');

/**
 * Classify a 503 response body code into one of the three capacity buckets.
 * @param {string|object|null} body response body (string or parsed JSON)
 * @returns {'unit'|'aggregate'|'unexpected'}
 */
export function classify503Code(body) {
  if (!body) return 'unexpected';
  let parsed = body;
  if (typeof body === 'string') {
    try { parsed = JSON.parse(body); } catch (_err) { return 'unexpected'; }
  }
  const code = parsed && typeof parsed === 'object' ? parsed.code : null;
  if (code === 'ASSESSMENT_SUBMIT_BUSY') return 'unit';
  if (code === 'COMPLETION_BUSY') return 'aggregate';
  return 'unexpected';
}

/** Record a 503 response with its code classification. */
export function record503(body, tags = {}) {
  const cls = classify503Code(body);
  capacityBusy503.add(1, tags);
  if (cls === 'unit') busy503Unit.add(1, tags);
  else if (cls === 'aggregate') busy503Aggregate.add(1, tags);
  else unexpected503.add(1, tags);
  return cls;
}

/** Fresh-write accounting (client-side). */
export const fixturesUsed = new Counter('gate_e_fixtures_used');
export const freshCompletions = new Counter('gate_e_fresh_completions');
export const idempotentReplays = new Counter('gate_e_idempotent_replays');
export const missingFixtures = new Counter('gate_e_missing_fixtures');
/** Steady-scenario splits of the fresh/replay counters (no tag dedup needed). */
export const steadyFreshCompletions = new Counter('gate_e_steady_fresh_completions');
export const steadyIdempotentReplays = new Counter('gate_e_steady_idempotent_replays');

/**
 * Raw steady eventual-latency samples. k6 v0.52 Trend summaries only expose
 * avg/min/med/max/p(90)/p(95) - no p(50)/p(99) - so the knee harness computes
 * its own quantiles from these samples (<= 3050 numbers per run, trivial).
 */
const steadyLatencySamples = [];
export function collectSteadyLatency(ms) {
  steadyLatencySamples.push(Number(ms) || 0);
}
export function steadyLatencyQuantiles() {
  if (!steadyLatencySamples.length) return null;
  const s = steadyLatencySamples.slice().sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  let sum = 0;
  for (const v of s) sum += v;
  return {
    count: s.length,
    p50: q(0.5),
    p90: q(0.9),
    p95: q(0.95),
    p99: q(0.99),
    max: s[s.length - 1],
    avg: sum / s.length,
  };
}

export function recordEventualOutcome(options) {
  const {
    ok,
    latencyMs = 0,
    status = 0,
    tags = {},
  } = options;
  eventualLatency.add(latencyMs, tags);
  const steady = tags && tags.phase === 'steady';
  if (steady) {
    steadyEventualLatency.add(latencyMs);
    collectSteadyLatency(latencyMs);
  }
  if (ok) {
    eventualSuccess.add(1, tags);
    if (steady) steadyEventualSuccess.add(1);
    eventualSuccessRate.add(1, tags);
    return;
  }
  eventualFailure.add(1, tags);
  if (steady) steadyEventualFailure.add(1);
  eventualSuccessRate.add(0, tags);
  if (Number(status) === 429) rateLimited429.add(1, tags);
  if (Number(status) === 503) capacityBusy503.add(1, tags);
}

/** Durable success statuses for a single logical submit (no 429). */
export function isDurableSuccessStatus(status) {
  return Number(status) === 200 || Number(status) === 201;
}
