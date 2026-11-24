import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { withStartNestedQueryRawLabel } from '../../services/runtimeObservability'
import { BoundedArtifactCache } from './bounded-artifact-cache'
import { canonicalHash, canonicalJsonBytes, retainImmutableCanonicalValue } from './canonical'
import { decryptCompactField, encryptCompactField } from './compact-field-codec'

export type PublicTemplateKind = 'SCALE_RESULT_BASE' | 'SCALE_REFERENCE' | 'SCALE_INTERPRETATION' | 'SCALE_CAVEATS' | 'SCALE_CANONICAL_LAYOUT' | 'COMPOSITE_REPORT_LAYOUT' | 'UNIT_ADMISSION_PLAN' | 'FROZEN_SLOT_PLAN' | 'WHOLE_VALIDATION_PLAN' | 'COGNITIVE_PROFILE_CONFIGURATION' | 'SCALE_RUNTIME_POLICY_PLAN' | 'SCALE_FACTS_BUNDLE'
export type PublicTemplateRow = { templateHash: string; templateKind: PublicTemplateKind; plaintextBytes: number; payloadEncrypted: string }
export interface PublicTemplateRepository { read(hashes: string[]): Promise<PublicTemplateRow[]>; append(rows: PublicTemplateRow[]): Promise<void> }
const MAX_BYTES = 2 * 1024 * 1024
const kinds = new Set<PublicTemplateKind>(['SCALE_RESULT_BASE', 'SCALE_REFERENCE', 'SCALE_INTERPRETATION', 'SCALE_CAVEATS', 'SCALE_CANONICAL_LAYOUT', 'COMPOSITE_REPORT_LAYOUT', 'UNIT_ADMISSION_PLAN', 'FROZEN_SLOT_PLAN', 'WHOLE_VALIDATION_PLAN', 'COGNITIVE_PROFILE_CONFIGURATION', 'SCALE_RUNTIME_POLICY_PLAN', 'SCALE_FACTS_BUNDLE'])
const hashOfBytes = (kind: PublicTemplateKind, valueBytes: Buffer): string =>
  createHash('sha256')
    .update(`{"kind":${JSON.stringify(kind)},"storageVersion":1,"value":`)
    .update(valueBytes)
    .update('}')
    .digest('hex')
const hashOf = (kind: PublicTemplateKind, value: unknown) => canonicalHash({ storageVersion: 1, kind, value })
export const publicTemplateHash = hashOf
type VerifiedTemplate = { kind: PublicTemplateKind; value: any; bytes: number }
export const createPublicTemplateStore = (
  repository: PublicTemplateRepository,
  limits = {entries:512,bytes:8*1024*1024},
  committed?: { get(hash: string): VerifiedTemplate | undefined },
  readPublishedStartPlans = false,
) => {
  // Public scientific content only. No personal results or access decisions.
  const cache = new BoundedArtifactCache<VerifiedTemplate>(limits.entries, limits.bytes)
  const get = (hash: string) => cache.get(hash) ?? committed?.get(hash)
  const acceptCommitted = (hash: string, template: VerifiedTemplate) => cache.set(hash, template, template.bytes)
  const decode = (row: PublicTemplateRow) => {
    if (!kinds.has(row.templateKind) || !/^[a-f0-9]{64}$/.test(row.templateHash) || !Number.isSafeInteger(row.plaintextBytes)
      || row.plaintextBytes < 1 || row.plaintextBytes > MAX_BYTES) throw new Error('Public template record invalid')
    const body = decryptCompactField<any>(row.payloadEncrypted, MAX_BYTES)
    if (body?.version !== 1 || body.kind !== row.templateKind || canonicalJsonBytes(body.value).length !== row.plaintextBytes
      || hashOf(row.templateKind, body.value) !== row.templateHash) throw new Error('Public template integrity invalid')
    const value = body.value && typeof body.value === 'object' ? retainImmutableCanonicalValue(body.value) : body.value
    const template = { kind: row.templateKind, value, bytes: row.plaintextBytes * 6 + row.payloadEncrypted.length * 2 + 512 }
    acceptCommitted(row.templateHash, template)
    return template
  }
  const saveMany = async (values: Array<{ kind: PublicTemplateKind; value: unknown; precomputedHash?: string }>): Promise<string[]> => {
    const pending = new Map<string, PublicTemplateRow>()
    const hashes = values.map(({ kind, value, precomputedHash }) => {
      if (!kinds.has(kind)) throw new Error('Unsupported public template kind')
      if (precomputedHash && /^[a-f0-9]{64}$/.test(precomputedHash)) {
        const known = get(precomputedHash)
        if (known) {
          if (known.kind !== kind) throw new Error('Public template kind mismatch')
          return precomputedHash
        }
      }
      const bytes = canonicalJsonBytes(value), hash = hashOfBytes(kind, bytes)
      if (bytes.length < 1 || bytes.length > MAX_BYTES) throw new Error('Public template size limit')
      const known = get(hash)
      if (known && known.kind !== kind) throw new Error('Public template kind mismatch')
      if (!known && !pending.has(hash)) pending.set(hash, { templateHash: hash, templateKind: kind, plaintextBytes: bytes.length,
        payloadEncrypted: encryptCompactField({ version: 1, kind, value }, MAX_BYTES) })
      return hash
    })
    if (readPublishedStartPlans && pending.size
      && [...pending.values()].every(row => row.templateKind === 'FROZEN_SLOT_PLAN' || row.templateKind === 'UNIT_ADMISSION_PLAN' || row.templateKind === 'SCALE_RUNTIME_POLICY_PLAN')) {
      for (const row of await repository.read([...pending.keys()])) {
        if (!pending.delete(row.templateHash)) throw new Error('Public template lookup returned an unrelated row')
        decode(row)
      }
    }
    if (pending.size) {
      const rows = [...pending.values()].sort((a, b) => a.templateHash.localeCompare(b.templateHash))
      // Independent append must commit before caching existence.
      await repository.append(rows)
      const committed = await repository.read(rows.map(row => row.templateHash))
      if (committed.length !== rows.length || new Set(committed.map(row => row.templateHash)).size !== rows.length) throw new Error('Public template append verification unavailable')
      for (const row of committed) { if (!pending.has(row.templateHash)) throw new Error('Public template append returned an unrelated row'); decode(row) }
    }
    return hashes
  }
  const loadMany = async (requests: Array<{ hash: string; kind: PublicTemplateKind }>, read: PublicTemplateRepository['read'] = repository.read): Promise<any[]> => {
    for (const x of requests) if (!/^[a-f0-9]{64}$/.test(x.hash) || !kinds.has(x.kind)) throw new Error('Public template reference invalid')
    const values = new Map<string, { kind: PublicTemplateKind; value: any }>(), missing = new Set<string>()
    for (const { hash } of requests) { const known = get(hash); if (known) values.set(hash, known); else missing.add(hash) }
    if (missing.size) for (const row of await read([...missing])) values.set(row.templateHash, decode(row))
    return requests.map(({ hash, kind }) => { const item = values.get(hash); if (!item || item.kind !== kind) throw new Error('PUBLIC_TEMPLATE_UNAVAILABLE'); return item.value })
  }
  return { saveMany, loadMany, stats: () => cache.stats(), get, acceptCommitted }
}
const repository: PublicTemplateRepository = {
  read: hashes => hashes.length ? withStartNestedQueryRawLabel('public_template_read', () => prisma.$queryRaw<PublicTemplateRow[]>`SELECT template_hash AS "templateHash", template_kind AS "templateKind",
    plaintext_bytes AS "plaintextBytes", payload_encrypted AS "payloadEncrypted" FROM assessment_public_templates WHERE template_hash IN (${Prisma.join(hashes)})`) : Promise.resolve([]),
  append: async rows => {
    if (!rows.length) return
    await withStartNestedQueryRawLabel('public_template_append', () => prisma.$executeRaw`INSERT INTO assessment_public_templates(template_hash, template_kind, plaintext_bytes, payload_encrypted)
      VALUES ${Prisma.join(rows.map(row => Prisma.sql`(${row.templateHash}, ${row.templateKind}, ${row.plaintextBytes}, ${row.payloadEncrypted})`))}
      ON CONFLICT (template_hash) DO NOTHING`)
  },
}
export const publicTemplates = createPublicTemplateStore(repository)
export type PublicTemplateStore = Pick<ReturnType<typeof createPublicTemplateStore>, 'saveMany' | 'loadMany'>

