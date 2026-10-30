import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { BoundedArtifactCache } from './bounded-artifact-cache'
import { canonicalHash, canonicalJsonBytes, retainImmutableCanonicalValue } from './canonical'
import { decryptCompactField, encryptCompactField } from './compact-field-codec'

export type PublicTemplateKind = 'SCALE_RESULT_BASE' | 'SCALE_REFERENCE' | 'SCALE_INTERPRETATION' | 'SCALE_CAVEATS' | 'SCALE_CANONICAL_LAYOUT' | 'COMPOSITE_REPORT_LAYOUT' | 'UNIT_ADMISSION_PLAN' | 'FROZEN_SLOT_PLAN' | 'WHOLE_VALIDATION_PLAN' | 'COGNITIVE_PROFILE_CONFIGURATION'
export type PublicTemplateRow = { templateHash: string; templateKind: PublicTemplateKind; plaintextBytes: number; payloadEncrypted: string }
export interface PublicTemplateRepository { read(hashes: string[]): Promise<PublicTemplateRow[]>; append(rows: PublicTemplateRow[]): Promise<void> }
const MAX_BYTES = 2 * 1024 * 1024
const kinds = new Set<PublicTemplateKind>(['SCALE_RESULT_BASE', 'SCALE_REFERENCE', 'SCALE_INTERPRETATION', 'SCALE_CAVEATS', 'SCALE_CANONICAL_LAYOUT', 'COMPOSITE_REPORT_LAYOUT', 'UNIT_ADMISSION_PLAN', 'FROZEN_SLOT_PLAN', 'WHOLE_VALIDATION_PLAN', 'COGNITIVE_PROFILE_CONFIGURATION'])
const hashOf = (kind: PublicTemplateKind, value: unknown) => canonicalHash({ storageVersion: 1, kind, value })
export const createPublicTemplateStore = (repository: PublicTemplateRepository, limits = {entries:512,bytes:8*1024*1024}) => {
  // Public scientific content only. No personal results or access decisions.
  const cache = new BoundedArtifactCache<{ kind: PublicTemplateKind; value: any }>(limits.entries, limits.bytes)
  const decode = (row: PublicTemplateRow) => {
    if (!kinds.has(row.templateKind) || !/^[a-f0-9]{64}$/.test(row.templateHash) || !Number.isSafeInteger(row.plaintextBytes)
      || row.plaintextBytes < 1 || row.plaintextBytes > MAX_BYTES) throw new Error('Public template record invalid')
    const body = decryptCompactField<any>(row.payloadEncrypted, MAX_BYTES)
    if (body?.version !== 1 || body.kind !== row.templateKind || canonicalJsonBytes(body.value).length !== row.plaintextBytes
      || hashOf(row.templateKind, body.value) !== row.templateHash) throw new Error('Public template integrity invalid')
    const value = body.value && typeof body.value === 'object' ? retainImmutableCanonicalValue(body.value) : body.value
    cache.set(row.templateHash, { kind: row.templateKind, value }, row.plaintextBytes * 6 + row.payloadEncrypted.length * 2 + 512)
    return { kind: row.templateKind, value }
  }
  const saveMany = async (values: Array<{ kind: PublicTemplateKind; value: unknown }>): Promise<string[]> => {
    const pending = new Map<string, PublicTemplateRow>()
    const hashes = values.map(({ kind, value }) => {
      if (!kinds.has(kind)) throw new Error('Unsupported public template kind')
      const bytes = canonicalJsonBytes(value), hash = hashOf(kind, value)
      if (bytes.length < 1 || bytes.length > MAX_BYTES) throw new Error('Public template size limit')
      const known = cache.get(hash)
      if (known && known.kind !== kind) throw new Error('Public template kind mismatch')
      if (!known && !pending.has(hash)) pending.set(hash, { templateHash: hash, templateKind: kind, plaintextBytes: bytes.length,
        payloadEncrypted: encryptCompactField({ version: 1, kind, value }, MAX_BYTES) })
      return hash
    })
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
    for (const { hash } of requests) { const known = cache.get(hash); if (known) values.set(hash, known); else missing.add(hash) }
    if (missing.size) for (const row of await read([...missing])) values.set(row.templateHash, decode(row))
    return requests.map(({ hash, kind }) => { const item = values.get(hash); if (!item || item.kind !== kind) throw new Error('PUBLIC_TEMPLATE_UNAVAILABLE'); return item.value })
  }
  return { saveMany, loadMany, stats: () => cache.stats() }
}
const repository: PublicTemplateRepository = {
  read: hashes => hashes.length ? prisma.$queryRaw<PublicTemplateRow[]>`SELECT template_hash AS "templateHash", template_kind AS "templateKind",
    plaintext_bytes AS "plaintextBytes", payload_encrypted AS "payloadEncrypted" FROM assessment_public_templates WHERE template_hash IN (${Prisma.join(hashes)})` : Promise.resolve([]),
  append: async rows => {
    if (!rows.length) return
    await prisma.$executeRaw`INSERT INTO assessment_public_templates(template_hash, template_kind, plaintext_bytes, payload_encrypted)
      VALUES ${Prisma.join(rows.map(row => Prisma.sql`(${row.templateHash}, ${row.templateKind}, ${row.plaintextBytes}, ${row.payloadEncrypted})`))}
      ON CONFLICT (template_hash) DO NOTHING`
  },
}
export const publicTemplates = createPublicTemplateStore(repository)
export type PublicTemplateStore = Pick<ReturnType<typeof createPublicTemplateStore>, 'saveMany' | 'loadMany'>

// A transaction may see its own uncommitted append. Its cache must remain
// local to that transaction and cannot become a global existence proof.
const transactionStores=new WeakMap<object,PublicTemplateStore>()
export const publicTemplatesForDatabase = (db?: Pick<Prisma.TransactionClient,'$queryRaw'>): PublicTemplateStore => {
 if(!db||db===prisma)return publicTemplates
 const known=transactionStores.get(db);if(known)return known
 const local=createPublicTemplateStore({
  read:hashes=>hashes.length?db.$queryRaw<PublicTemplateRow[]>`SELECT template_hash AS "templateHash",template_kind AS "templateKind",plaintext_bytes AS "plaintextBytes",payload_encrypted AS "payloadEncrypted" FROM assessment_public_templates WHERE template_hash IN (${Prisma.join(hashes)})`:Promise.resolve([]),
  append:async rows=>{if(rows.length)await db.$queryRaw`INSERT INTO assessment_public_templates(template_hash,template_kind,plaintext_bytes,payload_encrypted)
    VALUES ${Prisma.join(rows.map(row=>Prisma.sql`(${row.templateHash},${row.templateKind},${row.plaintextBytes},${row.payloadEncrypted})`))} ON CONFLICT(template_hash) DO NOTHING RETURNING template_hash`},
 },{entries:64,bytes:2*1024*1024})
 transactionStores.set(db,local);return local
}
