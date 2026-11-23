import { randomBytes } from 'node:crypto'
import { BoundedArtifactCache } from './bounded-artifact-cache'
import { canonicalHash, retainImmutableCanonicalValue } from './canonical'
import { publicTemplateHash, publicTemplates, type PublicTemplateStore } from './public-templates'
import { encodeCompositeUnitSeeds } from './composite-final.codec'
import { runnerDefinition, type ScaleDefinitionV2 } from '../scale/scale-definition'
import type { AssessmentReferenceSetDefinition } from '../assessment-reference/reference'
import type { CompiledInstrumentRuntimeV1 } from './types'
import type { CompositeSection } from './form-section-definition'
import { publicTrainingFormDefinition } from './typed-form'
import {
  runnerSituationRuntimeDefinition,
  type SituationRuntimeDefinition,
} from '../situational/situation-runtime-definition'
import type { CognitiveProfile, SessionConfigSnapshot } from '../cognitive/v2/types'
import type { AssessmentStaticImageAssetIdentityV1 } from '../assessment-media/assessment-image'
import type { AssessmentVideoPresentationV1 } from '../assessment-media/assessment-video'

export interface CompositeSlotVideoEntry {
  presentation: AssessmentVideoPresentationV1
  retentionOwner: {
    entityType: string
    entityId: string
    field: string
  }
}

export interface CompositeSlotMediaManifest {
  imageAssets?: Record<string, AssessmentStaticImageAssetIdentityV1>
  videoPresentations?: Record<string, CompositeSlotVideoEntry>
}

export type CompositePublicationScaleSlot = CompositeSlotMediaManifest & {
  slotKey: string
  unitType: 'SCALE'
  itemId: string
  scaleId: string
  instrumentKey: string
  instrumentVersion: string
  name: string
  title: string
  required: boolean
  position: number
  definitionHash: string
  instruction?: string | null
  definition: ScaleDefinitionV2
  compiledRuntime: CompiledInstrumentRuntimeV1
  referenceSets: AssessmentReferenceSetDefinition[]
  referencePolicy?: unknown
}

export type CompositePublicationFormSectionSlot = CompositeSlotMediaManifest & {
  slotKey: string
  unitType: 'FORM_SECTION'
  sectionId: string
  title: string
  description?: string | null
  required: boolean
  position: number
  contextSection: boolean
  definitionHash: string
  section: CompositeSection
}

export type CompositePublicationSituationalSlot = CompositeSlotMediaManifest & {
  slotKey: string
  unitType: 'SITUATIONAL'
  itemId: string
  instrumentKey: string
  instrumentVersion: string
  title: string
  required: boolean
  position: number
  definitionHash: string
  definition: SituationRuntimeDefinition
  compiledRuntime: CompiledInstrumentRuntimeV1
}

export type CompositePublicationCognitiveSlot = CompositeSlotMediaManifest & {
  slotKey: string
  unitType: 'COGNITIVE'
  itemId: string
  testType: string
  title: string
  required: boolean
  position: number
  definitionHash: string
  resolvedConfigHash: string
  profile: CognitiveProfile
  sessionSnapshot: SessionConfigSnapshot
  compiledRuntime: CompiledInstrumentRuntimeV1
}

export type CompositePublicationSlotV1 =
  | CompositePublicationScaleSlot
  | CompositePublicationFormSectionSlot
  | CompositePublicationSituationalSlot
  | CompositePublicationCognitiveSlot

export interface CompositePublicationPlanV1 {
  schemaVersion: 1
  compositeId: string
  title: string
  description?: string | null
  instruction?: string | null
  slotSetHash: string
  publicationHash: string
  flowDefinition?: unknown | null
  slots: CompositePublicationSlotV1[]
}

