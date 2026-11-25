import { isDeepStrictEqual } from 'node:util'
import { serialize as serializeV8, deserialize as deserializeV8 } from 'node:v8'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { canonicalHash } from './canonical'

export class DynamicFinalAuthorityRead extends Error {}

type AuthorityReadEntry = { value: unknown; digest: string; bytes: number; deadlines: number[]; copy?: Buffer }
const authorityReadCaches = new WeakMap<object, { entries: Map<string, AuthorityReadEntry>; bytes: number }>()
const AUTHORITY_CACHE_BYTES = 16 * 1024 * 1024
const AUTHORITY_CACHE_ENTRIES = 512
const serializeRead = (value: unknown): string => {
  try { return JSON.stringify(value) ?? 'null' }
  catch (error) {
    if (!(error instanceof TypeError) || !/BigInt/i.test(error.message)) throw error
    return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? { bigint: String(item) } : item) ?? 'null'
  }
}
const hashRead = (serialized: string) => createHash('sha256').update(serialized).digest('hex')

/** Preparation can reuse previously committed read results. Every recorded read
 * still executes again under the original write-transaction locks. This cache
 * never contains computed scores/receipts, and never substitutes for the live
 * authority check. A changed result evicts its entry and aborts the fresh FINAL. */

/** Capture the reads used by FINAL governance computation, then repeat only
 * those reads under the final transaction's authority/parent locks. This keeps
 * interpretation, report projection and encryption outside the transaction
 * without accepting a grant/release/context that changed during preparation.
 * The proxy deliberately cannot mutate business state. */
