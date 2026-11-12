import { randomBytes, randomUUID } from 'node:crypto'
import { describe, it, expect, vi, afterAll } from 'vitest'
import express from 'express'

const joinStudy = vi.hoisted(() => vi.fn(async () => ({ studyId: 'study', credential: 'credential', displayCode: 'P-TEST' })))
const recoverParticipationCode = vi.hoisted(() => vi.fn(async () => ({ studyId: 'study', credential: 'credential', displayCode: 'P-TEST' })))
vi.mock('../../modules/anonymous-study/service', () => ({
  joinStudy,
  recoverParticipationCode,
}))

import { publicAnonymousStudyRouter, anonymousJoinRateLimit } from '../../modules/anonymous-study/routes'
import { BoundedAdmissionBusyError } from '../../services/boundedAdmissionGate'

const bearer = () => `Bearer ${randomBytes(32).toString('base64url').slice(0, 43)}`

describe('anonymous join per-IP rate limit (500 / 15 min)', () => {
  const app = express()
  app.use(express.json())
  app.use('/api/public/anonymous-studies', publicAnonymousStudyRouter)
  const server = app.listen(0, '127.0.0.1')
  const ready = new Promise<void>((resolve) => server.once('listening', resolve))
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  })

  it('allows 500 joins from one IP and rejects the 501st with 429', async () => {
    await ready
    const port = (server.address() as { port: number }).port
    const url = `http://127.0.0.1:${port}/api/public/anonymous-studies/waves/${randomUUID()}/join`
    // Each request carries a distinct bearer token so the router-level
    // 150/IP limiter (keyed by credential-or-IP) never binds; the join
    // limiter under test keys on IP only.
    const statuses: number[] = []
    for (let i = 0; i < 501; i += 1) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: bearer(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'x'.repeat(32), consent: true }),
      })
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 500).every((s) => s !== 429)).toBe(true)
    expect(statuses[500]).toBe(429)
    expect(joinStudy).toHaveBeenCalledTimes(500)
  }, 60000)

  it('keeps code recover/reset at the tighter 30 budget', async () => {
    await ready
    const port = (server.address() as { port: number }).port
    const url = `http://127.0.0.1:${port}/api/public/anonymous-studies/${randomUUID()}/code/recover`
    const statuses: number[] = []
    for (let i = 0; i < 31; i += 1) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'TEST-ABCD1234' }),
      })
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 30).every((s) => s !== 429)).toBe(true)
    expect(statuses[30]).toBe(429)
    expect(recoverParticipationCode).toHaveBeenCalledTimes(30)
  }, 60000)

  it('gate-rejected 503 joins do not consume the 500 budget', async () => {
    await ready
    const port = (server.address() as { port: number }).port
    const url = `http://127.0.0.1:${port}/api/public/anonymous-studies/waves/${randomUUID()}/join`
    // Reset this IP's counter: the first test in this file consumed the 500
    // budget with successful joins.
    anonymousJoinRateLimit.resetKey('127.0.0.1')
    // A 500-student burst from one NAT overflows the join gate; every 503 is
    // retried by the frontend (#704). If 503s counted, the retries alone
    // would exhaust the budget and the last students would get 429s.
    joinStudy.mockImplementation(async () => {
      throw new BoundedAdmissionBusyError({
        gate: 'study_join_admission',
        reason: 'queue_full',
        retryAfterSeconds: 1,
        code: 'STUDY_JOIN_BUSY',
      })
    })
    const statuses: number[] = []
    for (let i = 0; i < 500; i += 1) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'x'.repeat(32), consent: true }),
      })
      statuses.push(res.status)
    }
    expect(statuses.every((s) => s === 503)).toBe(true)
    // express-rate-limit decrements a failed request asynchronously after
    // the response finishes; poll until the counter settles at 0.
    const start = Date.now()
    for (;;) {
      const info = await anonymousJoinRateLimit.getKey('127.0.0.1')
      if ((info?.totalHits ?? 0) === 0) break
      if (Date.now() - start > 5000) {
        throw new Error(`timed out waiting for totalHits=0, got ${info?.totalHits}`)
      }
      await new Promise((r) => setTimeout(r, 25))
    }
    // The same student retrying after the gate drains must still get in:
    // the 500 failed attempts consumed none of the budget.
    joinStudy.mockImplementation(async () => ({ studyId: 'study', credential: 'credential', displayCode: 'P-TEST' }))
    const retry = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'x'.repeat(32), consent: true }),
    })
    expect(retry.status).toBe(200)
  }, 60000)

  it('counts malformed and forbidden joins so failed code guesses remain bounded', async () => {
    await ready
    const port = (server.address() as { port: number }).port
    const url = `http://127.0.0.1:${port}/api/public/anonymous-studies/waves/${randomUUID()}/join`
    anonymousJoinRateLimit.resetKey('127.0.0.1')
    const malformed = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'short', consent: true }),
    })
    expect(malformed.status).toBe(400)
    joinStudy.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    const denied = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'x'.repeat(32), consent: true }),
    })
    expect(denied.status).toBe(403)
    expect((await anonymousJoinRateLimit.getKey('127.0.0.1'))?.totalHits).toBe(2)
  }, 60000)
})
