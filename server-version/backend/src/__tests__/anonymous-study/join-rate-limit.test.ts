import { randomBytes, randomUUID } from 'node:crypto'
import { describe, it, expect, vi, afterAll } from 'vitest'
import express from 'express'

const joinStudy = vi.hoisted(() => vi.fn(async () => ({ studyId: 'study', credential: 'credential', displayCode: 'P-TEST' })))
const recoverParticipationCode = vi.hoisted(() => vi.fn(async () => ({ studyId: 'study', credential: 'credential', displayCode: 'P-TEST' })))
vi.mock('../../modules/anonymous-study/service', () => ({
  joinStudy,
  recoverParticipationCode,
}))

import { publicAnonymousStudyRouter } from '../../modules/anonymous-study/routes'

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
})
