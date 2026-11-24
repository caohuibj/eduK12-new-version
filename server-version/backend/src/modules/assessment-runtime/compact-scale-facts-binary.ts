import { createCipheriv, createDecipheriv, createHash, createSecretKey, randomBytes, type KeyObject } from 'node:crypto'
import * as zlib from 'node:zlib'
import { COMPACT_FIELD_MAX_BYTES } from './compact-field-codec'

const PREFIX = 'ekf1:'
const DOMAIN = Buffer.from('eduk12:scale-facts:v1:')
const HEX64 = /^[a-f0-9]{64}$/
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const WHOLE_SUB_RE = /^whole-([a-f0-9]{64})$/

export type BinaryScaleFacts = {
  kind: 'SCALE_RESULT_FACTS'
  version: 1 | 2
  binding: { assessmentId: string; attemptEpoch: number; submissionId: string; payloadHash: string }
  sourceResultHash: string
  bundle?: string
  base: string
  scores: Array<[number | null, string, boolean, number[] | null, Record<string, unknown>]>
  quality: { status: 'interpretable' | 'limited' | 'invalid'; flags: Array<'missing_items' | 'insufficient_items' | 'score_not_calculable'> }
  context: { schemaVersion: 1; snapshotHash: string } | null
  items: Array<[number, number, number, number, Record<string, unknown>]>
  references: Array<{ base: string; band: string | null; hasBand: boolean; dynamic: Record<string, unknown> }>
  interpretations: Array<{ template: string; extras: Record<string, unknown> }>
  caveats: string
  extras: Record<string, unknown>
  methodExtras: Record<string, unknown>
  canonical: null | { template: string; values: unknown[] }
  completedAt?: string
}

let cachedKey: { input: string; key: KeyObject; id8: Buffer } | undefined
const keyMaterial = () => {
  const input = process.env.DATA_ENCRYPTION_KEY
  if (cachedKey && input === cachedKey.input) return cachedKey
  if (!input || !/^[a-fA-F0-9]{64}$/.test(input)) throw new Error('Compact facts encryption key unavailable')
  const bytes = Buffer.from(input, 'hex')
  cachedKey = {
    input,
    key: createSecretKey(bytes),
    id8: createHash('sha256').update(bytes).digest().subarray(0, 8),
  }
  return cachedKey
}

type ZstdSyncFn = (input: Buffer, options?: Record<string, unknown>) => Buffer
const zstdCompressSync: ZstdSyncFn | undefined = typeof (zlib as Record<string, unknown>).zstdCompressSync === 'function'
  ? (zlib as unknown as { zstdCompressSync: ZstdSyncFn }).zstdCompressSync
  : undefined
const zstdDecompressSync: ZstdSyncFn | undefined = typeof (zlib as Record<string, unknown>).zstdDecompressSync === 'function'
  ? (zlib as unknown as { zstdDecompressSync: ZstdSyncFn }).zstdDecompressSync
  : undefined
const ZSTD_C_COMPRESSION_LEVEL = (zlib.constants as Record<string, number>).ZSTD_c_compressionLevel
const useZstdCodec = () => process.env.ASSESSMENT_COMPACT_CODEC !== 'gzip' && typeof zstdCompressSync === 'function'

const isEmptyObj = (value: Record<string, unknown> | undefined | null): boolean =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
const isNibbleInt = (v: number): boolean => Number.isInteger(v) && v >= 0 && v <= 15
const isInt16 = (v: number): boolean => Number.isInteger(v) && v >= -32768 && v <= 32767 && !Object.is(v, -0)
const isCanonicalIso = (value: string | undefined): value is string => {
  if (typeof value !== 'string') return false
  const ms = Date.parse(value)
  return Number.isSafeInteger(ms) && ms >= 0 && new Date(ms).toISOString() === value
}
const hex32 = (value: string): Buffer => {
  if (!HEX64.test(value)) throw new Error('Invalid compact facts hex digest')
  return Buffer.from(value, 'hex')
}
const writeU16 = (n: number): Buffer => {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new Error('Compact facts count out of bounds')
  const b = Buffer.allocUnsafe(2); b.writeUInt16BE(n); return b
}
const writeU32 = (n: number): Buffer => {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error('Compact facts integer out of bounds')
  const b = Buffer.allocUnsafe(4); b.writeUInt32BE(n); return b
}
const writeId = (value: string): Buffer => {
  if (UUID_RE.test(value)) return Buffer.concat([Buffer.from([1]), Buffer.from(value.replace(/-/g, ''), 'hex')])
  const utf8 = Buffer.from(value, 'utf8')
  if (utf8.length < 1 || utf8.length > 2048) throw new Error('Compact facts id length invalid')
  return Buffer.concat([Buffer.from([0]), writeU16(utf8.length), utf8])
}
const writeSubId = (value: string): Buffer => {
  const whole = WHOLE_SUB_RE.exec(value)
  if (whole) return Buffer.concat([Buffer.from([2]), Buffer.from(whole[1], 'hex')])
  return writeId(value)
}

