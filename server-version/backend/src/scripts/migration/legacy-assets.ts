import { createHash } from 'node:crypto'
import { promises as fs, createReadStream } from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import COS from 'cos-nodejs-sdk-v5'
import { Prisma } from '@prisma/client'
import { createAttachmentSchema } from '../../utils/attachmentSchema'
import { validateMappedData, type ImportAction } from './import-plan'

type AssetSource = { provider: 'local'; file: string; fallbackCosKey?: string } | { provider: 'cos'; key: string }
type Identity = { ownerId: string | null; accessScope: 'PRIVATE' | 'COURSE' | 'PUBLIC_CHECKIN'; scopeId: string | null }
type Digest = { sha256: string; sizeBytes: number; mimeType: string; fingerprint: string }
export type AssetProblem = { model: string; id: string; field: string; reason: string }
export type AssetOptions = {
  mode: 'dry_run' | 'apply' | 'verify'; legacyUploadDir: string; uploadDir: string; cacheFile: string
  cosDomain: string; legacySiteHosts: string[]; externalHosts: string[]
}
const digestText = (value: string) => createHash('sha256').update(value).digest('hex')
const mimeFor = (name: string) => ({
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}[path.extname(name).toLowerCase()] || 'application/octet-stream')
const safeKey = (key: string) => {
  const clean = key.replace(/^\/+/, '')
  if (!clean || clean.startsWith('backups/') || clean.includes('\\') || clean.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid legacy business object key')
  return clean
}

export function resolveLegacyAssetSource(value: string, options: AssetOptions, explicitCosKey = false): AssetSource | 'external' | null {
  if (!value) return null
  if (explicitCosKey) return { provider: 'cos', key: safeKey(value) }
  let raw = value
  if (raw.startsWith('file://')) raw = new URL(raw).pathname
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw), domain = new URL(options.cosDomain)
    const bucket = process.env.LEGACY_COS_BUCKET || process.env.COS_BUCKET
    const region = process.env.LEGACY_COS_REGION || process.env.COS_REGION
    if (url.protocol !== 'https:') {
      if (!options.legacySiteHosts.includes(url.hostname)) throw new Error('Legacy remote media requires HTTPS')
    }
    if (url.hostname === domain.hostname || (bucket && region && url.hostname === bucket + '.cos.' + region + '.myqcloud.com')) {
      return { provider: 'cos', key: safeKey(decodeURIComponent(url.pathname)) }
    }
    if (options.legacySiteHosts.includes(url.hostname) && /^\/videos\/(processed|thumbnails)\//.test(url.pathname)) return { provider: 'cos', key: safeKey(decodeURIComponent(url.pathname)) }
    if (options.legacySiteHosts.includes(url.hostname) && url.pathname.startsWith('/uploads/')) raw = url.pathname
    else if (options.externalHosts.includes(url.hostname)) return 'external'
    else throw new Error('Unapproved legacy media hostname')
  }
  const marker = raw.lastIndexOf('/uploads/')
  const relative = marker >= 0 ? raw.slice(marker + '/uploads/'.length) : raw.replace(/^\/+/, '').replace(/^uploads\//, '')
  if (!relative || relative.includes('\\') || relative.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid legacy local path')
  const file = path.resolve(options.legacyUploadDir, relative), root = path.resolve(options.legacyUploadDir)
  if (!file.startsWith(root + path.sep)) throw new Error('Legacy local path escaped source root')
  return { provider: 'local', file, ...(/^(documents|images|covers)\//.test(relative) ? { fallbackCosKey: safeKey(relative) } : {}) }
}

/** Sequential, bounded-memory hashing; ETag identifies cache freshness, never content SHA-256. */
class AssetReader {
  private cos = new COS({ SecretId: process.env.COS_SECRET_ID || '', SecretKey: process.env.COS_SECRET_KEY || '',
    Timeout: 60000, ChunkRetryTimes: 1 })
  private cache: Record<string, Digest> = {}
  private verifiedTargets = new Set<string>()
  hashed = 0
  bytes = 0
  constructor(private options: AssetOptions) {}
  async open() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.options.cacheFile, 'utf8'))
      if (parsed.schemaVersion !== 1 || !parsed.entries || typeof parsed.entries !== 'object') throw new Error('Invalid digest cache')
      this.cache = parsed.entries
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw new Error('Invalid digest cache')
    }
  }
  private async save() {
    await fs.mkdir(path.dirname(this.options.cacheFile), { recursive: true, mode: 0o700 })
    const temporary = this.options.cacheFile + '.tmp'
    await fs.writeFile(temporary, JSON.stringify({ schemaVersion: 1, entries: this.cache }), { mode: 0o600 })
    await fs.chmod(temporary, 0o600)
    await fs.rename(temporary, this.options.cacheFile)
  }
  private location(key: string, source = true) {
    const Bucket = (source ? process.env.LEGACY_COS_BUCKET : undefined) || process.env.COS_BUCKET
    const Region = (source ? process.env.LEGACY_COS_REGION : undefined) || process.env.COS_REGION
    if (!Bucket || !Region || !process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) throw new Error('COS asset migration configuration unavailable')
    return { Bucket, Region, Key: safeKey(key) }
  }
  private async head(key: string, source = true) {
    const data: any = await new Promise((resolve, reject) => this.cos.headObject(this.location(key, source), (error, value) => error ? reject(error) : resolve(value)))
    const sizeBytes = Number(data.headers?.['content-length'])
    const etag = data.ETag || data.headers?.etag
    const modified = data.headers?.['last-modified']
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 2147483647 || !etag || !modified) throw new Error('Invalid COS object metadata')
    return { sizeBytes, mimeType: data.headers?.['content-type'] || mimeFor(key), etag,
      fingerprint: JSON.stringify([sizeBytes, etag, modified, data.VersionId || '']) }
  }
  private async hashCos(key: string, metadata: Awaited<ReturnType<AssetReader['head']>>, source = true): Promise<Digest> {
    const stream = new PassThrough({ highWaterMark: 65536 })
    const hash = createHash('sha256')
    let bytes = 0
    const completed = new Promise<void>((resolve, reject) => this.cos.getObject({
      ...this.location(key, source), IfMatch: metadata.etag, Output: stream,
    }, error => { if (error) { stream.destroy(new Error('COS content read failed')); reject(new Error('COS content read failed')) } else resolve() }))
    const consumed = (async () => { for await (const chunk of stream) { hash.update(chunk); bytes += chunk.length } })()
    await Promise.all([completed, consumed])
    if (bytes !== metadata.sizeBytes) throw new Error('COS content length mismatch')
    this.hashed += 1; this.bytes += bytes
    if (this.hashed % 10 === 0) process.stderr.write('Asset content hashed: ' + this.hashed + ' objects, ' + this.bytes + ' bytes\n')
    return { sha256: hash.digest('hex'), sizeBytes: bytes, mimeType: metadata.mimeType, fingerprint: metadata.fingerprint }
  }
  async digest(source: AssetSource): Promise<Digest> {
    let cacheKey: string, fingerprint: string, sizeBytes: number, mimeType: string
    let metadata: Awaited<ReturnType<AssetReader['head']>> | undefined
    if (source.provider === 'cos') {
      metadata = await this.head(source.key); fingerprint = metadata.fingerprint
      cacheKey = 'cos:' + this.location(source.key).Bucket + ':' + source.key
      sizeBytes = metadata.sizeBytes; mimeType = metadata.mimeType
    } else {
      const actual = await fs.realpath(source.file)
      const root = await fs.realpath(this.options.legacyUploadDir)
      if (!actual.startsWith(root + path.sep)) throw new Error('Legacy source symlink escaped root')
      const stat = await fs.stat(actual)
      if (!stat.isFile() || stat.size <= 0 || stat.size > 2147483647) throw new Error('Invalid local asset metadata')
      fingerprint = JSON.stringify([stat.size, stat.mtimeMs, stat.ino])
      cacheKey = 'local:' + actual; sizeBytes = stat.size; mimeType = mimeFor(actual)
    }
    const cached = this.cache[cacheKey]
    if (cached?.fingerprint === fingerprint && cached.sizeBytes === sizeBytes && /^[a-f0-9]{64}$/.test(cached.sha256)) return cached
    let result: Digest
    if (source.provider === 'cos') result = await this.hashCos(source.key, metadata!)
    else {
      const hash = createHash('sha256'), stream = createReadStream(source.file)
      let bytes = 0
      for await (const chunk of stream) { hash.update(chunk); bytes += chunk.length }
      if (bytes !== sizeBytes) throw new Error('Local content changed while hashing')
      result = { sha256: hash.digest('hex'), sizeBytes, mimeType, fingerprint }
      this.hashed += 1; this.bytes += bytes
    }
    this.cache[cacheKey] = result; await this.save()
    return result
  }
  async materialize(source: AssetSource, objectKey: string, expected: Digest) {
    if (this.options.mode === 'dry_run' || this.verifiedTargets.has(objectKey)) return
    if (source.provider === 'local') {
      const root = path.resolve(this.options.uploadDir), file = path.resolve(root, objectKey)
      if (!file.startsWith(root + path.sep)) throw new Error('Asset destination escaped root')
      if (this.options.mode === 'apply') {
        await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o750 })
        try { await fs.copyFile(source.file, file, 1); await fs.chmod(file, 0o600) }
        catch (error: any) { if (error.code !== 'EEXIST') throw error }
      }
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(file)) hash.update(chunk)
      if (hash.digest('hex') !== expected.sha256) throw new Error('Copied local content checksum mismatch')
    } else {
      let target: Awaited<ReturnType<AssetReader['head']>> | undefined
      try { target = await this.head(objectKey, false) }
      catch (error: any) {
        if (!(error.statusCode === 404 || error.code === 'NoSuchKey')) throw new Error('COS destination metadata unavailable')
        if (this.options.mode === 'verify') throw new Error('COS migrated object missing')
        const location = this.location(source.key)
        const copySource = location.Bucket + '.cos.' + location.Region + '.myqcloud.com/' + source.key.split('/').map(encodeURIComponent).join('/')
        await new Promise((resolve, reject) => this.cos.putObjectCopy({
          ...this.location(objectKey, false), CopySource: copySource, CopySourceIfMatch: JSON.parse(expected.fingerprint)[1],
          ACL: 'private',
        }, (error, data) => error ? reject(new Error('COS private copy failed')) : resolve(data)))
        target = await this.head(objectKey, false)
      }
      const cacheKey = 'target:' + this.location(objectKey, false).Bucket + ':' + objectKey
      const cached = this.cache[cacheKey]
      const checked = cached?.fingerprint === target.fingerprint && cached.sha256 === expected.sha256
        ? cached : await this.hashCos(objectKey, target, false)
      if (checked.sha256 !== expected.sha256 || checked.sizeBytes !== expected.sizeBytes) throw new Error('Copied COS content checksum mismatch')
      this.cache[cacheKey] = checked; await this.save()
    }
    this.verifiedTargets.add(objectKey)
  }
}

