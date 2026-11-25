import type { Request } from 'express'
import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashRecoveryToken, isValidRecoveryToken } from '../../services/anonymousAccess'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { BoundedArtifactCache } from '../assessment-runtime/bounded-artifact-cache'
import {
  buildCompositePublicationPlan,
  cacheCommittedCompositePublicationPlan,
  loadCompositePublicationPlan,
  saveCompositePublicationPlan,
  type CompositePublicationPlanV1,
  type CompositePublicationScaleSlot,
  type CompositePublicationSlotV1,
  type CompositeSlotMediaManifest,
  type CompositeSlotVideoEntry,
} from '../assessment-runtime/composite-publication-plan'
import type { CompositeWholeFinalFeedbackContext } from '../assessment-runtime/composite-final.writer'
import { canonicalHash } from '../assessment-runtime/canonical'
import { compileScaleRuntime } from '../assessment-runtime/compiler'
import {
  compositeFormSectionDefinitionHash,
  mapCompositeSection,
} from '../assessment-runtime/form-section-definition'
import { compositeItemSlotKey, formSectionSlotKey } from '../assessment-runtime/slot-set'
import {
  assessmentStaticImageAssetIdentitySchema,
  type AssessmentStaticImageAssetIdentityV1,
} from '../assessment-media/assessment-image'
import {
  assessmentVideoPresentationSchema,
} from '../assessment-media/assessment-video'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
} from '../assessment-media/assessment-asset'
import {
  validateReferenceSetDefinition,
  type AssessmentReferenceSetDefinition,
} from '../assessment-reference/reference'
import {
  hashScaleDefinition,
  scaleDefinitionSchema,
} from '../scale/scale-definition'
import { scaleRuntimeInstrumentKey } from '../scale/runtime-identity'
import { resolveScaleStartDeployment } from '../scale/deployment/service'
import { computeTrainingReferenceBinding, trainingBoundContent } from './training-reference-binding'
import { prepareTrainingFinalReceipt } from './training-content-final'
import {
  isCompactTrainingContentBindingRef,
  resolveTrainingContentBindingParent,
} from './training-content-binding'
import {
  readFrozenCompositionIdentity,
  type FrozenCompositionIdentity,
} from '../assessment-run/educationCompositionExecution'
import type { RunResourcePolicy } from '../assessment-run/resourceAuthority'
import type { ResultDisclosureContractV1 } from '../assessment-policy/result-disclosure'
import { projectEducationDeclaredUnitReports } from '../reporting/education-assessment-report.projector'
import {
  projectSingleNativeEducationScaleUnit,
  type NativeEducationFeedbackSource,
} from '../reporting/education-native-scale-feedback'
import {
  resolveSituationalReleases,
  situationalReleaseKey,
} from '../situational/situational-release.service'
import { prepareUnifiedCognitiveSessionConfigSnapshot } from '../cognitive/session.service'
import { decryptCognitivePayload } from '../cognitive/cognitive.security'
import { hashResolvedConfig, readFrozenReport } from '../cognitive/profile-freeze'
import { getCognitiveV2TaskDefinition } from '../cognitive/v2/registry'
import type { CognitiveProfile } from '../cognitive/v2/types'
import {
  onCommittedStartTransaction,
  publicTemplates,
  publicTemplatesForDatabase,
} from '../assessment-runtime/public-templates'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { createRelationalRuntimeConsentAuthority } from '../assessment-relational/runtime-consent'
import { createSqlRelationalAssignmentRepository } from '../assessment-relational/repository'
import { assertPrivateFormFinalCurrent } from '../assessment-run/educationPrivateFormExecution'
import { currentFieldComposition } from '../huiteacher/fieldComposition.authority'
import {
  readTrainingPersistenceSnapshot,
  trainingCheckpointExpiry,
  type TrainingPersistenceSnapshot,
} from './training-persistence.policy'
import type { AuthorizedWholeV2Attempt, WholeV2PersistencePolicyView } from './whole-v2.routes'

type Db = PrismaClient | Prisma.TransactionClient

const planByCompositeCache = new BoundedArtifactCache<CompositePublicationPlanV1>(128, 32 * 1024 * 1024)

export function resetWholeV2PlanCacheForTests(): void {
  planByCompositeCache.clear()
}