const SCORE_STATUS_LIST = ['calculated', 'limited', 'not_calculable'] as const

export const isCompactScaleFactsBinary = (value: unknown): value is `ekf1:${string}` =>
  typeof value === 'string' && value.startsWith(PREFIX)

export const encryptCompactScaleFactsBinary = (facts: BinaryScaleFacts, estPlainBytes: number): string => {
  if (!Number.isSafeInteger(estPlainBytes) || estPlainBytes < 1 || estPlainBytes > COMPACT_FIELD_MAX_BYTES) {
    throw new Error('Compact facts size limit')
  }
  const hasBundle = typeof facts.bundle === 'string' && HEX64.test(facts.bundle)
  const hasCanonical = facts.canonical !== null
  const fastCompletedAt = isCanonicalIso(facts.completedAt)
  const fastContext = facts.context !== null
    && facts.context.schemaVersion === 1
    && HEX64.test(facts.context.snapshotHash)
    && Object.keys(facts.context).length === 2
  const itemsFastPack = facts.items.length <= 0xffff && facts.items.every(
    (row, i) => row[0] === i && row[3] === 0 && isEmptyObj(row[4]) && isNibbleInt(row[1]) && isNibbleInt(row[2]),
  )
  const scoresFastPack = facts.scores.length <= 0xffff && facts.scores.every(
    row => row[3] === null && isEmptyObj(row[4]) && (SCORE_STATUS_LIST as readonly string[]).includes(row[1]),
  )
  const defaultQuality = facts.quality.status === 'interpretable'
    && facts.quality.flags.length === 0
    && Object.keys(facts.quality).length === 2

  const tail: Record<string, unknown> = {}
  if (!defaultQuality) tail.q = facts.quality
  if (facts.completedAt !== undefined && !fastCompletedAt) tail.t = facts.completedAt
  if (facts.context !== null && !fastContext) tail.c = facts.context
  if (!itemsFastPack) tail.i = facts.items
  if (!scoresFastPack) tail.s = facts.scores
  if (hasCanonical && facts.canonical!.values.length > 0) tail.cv = facts.canonical!.values
  if (!isEmptyObj(facts.extras)) tail.ex = facts.extras
  if (!isEmptyObj(facts.methodExtras)) tail.mx = facts.methodExtras

  const refDynamics: Record<string, unknown>[] = []
  const refParts: Buffer[] = [writeU16(facts.references.length)]
  for (const ref of facts.references) {
    const hasDyn = !isEmptyObj(ref.dynamic)
    const rFlags = (ref.hasBand ? 1 : 0) | (ref.band !== null ? 2 : 0) | (hasDyn ? 4 : 0)
    refParts.push(Buffer.from([rFlags]), hex32(ref.base))
    if (ref.band !== null) refParts.push(hex32(ref.band))
    if (hasDyn) refDynamics.push(ref.dynamic)
  }
  if (refDynamics.length) tail.rd = refDynamics

  const interpExtras: Record<string, unknown>[] = []
  const interpParts: Buffer[] = [writeU16(facts.interpretations.length)]
  for (const interp of facts.interpretations) {
    const hasEx = !isEmptyObj(interp.extras)
    interpParts.push(Buffer.from([hasEx ? 1 : 0]), hex32(interp.template))
    if (hasEx) interpExtras.push(interp.extras)
  }
  if (interpExtras.length) tail.ie = interpExtras

  const hasTailJson = Object.keys(tail).length > 0
  const flags = (facts.version === 2 ? 1 : 0)
    | (hasBundle ? 2 : 0)
    | (hasCanonical ? 4 : 0)
    | (fastCompletedAt ? 8 : 0)
    | (fastContext ? 16 : 0)
    | (itemsFastPack ? 32 : 0)
    | (scoresFastPack ? 64 : 0)
    | (hasTailJson ? 128 : 0)

  const chunks: Buffer[] = [
    Buffer.from([flags]),
    writeId(facts.binding.assessmentId),
    writeU32(facts.binding.attemptEpoch),
    writeSubId(facts.binding.submissionId),
    hex32(facts.binding.payloadHash),
    hex32(facts.sourceResultHash),
  ]
  if (hasBundle) {
    chunks.push(hex32(facts.bundle!))
  } else {
    chunks.push(hex32(facts.base), hex32(facts.caveats))
    if (hasCanonical) chunks.push(hex32(facts.canonical!.template))
  }
  chunks.push(Buffer.from([defaultQuality ? 0 : 1]))
  if (fastCompletedAt) {
    const tBuf = Buffer.allocUnsafe(8)
    tBuf.writeBigUInt64BE(BigInt(Date.parse(facts.completedAt!)))
    chunks.push(tBuf)
  }
  if (fastContext) chunks.push(hex32(facts.context!.snapshotHash))
  chunks.push(...refParts, ...interpParts)
  if (itemsFastPack) {
    const itemBuf = Buffer.allocUnsafe(2 + facts.items.length)
    itemBuf.writeUInt16BE(facts.items.length, 0)
    for (let i = 0; i < facts.items.length; i++) {
      itemBuf[2 + i] = ((facts.items[i][1] & 0xf) << 4) | (facts.items[i][2] & 0xf)
    }
    chunks.push(itemBuf)
  }
  if (scoresFastPack) {
    chunks.push(writeU16(facts.scores.length))
    for (const row of facts.scores) {
      const statusIdx = SCORE_STATUS_LIST.indexOf(row[1] as typeof SCORE_STATUS_LIST[number])
      const val = row[0]
      if (val === null) {
        chunks.push(Buffer.from([statusIdx | (row[2] ? 4 : 0) | 8]))
      } else if (isInt16(val)) {
        const b = Buffer.allocUnsafe(3)
        b[0] = statusIdx | (row[2] ? 4 : 0) | 16
        b.writeInt16BE(val, 1)
        chunks.push(b)
      } else {
        const b = Buffer.allocUnsafe(9)
        b[0] = statusIdx | (row[2] ? 4 : 0)
        b.writeDoubleBE(val, 1)
        chunks.push(b)
      }
    }
  }
  if (hasTailJson) chunks.push(Buffer.from(JSON.stringify(tail), 'utf8'))

  const plain = Buffer.concat(chunks)
  if (plain.length < 1 || plain.length > COMPACT_FIELD_MAX_BYTES) throw new Error('Compact facts binary size limit')

  let codec = 0
  let payload: Buffer = plain
  if (plain.length >= 96) {
    if (useZstdCodec()) {
      const packed = zstdCompressSync!(plain, ZSTD_C_COMPRESSION_LEVEL !== undefined
        ? { params: { [ZSTD_C_COMPRESSION_LEVEL]: 3 } }
        : undefined)
      if (packed.length < plain.length) { codec = 2; payload = packed }
    } else {
      const packed = zlib.gzipSync(plain, {
        level: plain.length >= 256 ? 6 : 1,
        chunkSize: Math.max(64, Math.min(16 * 1024, plain.length + 64)),
      })
      if (packed.length < plain.length) { codec = 1; payload = packed }
    }
  }

  const material = keyMaterial()
  const header = Buffer.allocUnsafe(14)
  header[0] = 1
  header[1] = codec
  material.id8.copy(header, 2)
  header.writeUInt32BE(plain.length, 10)

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', material.key, iv)
  cipher.setAAD(Buffer.concat([DOMAIN, Buffer.from(`${estPlainBytes}:`), header]))
  const body = Buffer.concat([cipher.update(payload), cipher.final()])
  return `${PREFIX}${estPlainBytes}:${Buffer.concat([header, iv, cipher.getAuthTag(), body]).toString('base64')}`
}

