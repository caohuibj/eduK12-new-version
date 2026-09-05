import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  isDurableSuccessStatus,
  recordEventualOutcome,
  record503,
  capacityRetries,
  fixturesUsed,
  freshCompletions,
  idempotentReplays,
  steadyIdempotentReplays,
  steadyFreshCompletions,
  missingFixtures,
} from './eventual-success.js';

const baseUrl = String(__ENV.BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');

// Retry contract modes (v4 review): 'finaldraft' (exact frontend exponential
// backoff + jitter), 'fixed' (legacy sleep(Retry-After)), 'off' (no retry).
const retryMode = String(__ENV.RETRY_MODE || 'finaldraft');
const maxAttempts = Number(__ENV.CAPACITY_RETRY_ATTEMPTS || 4);

// Frontend isFinalDraftCapacityRetryable: 503/502/504 or network failure.
// 429 is a hard stop (never retried).
function isRetryableStatus(status) {
  const s = Number(status);
  return s === 503 || s === 502 || s === 504 || s === 0;
}

// Exact port of frontend finalDraftCapacityRetryDelayMs (attempt is 1-based):
//   delay = max(Retry-AfterMs, 1000 * 2^(attempt-1)) + jitter(0..exponential)
//   safety-capped at 30s. Jitter is floor-preserving so Retry-After is a floor,
//   not a hard 1s concentrate.
function finalDraftRetryDelayMs(attempt, retryAfterMs) {
  const SAFETY_CAP_MS = 30000;
  const BASE_DELAY_MS = 1000;
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const retryFloor = (retryAfterMs !== null && isFinite(retryAfterMs) && retryAfterMs >= 0)
    ? Math.min(SAFETY_CAP_MS, Math.max(0, retryAfterMs)) : 0;
  const exponential = Math.min(SAFETY_CAP_MS, BASE_DELAY_MS * Math.pow(2, safeAttempt - 1));
  const sampled = Math.min(1, Math.max(0, Math.random()));
  const jitter = Math.floor(sampled * (exponential + 1));
  return Math.min(SAFETY_CAP_MS, Math.max(retryFloor, exponential) + jitter);
}

export function loadFixtureGroup(fixtures, groupName) {
  const group = fixtures[groupName];
  if (Array.isArray(group)) return group;
  if (group && Array.isArray(group.requests)) return group.requests;
  return [];
}

// k6/Goja (v0.49) does NOT parse object spread in arbitrary positions, so we
// avoid `{ ...a, ...b }` and use explicit Object.assign merges instead.
export function merge(base, extra) {
  const out = {};
  Object.assign(out, base || {});
  Object.assign(out, extra || {});
  return out;
}

export function pickFreshRequest(requests, index) {
  if (!requests.length) return null;
  // FIXTURE_OFFSET lets a single large fresh pool be consumed by multiple
  // sequential k6 runs without reuse: effective index = offset + iteration.
  const offset = Number(__ENV.FIXTURE_OFFSET || 0);
  const effective = offset + Number(index || 0);
  if (effective < requests.length) return requests[effective];
  return null;
}

function parseReplayFlag(body) {
  if (!body) return false;
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    const data = parsed && parsed.data ? parsed.data : parsed;
    return Boolean(data && data.replayed === true);
  } catch (_err) {
    return false;
  }
}

/**
 * Attempt one logical submit. Optional capacity retries on 503 only (not 429).
 * Returns whether eventual durable success was observed.
 * Fresh-write rule: only the first success for a unique submissionId counts as
 * fresh_completion; replayed:true is idempotent_replay (INVALID for E2 fresh curve
 * unless it came from a capacity retry of the same logical submit).
 */
