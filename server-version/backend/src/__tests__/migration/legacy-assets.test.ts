import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { planLegacyAssets, resolveLegacyAssetSource, type AssetOptions } from '../../scripts/migration/legacy-assets'
import { type ImportAction } from '../../scripts/migration/import-plan'
let folder: string, options: AssetOptions
const bytes = Buffer.from('synthetic media content')
function action(): ImportAction {
  return { model: 'video', operation: 'upsert', args: { where: { id: 'v1' }, create: {
    id: 'v1', title: 'Synthetic video', teacherId: 'teacher1', filePath: '/uploads/videos/source.mp4',
    fileName: 'source.mp4', fileSize: bytes.length, mimeType: 'video/mp4', isDeleted: false, status: 'COMPLETED',
  }, update: {} } as any, mapping: { entity: 'video', legacyId: 'v1', newId: 'v1' } }
}
beforeEach(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-assets-test-'))
  options = { mode: 'dry_run', legacyUploadDir: path.join(folder, 'source'), uploadDir: path.join(folder, 'target'),
    cacheFile: path.join(folder, 'private', 'digests.json'), cosDomain: 'https://cdn.example.test',
    legacySiteHosts: ['old.example.test'], externalHosts: ['www.bilibili.com'] }
  await fs.mkdir(path.join(options.legacyUploadDir, 'videos'), { recursive: true })
  await fs.writeFile(path.join(options.legacyUploadDir, 'videos', 'source.mp4'), bytes)
})
afterEach(async () => { await fs.rm(folder, { recursive: true, force: true }) })
describe('legacy asset content and isolation', () => {
  it('rejects path traversal, backups and unapproved remote hosts', () => {
    expect(() => resolveLegacyAssetSource('/uploads/../../secret', options)).toThrow()
    expect(() => resolveLegacyAssetSource('backups/db.sql', options, true)).toThrow()
    expect(() => resolveLegacyAssetSource('https://127.0.0.1/private', options)).toThrow()
    expect(resolveLegacyAssetSource('https://www.bilibili.com/video/example', options)).toBe('external')
    expect(resolveLegacyAssetSource('https://cdn.example.test/videos/source.mp4', options)).toEqual({ provider: 'cos', key: 'videos/source.mp4' })
  })
  it('dry-run hashes actual bytes and catalogs scope without copying or writing business data', async () => {
    const rows = [action()]
    const result = await planLegacyAssets(rows, options)
    expect(result).toMatchObject({ assets: 1, references: 1, hashedObjects: 1, hashedBytes: bytes.length, problems: [] })
    const asset = rows.find(row => row.model === 'storedAsset')!
    expect(asset.args.create).toMatchObject({ sha256: createHash('sha256').update(bytes).digest('hex'), ownerId: 'teacher1', accessScope: 'PRIVATE', provider: 'local' })
    await expect(fs.stat(options.uploadDir)).rejects.toThrow()
    expect((await fs.stat(options.cacheFile)).mode & 0o777).toBe(0o600)
    expect(rows.find(row => row.model === 'video')!.args.create!.originalAssetId).toBe(asset.args.where.id)
  })
  it('apply copies and verifies content; replay is stable and verify detects changed destination', async () => {
    const rows = [action()]
    await planLegacyAssets(rows, { ...options, mode: 'apply' })
    const asset = rows.find(row => row.model === 'storedAsset')!
    const target = path.join(options.uploadDir, String(asset.args.create!.objectKey))
    expect(await fs.readFile(target)).toEqual(bytes)
    const second = [action()]
    await planLegacyAssets(second, { ...options, mode: 'verify' })
    expect(second.find(row => row.model === 'storedAsset')!.args.where.id).toBe(asset.args.where.id)
    await fs.writeFile(target, 'tampered')
    await expect(planLegacyAssets([action()], { ...options, mode: 'verify' })).rejects.toThrow('checksum mismatch')
  })
  it('rejects active missing files and retains deleted tombstones with explicit issues', async () => {
    const active = action(); active.args.create!.filePath = '/uploads/videos/missing.mp4'
    await expect(planLegacyAssets([active], options)).rejects.toThrow('no verified source')
    const deleted = action(); deleted.args.create!.filePath = '/uploads/videos/missing.mp4'; deleted.args.create!.isDeleted = true
    const result = await planLegacyAssets([deleted], options)
    expect(result.assets).toBe(0)
    expect(result.problems).toContainEqual({ model: 'video', id: 'v1', field: 'original', reason: 'missing-source' })
    expect(deleted.args.create).toMatchObject({ isDeleted: true, filePath: '' })
  })
  it('deduplicates identical bytes within one owner and separates different owners', async () => {
    const a = action(), b = action(), c = action()
    b.args.where.id = 'v2'; b.args.create!.id = 'v2'; b.mapping = { entity: 'video', legacyId: 'v2', newId: 'v2' }
    c.args.where.id = 'v3'; c.args.create!.id = 'v3'; c.args.create!.teacherId = 'teacher2'; c.mapping = { entity: 'video', legacyId: 'v3', newId: 'v3' }
    const result = await planLegacyAssets([a, b, c], options)
    expect(result.assets).toBe(2); expect(result.references).toBe(3)
    expect(a.args.create!.originalAssetId).toBe(b.args.create!.originalAssetId)
    expect(c.args.create!.originalAssetId).not.toBe(a.args.create!.originalAssetId)
  })
})
