import { encryptControlReference } from './control-reference-codec'
import { AsyncLocalStorage } from 'node:async_hooks'
import { prisma } from '../../config/database'
import { canonicalHash, canonicalJsonBytes } from './canonical'
import { encryptUnifiedRuntimePayload, decryptUnifiedRuntimePayload } from './security'
import { compactAssessmentStorageEnabled } from './compact-field-codec'
import { publicTemplates, publicTemplatesForDatabase } from './public-templates'
import type { Prisma } from '@prisma/client'
import { decryptCompactField } from './compact-field-codec'
import type { VersionedFrozenUnitAdmission } from './admission-snapshot-v2'

export const sharedControlWritesEnabled = () => compactAssessmentStorageEnabled() && process.env.ASSESSMENT_SHARED_CONTROL_ENABLED === 'true'
// Personal frozen context is invocation-local. Current authorization and leases
// are always checked by their owners; neither is cached here.
type Context = { reads: Map<string, Promise<any>>; writes: Map<string, Promise<string>> }
const contexts = new AsyncLocalStorage<Context>()
export type SharedControlDb=Pick<Prisma.TransactionClient,'$queryRaw'>
const transactionContexts=new WeakMap<object,Context>()
const contextFor=(db?:SharedControlDb):Context|undefined=>{if(!db||db===prisma)return contexts.getStore();let context=transactionContexts.get(db);if(!context){context={reads:new Map(),writes:new Map()};transactionContexts.set(db,context)}return context}
export const withSharedControlContext = <T>(work: () => Promise<T>): Promise<T> => contexts.getStore() ? work() : contexts.run({ reads: new Map(), writes: new Map() }, work)
const limited = <T>(map: Map<string, Promise<T>> | undefined, key: string, work: () => Promise<T>): Promise<T> => {
  const known = map?.get(key); if (known) return known
  const result = work(); if (map && map.size < 32) map.set(key, result)
  void result.catch(() => { if (map?.get(key) === result) map.delete(key) })
  return result
}
const bindingBody = (snapshot: VersionedFrozenUnitAdmission) => ({ version: 1, parent: { kind: snapshot.parent!.kind, id: snapshot.parent!.parentId },
  attemptEpoch: snapshot.attemptEpoch, principal: snapshot.principal, contextSnapshotHash: snapshot.contextSnapshotHash, contextValues: snapshot.contextValues })