export async function captureFinalAuthorityReads<T>(db: object, work: (readDb: any) => Promise<T>) {
  let cache = authorityReadCaches.get(db)
  if (!cache) { cache = { entries: new Map(), bytes: 0 }; authorityReadCaches.set(db, cache) }
  const reads: Array<{ run: (tx: any) => Promise<unknown>; expected?: AuthorityReadEntry; key: string }> = []
  const preparedAt = Date.now()
  let validityDeadline = Infinity
  const pending = new Map<string, AuthorityReadEntry>()
  const accessed = new Set<string>()
  const evict = (key: string) => {
    const old = cache!.entries.get(key)
    if (old) { cache!.entries.delete(key); cache!.bytes -= old.bytes }
  }
  const clone = (value: any): any => {
    if (value instanceof Date) return new Date(value)
    if (Buffer.isBuffer(value)) return Buffer.from(value)
    if (value instanceof Prisma.Decimal) return new Prisma.Decimal(value)
    if (value?.strings && Array.isArray(value.values)) return Prisma.sql([...value.strings], ...value.values.map(clone))
    if (Array.isArray(value)) return value.map(clone)
    if (value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)]))
    return value
  }
  const nativeCopyable = (value: any, seen = new WeakSet<object>()): boolean => {
    if (value == null || typeof value !== 'object') return typeof value !== 'function' && typeof value !== 'symbol'
    if (value instanceof Date || Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return true
    if (seen.has(value)) return true
    seen.add(value)
    if (Array.isArray(value)) return value.every(item => nativeCopyable(item, seen))
    const prototype = Object.getPrototypeOf(value)
    return (prototype === Object.prototype || prototype === null) && Object.values(value).every(item => nativeCopyable(item, seen))
  }
  const temporal = (value: any): boolean => value instanceof Date
    || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/.test(value)
    || Array.isArray(value) && value.some(temporal)
    || value != null && typeof value === 'object' && Object.values(value).some(temporal)
  const argumentsSnapshot = (args: any[]) => {
    if (args.some(temporal)) throw new DynamicFinalAuthorityRead('FINAL authority has a temporal query argument')
    return args.map((arg,i)=>i===0&&Array.isArray(arg)&&(arg as unknown as TemplateStringsArray).raw ? arg : clone(arg))
  }
  const deadlinesIn = (value: any, field = '', output: number[] = []): number[] => {
    if (/expires?(_?at)?$|valid_?(until|to)$|ends?_?at$|not_?after$|deadline$/i.test(field)) {
      const millis = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : typeof value === 'number' ? value : NaN
      if (Number.isFinite(millis)) output.push(millis)
    }
    if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      for (const [key, child] of Object.entries(value)) deadlinesIn(child, key, output)
    }
    return output
  }
  const bindValidity = (entry: AuthorityReadEntry) => {
    for (const deadline of entry.deadlines) if (deadline > preparedAt) validityDeadline = Math.min(validityDeadline, deadline)
  }
  // Preserve the original single-connection invocation order, including when
  // a cached read would otherwise overtake an earlier cold read.
  let readQueue: Promise<unknown> = Promise.resolve()
  const record = (source: any, run: (target: any) => Promise<unknown>, method: string, args: unknown[], cacheable = true) => {
    const key = method + ':' + hashRead(serializeRead(args))
    accessed.add(key)
    const read: typeof reads[number] = { run, key }
    reads.push(read)
    const result = readQueue.then(async () => {
      let expected = cacheable ? pending.get(key) ?? cache!.entries.get(key) : undefined
      if (expected) {
        if (cache!.entries.has(key)) { cache!.entries.delete(key); cache!.entries.set(key, expected) }
        read.expected = expected
        bindValidity(expected)
        return expected.copy ? deserializeV8(expected.copy) : clone(expected.value)
      }
      const value = await run(source), serialized = serializeRead(value)
      expected = { value: clone(value), digest: hashRead(serialized), bytes: Math.max(512, Buffer.byteLength(serialized) * 6 + key.length * 2), deadlines: deadlinesIn(value) }
      if (nativeCopyable(expected.value)) expected.copy = serializeV8(expected.value)
      read.expected = expected
      bindValidity(expected)
      if (cacheable && expected.bytes <= AUTHORITY_CACHE_BYTES) pending.set(key, expected)
      return value
    })
    readQueue = result.then(() => undefined, () => undefined)
    return result
  }
  const isRead = (sql: string) => /^\s*(SELECT|WITH)\b/i.test(sql)
    && !/\b(INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+[\w".]+\s+SET|ALTER\s+TABLE|DROP\s+|TRUNCATE\s+|COPY\s+)\b/i.test(sql)
  const wrap = (source: any): any => new Proxy(source, { get(target: any, key: string) {
    if (key === '$transaction' && typeof target.$transaction !== 'function') return undefined
    if (key === '$transaction') return (fn: any, options?: any) => {
      if (typeof fn !== 'function') throw new Error('FINAL_PREPARATION_READ_ONLY')
      return target.$transaction((tx: any) => fn(wrap(tx)), options)
    }
    if (['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe'].includes(key)) {
      return (...args: any[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : Array.from(args[0]?.strings ?? args[0] ?? []).join('?')
        // Wall-clock-dependent authority must be evaluated by the original
        // transaction path; a result digest cannot validate a moving clock.
        if (/\b(clock_timestamp|statement_timestamp|transaction_timestamp|now)\s*\(|\b(CURRENT_TIMESTAMP|CURRENT_DATE|LOCALTIME|LOCALTIMESTAMP)\b/i.test(sql)) throw new DynamicFinalAuthorityRead('FINAL authority depends on the live clock')
        if (!isRead(sql) || (key.includes('execute') && !/^\s*SELECT\s+set_config\(/i.test(sql))) throw new Error('FINAL_PREPARATION_READ_ONLY')
        if (/\bset_config\s*\(/i.test(sql)) {
          const names = [...sql.matchAll(/set_config\(\s*'([^']+)'/gi)].map(match => match[1])
          if (!names.length || names.some(name => !['join_collapse_limit','from_collapse_limit','plan_cache_mode'].includes(name))) throw new DynamicFinalAuthorityRead('FINAL authority requires session context')
        }
        const saved = argumentsSnapshot(args)
        return record(target, client => client[key](...saved), key, saved, !/\bset_config\s*\(/i.test(sql))
      }
    }
    const model = Reflect.get(target, key)
    if (!model || typeof model !== 'object') return model
    return new Proxy(model, { get(_model, method: string) {
      if (typeof model[method] !== 'function') return model[method]
      return (...args: any[]) => {
        if (!/^(find|count|aggregate|groupBy)/.test(method)) throw new Error('FINAL_PREPARATION_READ_ONLY')
        const saved = argumentsSnapshot(args)
        return record(target, client => client[key][method](...saved), key + '.' + method, saved)
      }
    } })
  } })
  let value: T
  try {
    value = await work(wrap(db))
    if (reads.some(read => !read.expected)) throw new Error('FINAL preparation left an authority read pending')
  }
  catch (error) { for (const key of accessed) evict(key); throw error }
  for (const [key, entry] of pending) {
    evict(key); cache.entries.set(key, entry); cache.bytes += entry.bytes
    while (cache.bytes > AUTHORITY_CACHE_BYTES || cache.entries.size > AUTHORITY_CACHE_ENTRIES) {
      evict(cache.entries.keys().next().value!)
    }
  }
  return { value, async verify(tx: any) {
    for (const read of reads) {
      const expected = read.expected!
      let actual: unknown
      try { actual = await read.run(tx) }
      catch (error) { evict(read.key); throw error }
      if (isDeepStrictEqual(actual, expected.value)) continue
      const serialized = serializeRead(actual)
      // Native serialization is cheap on the usual identical-result path. If
      // property ordering changed, retain canonical structural equality before
      // treating the authority as stale.
      if (hashRead(serialized) === expected.digest || canonicalHash(JSON.parse(serialized)) === canonicalHash(JSON.parse(serializeRead(expected.value)))) continue
      evict(read.key)
      const error = new Error('提交准备期间权威状态已变更，请重试') as Error & {code: string; statusCode: number}
      error.code = 'STALE_ATTEMPT'; error.statusCode = 409; throw error
    }
    // A grant can expire while raw row values remain unchanged. Recheck the
    // preparation interval as well as the live rows before allowing the write.
    if (Date.now() < preparedAt || Date.now() >= validityDeadline) {
      for (const key of accessed) evict(key)
      throw Object.assign(new Error('提交准备期间授权有效期已变更，请重试'), { code: 'STALE_ATTEMPT', statusCode: 409 })
    }
  } }
}
