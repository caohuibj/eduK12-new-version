import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  isDurableSuccessStatus,
  recordEventualOutcome,
} from './eventual-success.js';

const baseUrl = String(__ENV.BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');

export function loadFixtureGroup(fixtures, groupName) {
  const group = fixtures[groupName];
  if (Array.isArray(group)) return group;
  if (group && Array.isArray(group.requests)) return group.requests;
  return [];
}

export function pickFreshRequest(requests, index) {
  if (!requests.length) return null;
  // Fresh fixture per logical submit: walk the list without wrapping when possible.
  if (index < requests.length) return requests[index];
  return null;
}

/**
 * Attempt one logical submit. Optional capacity retries on 503 only (not 429).
 * Returns whether eventual durable success was observed.
 */
export function runLogicalSubmit(request, tags = {}) {
  if (!request) {
    recordEventualOutcome({ ok: false, status: 0, tags: { ...tags, reason: 'missing_fixture' } });
    check(false, { 'fixture present': (value) => value === true });
    return false;
  }

  const maxAttempts = Number(__ENV.CAPACITY_RETRY_ATTEMPTS || 4);
  const started = Date.now();
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const path = String(request.path || '');
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = { ...(request.headers || {}) };
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
      tags: { ...tags, attempt: String(attempt) },
    });
    lastStatus = response.status;

    if (isDurableSuccessStatus(response.status)) {
      recordEventualOutcome({
        ok: true,
        latencyMs: Date.now() - started,
        status: response.status,
        tags,
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
      const retryAfter = Number(response.headers['Retry-After'] || response.headers['retry-after'] || 1);
      sleep(Math.min(30, Math.max(0.2, retryAfter)));
      continue;
    }

    break;
  }

  recordEventualOutcome({
    ok: false,
    latencyMs: Date.now() - started,
    status: lastStatus,
    tags,
  });
  check(false, { 'eventual durable success': (value) => value === true });
  return false;
}