const freezePrivateBinding = (value: any): any => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freezePrivateBinding(child); Object.freeze(value) }; return value }
const verifyBinding = (row: any) => {
  if (!row || !/^[1-9][0-9]*$/.test(String(row.id)) || !Buffer.isBuffer(row.bindingHash) || row.bindingHash.length !== 32) throw new Error('Frozen personal binding record invalid')
  const envelope=decryptCompactField<any>(row.payloadEncrypted,256*1024+1024)
  if(envelope?.schemaVersion!==1)throw new Error('Frozen binding encryption version invalid')
  const body=envelope.value
  if (body?.version !== 1 || !body.value || canonicalHash(body.value) !== row.bindingHash.toString('hex') || canonicalJsonBytes(body.value).length !== row.plaintextBytes) throw new Error('Frozen personal binding integrity mismatch')
  const value = body.value
  if (value.version !== 1 || !Number.isSafeInteger(value.attemptEpoch) || value.attemptEpoch < 1 || !value.principal
    || !['composite', 'questionnaire'].includes(value.parent?.kind) || typeof value.parent.id !== 'string'
    || value.parent.id !== (value.parent.kind === 'composite' ? row.compositeAttemptId : row.questionnaireAssessmentId)) throw new Error('Frozen personal binding ownership mismatch')
  return freezePrivateBinding(value)
}
const readBinding = async (id: string, db:SharedControlDb=prisma) => {
  if (!/^[1-9][0-9]*$/.test(id) || id.length > 19) throw new Error('Frozen binding reference invalid')
  return limited(contextFor(db)?.reads, id, async () => {
    const rows = await db.$queryRaw<any[]>`SELECT id,binding_hash AS "bindingHash",payload_encrypted AS "payloadEncrypted",plaintext_bytes AS "plaintextBytes",
      composite_attempt_id AS "compositeAttemptId",questionnaire_assessment_id AS "questionnaireAssessmentId" FROM assessment_frozen_bindings WHERE id=${BigInt(id)}`
    if (rows.length !== 1) throw new Error('Frozen personal binding unavailable; restore it before retrying')
    const value = verifyBinding(rows[0]), context = contextFor(db)
    if (context && context.writes.size < 32) context.writes.set(rows[0].bindingHash.toString('hex'), Promise.resolve(String(rows[0].id)))
    return value
  })
}
const saveBinding = async (value: ReturnType<typeof bindingBody>,db:SharedControlDb=prisma): Promise<string> => {
  const bytes = canonicalJsonBytes(value); if (bytes.length > 256 * 1024) throw new Error('Frozen binding size limit')
  const hash = canonicalHash(value), context = contextFor(db)
  return limited(context?.writes, hash, async () => {
    const binary = Buffer.from(hash, 'hex')
    const payload = encryptUnifiedRuntimePayload({ version: 1, value })
    let rows = await db.$queryRaw<any[]>`INSERT INTO assessment_frozen_bindings(binding_hash,composite_attempt_id,questionnaire_assessment_id,plaintext_bytes,payload_encrypted)
      VALUES(${binary},${value.parent.kind === 'composite' ? value.parent.id : null},${value.parent.kind === 'questionnaire' ? value.parent.id : null},${bytes.length},${payload}) ON CONFLICT(binding_hash) DO NOTHING
      RETURNING id,binding_hash AS "bindingHash",payload_encrypted AS "payloadEncrypted",plaintext_bytes AS "plaintextBytes",composite_attempt_id AS "compositeAttemptId",questionnaire_assessment_id AS "questionnaireAssessmentId"`
    if (!rows.length) rows = await db.$queryRaw<any[]>`SELECT id,binding_hash AS "bindingHash",payload_encrypted AS "payloadEncrypted",plaintext_bytes AS "plaintextBytes",
      composite_attempt_id AS "compositeAttemptId",questionnaire_assessment_id AS "questionnaireAssessmentId" FROM assessment_frozen_bindings WHERE binding_hash=${binary}`
    if (rows.length !== 1) throw new Error('Frozen binding append verification failed')
    const verified = verifyBinding(rows[0])
    if (canonicalHash(verified) !== hash) throw new Error('Frozen binding append verification failed')
    const id = String(rows[0].id); if (context && context.reads.size < 32) context.reads.set(id, Promise.resolve(verified))
    return id
  })
}

/** The shared plan is an explicit allowlist; eligibility, grants and decisions remain personal. */
export const storeSharedUnitAdmission = async (snapshot: VersionedFrozenUnitAdmission,db?:SharedControlDb): Promise<string> => {
  if (!sharedControlWritesEnabled() || !snapshot.parent || canonicalJsonBytes(bindingBody(snapshot)).length>16*1024) return encryptUnifiedRuntimePayload(snapshot)
  const plan: any = { schemaVersion: snapshot.schemaVersion, runtimeGeneration: snapshot.runtimeGeneration, requiresContext: snapshot.requiresContext,
    parent: { kind: snapshot.parent.kind, slotKey: snapshot.parent.slotKey, sourceDefinitionHash: snapshot.parent.sourceDefinitionHash, compiledRuntimeHash: snapshot.parent.compiledRuntimeHash } }
  for (const key of ['scale', 'cognitive', 'formSection'] as const) if (Object.prototype.hasOwnProperty.call(snapshot, key)) plan[key] = (snapshot as any)[key]
  const [template] = await publicTemplatesForDatabase(db).saveMany([{ kind: 'UNIT_ADMISSION_PLAN', value: plan }])
  const binding = await saveBinding(bindingBody(snapshot),db)
  const personal = Object.fromEntries(Object.entries(snapshot).filter(([key]) => !['schemaVersion','runtimeGeneration','requiresContext','parent','principal','contextSnapshotHash','contextValues','attemptEpoch','snapshotHash','scale','cognitive','formSection'].includes(key)))
  return encryptControlReference({ k: 'UAR2', p: template, b: binding, x: personal })
}
export const loadSharedUnitAdmission = async (encrypted: string,db?:SharedControlDb): Promise<unknown> => {
  const ref = decryptUnifiedRuntimePayload<any>(encrypted)
  if (ref?.k !== 'UAR2') return ref
  if (typeof ref.p !== 'string' || typeof ref.b !== 'string' || !ref.x || typeof ref.x !== 'object' || Array.isArray(ref.x)) throw new Error('Frozen admission reference invalid')
  const [[plan], binding] = await Promise.all([publicTemplatesForDatabase(db).loadMany([{ hash: ref.p, kind: 'UNIT_ADMISSION_PLAN' }]), readBinding(ref.b,db)])
  if (plan.parent?.kind !== binding.parent.kind || Object.keys(ref.x).some(key => !['frozenAt','governance','scalePolicy'].includes(key))) throw new Error('Frozen admission reference binding invalid')
  const unsigned = { ...plan, ...ref.x, attemptEpoch: binding.attemptEpoch, principal: binding.principal,
    parent: { ...plan.parent, parentId: binding.parent.id }, contextSnapshotHash: binding.contextSnapshotHash, contextValues: binding.contextValues }
  return { ...unsigned, snapshotHash: canonicalHash(unsigned) }
}