export const decryptCompactScaleFactsBinary = (value: string, limit = COMPACT_FIELD_MAX_BYTES): BinaryScaleFacts => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > COMPACT_FIELD_MAX_BYTES || value.length > 2 * (limit + 1024)) {
    throw new Error('Compact facts size limit')
  }
  const match = /^ekf1:([1-9][0-9]*):([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) throw new Error('Compact facts encoding invalid')
  const estPlainBytes = Number(match[1])
  if (!Number.isSafeInteger(estPlainBytes) || estPlainBytes < 1 || estPlainBytes > limit) {
    throw new Error('Compact facts metadata invalid')
  }
  const data = Buffer.from(match[2], 'base64')
  if (data.length < 43 || data.toString('base64') !== match[2] || data.length > limit + 1024) {
    throw new Error('Compact facts encoding invalid')
  }
  const header = data.subarray(0, 14)
  const material = keyMaterial()
  const codec = header[1]
  const binLen = header.readUInt32BE(10)
  if (header[0] !== 1 || codec > 2 || !header.subarray(2, 10).equals(material.id8) || binLen < 1 || binLen > limit) {
    throw new Error('Compact facts metadata invalid')
  }
  const decipher = createDecipheriv('aes-256-gcm', material.key, data.subarray(14, 26))
  decipher.setAAD(Buffer.concat([DOMAIN, Buffer.from(`${estPlainBytes}:`), header]))
  decipher.setAuthTag(data.subarray(26, 42))
  const packed = Buffer.concat([decipher.update(data.subarray(42)), decipher.final()])
  let plain: Buffer
  if (codec === 0) {
    plain = packed
  } else if (codec === 1) {
    plain = zlib.gunzipSync(packed, { maxOutputLength: Math.min(binLen, limit) })
  } else {
    if (!zstdDecompressSync) throw new Error('Compact facts zstd codec unavailable')
    plain = zstdDecompressSync(packed, { maxOutputLength: Math.min(binLen, limit) })
  }
  if (plain.length !== binLen) throw new Error('Compact facts integrity invalid')

  let cursor = 0
  const take = (n: number): Buffer => {
    if (cursor + n > plain.length) throw new Error('Compact facts truncated')
    const out = plain.subarray(cursor, cursor + n); cursor += n; return out
  }
  const readU16 = () => take(2).readUInt16BE()
  const readHex32 = () => take(32).toString('hex')
  const readId = (): string => {
    const tag = take(1)[0]
    if (tag === 1) {
      const h = take(16).toString('hex')
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
    }
    if (tag === 2) return `whole-${take(32).toString('hex')}`
    if (tag !== 0) throw new Error('Compact facts id tag invalid')
    const len = readU16()
    if (len < 1 || len > 2048) throw new Error('Compact facts id length invalid')
    return take(len).toString('utf8')
  }

  const flags = take(1)[0]
  const version: 1 | 2 = (flags & 1) ? 2 : 1
  const hasBundle = Boolean(flags & 2)
  const hasCanonical = Boolean(flags & 4)
  const fastCompletedAt = Boolean(flags & 8)
  const fastContext = Boolean(flags & 16)
  const itemsFastPack = Boolean(flags & 32)
  const scoresFastPack = Boolean(flags & 64)
  const hasTailJson = Boolean(flags & 128)

  const assessmentId = readId()
  const attemptEpoch = take(4).readUInt32BE()
  const submissionId = readId()
  const payloadHash = readHex32()
  const sourceResultHash = readHex32()

  let bundle: string | undefined
  let base = ''
  let caveats = ''
  let canonicalTemplate = ''
  if (hasBundle) {
    bundle = readHex32()
  } else {
    base = readHex32()
    caveats = readHex32()
    if (hasCanonical) canonicalTemplate = readHex32()
  }

  const qualityCode = take(1)[0]
  let completedAt: string | undefined
  if (fastCompletedAt) {
    const ms = take(8).readBigUInt64BE()
    if (ms > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Compact facts timestamp invalid')
    completedAt = new Date(Number(ms)).toISOString()
  }
  let context: BinaryScaleFacts['context'] = null
  if (fastContext) context = { schemaVersion: 1, snapshotHash: readHex32() }

  const refCount = readU16()
  const rawRefs: Array<{ base: string; band: string | null; hasBand: boolean; hasDyn: boolean }> = []
  for (let i = 0; i < refCount; i++) {
    const rFlags = take(1)[0]
    const refBase = readHex32()
    const band = (rFlags & 2) ? readHex32() : null
    rawRefs.push({ base: refBase, band, hasBand: Boolean(rFlags & 1), hasDyn: Boolean(rFlags & 4) })
  }

  const interpCount = readU16()
  const rawInterps: Array<{ template: string; hasEx: boolean }> = []
  for (let i = 0; i < interpCount; i++) {
    const iFlags = take(1)[0]
    rawInterps.push({ template: readHex32(), hasEx: Boolean(iFlags & 1) })
  }

  let items: BinaryScaleFacts['items'] = []
  if (itemsFastPack) {
    const itemCount = readU16()
    const packedItems = take(itemCount)
    items = new Array(itemCount)
    for (let i = 0; i < itemCount; i++) {
      const b = packedItems[i]
      items[i] = [i, (b >> 4) & 0xf, b & 0xf, 0, {}]
    }
  }

  let scores: BinaryScaleFacts['scores'] = []
  if (scoresFastPack) {
    const scoreCount = readU16()
    scores = new Array(scoreCount)
    for (let i = 0; i < scoreCount; i++) {
      const sByte = take(1)[0]
      const statusIdx = sByte & 3
      if (statusIdx >= SCORE_STATUS_LIST.length) throw new Error('Compact facts score status invalid')
      const prorated = Boolean(sByte & 4)
      let val: number | null
      if (sByte & 8) val = null
      else if (sByte & 16) val = take(2).readInt16BE()
      else val = take(8).readDoubleBE()
      scores[i] = [val, SCORE_STATUS_LIST[statusIdx], prorated, null, {}]
    }
  }

  let tail: Record<string, any> = {}
  if (hasTailJson) {
    const tailBytes = take(plain.length - cursor)
    tail = JSON.parse(tailBytes.toString('utf8'))
    if (!tail || typeof tail !== 'object' || Array.isArray(tail)) throw new Error('Compact facts tail invalid')
  }
  if (cursor !== plain.length) throw new Error('Compact facts trailing bytes')

  const quality = qualityCode === 0 ? { status: 'interpretable' as const, flags: [] } : tail.q
  if (!fastCompletedAt && tail.t !== undefined) completedAt = tail.t
  if (!fastContext && tail.c !== undefined) context = tail.c
  if (!itemsFastPack) items = tail.i
  if (!scoresFastPack) scores = tail.s

  let rdIdx = 0
  const rdList: Record<string, unknown>[] = Array.isArray(tail.rd) ? tail.rd : []
  const references = rawRefs.map(r => ({
    base: r.base,
    band: r.band,
    hasBand: r.hasBand,
    dynamic: r.hasDyn ? rdList[rdIdx++] : {},
  }))

  let ieIdx = 0
  const ieList: Record<string, unknown>[] = Array.isArray(tail.ie) ? tail.ie : []
  const interpretations = rawInterps.map(x => ({
    template: x.template,
    extras: x.hasEx ? ieList[ieIdx++] : {},
  }))

  return {
    kind: 'SCALE_RESULT_FACTS',
    version,
    binding: { assessmentId, attemptEpoch, submissionId, payloadHash },
    sourceResultHash,
    ...(bundle ? { bundle } : {}),
    base,
    scores,
    quality,
    context,
    items,
    references,
    interpretations,
    caveats,
    extras: tail.ex ?? {},
    methodExtras: tail.mx ?? {},
    canonical: hasCanonical ? { template: canonicalTemplate, values: Array.isArray(tail.cv) ? tail.cv : [] } : null,
    ...(completedAt !== undefined ? { completedAt } : {}),
  }
}
