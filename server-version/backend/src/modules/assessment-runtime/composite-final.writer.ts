import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { canonicalHash } from './canonical'
import { encryptCompactField } from './compact-field-codec'
import { publicTemplatesForDatabase, type PublicTemplateStore } from './public-templates'
import {
  buildScaleUnitFactsBatch,
  decodeCompositeUnitSeeds,
  encodeCompositeFinalFacts,
  encodeCompositeFinalRaw,
  type BuildScaleUnitFactInput,
} from './composite-final.codec'
import {
  HEX64_RE,
  type CompositeCognitiveUnitFactV1,
  type CompositeFinalFactsV1,
  type CompositeFinalRawV1,
  type CompositeFormSectionUnitFactV1,
  type CompositeSituationalUnitFactV1,
  type CompositeUnitFactV1,
  type CompositeUnitRawV1,
} from './composite-final.contract'
import {
  clearCompositeCheckpoint,
  readLockedUnitsForSubmit,
  type CompositeCheckpointDb,
} from './composite-checkpoint.service'
import type {
  CompositePublicationCognitiveSlot,
  CompositePublicationFormSectionSlot,
  CompositePublicationPlanV1,
  CompositePublicationScaleSlot,
  CompositePublicationSituationalSlot,
} from './composite-publication-plan'
import {
  createCanonicalUnitResultEnvelope,
  projectCognitiveCanonicalUnitResult,
  projectScaleCanonicalUnitResult,
  projectSituationCanonicalUnitResult,
} from './unit-result'
import { buildScaleResult } from '../scale/scale-result'
import type { ReferenceContext } from '../assessment-reference/reference'
import type { ScaleAnswer } from '../scale/scale-scoring'
import { normalizeCompositeSectionAnswers, type SectionSubmitInput } from '../composite/final-submit.service'
import { projectReachableSituationDefinitionForScoring } from '../situational/situation-trajectory'
import { normalizeSituationalSubmission } from '../situational/situational-final-submit.service'
import { scoreSituationalModel } from '../situational/situation-model-resolver'
import { buildSjtNarrative } from '../situational/authoring/narrative'
import { getCognitiveV2TaskDefinition } from '../cognitive/v2/registry'
import { runAuthoritativeScorer } from '../cognitive/v2/authoritative-scorer'
import type { CognitiveResultSnapshot } from '../cognitive/v2/types'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

const hashSchema = z.string().regex(HEX64_RE)

const scaleUnitSubmitSchema = z.object({
  unitType: z.literal('SCALE'),
  definitionHash: hashSchema,
  answers: z.array(z.object({
    itemCode: z.string().min(1).max(200),
    responseValue: z.union([z.string(), z.number().finite()]),
    responseTimeMs: z.number().finite().min(0).optional(),
    answeredAt: z.string().optional(),
    changeCount: z.number().int().min(0).optional(),
  }).strict()).max(20000),
  timings: z.record(z.string(), z.unknown()).optional(),
  deviceInputProvenance: z.record(z.string(), z.unknown()).optional(),
}).strict()

const formSectionUnitSubmitSchema = z.object({
  unitType: z.literal('FORM_SECTION'),
  definitionHash: hashSchema,
  answers: z.array(z.object({
    formItemId: z.string().min(1).max(200),
    value: z.unknown(),
    otherText: z.string().max(4000).optional(),
  }).strict()).max(1000),
}).strict()

const situationalUnitSubmitSchema = z.object({
  unitType: z.literal('SITUATIONAL'),
  definitionHash: hashSchema,
  responses: z.record(z.string(), z.unknown()),
  researchEvents: z.array(z.unknown()).max(10000).optional(),
  totalTimeMs: z.number().finite().min(0).optional(),
}).strict()

const cognitiveUnitSubmitSchema = z.object({
  unitType: z.literal('COGNITIVE'),
  definitionHash: hashSchema,
  randomSeed: z.string().min(1).max(240),
  trials: z.array(z.unknown()).max(20000),
  summaryMeta: z.record(z.string(), z.unknown()).optional(),
}).strict()

export const wholeV2UnitSubmitSchema = z.discriminatedUnion('unitType', [
  scaleUnitSubmitSchema,
  formSectionUnitSubmitSchema,
  situationalUnitSubmitSchema,
  cognitiveUnitSubmitSchema,
])
export type WholeV2UnitSubmitPayload = z.infer<typeof wholeV2UnitSubmitSchema>

