import { describe, expect, it } from 'vitest'
import { PassThrough, Readable } from 'node:stream'
import { createReadStream } from 'node:fs'
import { once } from 'node:events'
import type { Response } from 'express'
import { streamResponse } from '../../utils/streamResponse'

describe('request-local stream lifecycle', () => {
  it.each(['ENOENT', 'EIO'])('handles asynchronous source %s without an uncaught error', async (code) => {
    const source = new Readable({ read() { this.destroy(Object.assign(new Error(code), { code })) } })
    const response = new PassThrough()
    const closed = new Promise<void>(resolve => response.once('close', resolve))
    streamResponse(source, response as unknown as Response)
    await closed
    expect(source.destroyed).toBe(true); expect(response.destroyed).toBe(true)
  })
  it('handles a file removed after the existence check', async () => {
    const response = new PassThrough()
    const closed = new Promise<void>(resolve => response.once('close', resolve))
    streamResponse(createReadStream('/nonexistent/prelaunch-deleted-file'), response as unknown as Response)
    await closed; expect(response.destroyed).toBe(true)
  })
  it.each([false, true])('releases source on client disconnect/response error: %s', async (error) => {
    const source = new PassThrough(); const response = new PassThrough()
    const closed = new Promise<void>(resolve => source.once('close', resolve))
    streamResponse(source, response as unknown as Response)
    response.destroy(error ? new Error('response EIO') : undefined)
    await closed; expect(source.destroyed).toBe(true)
  })
  it('delivers a subsequent healthy request normally', async () => {
    const response = new PassThrough(); let body = ''
    response.on('data', chunk => { body += chunk })
    const finished = once(response, 'finish')
    streamResponse(Readable.from(['healthy']), response as unknown as Response)
    await finished; expect(body).toBe('healthy')
  })
})
