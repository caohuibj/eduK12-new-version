import { parseVersionedFrozenUnitAdmission } from '../assessment-runtime/admission-snapshot-v2'
import { parseFrozenActiveSlotSet, compositeItemSlotKey } from '../assessment-runtime/slot-set'
import { parseVersionedFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'

/** All records and independent stored hashes must be loaded by the server from
 * the same execution. This structural check is not current read authorization. */
export interface EducationScaleReportPersistedFacts {
  actorUserId: string
  /** Server-resolved immutable approved entry and frozen track contract, never
   * reconstructed from the supplied runtime or a client request. */
  approvedLibrarySource?: { approvedSnapshotHash: string; sourceDefinitionHash: string; resultDisclosureHash: string }
  /** Independently persisted author-private version, resolved by the server's
   * exact registered HISTORY identity reader, not inferred from runtime input. */
  privateVersionSource?: { versionId: string; contentHash: string; sourceDefinitionHash: string; resultDisclosureHash: string }
  resultDisclosureHash: string
  admission: unknown
  slotSet: unknown
  parent: { id: string; attemptEpoch: number; frozenActiveSlotSetHash: string }
  assessment: {
    id: string; scaleId: string; userId: string; compositeAttemptId: string
    compositeItemId: string; attemptEpoch: number; status: string
    submissionId: string; compiledRuntimeHash: string; frozenAdmissionSnapshotHash: string
  }
  finalUnit: {
    compositeAttemptId: string; attemptEpoch: number; slotKey: string
    unitType: string; terminalState: string; payloadKind: string; sourceType: string
    sourceAttemptId: string; sourceSubmissionId: string
    sourceDefinitionHash: string; compiledRuntimeHash: string
  }
}

/** Verify existing durable admission, parent slot and completed FINAL anchors.
 * The runtime's self hash is parsed for integrity, NEVER promoted to an
 * independently persisted expected hash. No new table or permission token. */
export function resolveEducationScaleReportPersistedBinding(
  facts: EducationScaleReportPersistedFacts, frozenSnapshot: unknown,
) {
  const runtime = parseVersionedFrozenScaleRuntimeSnapshot(frozenSnapshot)
  const admission = parseVersionedFrozenUnitAdmission(facts.admission)
  const slots = parseFrozenActiveSlotSet(facts.slotSet)
  const { parent, assessment, finalUnit } = facts
  const reject = (): never => { throw new Error('EDUCATION_REPORT_PERSISTED_BINDING_MISMATCH') }
  const hash = /^[a-f0-9]{64}$/
  if (![facts.resultDisclosureHash, parent.frozenActiveSlotSetHash, assessment.frozenAdmissionSnapshotHash]
    .every(value => hash.test(value))) reject()
  if (!facts.actorUserId || !assessment.id || !assessment.scaleId || !assessment.submissionId
    || !parent.id || !assessment.compositeItemId || !Number.isSafeInteger(parent.attemptEpoch)
    || parent.attemptEpoch < 1 || assessment.status !== 'COMPLETED'
    || assessment.userId !== facts.actorUserId
    || assessment.compositeAttemptId !== parent.id
    || assessment.attemptEpoch !== parent.attemptEpoch
    || admission.snapshotHash !== assessment.frozenAdmissionSnapshotHash
    || slots.snapshotHash !== parent.frozenActiveSlotSetHash
    || slots.attemptEpoch !== parent.attemptEpoch
    || admission.attemptEpoch !== parent.attemptEpoch
    || admission.principal.userId !== facts.actorUserId
    || admission.governance.status !== 'READY'
    || admission.scale?.id !== assessment.scaleId
    || admission.scale.code !== runtime.instrumentKey
    || admission.scale.instrumentVersion !== runtime.instrumentVersion
    || admission.schemaVersion !== runtime.schemaVersion) reject()
  if (runtime.schemaVersion === 2) {
    if (admission.schemaVersion !== 2 || admission.scalePolicy?.runtimePolicyHash !== runtime.runtimePolicyHash
      || admission.scalePolicy.eligibility.outcome !== 'ELIGIBLE'
      || admission.scalePolicy.eligibility.policyHash !== runtime.runtimePolicyHash) reject()
  } else {
    if (Boolean(facts.approvedLibrarySource) === Boolean(facts.privateVersionSource)) reject()
    const source = facts.approvedLibrarySource ?? facts.privateVersionSource
    if (!source || ![source.sourceDefinitionHash, source.resultDisclosureHash].every(value => typeof value === 'string' && hash.test(value))
      || source.sourceDefinitionHash !== runtime.sourceDefinitionHash
      || source.resultDisclosureHash !== facts.resultDisclosureHash) reject()
    if (facts.approvedLibrarySource && !hash.test(facts.approvedLibrarySource.approvedSnapshotHash)) reject()
    if (facts.privateVersionSource && (typeof facts.privateVersionSource.versionId !== 'string' || typeof facts.privateVersionSource.contentHash !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(facts.privateVersionSource.versionId)
      || !hash.test(facts.privateVersionSource.contentHash))) reject()
  }
  const slotKey = compositeItemSlotKey(assessment.compositeItemId, 'SCALE')
  const slot = slots.slots.find(candidate => candidate.slotKey === slotKey)
  if (!slot || slot.unitType !== 'SCALE' || !slot.required
    || slot.sourceDefinitionIdentity.key !== runtime.instrumentKey
    || slot.sourceDefinitionIdentity.version !== runtime.instrumentVersion
    || slot.sourceDefinitionIdentity.hash !== runtime.sourceDefinitionHash
    || slot.sourceBinding.compositeItemId !== assessment.compositeItemId
    || slot.sourceBinding.compiledRuntimeHash !== runtime.compiledRuntime.compiledRuntimeHash
    || assessment.compiledRuntimeHash !== runtime.compiledRuntime.compiledRuntimeHash
    || admission.parent?.kind !== 'composite' || admission.parent.parentId !== parent.id
    || admission.parent.slotKey !== slotKey
    || admission.parent.sourceDefinitionHash !== runtime.sourceDefinitionHash
    || admission.parent.compiledRuntimeHash !== runtime.compiledRuntime.compiledRuntimeHash) reject()
  if (finalUnit.compositeAttemptId !== parent.id || finalUnit.attemptEpoch !== parent.attemptEpoch
    || finalUnit.slotKey !== slotKey || finalUnit.unitType !== 'SCALE'
    || finalUnit.terminalState !== 'COMPLETED' || finalUnit.payloadKind !== 'UNIT_RESULT'
    || finalUnit.sourceType !== 'ASSESSMENT' || finalUnit.sourceAttemptId !== assessment.id
    || finalUnit.sourceSubmissionId !== assessment.submissionId
    || finalUnit.sourceDefinitionHash !== runtime.sourceDefinitionHash
    || finalUnit.compiledRuntimeHash !== runtime.compiledRuntime.compiledRuntimeHash) reject()
  return {
    scaleId: assessment.scaleId,
    definitionHash: runtime.legacyDefinitionHash,
    instrumentVersion: runtime.instrumentVersion,
    reportVersion: runtime.definition.report.reportVersion,
    ...(runtime.schemaVersion === 2 ? { runtimePolicyHash: runtime.runtimePolicyHash } : {}),
    resultDisclosureHash: facts.resultDisclosureHash,
    sourceDefinitionHash: finalUnit.sourceDefinitionHash,
    assessmentId: assessment.id,
  }
}