export const wholeV2SubmitSchema = z.object({
  submissionId: z.string().min(16).max(200),
  attemptEpoch: z.number().int().min(1),
  publicationHash: hashSchema,
  slotSetHash: hashSchema,
  units: z.record(z.string(), wholeV2UnitSubmitSchema),
  /** Optional list of reached slotKeys when Flow branching hides unreached units. */
  executedSlotKeys: z.array(z.string().min(1).max(240)).max(200).optional(),
  totalTimeMs: z.number().finite().min(0).optional(),
}).strict()
export type WholeV2SubmitInput = z.infer<typeof wholeV2SubmitSchema>

export interface CommitCompositeWholeFinalInput {
  attempt: {
    id: string
    attemptEpoch: number
    compositeAssessmentId: string
    organizationId?: string | null
    deliveryCourseId?: string | null
    publicationHash: string
    unitSeedsEncrypted?: string | null
    receiptOnly: boolean
    startedAt: Date
  }
  plan: CompositePublicationPlanV1
  submit: WholeV2SubmitInput
  /** Optional education run records to reconcile to COMPLETED inside the same transaction. */
  educationRun?: {
    executionId: string
    assignmentId: string
  }
  /** Optional active slot subset (e.g. from weighted variant allocation or evaluated Flow). */
  activeSlotKeys?: ReadonlySet<string>
  /** Optional in-memory feedback pre-materializer (zero extra DB queries). */
  buildFeedback?: (facts: CompositeFinalFactsV1) => unknown | Promise<unknown>
  templates?: PublicTemplateStore
  now?: Date
}

export interface CompositeWholeFinalReceipt {
  status: 'COMPLETED'
  attemptId: string
  attemptEpoch: number
  submissionId: string
  payloadHash: string
  aggregateHash: string
  factsHash: string
  rawHash: string
  completedAt: string
  replayed: boolean
  receiptOnly: boolean
  feedbackAvailable: boolean
}

type ExistingFinalRow = {
  attemptId: string
  attemptEpoch: number
  submissionId: string
  payloadHash: string
  aggregateHash: string
  factsHash: string
  rawHash: string
  feedbackCipher: string | null
  completedAt: Date
}

export type CompositeFinalWriterDb = CompositeCheckpointDb

/** Authoritative 4-in-1 synchronous single-row FINAL writer (Scale + Form + SJT + Cognitive).
 * Scores purely in memory, enforces monotonic locked units from composite_attempt_checkpoints,
 * writes 1 row to composite_attempt_finals, updates parent/execution status, and clears
 * the ephemeral checkpoint — all inside the caller's transaction with ZERO child rows. */
