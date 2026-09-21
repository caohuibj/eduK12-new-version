import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import {
  decryptFrozenUnitAdmission,
  frozenAdmissionPersistence,
  type FrozenUnitAdmissionV1,
} from './admission-snapshot'
import {
  decryptVersionedFrozenUnitAdmission,
  versionedFrozenAdmissionPersistence,
  type VersionedFrozenUnitAdmission,
} from './admission-snapshot-v2'

export type AdmissionParentForeignKeys = {
  questionnaireAssessmentId?: string | null
  compositeAttemptId?: string | null
}

export type StoredAdmissionRow = {
  frozenAdmissionSnapshotEncrypted: string | null
  frozenAdmissionSnapshotHash: string | null
}

export const assertAdmissionParentBinding = (
  child: AdmissionParentForeignKeys,
  admission: Pick<VersionedFrozenUnitAdmission, 'parent'>,
): void => {
  const questionnaireId = child.questionnaireAssessmentId ?? null
  const compositeId = child.compositeAttemptId ?? null
  if (questionnaireId && compositeId) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '准入快照上级绑定不匹配', 409)
  }
  if (questionnaireId) {
    if (admission.parent?.kind !== 'questionnaire' || admission.parent.parentId !== questionnaireId) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '准入快照上级绑定不匹配', 409)
    }
    return
  }
  if (compositeId) {
    if (admission.parent?.kind !== 'composite' || admission.parent.parentId !== compositeId) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '准入快照上级绑定不匹配', 409)
    }
    return
  }
  if (admission.parent !== null) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '准入快照上级绑定不匹配', 409)
  }
}

/** Legacy V1 reader retained for Cognitive/Form callers that have not moved schemas. */
export const readStoredUnitAdmission = (
  row: StoredAdmissionRow,
  unreadableMessage: string,
): FrozenUnitAdmissionV1 | null => {
  if (!row.frozenAdmissionSnapshotEncrypted || !row.frozenAdmissionSnapshotHash) return null
  try {
    return decryptFrozenUnitAdmission(row.frozenAdmissionSnapshotEncrypted, row.frozenAdmissionSnapshotHash)
  } catch (error) {
    throw new InstrumentFinalSubmitError(
      'STALE_ATTEMPT',
      error instanceof Error ? error.message : unreadableMessage,
      409,
    )
  }
}

export const readStoredVersionedUnitAdmission = (
  row: StoredAdmissionRow,
  unreadableMessage: string,
): VersionedFrozenUnitAdmission | null => {
  if (!row.frozenAdmissionSnapshotEncrypted || !row.frozenAdmissionSnapshotHash) return null
  try {
    return decryptVersionedFrozenUnitAdmission(row.frozenAdmissionSnapshotEncrypted, row.frozenAdmissionSnapshotHash)
  } catch (error) {
    throw new InstrumentFinalSubmitError(
      'STALE_ATTEMPT',
      error instanceof Error ? error.message : unreadableMessage,
      409,
    )
  }
}

export const persistAdmissionOnce = async (input: {
  snapshot: FrozenUnitAdmissionV1
  writeIfEmpty: (persisted: ReturnType<typeof frozenAdmissionPersistence>) => Promise<{ count: number }>
  read: () => Promise<StoredAdmissionRow | null>
  missingMessage: string
  unreadableMessage: string
}): Promise<FrozenUnitAdmissionV1> => {
  const persisted = frozenAdmissionPersistence(input.snapshot)
  const updated = await input.writeIfEmpty(persisted)
  if (updated.count === 1) return input.snapshot
  const current = await input.read()
  if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', input.missingMessage, 404)
  const stored = readStoredUnitAdmission(current, input.unreadableMessage)
  if (stored) return stored
  throw new InstrumentFinalSubmitError('STALE_ATTEMPT', input.unreadableMessage, 409)
}

export const persistVersionedAdmissionOnce = async <T extends VersionedFrozenUnitAdmission>(input: {
  snapshot: T
  writeIfEmpty: (persisted: ReturnType<typeof versionedFrozenAdmissionPersistence>) => Promise<{ count: number }>
  read: () => Promise<StoredAdmissionRow | null>
  missingMessage: string
  unreadableMessage: string
}): Promise<T> => {
  const persisted = versionedFrozenAdmissionPersistence(input.snapshot)
  const updated = await input.writeIfEmpty(persisted)
  if (updated.count === 1) return input.snapshot
  const current = await input.read()
  if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', input.missingMessage, 404)
  const stored = readStoredVersionedUnitAdmission(current, input.unreadableMessage)
  if (!stored) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', input.unreadableMessage, 409)
  if (stored.schemaVersion !== input.snapshot.schemaVersion) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表准入快照版本冲突', 409)
  }
  if (stored.attemptEpoch !== input.snapshot.attemptEpoch
    || stored.contextSnapshotHash !== input.snapshot.contextSnapshotHash
    || JSON.stringify(stored.principal) !== JSON.stringify(input.snapshot.principal)
    || JSON.stringify(stored.parent) !== JSON.stringify(input.snapshot.parent)
    || (stored.schemaVersion === 2 && input.snapshot.schemaVersion === 2
      && stored.scalePolicy?.eligibility.identityBindingHash !== input.snapshot.scalePolicy?.eligibility.identityBindingHash)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表准入并发冻结绑定冲突', 409)
  }
  return stored as T
}
