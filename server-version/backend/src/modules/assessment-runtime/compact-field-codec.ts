import { createCipheriv, createDecipheriv, createHash, randomBytes, createSecretKey, type KeyObject } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

const PREFIX = 'ekc1:'
export const COMPACT_FIELD_MAX_BYTES = 8 * 1024 * 1024
export const compactAssessmentStorageEnabled = () => process.env.ASSESSMENT_COMPACT_FACTS_ENABLED === 'true'
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex')
let currentKey: { input: string; material: KeyObject; identity: string } | undefined
const key = () => {
  const input = process.env.DATA_ENCRYPTION_KEY
  if (currentKey && input === currentKey.input) return currentKey
  if (!input || !/^[a-fA-F0-9]{64}$/.test(input)) throw new Error('Compact field encryption key unavailable')
  const bytes = Buffer.from(input, 'hex')
  currentKey = { input, material: createSecretKey(bytes), identity: digest(bytes).slice(0, 16) }
  return currentKey
}
// Short control records should not allocate the default 16 KiB output chunk
// or full 32 KiB compression window on every read/write. The gzip wire format
// stays unchanged and all authenticated length/digest limits still apply.
const outputChunk = (bytes: number) => Math.max(64, Math.min(16 * 1024, bytes + 64))

export const isCompactEncryptedField = (value: unknown): boolean => typeof value === 'string' && value.startsWith(PREFIX)

/** Version, codec, key identity, declared length and plaintext digest are authenticated. */
export const encryptCompactField = (value: unknown, limit = COMPACT_FIELD_MAX_BYTES): string => {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('Compact field is not JSON')
  const plain = Buffer.from(serialized, 'utf8')
  if (plain.length < 1 || plain.length > limit || limit > COMPACT_FIELD_MAX_BYTES) throw new Error('Compact field size limit')
  const material = key(), iv = randomBytes(12), packed = gzipSync(plain, { level: 1, chunkSize: outputChunk(plain.length), ...(plain.length <= 4096 ? { windowBits: 12, memLevel: 4 } : {}) })
  const useGzip = packed.length < plain.length
  const header = `ekc1:${useGzip ? 'gz' : 'js'}:${material.identity}:${plain.length}:${digest(plain)}:`
  const cipher = createCipheriv('aes-256-gcm', material.material, iv)
  cipher.setAAD(Buffer.from(header))
  const body = Buffer.concat([cipher.update(useGzip ? packed : plain), cipher.final()])
  return header + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

export const decryptCompactField = <T>(value: string, limit = COMPACT_FIELD_MAX_BYTES): T => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > COMPACT_FIELD_MAX_BYTES || value.length > 2 * (limit + 1024)) throw new Error('Compact field size limit')
  const match = /^ekc1:(gz|js):([a-f0-9]{16}):([1-9][0-9]*):([a-f0-9]{64}):([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) throw new Error('Compact field encoding invalid')
  const size = Number(match[3]), material = key()
  if (!Number.isSafeInteger(size) || size > limit || match[2] !== material.identity) throw new Error('Compact field metadata invalid')
  const data = Buffer.from(match[5], 'base64')
  if (data.length < 29 || data.toString('base64') !== match[5] || data.length > limit + 1024) throw new Error('Compact field encoding invalid')
  const header = value.slice(0, value.length - match[5].length)
  const decipher = createDecipheriv('aes-256-gcm', material.material, data.subarray(0, 12))
  decipher.setAAD(Buffer.from(header)); decipher.setAuthTag(data.subarray(12, 28))
  const packed = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()])
  const plain = match[1] === 'gz' ? gunzipSync(packed, { maxOutputLength: Math.min(size, limit), chunkSize: outputChunk(size) }) : packed
  if (plain.length !== size || digest(plain) !== match[4]) throw new Error('Compact field integrity invalid')
  return JSON.parse(plain.toString('utf8')) as T
}
