import { createDecipheriv } from 'node:crypto'

/** Uses the archive key only; never substitutes the live business encryption key. */
export function decodeLegacyField(value: unknown, key = process.env.LEGACY_DATA_ENCRYPTION_KEY): unknown {
  if (typeof value !== 'string') return value
  if (value.length > 2 * 1024 * 1024) throw new Error('Archive field exceeds read limit')
  const parts = value.split(':')
  const resemblesCipher = parts.length === 3 && /^[a-f0-9]{32}$/i.test(parts[0])
  if (!resemblesCipher) return value
  if (!key || !/^[a-f0-9]{64}$/i.test(key) || !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^(?:[a-f0-9]{2})+$/i.test(parts[2])) {
    throw new Error('Archive decryption unavailable')
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(parts[0], 'hex'))
    decipher.setAuthTag(Buffer.from(parts[1], 'hex'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[2], 'hex')), decipher.final()]).toString('utf8'))
  } catch {
    // Ciphertext, key, plaintext and crypto exceptions must never enter logs.
    throw new Error('Archive decryption unavailable')
  }
}
