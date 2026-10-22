import { createHmac, timingSafeEqual } from 'node:crypto'

/** RFC 6238 / Authenticator-compatible SHA-1, six digits, 30-second periods. */
export const TOTP_PERIOD_SECONDS = 30
export function encodeTotpSecret(secret: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0, encoded = ''
  for (const byte of secret) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 5) { bits -= 5; encoded += alphabet[(value >>> bits) & 31] }
  }
  if (bits) encoded += alphabet[(value << (5 - bits)) & 31]
  return encoded
}
export function totpAtStep(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac('sha1', secret).update(counter).digest()
  const offset = mac[mac.length - 1] & 15
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
export function matchTotpStep(secret: Buffer, code: string, lastUsedStep: bigint, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const current = Math.floor(now / (TOTP_PERIOD_SECONDS * 1000))
  for (const step of [current, current - 1, current + 1]) {
    if (step >= 0 && BigInt(step) > lastUsedStep && timingSafeEqual(Buffer.from(totpAtStep(secret, step)), Buffer.from(code))) return step
  }
  return null
}