// Templates are append-only. Transactions can consume proofs from committed
// templates; rows first observed in a transaction stay local until it commits.
const transactionStores = new WeakMap<object, ReturnType<typeof createPublicTemplateStore>>()
const pendingStartTemplates = new WeakMap<object, Set<string>>()

export async function withCommittedStartTemplates<T>(
  transact: (work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let completedTx: Prisma.TransactionClient | undefined
  const hashes = new Set<string>()
  const result = await transact(tx => {
    completedTx = tx
    pendingStartTemplates.set(tx, hashes)
    return work(tx)
  })
  const local = completedTx && transactionStores.get(completedTx)
  if (local) for (const hash of hashes) {
    const template = local.get(hash)
    if (template) publicTemplates.acceptCommitted(hash, template)
  }
  return result
}
export const publicTemplatesForDatabase = (db?: Pick<Prisma.TransactionClient,'$queryRaw'>): PublicTemplateStore => {
 if(!db||db===prisma)return publicTemplates
 const known=transactionStores.get(db);if(known)return known
 const local=createPublicTemplateStore({
  read: async hashes => {
    if (!hashes.length) return []
    const rows = await withStartNestedQueryRawLabel('public_template_read', () => db.$queryRaw<PublicTemplateRow[]>`
      SELECT template_hash AS "templateHash", template_kind AS "templateKind", plaintext_bytes AS "plaintextBytes",
        payload_encrypted AS "payloadEncrypted" FROM assessment_public_templates WHERE template_hash IN (${Prisma.join(hashes)})`)
    const pending = pendingStartTemplates.get(db)
    if (pending) for (const row of rows) {
      if (row.templateKind === 'FROZEN_SLOT_PLAN' || row.templateKind === 'UNIT_ADMISSION_PLAN' || row.templateKind === 'SCALE_RUNTIME_POLICY_PLAN') pending.add(row.templateHash)
    }
    return rows
  },
  append:async rows=>{if(rows.length)await withStartNestedQueryRawLabel('public_template_append', () => db.$queryRaw`INSERT INTO assessment_public_templates(template_hash,template_kind,plaintext_bytes,payload_encrypted)
    VALUES ${Prisma.join(rows.map(row=>Prisma.sql`(${row.templateHash},${row.templateKind},${row.plaintextBytes},${row.payloadEncrypted})`))} ON CONFLICT(template_hash) DO NOTHING RETURNING template_hash`)},
 },{entries:64,bytes:2*1024*1024},pendingStartTemplates.has(db)?publicTemplates:undefined,pendingStartTemplates.has(db))
 transactionStores.set(db,local);return local
}
