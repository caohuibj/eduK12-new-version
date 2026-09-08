import { createHmac } from 'node:crypto'
import { HEX_32_BYTE_KEY } from '../../utils/encryption'

let cachedKeySource: string | undefined
let cachedKey: Buffer | undefined

const pseudonymKey = (): Buffer => {
  const source = process.env.DATA_PSEUDONYM_KEY
  if (!source || !HEX_32_BYTE_KEY.test(source)) {
    throw new Error('DATA_PSEUDONYM_KEY must be exactly 64 hex characters (32 bytes)')
  }
  if (cachedKeySource === source && cachedKey) return cachedKey
  cachedKeySource = source
  cachedKey = Buffer.from(source, 'hex')
  return cachedKey
}

/** Stable per-user pseudonym shared by standalone runtime domains. */
export const getParticipantKey = (userId: string): string => {
  if (!userId) throw new Error('userId is required for participantKey')
  return createHmac('sha256', pseudonymKey()).update(userId).digest('hex')
}
