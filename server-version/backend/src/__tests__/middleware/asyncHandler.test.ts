import express from 'express'
import type { Server } from 'node:http'
import { describe, expect, it } from 'vitest'
import { asyncHandler } from '../../middleware/asyncHandler'
import { errorHandler } from '../../middleware/errorHandler'

describe('Express 4 async error forwarding', () => {
  it('returns a sanitized 500 and keeps the server available after a rejected Run handler', async () => {
    const app = express()
    app.get('/fail', asyncHandler(async () => { throw new Error('private database detail') }))
    app.get('/ok', (_req, res) => { res.json({ ok: true }) })
    app.use(errorHandler)
    const server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
    })
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('test server has no TCP port')
      const base = `http://127.0.0.1:${address.port}`
      const failed = await fetch(`${base}/fail`)
      expect(failed.status).toBe(500)
      expect(JSON.stringify(await failed.json())).not.toContain('private database detail')
      expect((await (await fetch(`${base}/ok`)).json())).toEqual({ ok: true })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