export const storeSharedSlotPlan = async (snapshot: any): Promise<string> => {
  if (!sharedControlWritesEnabled()) return encryptUnifiedRuntimePayload(snapshot)
  const { attemptEpoch, snapshotHash: _hash, ...plan } = snapshot
  const [p] = await publicTemplates.saveMany([{ kind: 'FROZEN_SLOT_PLAN', value: plan }])
  return encryptControlReference({ k: 'FSP2', p, e: attemptEpoch })
}
export const loadSharedSlotPlan = async (encrypted: string, decoded?:unknown): Promise<unknown> => {
  const ref = decoded===undefined?decryptUnifiedRuntimePayload<any>(encrypted):decoded as any
  if (ref?.k !== 'FSP2') return ref
  if (!Number.isSafeInteger(ref.e) || ref.e < 1 || Object.keys(ref).some(k => !['k','p','e'].includes(k))) throw new Error('Frozen slot reference invalid')
  const [plan] = await publicTemplates.loadMany([{ hash: ref.p, kind: 'FROZEN_SLOT_PLAN' }])
  const unsigned = { ...plan, attemptEpoch: ref.e }
  return { ...unsigned, snapshotHash: canonicalHash(unsigned) }
}

export const storeSharedWholeValidation = async (manifest: any): Promise<string> => {
  if (!sharedControlWritesEnabled()) return encryptUnifiedRuntimePayload(manifest)
  const plan = { schemaVersion: manifest.schemaVersion, requiredFormSlots: manifest.requiredFormSlots,
    units: manifest.units.map((u: any) => Object.fromEntries(Object.entries(u).filter(([k]) => !['assessmentId','admissionHash'].includes(k)))) }
  const [p] = await publicTemplates.saveMany([{ kind: 'WHOLE_VALIDATION_PLAN', value: plan }])
  return encryptControlReference({ k: 'WVP2', p, b: manifest.binding, u: manifest.units.map((u: any) => [u.assessmentId, u.admissionHash]) })
}
export const loadSharedWholeValidation = async <T>(encrypted: string): Promise<T> => {
  const ref = decryptUnifiedRuntimePayload<any>(encrypted)
  if (ref?.k !== 'WVP2') return ref as T
  const [plan] = await publicTemplates.loadMany([{ hash: ref.p, kind: 'WHOLE_VALIDATION_PLAN' }])
  if (!Array.isArray(ref.u) || !Array.isArray(plan.units) || ref.u.length !== plan.units.length || ref.u.length > 32) throw new Error('Frozen whole validation reference invalid')
  return { ...plan, binding: ref.b, units: plan.units.map((unit: any, i: number) => {
    const x = ref.u[i]; if (!Array.isArray(x) || x.length !== 2 || typeof x[0] !== 'string' || !/^[a-f0-9]{64}$/.test(x[1])) throw new Error('Frozen whole unit binding invalid')
    return { ...unit, assessmentId: x[0], admissionHash: x[1] }
  }) } as T
}

/** Reuse immutable personal bindings only inside one HTTP request. Async tasks
 * keep their own request context; current authentication/ownership still runs. */
export const sharedControlRequestContext: import('express').RequestHandler = (_req, _res, next) => {
  if (!sharedControlWritesEnabled()) { next(); return }
  void withSharedControlContext(async () => { next() }).catch(next)
}