export interface WholeV2TemplatePayload {
  schemaVersion: 2
  publicationHash: string
  slotSetHash: string
  compositeId: string
  title: string
  description?: string | null
  instruction?: string | null
  flowDefinition?: unknown | null
  units: Array<
    | {
        slotKey: string
        unitType: 'SCALE'
        itemId: string
        scaleId: string
        title: string
        required: boolean
        position: number
        definitionHash: string
        instruction?: string | null
        definition: ReturnType<typeof runnerDefinition>
      }
    | {
        slotKey: string
        unitType: 'FORM_SECTION'
        sectionId: string
        title: string
        description?: string | null
        required: boolean
        position: number
        contextSection: boolean
        definitionHash: string
        items: Array<{
          id: string
          formType: string
          formLabel: string
          formPlaceholder?: string | null
          formOptions?: unknown
          formDefinition?: unknown
          formPolicy?: unknown
          contextKey?: string | null
          required: boolean
          position: number
        }>
      }
    | {
        slotKey: string
        unitType: 'SITUATIONAL'
        itemId: string
        instrumentKey: string
        instrumentVersion: string
        title: string
        required: boolean
        position: number
        definitionHash: string
        compiledRuntimeHash: string
        scorerKey: string
        scoringVersion: string
        definition: ReturnType<typeof runnerSituationRuntimeDefinition>
      }
    | {
        slotKey: string
        unitType: 'COGNITIVE'
        itemId: string
        testType: string
        title: string
        required: boolean
        position: number
        definitionHash: string
        configVersion: string
        engineVersion: string
        scoringVersion: string
        protocolSignature: string
        protocol: SessionConfigSnapshot['protocol']
        profile: string
        config: unknown
        presentation?: unknown
      }
  >
}

const planCache = new BoundedArtifactCache<CompositePublicationPlanV1>(128, 16 * 1024 * 1024)

export function clearCompositePublicationPlanCacheForTests(): void {
  planCache.clear()
}

export function computeCompositeSlotSetHash(slots: readonly CompositePublicationSlotV1[]): string {
  return canonicalHash(slots.map(slot => ({
    slotKey: slot.slotKey,
    unitType: slot.unitType,
    required: slot.required,
    definitionHash: slot.definitionHash,
  })))
}

export function buildCompositePublicationPlan(input: {
  compositeId: string
  title: string
  description?: string | null
  instruction?: string | null
  flowDefinition?: unknown | null
  slots: CompositePublicationSlotV1[]
}): CompositePublicationPlanV1 {
  const ordered = [...input.slots].sort((a, b) => a.position - b.position)
  const seen = new Set<string>()
  for (const slot of ordered) {
    if (seen.has(slot.slotKey)) throw new Error(`Duplicate publication slotKey: ${slot.slotKey}`)
    seen.add(slot.slotKey)
  }
  const slotSetHash = computeCompositeSlotSetHash(ordered)
  const unsigned = {
    schemaVersion: 1 as const,
    compositeId: input.compositeId,
    title: input.title,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
    slotSetHash,
    ...(input.flowDefinition !== undefined ? { flowDefinition: input.flowDefinition } : {}),
    slots: ordered,
  }
  const publicationHash = publicTemplateHash('COMPOSITE_PUBLICATION_PLAN', unsigned)
  return retainImmutableCanonicalValue({ ...unsigned, publicationHash })
}

export async function saveCompositePublicationPlan(
  plan: CompositePublicationPlanV1,
  templates: PublicTemplateStore = publicTemplates,
): Promise<string> {
  const { publicationHash, ...unsigned } = plan
  const [templateHash] = await templates.saveMany([{
    kind: 'COMPOSITE_PUBLICATION_PLAN',
    value: unsigned,
    precomputedHash: publicationHash,
  }])
  const estBytes = Math.max(4096, JSON.stringify(plan).length * 4)
  planCache.set(templateHash, plan, estBytes)
  return templateHash
}

export async function loadCompositePublicationPlan(
  publicationHash: string,
  templates: PublicTemplateStore = publicTemplates,
): Promise<CompositePublicationPlanV1> {
  const cached = planCache.get(publicationHash)
  if (cached) return cached
  const [loaded] = await templates.loadMany([{
    hash: publicationHash,
    kind: 'COMPOSITE_PUBLICATION_PLAN',
  }])
  if (!loaded || loaded.schemaVersion !== 1 || !Array.isArray(loaded.slots)) {
    throw new Error('Invalid composite publication plan template')
  }
  const plan = retainImmutableCanonicalValue({
    ...(loaded as Omit<CompositePublicationPlanV1, 'publicationHash'>),
    publicationHash,
  })
  const estBytes = Math.max(4096, JSON.stringify(plan).length * 4)
  planCache.set(publicationHash, plan, estBytes)
  return plan
}