function collectMediaFromUnknown(
  root: unknown,
  retentionEntityId: string,
): CompositeSlotMediaManifest {
  const imageAssets: Record<string, AssessmentStaticImageAssetIdentityV1> = {}
  const videoPresentations: Record<string, CompositeSlotVideoEntry> = {}
  const visited = new Set<unknown>()

  const walk = (node: unknown, pathKey: string) => {
    if (!node || typeof node !== 'object' || visited.has(node)) return
    visited.add(node)
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathKey}[${idx}]`))
      return
    }
    const record = node as Record<string, unknown>
    if (typeof record.assetId === 'string' && typeof record.contentHash === 'string' && typeof record.mimeType === 'string') {
      const parsedImg = assessmentStaticImageAssetIdentitySchema.safeParse(record)
      if (parsedImg.success) {
        imageAssets[parsedImg.data.assetId] = parsedImg.data
      }
    }
    if (record.video && typeof record.video === 'object') {
      const parsedVid = assessmentVideoPresentationSchema.safeParse(record)
      if (parsedVid.success) {
        videoPresentations[pathKey || parsedVid.data.video.assetId] = {
          presentation: parsedVid.data,
          retentionOwner: {
            entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
            entityId: retentionEntityId,
            field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
          },
        }
        if (parsedVid.data.poster) {
          imageAssets[parsedVid.data.poster.assetId] = parsedVid.data.poster
        }
        return
      }
    }
    for (const [k, v] of Object.entries(record)) {
      if (v && typeof v === 'object') {
        walk(v, pathKey ? `${pathKey}.${k}` : k)
      }
    }
  }

  walk(root, '')
  return {
    ...(Object.keys(imageAssets).length > 0 ? { imageAssets } : {}),
    ...(Object.keys(videoPresentations).length > 0 ? { videoPresentations } : {}),
  }
}

async function loadScaleReferenceSetsForDefinitions(
  db: Db,
  requests: Array<{ instrumentKey: string; referenceVersions: string[] }>,
): Promise<Map<string, AssessmentReferenceSetDefinition[]>> {
  const result = new Map<string, AssessmentReferenceSetDefinition[]>()
  const orClauses: Prisma.AssessmentReferenceSetWhereInput[] = []
  for (const req of requests) {
    if (req.referenceVersions.length > 0) {
      orClauses.push({
        instrumentType: 'SCALE',
        instrumentKey: req.instrumentKey,
        referenceVersion: { in: req.referenceVersions },
        status: 'ACTIVE',
      })
    }
  }
  if (!orClauses.length) return result
  const rows = await db.assessmentReferenceSet.findMany({ where: { OR: orClauses } })
  for (const row of rows) {
    const validation = validateReferenceSetDefinition({
      ...(row.definition && typeof row.definition === 'object' ? row.definition : {}),
      schemaVersion: 1,
      instrumentType: 'scale',
      instrumentKey: row.instrumentKey,
      referenceVersion: row.referenceVersion,
      status: row.status,
    })
    if (validation.definition && !validation.issues.some(issue => issue.severity === 'error')) {
      const list = result.get(row.instrumentKey) ?? []
      list.push(validation.definition)
      result.set(row.instrumentKey, list)
    }
  }
  return result
}

async function loadCognitiveReferenceSetsForDefinitions(
  db: Db,
  requests: Array<{ testType: string; referenceVersions: string[] }>,
): Promise<Map<string, AssessmentReferenceSetDefinition[]>> {
  const result = new Map<string, AssessmentReferenceSetDefinition[]>()
  const byType = new Map<string, Set<string>>()
  for (const req of requests) {
    if (!req.referenceVersions.length) continue
    const set = byType.get(req.testType) ?? new Set<string>()
    for (const v of req.referenceVersions) set.add(v)
    byType.set(req.testType, set)
  }
  const orClauses: Prisma.AssessmentReferenceSetWhereInput[] = []
  for (const [testType, versions] of byType.entries()) {
    orClauses.push({
      instrumentType: 'COGNITIVE',
      instrumentKey: testType,
      referenceVersion: { in: [...versions] },
      status: 'ACTIVE',
    })
  }
  if (!orClauses.length) return result
  const rows = await db.assessmentReferenceSet.findMany({ where: { OR: orClauses } })
  for (const row of rows) {
    const validation = validateReferenceSetDefinition({
      ...(row.definition && typeof row.definition === 'object' ? row.definition : {}),
      schemaVersion: 1,
      instrumentType: 'cognitive',
      instrumentKey: row.instrumentKey,
      referenceVersion: row.referenceVersion,
      status: row.status,
    })
    if (validation.definition && !validation.issues.some(issue => issue.severity === 'error')) {
      const list = result.get(row.instrumentKey) ?? []
      list.push(validation.definition)
      result.set(row.instrumentKey, list)
    }
  }
  return result
}

async function verifyCachedScaleDeployments(
  plan: CompositePublicationPlanV1,
  db: Db,
): Promise<boolean> {
  for (const slot of plan.slots) {
    if (slot.unitType !== 'SCALE' || slot.instrumentClass !== 'STANDARD') continue
    const deploymentResolution = await resolveScaleStartDeployment({
      db: db as any,
      scale: {
        id: slot.scaleId,
        code: slot.scaleCode ?? slot.instrumentKey,
        instrumentVersion: slot.instrumentVersion,
        instrumentClass: 'STANDARD',
        status: 'PUBLISHED',
      },
    })
    if (!deploymentResolution.allowNewStarts) {
      throw new InstrumentFinalSubmitError(
        'INSTRUMENT_NOT_AVAILABLE',
        `量表部署策略不允许新开始：${deploymentResolution.reasons.join(',') || 'UNKNOWN'}`,
        409,
      )
    }
    const livePolicyHash = deploymentResolution.kind === 'MANAGED_V2'
      ? deploymentResolution.runtimePolicy.runtimePolicyHash
      : undefined
    if (livePolicyHash !== slot.runtimePolicyHash) {
      return false
    }
  }
  return true
}

/** Materializes and persists (content-addressed in assessment_public_templates)
 * the complete frozen CompositePublicationPlanV1 for a published composite assessment. */
export async function materializeCompositePublicationPlan(
  compositeId: string,
  db: Db = prisma,
  knownHeader?: { id: string; publishedAt: Date | null; updatedAt: Date },
): Promise<CompositePublicationPlanV1> {
  const knownCacheKey = knownHeader && knownHeader.id === compositeId
    ? `${knownHeader.id}:${knownHeader.publishedAt?.toISOString() ?? knownHeader.updatedAt.toISOString()}`
    : null
  if (knownCacheKey && (db === prisma || knownHeader!.publishedAt != null)) {
    const cached = planByCompositeCache.get(knownCacheKey)
    if (cached) {
      if (await verifyCachedScaleDeployments(cached, db)) {
        return cached
      }
      planByCompositeCache.delete(knownCacheKey)
    }
  }

  const composite = await db.compositeAssessment.findUnique({
    where: { id: compositeId },
    select: {
      id: true,
      name: true,
      description: true,
      updatedAt: true,
      publishedAt: true,
      trainingFlowFrozen: true,
      trainingFlowDraft: true,
      items: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          type: true,
          position: true,
          required: true,
          scaleId: true,
          cognitiveAssignmentId: true,
          situationalInstrumentKey: true,
          situationalInstrumentVersion: true,
          scale: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              instrumentVersion: true,
              instrumentClass: true,
              standardSourceKind: true,
              standardToolKey: true,
              libraryEntryId: true,
              measurementReleaseId: true,
              definition: true,
              definitionHash: true,
              instruction: true,
            },
          },
          cognitiveAssignment: {
            select: {
              id: true,
              title: true,
              profile: true,
              resolvedConfigSnapshotEncrypted: true,
              resolvedConfigHash: true,
              resolvedReportSnapshotEncrypted: true,
              config: {
                select: {
                  testType: true,
                  configVersion: true,
                  engineVersion: true,
                  scoringVersion: true,
                  config: true,
                },
              },
            },
          },
        },
      },
      formSections: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          position: true,
          contextSection: true,
          items: {
            orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }],
            select: {
              id: true,
              formType: true,
              formLabel: true,
              formPlaceholder: true,
              formOptions: true,
              formDefinition: true,
              formPolicy: true,
              contextKey: true,
              required: true,
              position: true,
              formSectionPosition: true,
            },
          },
        },
      },
    },
  })
  if (!composite) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '组合测评不存在', 404)
  }

  const cacheKey = `${composite.id}:${composite.publishedAt?.toISOString() ?? composite.updatedAt.toISOString()}`
  // Published composite plans are immutable by (compositeId, publishedAt, updatedAt), so
  // START transactions (where db is a Prisma.TransactionClient) safely share the read cache,
  // while still verifying live STANDARD Scale deployment policies before returning a cached plan.
  const canUsePlanCache = db === prisma || composite.publishedAt != null
  if (canUsePlanCache) {
    const cached = planByCompositeCache.get(cacheKey)
    if (cached) {
      if (await verifyCachedScaleDeployments(cached, db)) {
        return cached
      }
      planByCompositeCache.delete(cacheKey)
    }
  }

  // Preload declared scale & cognitive reference sets in 1 batched query each
  const scaleRefRequests: Array<{ instrumentKey: string; referenceVersions: string[] }> = []
  const cogRefRequests: Array<{ testType: string; referenceVersions: string[] }> = []
  const parsedScaleDefs = new Map<string, ReturnType<typeof scaleDefinitionSchema.parse>>()
  for (const item of composite.items) {
    if (item.type === 'SCALE' && item.scale?.definition) {
      const def = scaleDefinitionSchema.parse(item.scale.definition)
      parsedScaleDefs.set(item.id, def)
      if (def.referencePolicy.type === 'declared') {
        const instrumentKey = scaleRuntimeInstrumentKey(item.scale) ?? item.scale.code
        const versions = [...new Set(def.referencePolicy.selections.map(s => s.referenceVersion))]
        scaleRefRequests.push({ instrumentKey, referenceVersions: versions })
      }
    } else if (item.type === 'COGNITIVE' && item.cognitiveAssignment?.config) {
      const cfg = item.cognitiveAssignment.config
      const cogTaskDef = getCognitiveV2TaskDefinition(cfg.testType, cfg.engineVersion, cfg.scoringVersion)
      if (cogTaskDef && cogTaskDef.references.length > 0) {
        cogRefRequests.push({
          testType: cfg.testType,
          referenceVersions: [...new Set(cogTaskDef.references.map(r => r.referenceVersion))],
        })
      }
    }
  }
  const [refSetsByInstrument, cogRefSetsByTestType] = await Promise.all([
    loadScaleReferenceSetsForDefinitions(db, scaleRefRequests),
    loadCognitiveReferenceSetsForDefinitions(db, cogRefRequests),
  ])

  // Preload SJT releases in 1 batch
  const sjtIdentities = composite.items
    .filter(item => item.type === 'SITUATIONAL' && item.situationalInstrumentKey && item.situationalInstrumentVersion)
    .map(item => ({
      instrumentKey: item.situationalInstrumentKey!,
      instrumentVersion: item.situationalInstrumentVersion!,
    }))
  const sjtReleases = sjtIdentities.length > 0
    ? await resolveSituationalReleases(sjtIdentities, db as Prisma.TransactionClient, false)
    : new Map()

  const slots: CompositePublicationSlotV1[] = []

  for (const section of composite.formSections) {
    const mapped = mapCompositeSection(section)
    const definitionHash = compositeFormSectionDefinitionHash(mapped)
    const slotKey = formSectionSlotKey(section.id)
    const media = collectMediaFromUnknown(mapped, `FORM_SECTION:${definitionHash}`)
    slots.push({
      slotKey,
      unitType: 'FORM_SECTION',
      sectionId: section.id,
      title: section.title,
      description: section.description ?? null,
      required: mapped.items.some(item => item.required),
      position: section.position,
      contextSection: mapped.contextSection,
      definitionHash,
      section: mapped,
      ...media,
    })
  }

  for (const item of composite.items) {
    if (item.type === 'FORM') continue
    if (item.type === 'SCALE') {
      if (!item.scale) {
        throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', `量表槽位缺少量表定义：${item.id}`, 409)
      }
      const def = parsedScaleDefs.get(item.id)
      if (!def) {
        throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', `量表缺少规范定义：${item.scale.code}`, 409)
      }
      const instrumentKey = scaleRuntimeInstrumentKey(item.scale) ?? item.scale.code
      const definitionHash = item.scale.definitionHash ?? hashScaleDefinition(def)
      const compiledRuntime = compileScaleRuntime({
        instrumentKey,
        instrumentVersion: item.scale.instrumentVersion,
        definition: def,
        sourceDefinitionHash: definitionHash,
      })
      let compiledPolicy: import('../scale/policy/compile').CompiledScalePolicyV1 | undefined
      let runtimePolicyHash: string | undefined
      if (item.scale.instrumentClass === 'STANDARD') {
        const deploymentResolution = await resolveScaleStartDeployment({
          db: db as any,
          scale: {
            id: item.scale.id,
            code: item.scale.code,
            instrumentVersion: item.scale.instrumentVersion,
            instrumentClass: item.scale.instrumentClass,
            status: item.scale.status,
          },
        })
        if (!deploymentResolution.allowNewStarts) {
          throw new InstrumentFinalSubmitError(
            'INSTRUMENT_NOT_AVAILABLE',
            `量表部署策略不允许新开始：${deploymentResolution.reasons.join(',') || 'UNKNOWN'}`,
            409,
          )
        }
        if (deploymentResolution.kind === 'MANAGED_V2') {
          compiledPolicy = deploymentResolution.runtimePolicy
          runtimePolicyHash = deploymentResolution.runtimePolicy.runtimePolicyHash
        }
      }
      const media = collectMediaFromUnknown(def.items, `SCALE:${compiledRuntime.compiledRuntimeHash}`)
      slots.push({
        slotKey: compositeItemSlotKey(item.id, 'SCALE'),
        unitType: 'SCALE',
        itemId: item.id,
        scaleId: item.scale.id,
        scaleCode: item.scale.code,
        instrumentKey,
        instrumentVersion: item.scale.instrumentVersion,
        instrumentClass: item.scale.instrumentClass,
        name: item.scale.name,
        title: item.scale.name,
        required: item.required,
        position: item.position,
        definitionHash,
        instruction: item.scale.instruction ?? null,
        definition: def,
        compiledRuntime,
        ...(compiledPolicy ? { compiledPolicy, runtimePolicyHash } : {}),
        referenceSets: refSetsByInstrument.get(instrumentKey) ?? [],
        referencePolicy: def.referencePolicy,
        ...media,
      })
      continue
    }

    if (item.type === 'SITUATIONAL') {
      if (!item.situationalInstrumentKey || !item.situationalInstrumentVersion) {
        throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', `情境题槽位缺少版本标识：${item.id}`, 409)
      }
      const key = situationalReleaseKey({
        instrumentKey: item.situationalInstrumentKey,
        instrumentVersion: item.situationalInstrumentVersion,
      })
      const resolved = sjtReleases.get(key)
      if (!resolved) {
        throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', `情境题发布包不可用：${key}`, 409)
      }
      const media = collectMediaFromUnknown(
        resolved.situationPackage.definition.scenes,
        `SITUATIONAL:${resolved.runtime.compiledRuntimeHash}`,
      )
      // Also index SJT scene video presentations directly by sceneKey so frontend
      // SituationalRunnerClient.loadVideoSources(attemptId, sceneKey) hits O(1).
      const sceneVideos: Record<string, CompositeSlotVideoEntry> = {
        ...(media.videoPresentations ?? {}),
      }
      for (const scene of resolved.situationPackage.definition.scenes) {
        const stimulus = scene.stimulus as Record<string, unknown> | undefined
        if (stimulus?.video && typeof stimulus.video === 'object') {
          const parsedVid = assessmentVideoPresentationSchema.safeParse(stimulus.video)
          if (parsedVid.success) {
            sceneVideos[scene.sceneKey] = {
              presentation: parsedVid.data,
              retentionOwner: {
                entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
                entityId: `SITUATIONAL:${resolved.runtime.compiledRuntimeHash}`,
                field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
              },
            }
          }
        }
      }
      if (Object.keys(sceneVideos).length > 0) {
        media.videoPresentations = sceneVideos
      }
      slots.push({
        slotKey: compositeItemSlotKey(item.id, 'SITUATIONAL'),
        unitType: 'SITUATIONAL',
        itemId: item.id,
        instrumentKey: item.situationalInstrumentKey,
        instrumentVersion: item.situationalInstrumentVersion,
        title: resolved.situationPackage.definition.source.title || item.situationalInstrumentKey,
        required: item.required,
        position: item.position,
        definitionHash: resolved.definitionHash,
        definition: resolved.situationPackage.definition,
        compiledRuntime: resolved.runtime,
        ...media,
      })
      continue
    }

    if (item.type === 'COGNITIVE') {
      const assignment = item.cognitiveAssignment
      if (!assignment?.config) {
        throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', `认知测验槽位缺少任务配置：${item.id}`, 409)
      }
      const resolvedConfig = assignment.resolvedConfigSnapshotEncrypted
        ? decryptCognitivePayload<unknown>(assignment.resolvedConfigSnapshotEncrypted)
        : assignment.config.config
      const prepared = await prepareUnifiedCognitiveSessionConfigSnapshot({
        testType: assignment.config.testType,
        configVersion: assignment.config.configVersion,
        engineVersion: assignment.config.engineVersion,
        scoringVersion: assignment.config.scoringVersion,
        config: resolvedConfig,
        db: db as any,
      })
      const resolvedConfigHash = assignment.resolvedConfigHash ?? hashResolvedConfig(resolvedConfig)
      const profile = (assignment.profile === 'experience' || assignment.profile === 'research'
        ? assignment.profile
        : 'standard') as CognitiveProfile
      const frozenReport = assignment.resolvedReportSnapshotEncrypted
        ? readFrozenReport(assignment.resolvedReportSnapshotEncrypted)
        : null
      const cogTaskDef = getCognitiveV2TaskDefinition(
        assignment.config.testType,
        assignment.config.engineVersion,
        assignment.config.scoringVersion,
      )
      const neededCogVersions = cogTaskDef && cogTaskDef.references.length > 0
        ? new Set(cogTaskDef.references.map(r => r.referenceVersion))
        : null
      const cogReferenceSets = neededCogVersions
        ? (cogRefSetsByTestType.get(assignment.config.testType) ?? []).filter(
            ref => neededCogVersions.has(ref.referenceVersion),
          )
        : []
      const media = collectMediaFromUnknown(
        prepared.snapshot.presentation,
        `COGNITIVE:${prepared.compiledRuntime.compiledRuntimeHash}`,
      )
      slots.push({
        slotKey: compositeItemSlotKey(item.id, 'COGNITIVE'),
        unitType: 'COGNITIVE',
        itemId: item.id,
        testType: assignment.config.testType,
        title: assignment.title,
        required: item.required,
        position: item.position,
        definitionHash: prepared.snapshot.configHash,
        resolvedConfigHash,
        profile,
        sessionSnapshot: prepared.snapshot,
        compiledRuntime: prepared.compiledRuntime,
        ...(frozenReport ? { frozenReport } : {}),
        ...(cogReferenceSets.length > 0 ? { referenceSets: cogReferenceSets } : {}),
        ...media,
      })
    }
  }

  const plan = buildCompositePublicationPlan({
    compositeId: composite.id,
    title: composite.name,
    description: composite.description ?? null,
    slots,
    flowDefinition: composite.trainingFlowFrozen ?? composite.trainingFlowDraft ?? null,
  })
  const alreadyCommitted = Boolean(publicTemplates.get(plan.publicationHash))
  await saveCompositePublicationPlan(plan, publicTemplatesForDatabase(db))
  if (db === prisma || alreadyCommitted) {
    // Already durable in DB (committed root store or previously committed template).
    cacheCommittedCompositePublicationPlan(plan)
    if (canUsePlanCache) {
      planByCompositeCache.set(cacheKey, plan, 256 * 1024)
    }
  } else {
    // Inside a START transaction: NEVER populate process-global caches before commit
    // so a rolled-back START can never leave a dangling publicationHash in memory.
    onCommittedStartTransaction(db, () => {
      cacheCommittedCompositePublicationPlan(plan)
      if (canUsePlanCache) {
        planByCompositeCache.set(cacheKey, plan, 256 * 1024)
      }
    })
  }
  return plan
}

export async function resolveCompositePublicationPlanForAttempt(
  attempt: { compositeAssessmentId: string; publicationHash?: string | null },
  _db: Db = prisma,
): Promise<CompositePublicationPlanV1> {
  // Strict WHOLE_V2 boundary: never materialize an ad-hoc publication plan for a legacy attempt.
  if (!attempt.publicationHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '该作答不属于统一整卷 V2 模式，请使用原入口继续作答', 409)
  }
  return loadCompositePublicationPlan(attempt.publicationHash)
}

interface LoadedAttemptRow {
  id: string
  compositeAssessmentId: string
  userId: string | null
  subjectUserId: string | null
  respondentUserId?: string | null
  recoveryTokenHash: string | null
  attemptEpoch: number
  status: string
  receiptOnly: boolean
  startedAt: Date
  publicationHash: string | null
  unitSeedsEncrypted: string | null
  deliveryCourseId: string | null
  assignmentRef: string | null
  consentId: string | null
  contextSnapshotEncrypted: string | null
  contextSnapshotHash: string | null
  trainingContentBinding: unknown
  trainingContentBindingHash: string | null
  trainingReferenceBinding: unknown
  trainingReferenceBindingHash: string | null
  trainingTimingSnapshot: unknown
  trainingPersistenceSnapshot: unknown
  trainingPersistenceSnapshotHash: string | null
  trainingVariantAllocationEncrypted: string | null
  trainingVariantAllocationHash: string | null
  compositeAssessment: {
    creationKey: string | null
    productKind: string
    expiresAt: Date | null
    createdBy: string | null
  } | null
  accessToken: {
    trainingRound: {
      closesAt: Date | null
    } | null
  } | null
}

async function resolveTimingAndPersistence(attempt: LoadedAttemptRow): Promise<{
  timingEnabled: boolean
  persistencePolicy: WholeV2PersistencePolicyView
  checkpointExpiresAt?: (now: Date) => Date
}> {
  // Strictly honor the attempt's frozen snapshots; never fall back to mutable
  // composite-level draft/timing policies (P1-02).
  const timingEnabled = attempt.trainingTimingSnapshot != null
  let snapshot: TrainingPersistenceSnapshot | null = null
  try {
    snapshot = readTrainingPersistenceSnapshot(attempt)
  } catch {
    // Corrupted or mismatched snapshot fails closed to persistence disabled.
    snapshot = null
  }
  let checkpointExpiresAt: ((now: Date) => Date) | undefined
  if (snapshot?.policy.checkpoint) {
    const course = snapshot.courseId
      ? await prisma.course.findUnique({ where: { id: snapshot.courseId }, select: { endedAt: true } })
      : null
    const cutoffs = [
      course?.endedAt ?? null,
      attempt.compositeAssessment?.expiresAt ?? null,
      attempt.accessToken?.trainingRound?.closesAt ?? null,
    ]
    const frozenSnapshot = snapshot
    checkpointExpiresAt = (now: Date) => trainingCheckpointExpiry(frozenSnapshot, now, cutoffs)
  }
  return {
    timingEnabled,
    persistencePolicy: {
      draftCheckpointEnabled: Boolean(snapshot?.policy.checkpoint?.enabled),
      draftTtlHours: snapshot?.policy.checkpoint?.ttlHours ?? null,
      localCognitiveEnabled: Boolean(snapshot?.policy.localCognitive?.enabled),
      localCognitiveTtlHours: snapshot?.policy.localCognitive?.ttlHours ?? null,
    },
    ...(checkpointExpiresAt ? { checkpointExpiresAt } : {}),
  }
}

function assertRelationalConsentInTx(
  tx: unknown,
  attempt: Pick<LoadedAttemptRow, 'id' | 'userId' | 'assignmentRef' | 'consentId'>,
  actorUserId: string,
): Promise<void> {
  if (!attempt.assignmentRef) return Promise.resolve()
  const authority = createRelationalRuntimeConsentAuthority({
    db: tx as any,
    assignments: createSqlRelationalAssignmentRepository(tx as any),
  })
  return authority.assertCompositeFinal(attempt.id, actorUserId, {
    id: attempt.id,
    userId: attempt.userId,
    assignmentRef: attempt.assignmentRef,
    consentId: attempt.consentId,
  })
}

export function resolveVariantActiveSlotKeys(
  attempt: Pick<LoadedAttemptRow, 'trainingVariantAllocationEncrypted' | 'trainingVariantAllocationHash'>,
  plan: CompositePublicationPlanV1,
): ReadonlySet<string> | undefined {
  if (!attempt.trainingVariantAllocationEncrypted && !attempt.trainingVariantAllocationHash) {
    return undefined
  }
  if (!attempt.trainingVariantAllocationEncrypted || !attempt.trainingVariantAllocationHash) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '概率分卷冻结分配信息不完整', 409)
  }
  const allocation = decryptUnifiedRuntimePayload<{
    allocationHash?: string
    selectedItemIds?: string[]
    selectedSectionIds?: string[]
  }>(attempt.trainingVariantAllocationEncrypted)
  if (!allocation || allocation.allocationHash !== attempt.trainingVariantAllocationHash) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '概率分卷冻结分配校验失败', 409)
  }
  const itemIds = new Set(allocation.selectedItemIds ?? [])
  const sectionIds = new Set(allocation.selectedSectionIds ?? [])
  const active = new Set<string>()
  for (const slot of plan.slots) {
    if (slot.unitType === 'FORM_SECTION') {
      if (sectionIds.has(slot.sectionId)) active.add(slot.slotKey)
    } else if (itemIds.has(slot.itemId)) {
      active.add(slot.slotKey)
    }
  }
  return active
}

/** Bind all attempt authority fields consumed during preparation. */
function finalFrozenState(attempt: LoadedAttemptRow) {
  return {
    trainingContentBindingHash: attempt.trainingContentBindingHash,
    trainingReferenceBindingHash: attempt.trainingReferenceBindingHash,
    contextSnapshotHash: attempt.contextSnapshotHash,
    trainingPersistenceSnapshotHash: attempt.trainingPersistenceSnapshotHash,
    trainingVariantAllocationHash: attempt.trainingVariantAllocationHash,
    unitSeedsEncrypted: attempt.unitSeedsEncrypted,
    assignmentRef: attempt.assignmentRef,
    consentId: attempt.consentId,
    respondentUserId: attempt.respondentUserId ?? null,
    recoveryTokenHash: attempt.recoveryTokenHash,
  }
}

function buildFinalizeGovernanceInTx(
  attempt: LoadedAttemptRow,
): AuthorizedWholeV2Attempt['finalizeGovernanceInTx'] {
  if (attempt.trainingContentBinding == null && attempt.trainingContentBindingHash == null) {
    return undefined
  }
  return async (tx, info) => {
    const prismaTx = tx as Prisma.TransactionClient
    const effectiveContextEncrypted = info.contextSnapshotEncrypted ?? attempt.contextSnapshotEncrypted
    const effectiveContextHash = info.contextHash ?? attempt.contextSnapshotHash
    const refParent = {
      id: attempt.id,
      attemptEpoch: attempt.attemptEpoch,
      compositeAssessmentId: attempt.compositeAssessmentId,
      trainingContentBinding: attempt.trainingContentBinding,
      trainingContentBindingHash: attempt.trainingContentBindingHash,
      trainingReferenceBinding: attempt.trainingReferenceBinding,
      trainingReferenceBindingHash: attempt.trainingReferenceBindingHash,
      contextSnapshotEncrypted: effectiveContextEncrypted,
      contextSnapshotHash: effectiveContextHash,
      compositeAssessment: {
        createdBy: attempt.compositeAssessment?.createdBy ?? null,
      },
    }
    const frozenRef = attempt.trainingReferenceBindingHash
      ? { binding: attempt.trainingReferenceBinding, hash: attempt.trainingReferenceBindingHash }
      : await computeTrainingReferenceBinding(
          prismaTx,
          refParent,
          info.contextObj && info.contextHash ? { context: info.contextObj, hash: info.contextHash } : undefined,
        )
    const ownerId = attempt.compositeAssessment?.createdBy
    if (!ownerId) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '受控测评缺少作者归属信息，无法签发最终解释回执', 409)
    }
    const prepared = await prepareTrainingFinalReceipt(prismaTx, {
      parent: {
        ...refParent,
        trainingReferenceBinding: frozenRef?.binding ?? null,
        trainingReferenceBindingHash: frozenRef?.hash ?? null,
        compositeAssessment: {
          id: attempt.compositeAssessmentId,
          createdBy: ownerId,
        },
      },
      aggregateInputHash: info.aggregateHash,
      completedAt: info.completedAt,
      verifiedPayloads: info.verifiedPayloads,
    })
    return {
      ...(frozenRef && !attempt.trainingReferenceBindingHash
        ? {
            trainingReferenceBinding: frozenRef.binding,
            trainingReferenceBindingHash: frozenRef.hash,
          }
        : {}),
      ...(prepared
        ? {
            trainingContentInterpretationEncrypted: prepared.encrypted,
            trainingContentInterpretationHash: prepared.hash,
            receipt: prepared.receipt,
            referenceBinding: prepared.referenceBinding,
            releases: prepared.releases,
          }
        : {}),
    }
  }
}

function buildEducationWholeV2Feedback(input: {
  attempt: LoadedAttemptRow
  plan: CompositePublicationPlanV1
  identity: FrozenCompositionIdentity | undefined
  actorUserId: string
}): AuthorizedWholeV2Attempt['buildFeedback'] {
  const { attempt, plan, identity, actorUserId } = input
  if (!identity || attempt.receiptOnly) return undefined
  if (attempt.subjectUserId !== actorUserId) return undefined
  if (identity.origin.variantKey !== 'STUDENT:SELF' && identity.origin.variantKey !== 'TEACHER:SELF') return undefined

  for (const block of identity.manifest) {
    if (block.kind === 'COGNITIVE' || block.kind === 'SJT') {
      const ceiling = identity.binding.unitReports.find(unit => unit.blockId === block.blockId)
      if (!ceiling || ceiling.respondent.mode === 'INDIVIDUAL_SUMMARY') {
        return undefined
      }
    }
  }

  const scaleSlotByKey = new Map(
    plan.slots
      .filter((slot): slot is CompositePublicationScaleSlot => slot.unitType === 'SCALE')
      .map(slot => [slot.slotKey, slot]),
  )

  return (facts, context?: CompositeWholeFinalFeedbackContext) => {
    if (!context) return undefined
    const needsDeclared = identity.manifest.some(block => {
      if (block.kind !== 'SCALE' || block.sourceProvider !== 'STANDARD_SCALE') return false
      const ceiling = identity.binding.unitReports.find(unit => unit.blockId === block.blockId)
      return ceiling?.respondent.mode === 'INDIVIDUAL_SUMMARY'
    })
    let binding: ReturnType<typeof trainingBoundContent> = null
    let declaredFacts: Map<string, any> | undefined
    const receipt = context.governance?.receipt ?? null
    const releases = context.governance?.releases
    const referenceBinding = context.governance?.referenceBinding ?? null
    if (needsDeclared) {
      binding = trainingBoundContent({
        id: attempt.id,
        attemptEpoch: attempt.attemptEpoch,
        compositeAssessmentId: attempt.compositeAssessmentId,
        trainingContentBinding: attempt.trainingContentBinding,
        trainingContentBindingHash: attempt.trainingContentBindingHash,
        contextSnapshotHash: facts.contextHash,
      })
      if (!binding || !receipt || !releases || !binding.educationComposition || binding.publicationHash !== identity.binding.manifestHash
        || canonicalHash(binding.educationComposition.origin) !== canonicalHash(identity.origin)) {
        return undefined
      }
      declaredFacts = new Map()
    }
    const verifiedReleaseIds = new Set<string>()
    const units = identity.manifest.map(block => {
      const base = { blockId: block.blockId, kind: block.kind, title: block.title }
      if (block.kind === 'FORM') {
        return { ...base, state: 'COMPLETION_ONLY' as const }
      }
      const ceiling = identity.binding.unitReports.find(unit => unit.blockId === block.blockId)
      if (!ceiling || ceiling.versionId !== block.versionId || ceiling.contentHash !== block.contentHash) {
        return null
      }
      if (block.kind === 'COGNITIVE' || block.kind === 'SJT') {
        return { ...base, state: 'WITHHELD' as const }
      }
      if (block.itemIds.length !== 1 || ceiling.respondent.mode !== 'INDIVIDUAL_SUMMARY') {
        return { ...base, state: 'WITHHELD' as const }
      }
      if (block.sourceProvider === 'STANDARD_SCALE') {
        if (!binding || !receipt || !releases || !declaredFacts) return null
        const boundUnit = binding.units.find(u => u.itemId === block.itemIds[0])
        if (!boundUnit?.source.educationStandard
          || boundUnit.source.educationStandard.releaseId !== block.versionId
          || boundUnit.source.educationStandard.combinationHash !== block.contentHash) {
          return null
        }
        const slotKey = compositeItemSlotKey(boundUnit.itemId, 'SCALE')
        const envelope = context.envelopesBySlotKey.get(slotKey)
        if (!envelope || envelope.core.contextHash !== (facts.contextHash ?? null)) return null
        const requiredIds = [
          boundUnit.measurement.releaseId,
          ...(boundUnit.report ? [boundUnit.report.releaseId] : []),
          ...((referenceBinding?.units.find(u => u.itemId === boundUnit.itemId)?.references ?? [])
            .filter(ref => ref.status === 'SELECTED')
            .map(ref => ref.releaseId)),
        ]
        for (const releaseId of requiredIds) {
          if (!releases.has(releaseId)) return null
          verifiedReleaseIds.add(releaseId)
        }
        declaredFacts.set(boundUnit.itemId, envelope)
        const [projected] = projectEducationDeclaredUnitReports({
          product: identity.origin.entry,
          binding,
          receipt,
          references: referenceBinding,
          releases,
          facts: declaredFacts,
          metricKeys: new Set(ceiling.respondent.metricKeys),
          disclosureByItem: new Map([[boundUnit.itemId, boundUnit.source.educationStandard.respondentDisclosure]]),
          units: [{
            itemId: boundUnit.itemId,
            family: boundUnit.family,
            measurement: boundUnit.measurement,
            report: boundUnit.report ?? null,
            references: (boundUnit.referencePolicy?.choices ?? []).map(choice => ({
              releaseId: choice.releaseId,
              contentHash: choice.contentHash,
            })),
          }],
        })
        return projected?.status === 'READY' && projected.rendered
          ? {
              ...base,
              state: 'READY' as const,
              declaredReport: projected.rendered,
              ...(projected.message ? { message: projected.message } : {}),
            }
          : { ...base, state: 'WITHHELD' as const }
      }
      const identityUnit = identity.units.find(u => u.itemId === block.itemIds[0] && u.versionId === block.versionId)
      if (!identityUnit || identityUnit.family !== 'SCALE' || !identityUnit.scaleId) return null
      const slotKey = compositeItemSlotKey(identityUnit.itemId, 'SCALE')
      const slot = scaleSlotByKey.get(slotKey)
      const scaleResult = context.scaleResults.get(slotKey)
      const envelope = context.envelopesBySlotKey.get(slotKey)
      if (!slot || !scaleResult || !envelope) return null
      const none = { mode: 'NONE' as const, metricKeys: [], longitudinalMetricKeys: [] }
      const resultDisclosure: ResultDisclosureContractV1 = {
        schemaVersion: 1,
        policyKey: 'EDUCATION_PRIVATE_TOOL_V1',
        minimumRespondents: null,
        audiences: {
          RESPONDENT: ceiling.respondent,
          SUBJECT: none,
          TEACHER: none,
          PARENT: none,
          PROFESSIONAL: none,
          ORGANIZATION: none,
          RESEARCH: none,
        },
      }
      const source: NativeEducationFeedbackSource = {
        itemId: identityUnit.itemId,
        scaleId: identityUnit.scaleId,
        title: block.title,
        sourceDefinitionHash: identityUnit.definitionHash,
        resultDisclosure,
        ...(block.sourceProvider === 'LIBRARY_SCALE'
          ? { approvedLibrary: { approvedSnapshotHash: block.contentHash } }
          : { privateVersion: { versionId: block.versionId, contentHash: block.contentHash } }),
      }
      const projected = projectSingleNativeEducationScaleUnit({
        actorUserId,
        contextSnapshotHash: facts.contextHash ?? null,
        sourceAttemptId: attempt.id,
        completedAt: new Date(facts.completedAt),
        source,
        slot,
        scaleResult,
        canonicalEnvelope: envelope,
      })
      return projected.state === 'PROJECTED'
        ? { ...base, state: 'READY' as const, nativeScaleUnits: projected.unitReports }
        : { ...base, state: 'WITHHELD' as const }
    })
    if (units.some(u => u === null)) return undefined
    const nonNullUnits = units as NonNullable<(typeof units)[number]>[]
    return {
      schemaVersion: 1 as const,
      kind: 'EDUCATION_FEEDBACK' as const,
      mode: 'COMPOSITION' as const,
      state: nonNullUnits.some(unit => unit.state === 'READY') ? 'READY' as const : 'COMPLETION_ONLY' as const,
      title: identity.title,
      units: nonNullUnits,
      _v2Verify: {
        policyHash: identity.policyHash,
        manifestHash: identity.binding.manifestHash,
        releaseIds: [...verifiedReleaseIds],
      },
    }
  }
}

async function loadAttemptRow(attemptId: string): Promise<LoadedAttemptRow> {
  const attempt = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      compositeAssessmentId: true,
      userId: true,
      subjectUserId: true,
      recoveryTokenHash: true,
      attemptEpoch: true,
      status: true,
      receiptOnly: true,
      startedAt: true,
      publicationHash: true,
      unitSeedsEncrypted: true,
      deliveryCourseId: true,
      assignmentRef: true,
      consentId: true,
      contextSnapshotEncrypted: true,
      contextSnapshotHash: true,
      trainingContentBinding: true,
      trainingContentBindingHash: true,
      trainingReferenceBinding: true,
      trainingReferenceBindingHash: true,
      trainingTimingSnapshot: true,
      trainingPersistenceSnapshot: true,
      trainingPersistenceSnapshotHash: true,
      trainingVariantAllocationEncrypted: true,
      trainingVariantAllocationHash: true,
      compositeAssessment: {
        select: {
          creationKey: true,
          productKind: true,
          expiresAt: true,
          createdBy: true,
        },
      },
      accessToken: {
        select: {
          trainingRound: {
            select: {
              closesAt: true,
            },
          },
        },
      },
    },
  })
  if (!attempt) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
  }
  return attempt
}

async function loadEducationAttemptAndRunRow(attemptId: string, preloaded?: Record<string, unknown>): Promise<{
  attempt: LoadedAttemptRow
  educationRun?: {
    executionId: string
    assignmentId: string
    organizationId: string
    runId: string
    hasCampusActivity: boolean
    hasHuiteacherLink: boolean
    trackResourceKey: string | null
    trackResourceVersion: string | null
    trackPolicy: RunResourcePolicy | null
    trackPolicyHash: string | null
  }
}> {
  type Row = {
    id: string
    compositeAssessmentId: string
    userId: string | null
    subjectUserId: string | null
    respondentUserId: string | null
    recoveryTokenHash: string | null
    attemptEpoch: number
    status: string
    receiptOnly: boolean
    startedAt: Date
    publicationHash: string | null
    unitSeedsEncrypted: string | null
    deliveryCourseId: string | null
    assignmentRef: string | null
    consentId: string | null
    contextSnapshotEncrypted: string | null
    contextSnapshotHash: string | null
    trainingContentBinding: unknown
    trainingContentBindingHash: string | null
    trainingReferenceBinding: unknown
    trainingReferenceBindingHash: string | null
    trainingTimingSnapshot: unknown
    trainingPersistenceSnapshot: unknown
    trainingPersistenceSnapshotHash: string | null
    trainingVariantAllocationEncrypted: string | null
    trainingVariantAllocationHash: string | null
    creationKey: string | null
    productKind: string
    expiresAt: Date | null
    createdBy: string | null
    executionId: string | null
    assignmentId: string | null
    organizationId: string | null
    runId: string | null
    hasCampusActivity: boolean | null
    hasHuiteacherLink: boolean | null
    trackResourceKey: string | null
    trackResourceVersion: string | null
    trackPolicy: RunResourcePolicy | null
    trackPolicyHash: string | null
  }
  const rows = preloaded ? [preloaded as unknown as Row] : await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      p.id,
      p.composite_assessment_id AS "compositeAssessmentId",
      p.user_id AS "userId",
      p.subject_user_id AS "subjectUserId",
      p.respondent_user_id AS "respondentUserId",
      p.recovery_token_hash AS "recoveryTokenHash",
      p.attempt_epoch AS "attemptEpoch",
      p.status::text AS status,
      p.receipt_only AS "receiptOnly",
      p.started_at AS "startedAt",
      p.publication_hash AS "publicationHash",
      p.unit_seeds_encrypted AS "unitSeedsEncrypted",
      p.delivery_course_id AS "deliveryCourseId",
      p.assignment_ref AS "assignmentRef",
      p.consent_id AS "consentId",
      p.context_snapshot_encrypted AS "contextSnapshotEncrypted",
      p.context_snapshot_hash AS "contextSnapshotHash",
      p.training_content_binding AS "trainingContentBinding",
      p.training_content_binding_hash AS "trainingContentBindingHash",
      p.training_reference_binding AS "trainingReferenceBinding",
      p.training_reference_binding_hash AS "trainingReferenceBindingHash",
      p.training_timing_snapshot AS "trainingTimingSnapshot",
      p.training_persistence_snapshot AS "trainingPersistenceSnapshot",
      p.training_persistence_snapshot_hash AS "trainingPersistenceSnapshotHash",
      p.training_variant_allocation_encrypted AS "trainingVariantAllocationEncrypted",
      p.training_variant_allocation_hash AS "trainingVariantAllocationHash",
      ca.creation_key AS "creationKey",
      ca.product_kind::text AS "productKind",
      ca.expires_at AS "expiresAt",
      ca.created_by AS "createdBy",
      e.id AS "executionId",
      e.relational_assignment_id AS "assignmentId",
      e.organization_id AS "organizationId",
      e.run_id AS "runId",
      CASE WHEN e.id IS NOT NULL THEN EXISTS(SELECT 1 FROM campus_activity_runs ar WHERE ar.organization_id = e.organization_id AND ar.run_id = e.run_id) END AS "hasCampusActivity",
      CASE WHEN e.id IS NOT NULL THEN EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links l WHERE l.organization_id = e.organization_id AND l.run_id = e.run_id) END AS "hasHuiteacherLink",
      t.resource_key AS "trackResourceKey",
      t.resource_version AS "trackResourceVersion",
      t.frozen_resource_policy AS "trackPolicy",
      t.resource_policy_hash AS "trackPolicyHash"
    FROM composite_assessment_attempts p
    JOIN composite_assessments ca ON ca.id = p.composite_assessment_id
    LEFT JOIN assessment_run_executions e
      ON e.runtime_binding_kind = 'COMPOSITE'
     AND e.runtime_binding_ref = p.id
    LEFT JOIN assessment_run_tracks t
      ON t.id = e.track_id
     AND t.organization_id = e.organization_id
     AND t.run_id = e.run_id
    WHERE p.id = ${attemptId}
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
  }
  const attempt: LoadedAttemptRow = {
    id: row.id,
    compositeAssessmentId: row.compositeAssessmentId,
    userId: row.userId,
    subjectUserId: row.subjectUserId,
    respondentUserId: row.respondentUserId,
    recoveryTokenHash: row.recoveryTokenHash,
    attemptEpoch: row.attemptEpoch,
    status: row.status,
    receiptOnly: row.receiptOnly,
    startedAt: new Date(row.startedAt),
    publicationHash: row.publicationHash,
    unitSeedsEncrypted: row.unitSeedsEncrypted,
    deliveryCourseId: row.deliveryCourseId,
    assignmentRef: row.assignmentRef,
    consentId: row.consentId,
    contextSnapshotEncrypted: row.contextSnapshotEncrypted,
    contextSnapshotHash: row.contextSnapshotHash,
    trainingContentBinding: row.trainingContentBinding,
    trainingContentBindingHash: row.trainingContentBindingHash,
    trainingReferenceBinding: row.trainingReferenceBinding,
    trainingReferenceBindingHash: row.trainingReferenceBindingHash,
    trainingTimingSnapshot: row.trainingTimingSnapshot,
    trainingPersistenceSnapshot: row.trainingPersistenceSnapshot,
    trainingPersistenceSnapshotHash: row.trainingPersistenceSnapshotHash,
    trainingVariantAllocationEncrypted: row.trainingVariantAllocationEncrypted,
    trainingVariantAllocationHash: row.trainingVariantAllocationHash,
    compositeAssessment: {
      creationKey: row.creationKey,
      productKind: row.productKind,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
      createdBy: row.createdBy,
    },
    accessToken: null,
  }
  return {
    attempt,
    ...(row.executionId && row.assignmentId && row.organizationId && row.runId
      ? {
          educationRun: {
            executionId: row.executionId,
            assignmentId: row.assignmentId,
            organizationId: row.organizationId,
            runId: row.runId,
            hasCampusActivity: Boolean(row.hasCampusActivity),
            hasHuiteacherLink: Boolean(row.hasHuiteacherLink),
            trackResourceKey: row.trackResourceKey,
            trackResourceVersion: row.trackResourceVersion,
            trackPolicy: row.trackPolicy,
            trackPolicyHash: row.trackPolicyHash,
          },
        }
      : {}),
  }
}

export async function authorizeTrainingAuthenticatedWholeV2(req: Request): Promise<AuthorizedWholeV2Attempt> {
  let attempt = await loadAttemptRow(req.params.attemptId)
  const actorUserId = req.user?.userId
  if (!actorUserId || attempt.userId !== actorUserId) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权访问此综合测评', 403)
  }
  if (isCompactTrainingContentBindingRef(attempt.trainingContentBinding)) {
    attempt = await resolveTrainingContentBindingParent(prisma, attempt)
  }
  const plan = await resolveCompositePublicationPlanForAttempt(attempt)
  const activeSlotKeys = resolveVariantActiveSlotKeys(attempt, plan)
  const { timingEnabled, persistencePolicy, checkpointExpiresAt } = await resolveTimingAndPersistence(attempt)
  const finalizeGovernanceInTx = buildFinalizeGovernanceInTx(attempt)
  return {
    attempt: {
      id: attempt.id,
      userId: attempt.userId,
      compositeAssessmentId: attempt.compositeAssessmentId,
      subjectUserId: attempt.subjectUserId,
      attemptEpoch: attempt.attemptEpoch,
      status: attempt.status,
      receiptOnly: attempt.receiptOnly,
      startedAt: attempt.startedAt,
      publicationHash: attempt.publicationHash!,
      frozenState: finalFrozenState(attempt),
      unitSeedsEncrypted: attempt.unitSeedsEncrypted,
      trainingTimingSnapshot: attempt.trainingTimingSnapshot ?? null,
      deliveryCourseId: attempt.deliveryCourseId,
    },
    plan,
    audience: 'authenticated',
    timingEnabled,
    persistencePolicy,
    ...(checkpointExpiresAt ? { checkpointExpiresAt } : {}),
    ...(activeSlotKeys ? { activeSlotKeys } : {}),
    ...(attempt.assignmentRef
      ? {
          verifyAuthorityInTx: tx => assertRelationalConsentInTx(tx, attempt, actorUserId),
        }
      : {}),
    ...(finalizeGovernanceInTx ? { finalizeGovernanceInTx } : {}),
  }
}

export async function authorizeTrainingPublicWholeV2(req: Request): Promise<AuthorizedWholeV2Attempt> {
  const rawToken = req.headers['x-recovery-token']
  if (!isValidRecoveryToken(rawToken)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '缺少有效的匿名恢复凭证', 403)
  }
  const recoveryTokenHash = hashRecoveryToken(rawToken)
  let attempt = await loadAttemptRow(req.params.attemptId)
  if (attempt.userId !== null || !attempt.recoveryTokenHash || attempt.recoveryTokenHash !== recoveryTokenHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权访问此综合测评', 403)
  }
  if (isCompactTrainingContentBindingRef(attempt.trainingContentBinding)) {
    attempt = await resolveTrainingContentBindingParent(prisma, attempt)
  }
  const plan = await resolveCompositePublicationPlanForAttempt(attempt)
  const activeSlotKeys = resolveVariantActiveSlotKeys(attempt, plan)
  const { timingEnabled, persistencePolicy, checkpointExpiresAt } = await resolveTimingAndPersistence(attempt)
  const finalizeGovernanceInTx = buildFinalizeGovernanceInTx(attempt)
  return {
    attempt: {
      id: attempt.id,
      userId: attempt.userId,
      compositeAssessmentId: attempt.compositeAssessmentId,
      subjectUserId: attempt.subjectUserId,
      attemptEpoch: attempt.attemptEpoch,
      status: attempt.status,
      receiptOnly: attempt.receiptOnly,
      startedAt: attempt.startedAt,
      publicationHash: attempt.publicationHash!,
      frozenState: finalFrozenState(attempt),
      unitSeedsEncrypted: attempt.unitSeedsEncrypted,
      trainingTimingSnapshot: attempt.trainingTimingSnapshot ?? null,
      deliveryCourseId: attempt.deliveryCourseId,
    },
    plan,
    audience: 'public',
    timingEnabled,
    persistencePolicy,
    ...(checkpointExpiresAt ? { checkpointExpiresAt } : {}),
    ...(activeSlotKeys ? { activeSlotKeys } : {}),
    verifyAuthorityInTx: async tx => {
      const rows = await (tx as Prisma.TransactionClient).$queryRaw<Array<{
        userId: string | null
        recoveryTokenHash: string | null
      }>>(Prisma.sql`
        SELECT user_id AS "userId", recovery_token_hash AS "recoveryTokenHash"
        FROM composite_assessment_attempts
        WHERE id = ${attempt.id}
        LIMIT 1
      `)
      const current = rows[0]
      if (!current || current.userId !== null || current.recoveryTokenHash !== recoveryTokenHash) {
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权访问此综合测评', 403)
      }
    },
    ...(finalizeGovernanceInTx ? { finalizeGovernanceInTx } : {}),
  }
}

export async function authorizeEducationWholeV2(req: Request, res?: import('express').Response): Promise<AuthorizedWholeV2Attempt> {
  // Entry middleware (campusWholeAccess / wholeBound / requireScaleAttempt / requireAttempt)
  // has verified School / Teacher entry access; verifyAuthorityInTx re-checks live
  // revocation/emergency-stop/consent fences atomically inside the FINAL transaction.
  const actorUserId = req.user?.userId
  if (!actorUserId) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '教育端作答需要已登录账号', 403)
  }
  const proof = res?.locals?.ordinarySelfWhole
  const raw = proof?.kind === 'bound' && proof.id === req.params.attemptId && proof.userId === actorUserId
    ? proof.wholeV2Authorization as Record<string, unknown> | undefined : undefined
  const preloaded = raw && raw.id === proof.id && raw.userId === actorUserId
    && raw.attemptEpoch === proof.epoch && raw.status === proof.parentStatus
    && typeof raw.publicationHash === 'string' && typeof raw.startedAt === 'string' ? raw : undefined
  const loaded = await loadEducationAttemptAndRunRow(req.params.attemptId, preloaded)
  let attempt = loaded.attempt
  if (attempt.userId !== actorUserId) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权访问此教育测评记录', 403)
  }
  const runBinding = loaded.educationRun
  const creationKey = attempt.compositeAssessment?.creationKey ?? ''
  const isComposition = creationKey.startsWith('education-composition:')
    && !creationKey.endsWith(':TEACHER:EXPERT_REPORT:2.0.0')
  const isBoundCompositionOrPrivateForm = creationKey.startsWith('education-composition:')
    || creationKey.startsWith('private-form:')
  if (isCompactTrainingContentBindingRef(attempt.trainingContentBinding)) {
    attempt = await resolveTrainingContentBindingParent(prisma, attempt)
  }
  const [plan, governance, compositionIdentity] = await Promise.all([
    resolveCompositePublicationPlanForAttempt(attempt),
    resolveTimingAndPersistence(attempt),
    isComposition && runBinding?.trackPolicy && runBinding.trackPolicyHash
      && runBinding.trackResourceKey && runBinding.trackResourceVersion
      ? readFrozenCompositionIdentity(prisma, {
          organizationId: runBinding.organizationId,
          key: runBinding.trackResourceKey,
          version: runBinding.trackResourceVersion,
          policy: runBinding.trackPolicy,
          policyHash: runBinding.trackPolicyHash,
        })
      : Promise.resolve(undefined),
  ])
  const { timingEnabled, persistencePolicy, checkpointExpiresAt } = governance
  const finalizeGovernanceInTx = buildFinalizeGovernanceInTx(attempt)
  const buildFeedback = buildEducationWholeV2Feedback({
    attempt,
    plan,
    identity: compositionIdentity,
    actorUserId,
  })
  return {
    attempt: {
      id: attempt.id,
      userId: attempt.userId,
      compositeAssessmentId: attempt.compositeAssessmentId,
      subjectUserId: attempt.subjectUserId,
      attemptEpoch: attempt.attemptEpoch,
      status: attempt.status,
      receiptOnly: attempt.receiptOnly,
      startedAt: attempt.startedAt,
      publicationHash: attempt.publicationHash!,
      frozenState: finalFrozenState(attempt),
      unitSeedsEncrypted: attempt.unitSeedsEncrypted,
      trainingTimingSnapshot: attempt.trainingTimingSnapshot ?? null,
      deliveryCourseId: attempt.deliveryCourseId,
      organizationId: runBinding?.organizationId ?? null,
    },
    plan,
    audience: 'authenticated',
    timingEnabled,
    persistencePolicy,
    ...(checkpointExpiresAt ? { checkpointExpiresAt } : {}),
    ...(runBinding
      ? {
          educationRun: {
            executionId: runBinding.executionId,
            assignmentId: runBinding.assignmentId,
          },
        }
      : {}),
    verifyAuthorityInTx: async tx => {
      if (isBoundCompositionOrPrivateForm) {
        await assertPrivateFormFinalCurrent(tx as Prisma.TransactionClient, {
          attemptId: attempt.id,
          actorUserId,
          knownParent: {
            id: attempt.id,
            userId: attempt.userId,
            subjectUserId: attempt.subjectUserId,
            respondentUserId: attempt.respondentUserId ?? null,
            assignmentRef: attempt.assignmentRef,
            consentId: attempt.consentId,
            compositeAssessmentId: attempt.compositeAssessmentId,
            compositeAssessment: { creationKey: attempt.compositeAssessment?.creationKey ?? null },
          },
          ...(runBinding
            ? {
                knownExecution: {
                  executionId: runBinding.executionId,
                  organizationId: runBinding.organizationId,
                  runId: runBinding.runId,
                  hasCampusActivity: runBinding.hasCampusActivity,
                  hasHuiteacherLink: runBinding.hasHuiteacherLink,
                },
              }
            : {}),
          ...(compositionIdentity ? { knownCompositionIdentity: compositionIdentity } : {}),
        })
      } else if (attempt.assignmentRef) {
        await assertRelationalConsentInTx(tx, attempt, actorUserId)
      }
    },
    ...(finalizeGovernanceInTx ? { finalizeGovernanceInTx } : {}),
    ...(buildFeedback ? { buildFeedback } : {}),
  }
}

export async function authorizeFieldCompositionWholeV2(req: Request): Promise<AuthorizedWholeV2Attempt> {
  const actorUserId = req.user?.userId
  if (!actorUserId) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '现场观察需要本人教育账号', 403)
  }
  let attempt = await loadAttemptRow(req.params.attemptId)
  if (isCompactTrainingContentBindingRef(attempt.trainingContentBinding)) {
    attempt = await resolveTrainingContentBindingParent(prisma, attempt)
  }
  const [fieldCtx, plan] = await Promise.all([
    currentFieldComposition(prisma, { attemptId: attempt.id, actorUserId }),
    resolveCompositePublicationPlanForAttempt(attempt),
  ])
  const finalizeGovernanceInTx = buildFinalizeGovernanceInTx(attempt)
  return {
    attempt: {
      id: attempt.id,
      userId: attempt.userId,
      compositeAssessmentId: attempt.compositeAssessmentId,
      subjectUserId: attempt.subjectUserId,
      attemptEpoch: attempt.attemptEpoch,
      status: attempt.status,
      receiptOnly: true,
      startedAt: attempt.startedAt,
      publicationHash: attempt.publicationHash!,
      frozenState: finalFrozenState(attempt),
      unitSeedsEncrypted: attempt.unitSeedsEncrypted,
      trainingTimingSnapshot: null,
      deliveryCourseId: attempt.deliveryCourseId,
      organizationId: fieldCtx.scope.organizationId,
    },
    plan,
    audience: 'authenticated',
    timingEnabled: false,
    persistencePolicy: {
      draftCheckpointEnabled: false,
      draftTtlHours: null,
      localCognitiveEnabled: false,
      localCognitiveTtlHours: null,
    },
    verifyAuthorityInTx: async tx => {
      await currentFieldComposition(tx as Prisma.TransactionClient, {
        attemptId: attempt.id,
        actorUserId,
        lock: true,
      })
    },
    ...(finalizeGovernanceInTx ? { finalizeGovernanceInTx } : {}),
  }
}
