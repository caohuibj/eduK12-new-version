import type { Prisma } from '@prisma/client'
import { freezeCompositeActiveSlotSet, type EducationSlotPresentation } from './attempt-runtime'
import type { PublishedScaleArtifact } from './published-scale-artifact'
import { publicTemplatesForDatabase, type PublicTemplateKind } from './public-templates'
import { sharedControlWritesEnabled } from './shared-control-records'
import { compositeItemSlotKey } from './slot-set'

export type PublishedStartScale = {
  itemId: string
  scale: { id: string; name: string; code: string; instrumentVersion: string }
  artifact: PublishedScaleArtifact
}

/** Publish the plans whose full content is known from sealed Scale artifacts.
 * Managed runtimes with a different identity still use their exact hash. */
export async function appendPublishedStartPlans(
  db: Prisma.TransactionClient,
  units: PublishedStartScale[],
  education?: { order: Map<string, number>; presentation: Map<string, EducationSlotPresentation> },
) {
  if (!sharedControlWritesEnabled() || !units.length) return
  const frozenSlots = freezeCompositeActiveSlotSet({
    attemptEpoch: 1,
    scales: units.map(({ itemId, artifact }) => ({
      compositeItemId: itemId, code: artifact.instrumentKey, instrumentVersion: artifact.instrumentVersion,
      sourceDefinitionHash: artifact.sourceDefinitionHash, compiledRuntimeHash: artifact.compiledRuntime.compiledRuntimeHash,
    })),
    formSections: [], cognitive: [], situational: [],
    unitOrder: education?.order, unitPresentation: education?.presentation,
  })
  const { attemptEpoch: _epoch, snapshotHash: _hash, ...slotPlan } = frozenSlots
  const entries: Array<{ kind: PublicTemplateKind; value: unknown }> = units.map(({ itemId, scale, artifact }) => ({
    kind: 'UNIT_ADMISSION_PLAN',
    value: {
      schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', requiresContext: false,
      parent: { kind: 'composite', slotKey: compositeItemSlotKey(itemId, 'SCALE'),
        sourceDefinitionHash: artifact.sourceDefinitionHash, compiledRuntimeHash: artifact.compiledRuntime.compiledRuntimeHash },
      scale: { id: scale.id, code: scale.code, name: scale.name, instrumentVersion: scale.instrumentVersion },
    },
  }))
  entries.push({ kind: 'FROZEN_SLOT_PLAN', value: slotPlan })
  await publicTemplatesForDatabase(db).saveMany(entries)
}