/** Projects a safe participant-facing runner template (strips scoring weights,
 * expert keys, and normative tables) covering all 4 instrument families. */
export function projectWholeV2Template(plan: CompositePublicationPlanV1): WholeV2TemplatePayload {
  return {
    schemaVersion: 2,
    publicationHash: plan.publicationHash,
    slotSetHash: plan.slotSetHash,
    compositeId: plan.compositeId,
    title: plan.title,
    description: plan.description ?? null,
    instruction: plan.instruction ?? null,
    flowDefinition: plan.flowDefinition ?? null,
    units: plan.slots.map(slot => {
      if (slot.unitType === 'SCALE') {
        return {
          slotKey: slot.slotKey,
          unitType: 'SCALE',
          itemId: slot.itemId,
          scaleId: slot.scaleId,
          title: slot.title,
          required: slot.required,
          position: slot.position,
          definitionHash: slot.definitionHash,
          instruction: slot.instruction ?? null,
          definition: runnerDefinition(slot.definition),
        }
      }
      if (slot.unitType === 'FORM_SECTION') {
        return {
          slotKey: slot.slotKey,
          unitType: 'FORM_SECTION',
          sectionId: slot.sectionId,
          title: slot.title,
          description: slot.description ?? null,
          required: slot.required,
          position: slot.position,
          contextSection: slot.contextSection,
          definitionHash: slot.definitionHash,
          items: slot.section.items.map(item => ({
            id: item.id,
            formType: item.formType ?? 'text',
            formLabel: item.formLabel ?? '',
            formPlaceholder: item.placeholder ?? null,
            formOptions: item.formOptions ?? null,
            formDefinition: item.formDefinition ? publicTrainingFormDefinition(item.formDefinition as any) : null,
            formPolicy: item.formPolicy ?? null,
            contextKey: item.contextKey ?? null,
            required: item.required,
            position: item.formSectionPosition ?? item.position ?? 0,
          })),
        }
      }
      if (slot.unitType === 'SITUATIONAL') {
        return {
          slotKey: slot.slotKey,
          unitType: 'SITUATIONAL',
          itemId: slot.itemId,
          instrumentKey: slot.instrumentKey,
          instrumentVersion: slot.instrumentVersion,
          title: slot.title,
          required: slot.required,
          position: slot.position,
          definitionHash: slot.definitionHash,
          compiledRuntimeHash: slot.compiledRuntime.compiledRuntimeHash,
          scorerKey: slot.compiledRuntime.scorerKey ?? '',
          scoringVersion: slot.compiledRuntime.scorerVersion ?? '',
          definition: runnerSituationRuntimeDefinition(slot.definition),
        }
      }
      return {
        slotKey: slot.slotKey,
        unitType: 'COGNITIVE',
        itemId: slot.itemId,
        testType: slot.testType,
        title: slot.title,
        required: slot.required,
        position: slot.position,
        definitionHash: slot.definitionHash,
        configVersion: slot.sessionSnapshot.configVersion,
        engineVersion: slot.sessionSnapshot.engineVersion,
        scoringVersion: slot.sessionSnapshot.scoringVersion,
        protocolSignature: slot.sessionSnapshot.protocolSignature,
        protocol: slot.sessionSnapshot.protocol,
        profile: slot.profile,
        config: slot.sessionSnapshot.config,
        presentation: slot.sessionSnapshot.presentation ?? null,
      }
    }),
  }
}

/** Issues cryptographic randomSeed values ONLY for Cognitive slots at START time.
 * Stored as a single compact encrypted column on composite_assessment_attempts. */
export function generateCompositeUnitSeeds(
  plan: CompositePublicationPlanV1,
  attemptId: string,
  attemptEpoch: number,
): { seeds: Record<string, string>; encrypted: string } | null {
  const cognitiveSlots = plan.slots.filter(slot => slot.unitType === 'COGNITIVE')
  if (!cognitiveSlots.length) return null
  const seeds: Record<string, string> = {}
  for (const slot of cognitiveSlots) {
    seeds[slot.slotKey] = randomBytes(16).toString('hex')
  }
  return {
    seeds,
    encrypted: encodeCompositeUnitSeeds({
      schemaVersion: 1,
      attemptId,
      attemptEpoch,
      seeds,
    }),
  }
}
