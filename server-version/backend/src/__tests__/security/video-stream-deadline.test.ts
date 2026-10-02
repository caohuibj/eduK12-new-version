import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const m = vi.hoisted(() => ({ get: vi.fn(), lookup: vi.fn() }))
vi.mock('axios', () => ({ default: { get: m.get } }))
vi.mock('dns', () => ({ promises: { lookup: m.lookup } }))
import { downloadVideo } from '../../utils/videoDownloader'
let dir: string
const body = () => new Readable({ read() {} })
describe('remote video lifetime covers DNS, redirects and stream body', () => {
 beforeEach(async () => { vi.clearAllMocks(); dir = await mkdtemp(path.join(tmpdir(), 'video-deadline-test-')); m.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]) })
 afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
 it.each(['stalled', 'trickling'])('aborts a %s 200 body, closes it and removes partial files', async mode => {
   const stream = body()
   m.get.mockResolvedValue({ status: 200, headers: {}, data: stream })
   const ticker = mode === 'trickling' ? setInterval(() => stream.push(Buffer.from('x')), 10) : undefined
   const began = Date.now()
   try {
     const result = await downloadVideo('https://public.example/video', { tempDir: dir, timeout: 80, maxFileSize: 1000 })
     expect(result.success).toBe(false); expect(result.error).toMatch(/超时/); expect(Date.now()-began).toBeLessThan(600)
     expect(stream.destroyed).toBe(true); expect(await readdir(dir)).toEqual([])
   } finally { if (ticker) clearInterval(ticker); stream.destroy() }
 })
 it('bounds a DNS lookup which never resolves', async () => {
   m.lookup.mockReturnValue(new Promise(() => {}))
   const result = await downloadVideo('https://public.example/video', { tempDir: dir, timeout: 40 })
   expect(result.success).toBe(false); expect(m.get).not.toHaveBeenCalled(); expect(await readdir(dir)).toEqual([])
 })
 it('keeps a normal completed body and exact bytes', async () => {
   m.get.mockResolvedValue({ status: 200, headers: { 'content-type': 'video/mp4' }, data: Readable.from([Buffer.from('synthetic-video')]) })
   const result = await downloadVideo('https://public.example/video', { tempDir: dir, timeout: 500 })
   expect(result.success).toBe(true); expect(await readFile(result.localPath!, 'utf8')).toBe('synthetic-video')
 })
 it('destroys redirected responses and applies one deadline to the chain', async () => {
   const first = body(), second = body()
   m.get.mockImplementationOnce(async () => { await new Promise(r => setTimeout(r, 35)); return { status: 302, headers: { location: '/final' }, data: first } })
   m.get.mockResolvedValueOnce({ status: 200, headers: {}, data: second })
   const began = Date.now(); const result = await downloadVideo('https://public.example/video', { tempDir: dir, timeout: 80 })
   expect(result.success).toBe(false); expect(Date.now()-began).toBeLessThan(600); expect(first.destroyed).toBe(true); expect(second.destroyed).toBe(true)
 })
 it('still rejects chunked bodies exceeding the byte cap and clears files', async () => {
   m.get.mockResolvedValue({ status: 200, headers: {}, data: Readable.from([Buffer.alloc(20)]) })
   const result = await downloadVideo('https://public.example/video', { tempDir: dir, timeout: 500, maxFileSize: 10 })
   expect(result.success).toBe(false); expect(await readdir(dir)).toEqual([])
 })
})
