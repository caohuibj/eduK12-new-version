import { afterEach, describe, expect, it } from 'vitest'
import { compare as nativeBcryptCompare, hash as nativeBcryptHash } from '@node-rs/bcrypt'
import bcrypt from 'bcryptjs'
import { Worker } from 'node:worker_threads'
import { createPasswordVerificationPool, PasswordVerificationPool } from '../../services/passwordVerificationPool'

const pools: PasswordVerificationPool[] = []
const create = (options: Parameters<typeof createPasswordVerificationPool>[0]) => {
  const pool = createPasswordVerificationPool(options)
  pools.push(pool)
  return pool
}
afterEach(async () => { await Promise.all(pools.splice(0).map(pool => pool.close())) })

describe('password verification threads', () => {
  it('matches existing bcryptjs passwords, Unicode and the 72-byte boundary', { timeout: 20_000 }, async () => {
    const pool = create({ size: 2 })
    const examples = ['SyntheticPass123!', '汉字🙂Password123', 'A'.repeat(72) + 'x', 'B'.repeat(71) + '🙂']
    for (const password of examples) {
      const hash = await bcrypt.hash(password, 10)
      for (const candidate of [password, password + 'different', 'wrong123']) {
        expect(await pool.compare(candidate, hash)).toBe(await bcrypt.compare(candidate, hash))
      }
    }
    expect(await pool.compare('password123', 'invalid-hash')).toBe(false)
  })
  it('isolates concurrent jobs and does not inherit application secrets', { timeout: 15_000 }, async () => {
    let inherited: unknown
    const pool = create({ size: 2, workerFactory: (source, options) => {
      inherited = options.env
      return new Worker(source, options)
    } })
    const hash = await bcrypt.hash('SyntheticPass123!', 10)
    const candidates = Array.from({ length: 12 }, (_, i) => i % 2 ? 'wrong123' : 'SyntheticPass123!')
    expect(await Promise.all(candidates.map(candidate => pool.compare(candidate, hash))))
      .toEqual(candidates.map((_, i) => i % 2 === 0))
    expect(inherited).toEqual({})
  })
  it('bounds the waiting queue and rejects overload without authenticating', async () => {
    const pool = create({ size: 1, maxQueue: 1 })
    const hash = await bcrypt.hash('SyntheticPass123!', 10)
    const active = pool.compare('SyntheticPass123!', hash)
    const waiting = pool.compare('wrong123', hash)
    await expect(pool.compare('SyntheticPass123!', hash)).rejects.toThrow('unavailable')
    expect(await active).toBe(true)
    expect(await waiting).toBe(false)
  })
  it('rejects active and queued work on a crash and does not restart repeatedly', async () => {
    let spawned = 0
    const pool = create({ size: 1, workerFactory: (_, options) => {
      spawned++
      return new Worker("throw new Error('private failure detail')", options)
    } })
    const results = await Promise.allSettled([pool.compare('private-password', 'private-hash'), pool.compare('other', 'hash')])
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason.message).toBe('Password verification unavailable')
    }
    expect(spawned).toBe(1)
  })
  it('isolates a stuck slot: surviving workers keep draining the queue', { timeout: 20_000 }, async () => {
    const spawned: string[] = []
    const pool = create({ size: 2, timeoutMs: 800, workerFactory: (_, options) => {
      const script = spawned.length === 0
        ? "require('node:worker_threads').parentPort.on('message', () => {})"
        : "const {parentPort, workerData} = require('node:worker_threads'); const b = require(workerData.modulePath); parentPort.on('message', ({id, password, hash}) => { setTimeout(() => parentPort.postMessage({id, valid: b.compareSync(password, hash)}), 150) })"
      spawned.push(script.slice(0, 24))
      return new Worker(script, options)
    } })
    const hash = await bcrypt.hash('SyntheticPass123!', 10)
    const a = pool.compare('SyntheticPass123!', hash)      // slot0 spawn#1 stuck -> timeout
    const b = pool.compare('wrong123', hash)               // slot1 spawn#2 (150ms delay)
    const c = pool.compare('SyntheticPass123!', hash)      // queued
    const d = pool.compare('SyntheticPass123!', hash)      // queued
    const e = pool.compare('wrong123', hash)               // queued when slot0 fails
    await expect(a).rejects.toThrow('unavailable')
    await expect(a).rejects.toMatchObject({ code: 'LOGIN_VERIFY_BUSY', retryAfterSeconds: 2 })
    await expect(await b).toBe(false)
    await expect(await c).toBe(true)
    await expect(await d).toBe(true)
    await expect(await e).toBe(false)
    expect(spawned.length).toBe(2)
  })

  it('cross-verifies native and bcryptjs hashes in both directions', { timeout: 15_000 }, async () => {
    const pool = create({ size: 2 })
    const nativeHash = await nativeBcryptHash('CrossCheck123!', { cost: 10 })
    const legacyHash = await bcrypt.hash('CrossCheck123!', 10)
    expect(await pool.compare('CrossCheck123!', nativeHash)).toBe(true)
    expect(await pool.compare('wrong', nativeHash)).toBe(false)
    expect(await pool.compare('CrossCheck123!', legacyHash)).toBe(true)
    expect(await bcrypt.compare('CrossCheck123!', nativeHash)).toBe(true)
    expect(await nativeBcryptCompare('CrossCheck123!', legacyHash)).toBe(true)
  })

  it('times out a stuck worker and safely closes pending work', async () => {
    const pool = create({ size: 1, timeoutMs: 100, workerFactory: (_, options) =>
      new Worker("require('node:worker_threads').parentPort.on('message', () => {})", options) })
    await expect(pool.compare('password', 'hash')).rejects.toThrow('unavailable')
    const pending = pool.compare('password', 'hash')
    const rejected = expect(pending).rejects.toThrow('unavailable')
    await pool.close()
    await rejected
    await expect(pool.compare('password', 'hash')).rejects.toThrow('unavailable')
  })

  it('pre-warms worker slots on warm() and reuses them without respawning', { timeout: 15_000 }, async () => {
    let spawned = 0
    const pool = create({
      size: 2,
      workerFactory: (source, options) => {
        spawned += 1
        return new Worker(source, options)
      },
    })
    pool.warm()
    expect(spawned).toBe(2)
    const hash = await bcrypt.hash('WarmPoolPass123!', 10)
    expect(await Promise.all([pool.compare('WarmPoolPass123!', hash), pool.compare('wrong', hash)])).toEqual([true, false])
    expect(spawned).toBe(2)
  })
})