export function runLogicalSubmit(request, tags = {}) {
  if (!request) {
    missingFixtures.add(1, tags);
    recordEventualOutcome({ ok: false, status: 0, tags: merge(tags, { reason: 'missing_fixture' }) });
    check(false, { 'fixture present': (value) => value === true });
    return false;
  }

  fixturesUsed.add(1, tags);
  const started = Date.now();
  let lastStatus = 0;
  let sawFreshCompletion = false;
  let last503Body = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const path = String(request.path || '');
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = merge(request.headers);
    const authToken = String(__ENV.AUTH_TOKEN || __ENV.PERF_AUTH_TOKEN || '').trim();
    const csrfToken = String(__ENV.CSRF_TOKEN || __ENV.PERF_CSRF_TOKEN || '').trim();
    if (authToken) {
      headers.Cookie = `ptool_session=${encodeURIComponent(authToken)}${csrfToken ? `; ptool_csrf=${encodeURIComponent(csrfToken)}` : ''}`;
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
    }
    if (request.body !== undefined && request.body !== null && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    let body = null;
    if (request.body !== undefined && request.body !== null) {
      body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    }

    const response = http.request(String(request.method || 'POST').toUpperCase(), url, body, {
      headers,
      tags: merge(tags, { attempt: String(attempt) }),
    });
    lastStatus = response.status;
    if (response.status === 503) last503Body = response.body;

    if (isDurableSuccessStatus(response.status)) {
      const replayed = parseReplayFlag(response.body);
      if (replayed) {
        idempotentReplays.add(1, tags);
        if (tags.phase === 'steady') steadyIdempotentReplays.add(1);
        // F7 (Gate-E): a replay on the first attempt means non-fresh /
        // pre-seeded reuse and is fail-closed for an authoritative run. Only a
        // replay that arrives on a later capacity (503) retry of this same
        // logical submit, after we already observed a fresh completion in this
        // attempt chain, is a legal eventual success.
        if (!sawFreshCompletion) {
          recordEventualOutcome({
            ok: false,
            latencyMs: Date.now() - started,
            status: response.status,
            tags: merge(tags, { replayed: 'true', reason: 'first_attempt_replay_invalid' }),
          });
          check(false, { 'no first-attempt replay (fail-closed)': () => true });
          return false;
        }
        // Documented retry-after-lost-response: earlier attempt in this logical
        // submit may have persisted server-side; replayed:true on capacity retry
        // is durable success for the same submissionId.
        recordEventualOutcome({
          ok: true,
          latencyMs: Date.now() - started,
          status: response.status,
          tags: merge(tags, { replayed: 'retry' }),
        });
        check(response, { 'eventual durable success': () => true });
        return true;
      }
      freshCompletions.add(1, tags);
      if (tags.phase === 'steady') steadyFreshCompletions.add(1);
      sawFreshCompletion = true;
      recordEventualOutcome({
        ok: true,
        latencyMs: Date.now() - started,
        status: response.status,
        tags: merge(tags, { replayed: 'false' }),
      });
      check(response, { 'eventual durable success': () => true });
      return true;
    }

    if (response.status === 429) {
      recordEventualOutcome({
        ok: false,
        latencyMs: Date.now() - started,
        status: 429,
        tags,
      });
      check(response, { '429 is not retried as capacity': () => true });
      return false;
    }

    if (retryMode !== 'off' && isRetryableStatus(response.status) && attempt < maxAttempts) {
      if (response.status === 503) record503(response.body, tags);
      capacityRetries.add(1, tags);
      const retryAfterSec = Number(response.headers['Retry-After'] || response.headers['retry-after'] || 1);
      let delaySec;
      if (retryMode === 'finaldraft') {
        delaySec = finalDraftRetryDelayMs(attempt, retryAfterSec * 1000) / 1000;
      } else {
        // fixed: sleep exactly Retry-After (legacy adversarial behavior)
        delaySec = Math.min(30, Math.max(0.2, retryAfterSec));
      }
      sleep(delaySec);
      continue;
    }

    break;
  }

  // Final non-durable 503 (attempt === maxAttempts, retries exhausted) — count once.
  if (Number(lastStatus) === 503) record503(last503Body, tags);

  recordEventualOutcome({
    ok: false,
    latencyMs: Date.now() - started,
    status: lastStatus,
    tags,
  });
  check(false, { 'eventual durable success': (value) => value === true });
  return false;
}
