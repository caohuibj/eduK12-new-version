import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const fake = vi.hoisted(() => ({ objects: new Map<string, Buffer>(), copies: [] as Record<string, any>[] }))
vi.mock('cos-nodejs-sdk-v5', () => ({ default: class {
  headObject(params: any, callback: any) {
    const bytes = fake.objects.get(params.Key)
    if (!bytes) { callback({ statusCode: 404, code: 'NoSuchKey' }); return }
    callback(null, { ETag: createHash('sha256').update(bytes).digest('hex'), headers: {
      'content-length': String(bytes.length), 'content-type': 'video/mp4', 'last-modified': 'Thu, 01 Oct 2026 00:00:00 GMT',
    } })
  }
  getObject(params: any, callback: any) {
    const bytes = fake.objects.get(params.Key)
    if (!bytes) { callback({ statusCode: 404 }); return }
    params.Output.end(bytes); queueMicrotask(() => callback(null, {}))
  }
  putObjectCopy(params: any, callback: any) {
    fake.copies.push(params)
    const key = params.CopySource.split('.myqcloud.com/')[1]
    fake.objects.set(params.Key, Buffer.from(fake.objects.get(key)!)); callback(null, {})
  }
} }))
import { planLegacyAssets, type AssetOptions } from '../../scripts/migration/legacy-assets'
import type { ImportAction } from '../../scripts/migration/import-plan'
let folder: string, options: AssetOptions
const rows = (): ImportAction[] => [{ model: 'video', operation: 'upsert', args: {
  where: { id: 'v1' }, create: { id: 'v1', title: 'Synthetic', teacherId: 't1', filePath: 'videos/source.mp4',
    originalCosKey: 'videos/source.mp4', fileName: 'source.mp4', mimeType: 'video/mp4', fileSize: 15, isDeleted: false }, update: {},
} as any, mapping: { entity: 'video', legacyId: 'v1', newId: 'v1' } }]
beforeEach(async () => {
  fake.objects.clear(); fake.copies.length = 0; fake.objects.set('videos/source.mp4', Buffer.from('synthetic-bytes'))
  vi.stubEnv('COS_SECRET_ID', 'synthetic-id'); vi.stubEnv('COS_SECRET_KEY', 'synthetic-key')
  vi.stubEnv('COS_BUCKET', 'synthetic-123'); vi.stubEnv('COS_REGION', 'ap-beijing')
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-cos-test-'))
  options = { mode: 'dry_run', legacyUploadDir: path.join(folder, 'old'), uploadDir: path.join(folder, 'new'),
    cacheFile: path.join(folder, 'cache.json'), cosDomain: 'https://cdn.example.test', legacySiteHosts: [], externalHosts: [] }
})
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(folder, { recursive: true, force: true }) })
describe('COS migration adapter', () => {
  it('dry-run reads actual source bytes and never copies; apply creates a private verified copy', async () => {
    const dryRows = rows(), source = Buffer.from(fake.objects.get('videos/source.mp4')!)
    const dry = await planLegacyAssets(dryRows, options)
    expect(dry.hashedBytes).toBe(source.length); expect(fake.copies).toHaveLength(0)
    const asset = dryRows.find(row => row.model === 'storedAsset')!
    expect(asset.args.create!.sha256).toBe(createHash('sha256').update(source).digest('hex'))
    const appliedRows = rows()
    const applied = await planLegacyAssets(appliedRows, { ...options, mode: 'apply' })
    expect(applied.hashedBytes).toBe(source.length) // source is cached, private target is read back
    expect(fake.copies).toHaveLength(1)
    expect(fake.copies[0]).toMatchObject({ ACL: 'private', CopySourceIfMatch: createHash('sha256').update(source).digest('hex') })
    expect(fake.objects.get('videos/source.mp4')).toEqual(source)
    expect(fake.objects.get(String(asset.args.create!.objectKey))).toEqual(source)
  })
  it('verify refuses corrupted destination content without overwriting original or target', async () => {
    const appliedRows = rows()
    await planLegacyAssets(appliedRows, { ...options, mode: 'apply' })
    const key = String(appliedRows.find(row => row.model === 'storedAsset')!.args.create!.objectKey)
    fake.objects.set(key, Buffer.from('tampered-target'))
    await expect(planLegacyAssets(rows(), { ...options, mode: 'verify' })).rejects.toThrow('checksum mismatch')
    expect(fake.copies).toHaveLength(1)
    expect(fake.objects.get(key)).toEqual(Buffer.from('tampered-target'))
    expect(fake.objects.get('videos/source.mp4')).toEqual(Buffer.from('synthetic-bytes'))
  })
})
