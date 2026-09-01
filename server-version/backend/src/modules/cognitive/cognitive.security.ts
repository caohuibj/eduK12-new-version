import { createHmac } from 'crypto'
import { encryptField, decryptField, HEX_32_BYTE_KEY } from '../../utils/encryption'

/**
 * Cognitive 域专用安全助手。
 *
 * 设计原则（见 Milestone D v1.2 收口文档 P0-1 / P0-3）：
 *  - Cognitive 是全新域，没有历史明文兼容需求，因此一律使用 STRICT 解密（decryptField），
 *    绝不使用 utils/encryption 的 safeDecrypt（后者会回退到明文 JSON，可能掩盖安全回归）。
 *  - 所有敏感字段（score / metrics / qualityFlags / trial payload）共用同一 envelope 契约，
 *    便于统一加解密与类型安全。
 *  - participantKey 与 trial payload 完整性使用独立于数据加密密钥的 secret，
 *    避免加密密钥轮换破坏研究参与者跨时间关联或留下可字典比对的明文摘要。
 */

const ENVELOPE_VERSION = 1
const INTEGRITY_DOMAIN = 'cognitive-trial-integrity-v1'

let cachedPseudonymKeySource: string | undefined
let cachedPseudonymKey: Buffer | undefined
let cachedIntegrityKeySource: string | undefined
let cachedIntegrityKey: Buffer | undefined

export interface CognitiveEnvelope<T> {
  version: number
  value: T
}

// ---------------------------------------------------------------------------
// Key accessors
// ---------------------------------------------------------------------------

const getPseudonymKey = (): Buffer => {
  const key = process.env.DATA_PSEUDONYM_KEY
  if (!key || !HEX_32_BYTE_KEY.test(key)) {
    throw new Error('DATA_PSEUDONYM_KEY must be exactly 64 hex characters (32 bytes)')
  }
  if (cachedPseudonymKeySource === key && cachedPseudonymKey) return cachedPseudonymKey
  cachedPseudonymKeySource = key
  cachedPseudonymKey = Buffer.from(key, 'hex')
  return cachedPseudonymKey
}

// 从 DATA_ENCRYPTION_KEY 派生 trial 完整性密钥（domain separation），不新增环境变量。
const getIntegrityKey = (): Buffer => {
  const encKey = process.env.DATA_ENCRYPTION_KEY
  if (!encKey || !HEX_32_BYTE_KEY.test(encKey)) {
    throw new Error('DATA_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)')
  }
  if (cachedIntegrityKeySource === encKey && cachedIntegrityKey) return cachedIntegrityKey
  cachedIntegrityKeySource = encKey
  cachedIntegrityKey = createHmac('sha256', Buffer.from(encKey, 'hex'))
    .update(INTEGRITY_DOMAIN)
    .digest()
  return cachedIntegrityKey
}

// 递归稳定规范化：对象键排序 + 无空白，保证 payloadHash 与字段顺序无关。
const sortDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortDeep(obj[k])
        return acc
      }, {})
  }
  return value
}

export const canonicalJson = (value: unknown): string => JSON.stringify(sortDeep(value))

// ---------------------------------------------------------------------------
// Strict encryption (统一 envelope)
// ---------------------------------------------------------------------------

// score(number) / metrics(object) / qualityFlags(object) / trial payload(object) 共用一种加密 envelope。
export const encryptCognitivePayload = <T>(value: T): string => {
  const envelope: CognitiveEnvelope<T> = { version: ENVELOPE_VERSION, value }
  return encryptField(envelope)
}

// 严格解密：非加密格式直接抛错，绝不回退明文。
export const decryptCognitivePayload = <T>(field: string): T => {
  if (typeof field !== 'string') {
    throw new Error('Cognitive encrypted field must be a string')
  }
  const envelope = decryptField<CognitiveEnvelope<T>>(field)
  if (!envelope || envelope.version !== ENVELOPE_VERSION) {
    throw new Error('Unsupported or missing cognitive envelope version')
  }
  return envelope.value
}

// ---------------------------------------------------------------------------
// Participant pseudonymization（独立于数据加密密钥）
// ---------------------------------------------------------------------------

export const getParticipantKey = (userId: string): string => {
  if (!userId) throw new Error('userId is required for participantKey')
  return createHmac('sha256', getPseudonymKey())
    .update(userId)
    .digest('hex')
}

// ---------------------------------------------------------------------------
// Keyed trial payload hash（完整性，非明文 deterministic digest）
// ---------------------------------------------------------------------------

export const hashTrialPayload = (payload: unknown): string => {
  return createHmac('sha256', getIntegrityKey())
    .update(canonicalJson(payload))
    .digest('hex')
}