export async function commitCompositeWholeFinal(
  tx: CompositeFinalWriterDb,
  input: CommitCompositeWholeFinalInput,
): Promise<CompositeWholeFinalReceipt> {
  const { attempt, plan, submit } = input
  if (submit.attemptEpoch !== attempt.attemptEpoch) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '作答版本已变更，请刷新后重试', 409)
  }
  if (submit.publicationHash !== attempt.publicationHash || submit.publicationHash !== plan.publicationHash) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '冻结发布快照摘要不匹配', 409)
  }
  if (submit.slotSetHash !== plan.slotSetHash) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '冻结工具清单摘要不匹配', 409)
  }

  const payloadHash = canonicalHash({
    publicationHash: submit.publicationHash,
    slotSetHash: submit.slotSetHash,
    units: submit.units,
    executedSlotKeys: submit.executedSlotKeys ?? null,
  })

  // 1. Idempotent replay & submission conflict check
  const existingRows = await tx.$queryRaw<ExistingFinalRow[]>(Prisma.sql`
    SELECT attempt_id AS "attemptId",
      attempt_epoch AS "attemptEpoch",
      submission_id AS "submissionId",
      payload_hash AS "payloadHash",
      aggregate_hash AS "aggregateHash",
      facts_hash AS "factsHash",
      raw_hash AS "rawHash",
      feedback_cipher AS "feedbackCipher",
      completed_at AS "completedAt"
    FROM composite_attempt_finals
    WHERE (attempt_id = ${attempt.id} AND attempt_epoch = ${attempt.attemptEpoch})
       OR submission_id = ${submit.submissionId}
    LIMIT 2
  `)
  if (existingRows.length > 0) {
    const match = existingRows.find(
      row => row.attemptId === attempt.id
        && row.attemptEpoch === attempt.attemptEpoch
        && row.submissionId === submit.submissionId
        && row.payloadHash === payloadHash,
    )
    if (match) {
      return {
        status: 'COMPLETED',
        attemptId: match.attemptId,
        attemptEpoch: match.attemptEpoch,
        submissionId: match.submissionId,
        payloadHash: match.payloadHash,
        aggregateHash: match.aggregateHash,
        factsHash: match.factsHash,
        rawHash: match.rawHash,
        completedAt: match.completedAt.toISOString(),
        replayed: true,
        receiptOnly: attempt.receiptOnly,
        feedbackAvailable: Boolean(match.feedbackCipher),
      }
    }
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '作答已提交且内容与原提交不一致', 409)
  }

  // 2. Load & verify monotonically locked Cognitive / SJT units from checkpoint
  const lockedUnits = await readLockedUnitsForSubmit(tx, {
    attemptId: attempt.id,
    attemptEpoch: attempt.attemptEpoch,
    publicationHash: attempt.publicationHash,
  })

  const slotByKey = new Map(plan.slots.map(slot => [slot.slotKey, slot]))
  const effectiveUnits: Record<string, WholeV2UnitSubmitPayload> = { ...submit.units }

  for (const [slotKey, locked] of Object.entries(lockedUnits)) {
    const slot = slotByKey.get(slotKey)
    if (!slot) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', `锁定槽位不存在：${slotKey}`, 409)
    const submitted = effectiveUnits[slotKey]
    if (locked.unitType === 'COGNITIVE') {
      if (submitted) {
        if (submitted.unitType !== 'COGNITIVE') {
          throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `锁定认知单元类型冲突：${slotKey}`, 409)
        }
        const submittedHash = canonicalHash({
          unitType: 'COGNITIVE',
          itemId: locked.itemId,
          randomSeed: submitted.randomSeed,
          trials: submitted.trials,
          ...(submitted.summaryMeta !== undefined ? { summaryMeta: submitted.summaryMeta } : {}),
        })
        if (submittedHash !== locked.payloadHash) {
          throw new InstrumentFinalSubmitError('CHECKPOINT_LOCKED_UNIT_IMMUTABLE', `认知单元 ${slotKey} 已锁定，禁止修改或重做`, 409)
        }
      } else {
        effectiveUnits[slotKey] = {
          unitType: 'COGNITIVE',
          definitionHash: slot.definitionHash,
          randomSeed: locked.randomSeed,
          trials: locked.trials,
          ...(locked.summaryMeta !== undefined ? { summaryMeta: locked.summaryMeta } : {}),
        }
      }
    } else {
      if (submitted) {
        if (submitted.unitType !== 'SITUATIONAL') {
          throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `锁定情境单元类型冲突：${slotKey}`, 409)
        }
        const submittedHash = canonicalHash({
          unitType: 'SITUATIONAL',
          itemId: locked.itemId,
          responses: submitted.responses,
          ...(submitted.researchEvents !== undefined ? { researchEvents: submitted.researchEvents } : {}),
          ...(submitted.totalTimeMs !== undefined ? { totalTimeMs: submitted.totalTimeMs } : {}),
        })
        if (submittedHash !== locked.payloadHash) {
          throw new InstrumentFinalSubmitError('CHECKPOINT_LOCKED_UNIT_IMMUTABLE', `情境单元 ${slotKey} 已锁定，禁止修改或重做`, 409)
        }
      } else {
        effectiveUnits[slotKey] = {
          unitType: 'SITUATIONAL',
          definitionHash: slot.definitionHash,
          responses: locked.responses,
          ...(locked.researchEvents !== undefined ? { researchEvents: locked.researchEvents } : {}),
          ...(locked.totalTimeMs !== undefined ? { totalTimeMs: locked.totalTimeMs } : {}),
        }
      }
    }
  }

  // 3. Validate slot membership & required completeness
  const allowedSlotKeys = input.activeSlotKeys ?? new Set(plan.slots.map(s => s.slotKey))
  for (const [slotKey, unitPayload] of Object.entries(effectiveUnits)) {
    const slot = slotByKey.get(slotKey)
    if (!slot || !allowedSlotKeys.has(slotKey)) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', `提交包含未授权槽位：${slotKey}`, 400)
    }
    if (slot.unitType !== unitPayload.unitType) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', `槽位类型不匹配：${slotKey}`, 400)
    }
    if (slot.definitionHash !== unitPayload.definitionHash) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', `槽位冻结版本不匹配：${slotKey}`, 409)
    }
  }
  for (const slot of plan.slots) {
    if (allowedSlotKeys.has(slot.slotKey) && slot.required && !effectiveUnits[slot.slotKey]) {
      throw new InstrumentFinalSubmitError('MISSING_REQUIRED_UNITS', `缺少必答单元：${slot.slotKey}`, 400)
    }
  }

  // Decode server-issued Cognitive random seeds once
  let unitSeeds: Record<string, string> = {}
  if (attempt.unitSeedsEncrypted) {
    const parsedSeeds = decodeCompositeUnitSeeds(attempt.unitSeedsEncrypted)
    if (parsedSeeds.attemptId !== attempt.id || parsedSeeds.attemptEpoch !== attempt.attemptEpoch) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知测验随机种子归属不匹配', 409)
    }
    unitSeeds = parsedSeeds.seeds
  }

  const now = input.now ?? new Date()
  const completedAtIso = now.toISOString()
  const factsUnits: Record<string, CompositeUnitFactV1> = {}
  const rawUnits: Record<string, CompositeUnitRawV1> = {}

  // 4A. Context Form Sections FIRST so contextSnapshotHash is available to Scale / SJT / Cognitive
  const formSlots = plan.slots.filter(
    (s): s is CompositePublicationFormSectionSlot => s.unitType === 'FORM_SECTION' && Boolean(effectiveUnits[s.slotKey]),
  )
  formSlots.sort((a, b) => Number(b.contextSection) - Number(a.contextSection))

  const contextFields: Record<string, unknown> = {}
  for (const slot of formSlots) {
    const submitted = effectiveUnits[slot.slotKey] as Extract<WholeV2UnitSubmitPayload, { unitType: 'FORM_SECTION' }>
    const normalizedResult = normalizeCompositeSectionAnswers(
      slot.section,
      submitted.answers as SectionSubmitInput['answers'],
    )
    const typedValues: Record<string, unknown> = {}
    const sectionContext: Record<string, unknown> = {}
    for (const entry of normalizedResult.normalized) {
      const val = 'payloadValue' in entry ? entry.payloadValue : entry.normalizedValue
      typedValues[entry.item.id] = val
      if (entry.item.contextKey && val !== null && val !== undefined) {
        sectionContext[entry.item.contextKey] = val
        contextFields[entry.item.contextKey] = val
      }
    }
    const formFact: CompositeFormSectionUnitFactV1 = {
      unitType: 'FORM_SECTION',
      sectionId: slot.sectionId,
      sourceDefinitionHash: slot.definitionHash,
      sourceResultHash: canonicalHash({ sectionId: slot.sectionId, typedValues }),
      typedValues: typedValues as any,
      ...(Object.keys(sectionContext).length > 0 ? { contextSnapshot: sectionContext } : {}),
    }
    factsUnits[slot.slotKey] = formFact
    rawUnits[slot.slotKey] = {
      unitType: 'FORM_SECTION',
      sectionId: slot.sectionId,
      answers: submitted.answers,
    }
  }

  const hasContext = Object.keys(contextFields).length > 0
  const contextHash = hasContext
    ? canonicalHash({ schemaVersion: 1, fields: contextFields })
    : null
  const assessmentContext = contextHash ? { schemaVersion: 1 as const, snapshotHash: contextHash } : null

  // 4B. Score all Scale units and batch-save templates in 1 single saveMany roundtrip
  const scaleSlots = plan.slots.filter(
    (s): s is CompositePublicationScaleSlot => s.unitType === 'SCALE' && Boolean(effectiveUnits[s.slotKey]),
  )
  const scaleBuildInputs: BuildScaleUnitFactInput[] = []
  const scaleSlotKeys: string[] = []
  for (const slot of scaleSlots) {
    const submitted = effectiveUnits[slot.slotKey] as Extract<WholeV2UnitSubmitPayload, { unitType: 'SCALE' }>
    const answers: ScaleAnswer[] = submitted.answers.map(a => ({
      itemCode: a.itemCode,
      responseValue: a.responseValue,
      ...(a.responseTimeMs !== undefined ? { responseTimeMs: a.responseTimeMs } : {}),
      ...(a.answeredAt !== undefined ? { answeredAt: a.answeredAt } : {}),
      ...(a.changeCount !== undefined ? { changeCount: a.changeCount } : {}),
    }))
    const result = buildScaleResult({
      scaleId: slot.scaleId,
      instrumentKey: slot.instrumentKey,
      name: slot.name,
      instrumentVersion: slot.instrumentVersion,
      definition: slot.definition,
      answers,
      referenceSets: slot.referenceSets,
      ...(hasContext ? { participantContext: contextFields as ReferenceContext } : {}),
      participantContextHash: contextHash,
    })
    const core = projectScaleCanonicalUnitResult({
      runtime: slot.compiledRuntime,
      result,
      contextHash,
    })
    const canonical = createCanonicalUnitResultEnvelope({
      core,
      completedAt: completedAtIso,
      persistenceProvenance: {
        sourceType: 'ASSESSMENT',
        sourceAttemptId: attempt.id,
        sourceSubmissionId: submit.submissionId,
      },
    })
    scaleBuildInputs.push({
      itemId: slot.itemId,
      scaleId: slot.scaleId,
      sourceDefinitionHash: slot.definitionHash,
      itemOrder: slot.definition.items.map(it => it.itemCode),
      result,
      canonical,
    })
    scaleSlotKeys.push(slot.slotKey)
    rawUnits[slot.slotKey] = {
      unitType: 'SCALE',
      itemId: slot.itemId,
      codes: answers.map(a => a.itemCode),
      values: answers.map(a => a.responseValue),
      ...(submitted.timings ? { timings: submitted.timings } : {}),
      ...(submitted.deviceInputProvenance ? { deviceInputProvenance: submitted.deviceInputProvenance } : {}),
    }
  }
  if (scaleBuildInputs.length > 0) {
    const templates = input.templates ?? publicTemplatesForDatabase(tx)
    const packedScales = await buildScaleUnitFactsBatch(scaleBuildInputs, templates)
    packedScales.forEach((fact, idx) => {
      factsUnits[scaleSlotKeys[idx]] = fact
    })
  }

  // 4C. Score all SJT units purely in memory (supports V1 + V2 branching DAG)
  const sjtSlots = plan.slots.filter(
    (s): s is CompositePublicationSituationalSlot => s.unitType === 'SITUATIONAL' && Boolean(effectiveUnits[s.slotKey]),
  )
  for (const slot of sjtSlots) {
    const submitted = effectiveUnits[slot.slotKey] as Extract<WholeV2UnitSubmitPayload, { unitType: 'SITUATIONAL' }>
    const responseList = Object.entries(submitted.responses).map(([pair, responseValue]) => {
      const idx = pair.indexOf(':')
      if (idx <= 0 || idx === pair.length - 1) {
        throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `无效的情境题回答键：${pair}`, 400)
      }
      return {
        sceneKey: pair.slice(0, idx),
        channelKey: pair.slice(idx + 1),
        responseValue: responseValue as any,
      }
    })
    const normalized = normalizeSituationalSubmission(slot.definition, responseList)
    const scoringDef = projectReachableSituationDefinitionForScoring(slot.definition, normalized.trajectory)
    const sjtResult = scoreSituationalModel(scoringDef, normalized.responses, {
      responsesValidated: true,
      ...(slot.definition.schemaVersion === 2
        ? {
            independentSceneKeyBySceneKey: Object.fromEntries(
              (slot.definition as any).flow.nodes.flatMap((n: any) =>
                n.nodeType === 'SCENE' ? [[n.sceneKey, n.motherSceneKey]] : [],
              ),
            ),
          }
        : {}),
    })
    const narrative = buildSjtNarrative(slot.definition, normalized.responses)
    if (narrative) sjtResult.narrative = narrative
    const canonicalCore = projectSituationCanonicalUnitResult({
      result: sjtResult,
      runtime: slot.compiledRuntime,
      contextHash,
    })
    const sjtFact: CompositeSituationalUnitFactV1 = {
      unitType: 'SITUATIONAL',
      itemId: slot.itemId,
      instrumentKey: slot.instrumentKey,
      instrumentVersion: slot.instrumentVersion,
      sourceDefinitionHash: slot.definitionHash,
      sourceResultHash: canonicalHash(sjtResult),
      scores: Object.fromEntries(sjtResult.metrics.map(m => [m.key, m.value])),
      ...(normalized.trajectory.nodeKeys.length > 0 ? { trajectory: normalized.trajectory.nodeKeys } : {}),
      quality: { status: sjtResult.quality.status, flags: [...sjtResult.quality.flags] },
      canonicalCore,
    }
    factsUnits[slot.slotKey] = sjtFact
    rawUnits[slot.slotKey] = {
      unitType: 'SITUATIONAL',
      itemId: slot.itemId,
      responses: submitted.responses,
      ...(submitted.researchEvents ? { researchEvents: submitted.researchEvents } : {}),
      ...(submitted.totalTimeMs !== undefined ? { totalTimeMs: submitted.totalTimeMs } : {}),
      ...(lockedUnits[slot.slotKey]?.lockedAt ? { lockedAt: lockedUnits[slot.slotKey].lockedAt } : {}),
    }
  }

  // 4D. Score all Cognitive units purely in memory (enforcing server-issued randomSeed)
  const cogSlots = plan.slots.filter(
    (s): s is CompositePublicationCognitiveSlot => s.unitType === 'COGNITIVE' && Boolean(effectiveUnits[s.slotKey]),
  )
  for (const slot of cogSlots) {
    const submitted = effectiveUnits[slot.slotKey] as Extract<WholeV2UnitSubmitPayload, { unitType: 'COGNITIVE' }>
    const expectedSeed = unitSeeds[slot.slotKey]
    if (!expectedSeed || submitted.randomSeed !== expectedSeed) {
      throw new InstrumentFinalSubmitError('COGNITIVE_SEED_MISMATCH', `认知测验随机种子不匹配：${slot.slotKey}`, 409)
    }
    const definition = getCognitiveV2TaskDefinition(
      slot.testType,
      slot.sessionSnapshot.engineVersion,
      slot.sessionSnapshot.scoringVersion,
    )
    if (!definition) {
      throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', `不支持的认知任务类型：${slot.testType}`, 409)
    }
    const scored = runAuthoritativeScorer({
      definition,
      session: slot.sessionSnapshot,
      trials: submitted.trials,
      randomSeed: expectedSeed,
    })
    const snapshot: CognitiveResultSnapshot = {
      schemaVersion: 1,
      completedAt: completedAtIso,
      testType: slot.sessionSnapshot.testType,
      configVersion: slot.sessionSnapshot.configVersion,
      engineVersion: slot.sessionSnapshot.engineVersion,
      scoringVersion: slot.sessionSnapshot.scoringVersion,
      protocolSignature: slot.sessionSnapshot.protocolSignature,
      profile: slot.profile,
      metrics: scored.metrics,
      quality: scored.quality,
      references: [],
      report: {},
      assessmentContext,
    }
    const canonicalCore = projectCognitiveCanonicalUnitResult({
      snapshot,
      runtime: slot.compiledRuntime,
      contextHash,
      resolvedConfigHash: slot.resolvedConfigHash,
    })
    const cogFact: CompositeCognitiveUnitFactV1 = {
      unitType: 'COGNITIVE',
      itemId: slot.itemId,
      testType: snapshot.testType,
      configVersion: snapshot.configVersion,
      engineVersion: snapshot.engineVersion,
      scoringVersion: snapshot.scoringVersion,
      protocolSignature: snapshot.protocolSignature,
      profile: slot.profile,
      sourceResultHash: canonicalHash(snapshot),
      trialCount: submitted.trials.length,
      metrics: snapshot.metrics,
      quality: snapshot.quality,
      references: snapshot.references,
      reportSummary: snapshot.report,
      canonicalCore,
    }
    factsUnits[slot.slotKey] = cogFact
    rawUnits[slot.slotKey] = {
      unitType: 'COGNITIVE',
      itemId: slot.itemId,
      randomSeed: expectedSeed,
      trials: submitted.trials,
      ...(submitted.summaryMeta ? { summaryMeta: submitted.summaryMeta } : {}),
      ...(lockedUnits[slot.slotKey]?.lockedAt ? { lockedAt: lockedUnits[slot.slotKey].lockedAt } : {}),
    }
  }

  // 5. Encode single-row FINAL facts, raw, and optional pre-materialized feedback
  const executedSlotKeys = plan.slots
    .map(s => s.slotKey)
    .filter(key => Object.prototype.hasOwnProperty.call(factsUnits, key))

  const finalFacts: CompositeFinalFactsV1 = {
    schemaVersion: 1,
    attemptId: attempt.id,
    attemptEpoch: attempt.attemptEpoch,
    compositeId: attempt.compositeAssessmentId,
    publicationHash: plan.publicationHash,
    slotSetHash: plan.slotSetHash,
    contextHash,
    completedAt: completedAtIso,
    executedSlotKeys,
    units: factsUnits,
  }
  const finalRaw: CompositeFinalRawV1 = {
    schemaVersion: 1,
    attemptId: attempt.id,
    attemptEpoch: attempt.attemptEpoch,
    submissionId: submit.submissionId,
    payloadHash,
    completedAt: completedAtIso,
    units: rawUnits,
  }

  const encodedFacts = encodeCompositeFinalFacts(finalFacts)
  const encodedRaw = encodeCompositeFinalRaw(finalRaw)
  const aggregateHash = canonicalHash({
    publicationHash: plan.publicationHash,
    slotSetHash: plan.slotSetHash,
    contextHash,
    factsHash: encodedFacts.hash,
  })

  let feedbackCipher: string | null = null
  if (!attempt.receiptOnly && input.buildFeedback) {
    const feedback = await input.buildFeedback(finalFacts)
    if (feedback != null) {
      feedbackCipher = encryptCompactField(feedback)
    }
  }

  const totalTimeSeconds = submit.totalTimeMs !== undefined
    ? Math.max(0, Math.round(submit.totalTimeMs / 1000))
    : Math.max(0, Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000))

  // 6. Atomic single-row FINAL persistence (ZERO child rows written)
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO composite_attempt_finals (
      attempt_id, attempt_epoch, composite_id, organization_id, course_id,
      publication_hash, slot_set_hash, context_hash, submission_id,
      payload_hash, aggregate_hash, facts_hash, facts_cipher,
      raw_hash, raw_cipher, feedback_cipher, completed_at
    ) VALUES (
      ${attempt.id}, ${attempt.attemptEpoch}, ${attempt.compositeAssessmentId},
      ${attempt.organizationId ?? null}, ${attempt.deliveryCourseId ?? null},
      ${plan.publicationHash}, ${plan.slotSetHash}, ${contextHash}, ${submit.submissionId},
      ${payloadHash}, ${aggregateHash}, ${encodedFacts.hash}, ${encodedFacts.cipher},
      ${encodedRaw.hash}, ${encodedRaw.cipher}, ${feedbackCipher}, ${now}
    )
  `)

  await tx.$executeRaw(Prisma.sql`
    UPDATE composite_assessment_attempts
    SET status = 'COMPLETED',
        progress = 100,
        completed_items = ${executedSlotKeys.length},
        completed_at = ${now},
        last_saved_at = ${now},
        total_time = ${totalTimeSeconds},
        aggregate_input_hash = ${aggregateHash},
        context_snapshot_hash = ${contextHash},
        frozen_active_slot_set_hash = COALESCE(frozen_active_slot_set_hash, ${plan.slotSetHash})
    WHERE id = ${attempt.id} AND attempt_epoch = ${attempt.attemptEpoch}
  `)

  if (input.educationRun) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE assessment_run_executions
      SET status = 'COMPLETED', completed_at = ${now}, updated_at = ${now}
      WHERE id = ${input.educationRun.executionId} AND status <> 'COMPLETED'
    `)
    await tx.$executeRaw(Prisma.sql`
      UPDATE relational_assessment_assignments
      SET status = 'COMPLETED', completed_at = ${now}, updated_at = ${now}
      WHERE id = ${input.educationRun.assignmentId} AND status <> 'COMPLETED'
    `)
  }

  await clearCompositeCheckpoint(tx, attempt.id)

  return {
    status: 'COMPLETED',
    attemptId: attempt.id,
    attemptEpoch: attempt.attemptEpoch,
    submissionId: submit.submissionId,
    payloadHash,
    aggregateHash,
    factsHash: encodedFacts.hash,
    rawHash: encodedRaw.hash,
    completedAt: completedAtIso,
    replayed: false,
    receiptOnly: attempt.receiptOnly,
    feedbackAvailable: Boolean(feedbackCipher),
  }
}
