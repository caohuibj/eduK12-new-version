import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import * as codec from '../../modules/assessment-runtime/compact-field-codec'
import { createPublicTemplateStore, publicTemplateHash, publicTemplates, publicTemplatesForDatabase,
  withCommittedPublicTemplates, type PublicTemplateRow } from '../../modules/assessment-runtime/public-templates'

const flatten = (xs: any[]): any[] => xs.flatMap(x => Array.isArray(x?.values) ? flatten(x.values) : [x])
function transaction(rows = new Map<string, PublicTemplateRow>()) {
  const query = vi.fn(async (first: any, ...rest: any[]) => {
    const sql = Array.isArray(first) ? first.join('?') : first.strings.join('?')
    const values = flatten(Array.isArray(first) ? rest : first.values)
    if (sql.includes('INSERT')) {
      for (let i = 0; i < values.length; i += 4) {
        const [templateHash, templateKind, plaintextBytes, payloadEncrypted] = values.slice(i, i + 4)
        if (!rows.has(templateHash)) rows.set(templateHash, { templateHash, templateKind, plaintextBytes, payloadEncrypted })
      }
      return []
    }
    return values.flatMap(h => rows.has(h) ? [rows.get(h)!] : [])
  })
  return { db: { $queryRaw: query } as unknown as Prisma.TransactionClient, query, rows }
}
describe('FINAL public template commit proofs', () => {
  beforeEach(() => vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64)))
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it('cold-reads an existing result bundle once and performs no encoding or insert', async () => {
    const value = { identity: randomUUID(), publicContent: 'Frozen scientific content' }, kind = 'SCALE_FACTS_BUNDLE' as const
    const hash = publicTemplateHash(kind, value), encrypted = codec.encryptCompactField({version:1,kind,value})
    const read = vi.fn(async () => [{templateHash:hash,templateKind:kind,plaintextBytes:Buffer.byteLength(JSON.stringify(value)),payloadEncrypted:encrypted}])
    const append = vi.fn(), encode = vi.spyOn(codec, 'encryptCompactField')
    const store = createPublicTemplateStore({read,append})
    expect(await store.saveMany([{kind,value},{kind,value}])).toEqual([hash,hash])
    expect(read).toHaveBeenCalledTimes(1)
    expect(append).not.toHaveBeenCalled()
    expect(encode).not.toHaveBeenCalled()
  })

  it('binds a cold-miss payload to the bytes hashed before the asynchronous lookup', async () => {
    const value = { identity: randomUUID(), text: 'original public content' }, kind = 'SCALE_INTERPRETATION' as const
    const expected = publicTemplateHash(kind, value), rows = new Map<string, PublicTemplateRow>()
    let first = true
    const store = createPublicTemplateStore({
      read: async hashes => {
        if (first) { first = false; value.text = 'changed while the query was pending'; return [] }
        return hashes.flatMap(h => rows.has(h) ? [rows.get(h)!] : [])
      },
      append: async batch => { for (const row of batch) rows.set(row.templateHash,row) },
    })
    expect(await store.saveMany([{kind,value}])).toEqual([expected])
    expect(store.get(expected)?.value.text).toBe('original public content')
    expect(codec.decryptCompactField<any>(rows.get(expected)!.payloadEncrypted).value.text).toBe('original public content')
  })

  it('promotes result templates only after commit and lets the next FINAL transaction avoid all template SQL', async () => {
    const value = { identity: randomUUID() }, kind = 'SCALE_FACTS_BUNDLE' as const, hash = publicTemplateHash(kind,value)
    const tx = transaction()
    await withCommittedPublicTemplates(work => work(tx.db), async db => {
      await publicTemplatesForDatabase(db).saveMany([{kind,value}])
      expect(publicTemplates.get(hash)).toBeUndefined()
    })
    expect(publicTemplates.get(hash)?.value).toEqual(value)
    const next = transaction(tx.rows)
    expect(await publicTemplatesForDatabase(next.db).saveMany([{kind,value}])).toEqual([hash])
    expect(next.query).not.toHaveBeenCalled()
  })

  it('never promotes a rolled-back FINAL template into a process-wide committed proof', async () => {
    const value = { identity: randomUUID() }, kind = 'SCALE_INTERPRETATION' as const, hash = publicTemplateHash(kind,value)
    const tx = transaction()
    await expect(withCommittedPublicTemplates(async work => { await work(tx.db); throw new Error('rollback') }, async db => {
      await publicTemplatesForDatabase(db).saveMany([{kind,value}])
    })).rejects.toThrow('rollback')
    expect(publicTemplates.get(hash)).toBeUndefined()
    const next = transaction()
    await publicTemplatesForDatabase(next.db).saveMany([{kind,value}])
    expect(next.query).toHaveBeenCalledTimes(3)
  })
})