export async function planLegacyAssets(actions: ImportAction[], options: AssetOptions) {
  const reader = new AssetReader(options)
  await reader.open()
  const assets = new Map<string, ImportAction>(), references = new Map<string, ImportAction>()
  const problems: AssetProblem[] = []
  const courses = new Map(actions.filter(action => action.model === 'course').map(action => [action.args.where.id, action.args.create!]))
  const checkins = new Map(actions.filter(action => action.model === 'checkin').map(action => [action.args.where.id, action.args.create!]))
  const issue = (action: ImportAction, field: string, reason: string) => problems.push({ model: action.model, id: action.args.where.id, field, reason })
  async function ensure(action: ImportAction, field: string, candidates: Array<{ value: unknown; explicitKey?: boolean }>, identity: Identity, optional: boolean) {
    let hadSource = false
    for (const candidate of candidates) {
      if (typeof candidate.value !== 'string' || !candidate.value) continue
      hadSource = true
      let source = resolveLegacyAssetSource(candidate.value, options, candidate.explicitKey)
      if (source === 'external') { issue(action, field, 'external-link-preserved'); return null }
      if (!source) continue
      let metadata: Digest
      try { metadata = await reader.digest(source) }
      catch (error: any) {
        if (error.code === 'ENOENT' && source.provider === 'local' && source.fallbackCosKey) {
          source = { provider: 'cos', key: source.fallbackCosKey }
          try { metadata = await reader.digest(source) }
          catch (fallbackError: any) {
            if (fallbackError.statusCode === 404 || fallbackError.code === 'NoSuchKey') continue
            throw new Error('Legacy COS fallback verification failed')
          }
        } else if (error.code === 'ENOENT' || error.statusCode === 404 || error.code === 'NoSuchKey') continue
        else throw new Error('Legacy asset content verification failed')
      }
      const identityHash = digestText(JSON.stringify(identity)).slice(0, 24)
      const assetId = 'legacy-' + metadata.sha256 + '-' + identityHash
      const objectKey = 'assets/legacy/' + metadata.sha256 + '-' + identityHash + path.extname(candidate.value.split('?')[0]).toLowerCase().replace(/[^.a-z0-9]/g, '')
      await reader.materialize(source, objectKey, metadata)
      if (!assets.has(assetId)) assets.set(assetId, {
        model: 'storedAsset', operation: 'upsert', args: { where: { id: assetId }, create: {
          id: assetId, objectKey, provider: source.provider, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes,
          sha256: metadata.sha256, originalName: path.basename(candidate.value.split('?')[0]), ...identity,
        }, update: {} } as ImportAction['args'], mapping: { entity: 'stored_asset', legacyId: assetId, newId: assetId },
      })
      const entityType = action.model[0].toUpperCase() + action.model.slice(1)
      const refId = 'legacy-ref-' + digestText(JSON.stringify([assetId, entityType, action.args.where.id, field]))
      references.set(refId, { model: 'assetReference', operation: 'upsert',
        args: { where: { id: refId }, create: { id: refId, assetId, entityType, entityId: action.args.where.id, field }, update: {} } as ImportAction['args'],
        mapping: { entity: 'asset_reference', legacyId: refId, newId: refId } })
      return { id: assetId, objectKey: String(assets.get(assetId)!.args.create!.objectKey), provider: String(assets.get(assetId)!.args.create!.provider) }
    }
    if (hadSource || !optional) {
      issue(action, field, 'missing-source')
      if (!optional) throw new Error('Referenced active legacy asset has no verified source: ' + action.model + '.' + field + ' record=' + digestText(action.args.where.id).slice(0, 16))
    }
    return null
  }
  async function walk(action: ImportAction, value: unknown, field: string, identity: Identity): Promise<unknown> {
    if (value === Prisma.JsonNull || value === Prisma.DbNull || value == null) return value
    if (typeof value === 'string') {
      if (!/^https?:\/\//i.test(value) && !value.includes('/uploads/') && !value.startsWith('uploads/')) return value
      const asset = await ensure(action, field, [{ value }], identity, false)
      return asset ? { assetId: asset.id } : value
    }
    if (Array.isArray(value)) {
      const entries: unknown[] = []
      for (const [index, entry] of value.entries()) entries.push(await walk(action, entry, field + '.' + index, identity))
      return entries
    }
    if (typeof value !== 'object') return value
    const object = value as Record<string, unknown>
    const candidates = ['processedUrl', 'url', 'originalUrl', 'cosUrl', 'filePath'].filter(key => typeof object[key] === 'string').map(key => ({ value: object[key] }))
    if (candidates.length) {
      const asset = await ensure(action, field, candidates, identity, false)
      if (asset) return { ...Object.fromEntries(Object.entries(object).filter(([key]) => !['url', 'processedUrl', 'originalUrl', 'cosUrl', 'filePath'].includes(key))), assetId: asset.id }
      return object
    }
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(object)) result[key] = await walk(action, entry, field + '.' + key, identity)
    return result
  }
  for (const action of actions) {
    if (action.operation !== 'upsert') continue
    const row = action.args.create!
    if (action.model === 'video') {
      const identity: Identity = { ownerId: String(row.teacherId), accessScope: 'PRIVATE', scopeId: null }
      const optional = row.isDeleted === true
      const original = await ensure(action, 'original', [
        { value: row.originalCosKey, explicitKey: true }, { value: row.originalCosUrl }, { value: row.originalUrl }, { value: row.filePath },
      ], identity, optional || (row.status === 'COMPLETED' && Boolean(row.processedUrl)))
      if (original) { row.originalAssetId = original.id; row.filePath = original.objectKey; row.originalCosKey = original.provider === 'cos' ? original.objectKey : null }
      else { row.filePath = ''; row.originalCosKey = null }
      const processed = await ensure(action, 'processed', [{ value: row.processedUrl }], identity, optional || !row.processedUrl)
      if (processed) row.processedAssetId = processed.id
      if (!optional && !original) {
        if (!processed || row.status !== 'COMPLETED') throw new Error('Active legacy video has no verified playable source')
        issue(action, 'original', 'original-missing-verified-processed-preserved')
      }
      const thumbnail = await ensure(action, 'thumbnail', [{ value: row.thumbnailUrl }], identity, optional || !row.thumbnailUrl)
      if (thumbnail) row.thumbnailAssetId = thumbnail.id
      // Originals remain complete in the raw archive; runtime uses private catalog URLs.
      row.originalCosUrl = null; row.originalUrl = null; row.processedUrl = null; row.thumbnailUrl = null
    } else if (action.model === 'document') {
      const asset = await ensure(action, 'file', [{ value: row.cosKey, explicitKey: true }, { value: row.cosUrl }, { value: row.filePath }],
        { ownerId: String(row.teacherId), accessScope: 'PRIVATE', scopeId: null }, row.isDeleted === true)
      if (asset) { row.assetId = asset.id; row.filePath = asset.objectKey; row.cosKey = asset.provider === 'cos' ? asset.objectKey : null }
      else row.filePath = ''
      row.cosUrl = null
    } else if (action.model === 'course' && row.coverUrl) {
      const asset = await ensure(action, 'cover', [{ value: row.coverUrl }], { ownerId: String(row.creatorId), accessScope: 'COURSE', scopeId: String(row.id) }, false)
      if (asset) { row.coverAssetId = asset.id; row.coverUrl = null }
    } else if (action.model === 'assignment' || action.model === 'checkin') {
      const ownerId = action.model === 'assignment' ? String(courses.get(String(row.courseId))?.creatorId) : String(row.creatorId)
      if (!ownerId || ownerId === 'undefined') throw new Error('Legacy attachment owner is missing')
      const identity: Identity = { ownerId, accessScope: 'COURSE', scopeId: String(row.courseId) }
      for (const field of ['images', 'documents', 'videos']) {
        row[field] = await walk(action, row[field], field, identity)
        if (Array.isArray(row[field]) && !(row[field] as unknown[]).every(value => createAttachmentSchema(false).safeParse(value).success)) {
          throw new Error('Mapped legacy attachment violates runtime contract: ' + action.model + '.' + field)
        }
      }
    } else if (action.model === 'checkinSubmission') {
      const identity: Identity = row.isAnonymous ? { ownerId: row.studentId as string | null, accessScope: 'PUBLIC_CHECKIN', scopeId: String(row.checkinId) }
        : { ownerId: row.studentId as string | null, accessScope: 'COURSE', scopeId: String(checkins.get(String(row.checkinId))?.courseId) }
      row.images = await walk(action, row.images, 'images', identity)
    }
  }
  // Owners are imported first; scope IDs are provenance strings, not FK records.
  const insertionIndex = actions.findIndex(action => !['user', 'teacherCode'].includes(action.model))
  actions.splice(insertionIndex < 0 ? actions.length : insertionIndex, 0, ...assets.values())
  actions.push(...references.values())
  for (const action of actions) validateMappedData(action.model, action.args.create ?? action.args.data ?? {}, action.operation === 'update')
  return { assets: assets.size, references: references.size, hashedObjects: reader.hashed, hashedBytes: reader.bytes, problems }
}
