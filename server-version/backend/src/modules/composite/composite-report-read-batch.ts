import { Prisma } from '@prisma/client'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { createSharedScaleRuntimeStore, isSharedScaleRuntimeReference, type SharedScaleArtifactRecord } from '../assessment-runtime/shared-scale-runtime'
import { parseVersionedFrozenScaleRuntimeSnapshot, type VersionedFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { publicTemplates, publicTemplatesForDatabase, type PublicTemplateStore } from '../assessment-runtime/public-templates'
import { loadScaleFactRecords, isScaleFactsReference } from '../assessment-runtime/scale-fact-records'
import { decodeScaleFacts, assertScaleFactsBinding, prefetchCompactScaleTemplates, restoreCompactScaleFacts } from '../assessment-runtime/compact-scale-facts'
import { mapCompositeSection } from '../assessment-runtime/form-section-definition'
import { readLoadedCompositeTypedFormValues, type TypedFormMetadata } from '../assessment-runtime/typed-form-facts'
import { formSectionSlotKey } from '../assessment-runtime/slot-set'
import type { TypedFormValue } from '../assessment-runtime/typed-form'
import { resolveTrainingAttemptScope } from './training-variant-scope'

/** A bounded page retains its verified public templates until projection ends.
 * Global cache eviction must not turn a batch into one query per participant. */
export function createReportReadTemplateStore(source: PublicTemplateStore = publicTemplates): PublicTemplateStore {
  const loaded = new Map<string, unknown>()
  return {
    saveMany: values => source.saveMany(values),
    async loadMany(requests) {
      const key = (r: typeof requests[number]) => `${r.kind}:${r.hash}`
      const missing = [...new Map(requests.filter(r => !loaded.has(key(r))).map(r => [key(r), r])).values()]
      if (missing.length) {
        const values = await source.loadMany(missing)
        if (values.length !== missing.length) throw new Error('Report template batch incomplete')
        missing.forEach((r, i) => loaded.set(key(r), values[i]))
      }
      return requests.map(r => loaded.get(key(r)))
    },
  }
}

export type CompositeReportFacts = {
  scaleResults: Map<any, any>
  /** Original immutable-result digests for verified compact facts, keyed by the exact bound child. */
  scaleSourceResultHashes: Map<any, string>
  scaleRuntimes: Map<any, VersionedFrozenScaleRuntimeSnapshot | undefined>
  typedFormValues: Map<string, TypedFormValue>
  typedFormStates: Map<string, TypedFormMetadata>
}
export type CompositeReportFactsReader = (attempt: any) => CompositeReportFacts
const identity = (attempt: any) => canonicalHash({
  id: attempt.id, epoch: attempt.attemptEpoch, slotSetHash: attempt.frozenActiveSlotSetHash ?? null,
  ...(attempt.trainingFlowPathHash!=null?{trainingFlowPathHash:attempt.trainingFlowPathHash}:{}),
  contextHash: attempt.contextSnapshotHash ?? null, allocationHash: attempt.trainingVariantAllocationHash ?? null,
  items: attempt.compositeAssessment.items.map((item: any) => item.id),
  sections: (attempt.compositeAssessment.formSections ?? []).map(mapCompositeSection),
  scales: attempt.scaleAssessments.map((row: any) => ({id: row.id, itemId: row.compositeItemId, epoch: row.attemptEpoch,
    submissionId: row.submissionId ?? null, payloadHash: row.submissionPayloadHash ?? null, result: row.result ?? null, runtime: row.runtimeSnapshotEncrypted ?? null, compiledRuntimeHash: row.compiledRuntimeHash ?? null})),
})

/** Only already-authorized, projected parents enter this request-local batch.
 * Every source still passes the single-reader's parent/epoch/definition checks. */
export async function preloadCompositeReportFacts(attempts: any[], db: Prisma.TransactionClient = prisma, options?: { selectedItemIds?: Map<string, Set<string>>; numericOnly?: boolean }): Promise<CompositeReportFactsReader> {
  const templates = createReportReadTemplateStore(publicTemplatesForDatabase(db)), contexts = new Map<any, {identity: string; facts: CompositeReportFacts}>()
  const sectionsByAttempt = new Map<any, ReturnType<typeof mapCompositeSection>[]>()
  for (const attempt of attempts) {
    const scope = await resolveTrainingAttemptScope(attempt, attempt.compositeAssessment, {db})
    if (scope.items.length !== attempt.compositeAssessment.items.length || attempt.compositeAssessment.items.some((item: any) => !scope.itemIds.has(item.id))) throw new Error('Report batch requires projected selection')
    const requested = options?.selectedItemIds?.get(attempt.id)
    const sections = (attempt.compositeAssessment.formSections ?? []).map(mapCompositeSection).filter((section: ReturnType<typeof mapCompositeSection>) => section.items.some(item => item.formDefinition != null) && (!requested || section.items.some(item => requested.has(item.id))))
    const sectionItemIds = new Set(sections.flatMap((section: ReturnType<typeof mapCompositeSection>) => section.items.map(item => item.id)))
    const typedCount = attempt.compositeAssessment.items.filter((item: any) => item.type === 'FORM' && item.formDefinition != null && (!requested || sectionItemIds.has(item.id))).length
    if (typedCount && (!sections.length || sections.reduce((n: number, section: ReturnType<typeof mapCompositeSection>) => n + section.items.filter(item => item.formDefinition != null).length, 0) !== typedCount)) throw new Error('Report batch typed sections missing')
    sectionsByAttempt.set(attempt, sections)
    for (const row of attempt.scaleAssessments) if (row.compositeAttemptId !== attempt.id || row.attemptEpoch !== attempt.attemptEpoch || !scope.itemIds.has(row.compositeItemId)) throw new Error('Report batch scale ownership/version mismatch')
    contexts.set(attempt, {identity: identity(attempt), facts: {scaleResults: new Map(), scaleSourceResultHashes: new Map(), scaleRuntimes: new Map(), typedFormValues: new Map(), typedFormStates: new Map()}})
  }
  const records = attempts.flatMap(attempt => attempt.scaleAssessments), references = records.filter(row => isScaleFactsReference(row.result))
  const snapshotWhere = attempts.flatMap(attempt => {
    const sections = sectionsByAttempt.get(attempt)!
    return sections.length ? [{compositeAttemptId: attempt.id, attemptEpoch: attempt.attemptEpoch, slotKey: {in: sections.map(section => formSectionSlotKey(section.id))}}] : []
  })
  const runtimes=new Map<any,any>(),artifactHashes=new Set<string>()
  for(const record of records) if(record.runtimeSnapshotEncrypted!=null){
    try{const value=typeof record.runtimeSnapshotEncrypted==='string'?decryptUnifiedRuntimePayload<any>(record.runtimeSnapshotEncrypted):record.runtimeSnapshotEncrypted
      runtimes.set(record,value)
      if(isSharedScaleRuntimeReference(value)&&typeof value.artifactHash==='string'&&/^[a-f0-9]{64}$/.test(value.artifactHash))artifactHashes.add(value.artifactHash)
    }catch{runtimes.set(record,undefined)}
  }
  const [rows, snapshots, artifacts] = await Promise.all([
    loadScaleFactRecords(references.map(row => ({id: row.id, attemptEpoch: row.result.e})), db),
    snapshotWhere.length ? db.assessmentUnitSnapshot.findMany({where: {OR: snapshotWhere}}) : [],
    artifactHashes.size?db.$queryRaw<SharedScaleArtifactRecord[]>`SELECT artifact_hash AS "artifactHash",format_version AS "formatVersion",plaintext_bytes AS "plaintextBytes",payload_encrypted AS "payloadEncrypted"
      FROM assessment_runtime_artifacts WHERE artifact_hash IN (${Prisma.join([...artifactHashes])})`:[],
  ])
  const artifactRows=new Map(artifacts.map(row=>[row.artifactHash,row]))
  if(artifactRows.size!==artifacts.length||artifacts.some(row=>!artifactHashes.has(row.artifactHash)))throw new Error('Report runtime artifact batch binding mismatch')
  const runtimeStore=createSharedScaleRuntimeStore({find:async hash=>artifactRows.get(hash)??null,insert:async()=>{throw new Error('Report runtime batch is read only')}})
  const byId = new Map(rows.map(row => [`${row.id}:${row.attemptEpoch}`, row]))
  if (byId.size !== rows.length || rows.length !== references.length) throw new Error('Report batch immutable sources incomplete')
  const decoded = new Map<any, NonNullable<ReturnType<typeof decodeScaleFacts>>>()
  for (const record of records) {
    const row = isScaleFactsReference(record.result) ? byId.get(`${record.id}:${record.result.e}`) : null
    if (isScaleFactsReference(record.result) && (!row || record.attemptEpoch !== row.attemptEpoch || record.submissionId !== row.submissionId || record.submissionPayloadHash !== row.submissionPayloadHash)) throw new Error('Report batch fact binding mismatch')
    const facts = decodeScaleFacts(row?.factsEncrypted ?? record.result)
    if (row && (!facts || facts.sourceResultHash !== row.sourceResultHash)) throw new Error('Report batch source digest mismatch')
    if (facts) {assertScaleFactsBinding(facts, record); decoded.set(record, facts)}
  }
  await prefetchCompactScaleTemplates([...decoded.values()], templates, {canonical: false})
  const snapshotsByAttempt = new Map<string, any[]>(), owners=new Map(attempts.map(attempt=>[`${attempt.id}:${attempt.attemptEpoch}`,attempt]))
  for (const snapshot of snapshots) {
    const owner = owners.get(`${snapshot.compositeAttemptId}:${snapshot.attemptEpoch}`)
    if (!owner || !sectionsByAttempt.get(owner)!.some(section => formSectionSlotKey(section.id) === snapshot.slotKey)) throw new Error('Report batch snapshot outside selected parent/epoch')
    const group = snapshotsByAttempt.get(owner.id) ?? []; group.push(snapshot); snapshotsByAttempt.set(owner.id, group)
  }
  for (const attempt of attempts) {
    const context = contexts.get(attempt)!.facts
    for (const record of attempt.scaleAssessments) {
      if(runtimes.has(record)){
        try{const value=runtimes.get(record);context.scaleRuntimes.set(record,isSharedScaleRuntimeReference(value)?await runtimeStore.load(value):parseVersionedFrozenScaleRuntimeSnapshot(value))}
        catch{context.scaleRuntimes.set(record,undefined)} // Existing frozen-policy reader denies on unavailable/invalid runtime.
      }
      const facts = decoded.get(record)
      context.scaleResults.set(record, facts ? (await restoreCompactScaleFacts(facts, {canonical: false, ...(options?.numericOnly ? {reportOnly: true} : {})}, templates)).result : record.result)
      if (facts) context.scaleSourceResultHashes.set(record, facts.sourceResultHash)
    }
    const sections = sectionsByAttempt.get(attempt)!
    if (sections.length) context.typedFormValues = readLoadedCompositeTypedFormValues(attempt, sections, snapshotsByAttempt.get(attempt.id) ?? [], context.typedFormStates)
  }
  return attempt => {
    const context = contexts.get(attempt)
    if (!context || context.identity !== identity(attempt)) throw new Error('Report batch identity changed')
    return context.facts
  }
}
