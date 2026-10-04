import { afterEach, describe, expect, it } from 'vitest'
import express from 'express'
import sharp from 'sharp'
import { request, type Server } from 'node:http'
import { promises as fs } from 'node:fs'
import { boundedUpload, acceptedImageTypes, uploadAdmission, validateImageBuffer } from '../../middleware/uploadAdmission'
const servers: Server[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))) })
async function endpoint(handler: Parameters<typeof boundedUpload>[3]) {
  const app = express(); app.post('/upload', boundedUpload('image', 1024 * 1024, acceptedImageTypes, handler))
  const server = app.listen(0, '127.0.0.1'); servers.push(server)
  await new Promise<void>(resolve => server.once('listening', resolve))
  return `http://127.0.0.1:${(server.address() as {port:number}).port}/upload`
}
async function send(url: string, bytes: Buffer) {
  const form = new FormData(); form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'test.png')
  return fetch(url, { method: 'POST', body: form })
}
describe('bounded multipart HTTP boundary', () => {
  it('accepts a genuine image and removes its private staging directory', async () => {
    let staging = ''
    const url = await endpoint(async (req, res) => { staging = req.file!.path; res.json({ bytes: req.file!.buffer.length }) })
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer()
    const response = await send(url, bytes); expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ bytes: bytes.length })
    await expect.poll(async () => fs.stat(staging).then(() => true, () => false)).toBe(false)
  })
  it('rejects magic-only malformed content before storage handler', async () => {
    let reached = false
    const url = await endpoint(async (_req, res) => { reached = true; res.end() })
    expect((await send(url, Buffer.from([137,80,78,71,13,10,26,10]))).status).toBe(400)
    expect(reached).toBe(false)
  })
  it('rejects oversized decoded dimensions', async () => {
    const bytes = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: 'black' } }).png().toBuffer()
    await expect(validateImageBuffer(bytes, 'image/png')).rejects.toThrow()
  })
  it('releases an incomplete multipart request after client disconnect', async () => {
    const url = await endpoint(async (_req, res) => { res.end() })
    const req = request(url, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=test-boundary' } })
    req.on('error', () => undefined)
    req.write('--test-boundary\r\nContent-Disposition: form-data; name="image"; filename="x.png"\r\nContent-Type: image/png\r\n\r\npartial')
    await expect.poll(() => uploadAdmission.getStats().active).toBe(1)
    req.destroy()
    await expect.poll(() => uploadAdmission.getStats().active, { timeout: 3000 }).toBe(0)
  })
  it('holds the concurrency permit through asynchronous storage, rejecting excess uploads', async () => {
    let release!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve })
    let active = 0
    const url = await endpoint(async (_req, res) => { active++; await barrier; res.end() })
    const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer()
    const first = send(url, bytes); const second = send(url, bytes)
    await expect.poll(() => active).toBe(2)
    const third = await send(url, bytes); expect(third.status).toBe(503); expect(third.headers.get('Retry-After')).toBe('2')
    expect(uploadAdmission.getStats().active).toBe(2)
    release(); await Promise.all([first, second])
    await expect.poll(() => uploadAdmission.getStats().active).toBe(0)
  })
})

describe('UTF-8 multipart filenames', () => {
  it.each(['中文验收资料.pdf', 'café.pdf', 'literal Â© 50%.pdf'])('preserves %s and the original file bytes', async name => {
    const app = express()
    app.post('/pdf', boundedUpload('document', 1024 * 1024, ['application/pdf'], async (req, res) => {
      res.json({ name: req.file!.originalname, bytes: req.file!.buffer.toString('base64') })
    }))
    const server = app.listen(0, '127.0.0.1'); servers.push(server)
    await new Promise<void>(resolve => server.once('listening', resolve))
    const bytes = Buffer.from('%PDF-1.4\n% 合成验收资料\n%%EOF')
    const form = new FormData(); form.append('document', new Blob([bytes], { type: 'application/pdf' }), name)
    const response = await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/pdf`, { method: 'POST', body: form })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name, bytes: bytes.toString('base64') })
  })
})
