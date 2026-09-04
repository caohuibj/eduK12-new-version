import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  isDurableSuccessStatus,
  recordEventualOutcome,
  record503,
  fixturesUsed,
  freshCompletions,
  idempotentReplays,
  missingFixtures,
} from './eventual-success.js';

const baseUrl = String(__ENV.BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');

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
  const maxAttempts = Number(__ENV.CAPACITY_RETRY_ATTEMPTS || 4);
  const started = Date.now();
  let lastStatus = 0;
  let sawFreshCompletion = false;
  let last503Body = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const path = String(request.path || '');
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = merge(request.headers);
    if (__ENV.AUTH_TOKEN) headers.Authorization = `Bearer ${__ENV.AUTH_TOKEN}`;
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

    if (response.status === 503 && attempt < maxAttempts) {
      record503(response.body, tags);
      const retryAfter = Number(response.headers['Retry-After'] || response.headers['retry-after'] || 1);
      sleep(Math.min(30, Math.max(0.2, retryAfter)));
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
