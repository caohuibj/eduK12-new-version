import { Prisma } from '@prisma/client'
import { readEducationScaleExecutionSource } from '../assessment-run/educationScaleExecutionSource'
import { loadFrozenActiveSlotSet, compositeItemSlotKey } from '../assessment-runtime/slot-set'
import { loadFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'

/** Content/binding proof only. Caller must establish the current actor, actual
 * Teacher event, assignment, and product authority; a library origin grants none. */
export async function teacherLibraryExecutionBindingMatches(db: Prisma.TransactionClient, input: {
  organizationId:string; actorUserId: string; resourceKey: string; resourceVersion: string;
  attemptId: string | null; assignmentId: string; itemId?: string;
  purpose?: 'COLLECTION' | 'REPORT_READ'
}): Promise<boolean> {
  const source = await readEducationScaleExecutionSource(db, {
    organizationId:input.organizationId,
    product: 'TEACHER', resourceKey: input.resourceKey, resourceVersion: input.resourceVersion,
    // An attempt claim alone grants nothing: parent, frozen slot and child are
    // verified below. New START still reads current collection policy.
    purpose: input.purpose === 'REPORT_READ' || input.attemptId ? 'HISTORY' : 'EXISTING_EXECUTION',
  })
  if (source.variantKey !== 'TEACHER:SELF' || (input.itemId && input.itemId !== source.compositeItemId)) return false
  if (!input.attemptId) return !input.itemId
  const parent = await db.compositeAssessmentAttempt.findUnique({ where: { id: input.attemptId } })
  if (!parent || parent.compositeAssessmentId !== source.compositeId || parent.assignmentRef !== input.assignmentId
    || parent.userId !== input.actorUserId || parent.subjectUserId !== input.actorUserId
    || parent.respondentUserId !== input.actorUserId || !parent.frozenActiveSlotSetEncrypted || !parent.frozenActiveSlotSetHash) return false
  const slots = await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted, db)
  const slot = slots.slots[0]
  if (slots.snapshotHash !== parent.frozenActiveSlotSetHash || slots.attemptEpoch !== parent.attemptEpoch
    || slots.slots.length !== 1 || !slot || slot.unitType !== 'SCALE' || !slot.required
    || slot.slotKey !== compositeItemSlotKey(source.compositeItemId, 'SCALE')
    || slot.sourceDefinitionIdentity.hash !== source.sourceDefinitionHash
    || slot.sourceBinding.compositeItemId !== source.compositeItemId) return false
  const children = await db.assessment.findMany({ where: { compositeAttemptId: parent.id, attemptEpoch: parent.attemptEpoch } })
  // A parent frame may initialize the child lazily. Item/asset/submission routes
  // require an actual exact child, never another item supplied by the client.
  if (children.length === 0) {
    if(input.purpose!=='REPORT_READ')await readEducationScaleExecutionSource(db,{
      organizationId:input.organizationId,product:'TEACHER',resourceKey:input.resourceKey,
      resourceVersion:input.resourceVersion,purpose:'EXISTING_EXECUTION',
    })
    return !input.itemId
  }
  if (children.length !== 1) return false
  const child = children[0]
  if (child.scaleId !== source.scaleId || child.compositeItemId !== source.compositeItemId
    || child.userId !== input.actorUserId || !child.runtimeSnapshotEncrypted) return false
  const runtime = await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted, db)
  // The shared loader validates the complete V1 or V2 snapshot. Public custom
  // descriptive scales legitimately use V1; version alone is not an authority.
  return runtime.sourceDefinitionHash === source.sourceDefinitionHash
    && runtime.instrumentKey === slot.sourceDefinitionIdentity.key && runtime.instrumentVersion === slot.sourceDefinitionIdentity.version
    && runtime.compiledRuntime.compiledRuntimeHash === slot.sourceBinding.compiledRuntimeHash
}
