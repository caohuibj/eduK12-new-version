import { createHash } from 'node:crypto'

// Exact prior encoder for write-off rollback and a complete-package comparison.
const legacyJsonArtifactBytes = (value: unknown): Buffer | null => {
  const active = new WeakSet<object>()
  const visit = (entry: unknown): void => {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return
    if (typeof entry === 'number' && Number.isFinite(entry)) return
    if (typeof entry !== 'object' || entry === null) throw new Error('Not strict JSON')
    const proto = Object.getPrototypeOf(entry)
    if ((!Array.isArray(entry) && proto !== Object.prototype && proto !== null)
      || Object.getOwnPropertySymbols(entry).length || active.has(entry)) throw new Error('Not strict JSON')
    if ('toJSON' in entry || Object.values(Object.getOwnPropertyDescriptors(entry)).some(d => d.get || d.set)) throw new Error('Not strict JSON')
    active.add(entry)
    if (Array.isArray(entry)) {
      for (let i = 0; i < entry.length; i++) visit(entry[i])
    } else for (const key of Object.keys(entry)) visit((entry as Record<string, unknown>)[key])
    active.delete(entry)
  }
  try { visit(value); return Buffer.from(JSON.stringify(value), 'utf8') } catch { return null }
}


// Only strict JSON content is eligible. Different property order may miss the
// cache, but unsupported values must never collide with a previously valid row.
const verifiedFrozenJson = new WeakSet<object>()
const frozenJsonBytes = new WeakMap<object, Buffer>()
export const jsonArtifactBytes = (value: unknown): Buffer | null => {
  if (process.env.ASSESSMENT_SHARED_CONTROL_ENABLED !== 'true') return legacyJsonArtifactBytes(value)
  const active = new WeakSet<object>(), verified: object[] = []
  // Frozen plain JSON cannot change. Prototype JSON hooks invalidate reuse.
  const reusable = !('toJSON' in Object.prototype) && !('toJSON' in Array.prototype)
  if (reusable && value && typeof value === 'object') {
    const known = frozenJsonBytes.get(value); if (known) return Buffer.from(known)
  }
  const visit = (entry: unknown): boolean => {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return true
    if (typeof entry === 'number' && Number.isFinite(entry)) return true
    if (typeof entry !== 'object' || entry === null) throw new Error('Not strict JSON')
    if (reusable && verifiedFrozenJson.has(entry)) return true
    const proto = Object.getPrototypeOf(entry)
    if ((!Array.isArray(entry) && proto !== Object.prototype && proto !== null)
      || Object.getOwnPropertySymbols(entry).length || active.has(entry)) throw new Error('Not strict JSON')
    if ('toJSON' in entry || Object.values(Object.getOwnPropertyDescriptors(entry)).some(d => d.get || d.set)) throw new Error('Not strict JSON')
    active.add(entry); let immutable = Object.isFrozen(entry)
    if (Array.isArray(entry)) {
      for (let i = 0; i < entry.length; i++) immutable = visit(entry[i]) && immutable
    } else for (const key of Object.keys(entry)) immutable = visit((entry as Record<string, unknown>)[key]) && immutable
    active.delete(entry)
    if (immutable && reusable) verified.push(entry)
    return immutable
  }
  try {
    const immutable = visit(value), bytes = Buffer.from(JSON.stringify(value), 'utf8')
    for (const object of verified) verifiedFrozenJson.add(object)
    if (immutable && reusable && value && typeof value === 'object' && bytes.length <= 256 * 1024) frozenJsonBytes.set(value, Buffer.from(bytes))
    return bytes
  } catch { return null }
}

export const artifactContentKey = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

export class BoundedArtifactCache<T> {
  private readonly values = new Map<string, { value: T; charge: number }>()
  private bytes = 0
  private hits = 0
  private misses = 0
  constructor(readonly maxEntries: number, readonly maxBytes: number) {}
  get(key: string): T | undefined {
    const entry = this.values.get(key)
    if (!entry) { this.misses++; return undefined }
    this.hits++; this.values.delete(key); this.values.set(key, entry); return entry.value
  }
  set(key: string, value: T, charge: number): void {
    if (!Number.isSafeInteger(charge) || charge < 1 || charge > this.maxBytes) return
    const prior = this.values.get(key)
    if (prior) { this.bytes -= prior.charge; this.values.delete(key) }
    while (this.values.size >= this.maxEntries || this.bytes + charge > this.maxBytes) {
      const oldest = this.values.keys().next().value!
      this.bytes -= this.values.get(oldest)!.charge; this.values.delete(oldest)
    }
    this.values.set(key, { value, charge }); this.bytes += charge
  }
  stats() { return { entries: this.values.size, bytes: this.bytes, maxEntries: this.maxEntries,
    maxBytes: this.maxBytes, hits: this.hits, misses: this.misses } }
}
