import type { Request } from 'express'
import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashRecoveryToken, isValidRecoveryToken } from '../../services/anonymousAccess'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { BoundedArtifactCache } from '../assessment-runtime/bounded-artifact-cache'
import {
  buildCompositePublicationPlan,
  loadCompositePublicationPlan,
  saveCompositePublicationPlan,
  type CompositePublicationPlanV1,
  type CompositePublicationSlotV1,
  type CompositeSlotMediaManifest,
  type CompositeSlotVideoEntry,
} from '../assessment-runtime/composite-publication-plan'
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
import {
  resolveSituationalReleases,
  situationalReleaseKey,
} from '../situational/situational-release.service'
import { prepareUnifiedCognitiveSessionConfigSnapshot } from '../cognitive/session.service'
import { decryptCognitivePayload } from '../cognitive/cognitive.security'
import { hashResolvedConfig } from '../cognitive/profile-freeze'
import type { CognitiveProfile } from '../cognitive/v2/types'
import type { AuthorizedWholeV2Attempt } from './whole-v2.routes'

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

/** Materializes and persists (content-addressed in assessment_public_templates)
 * the complete frozen CompositePublicationPlanV1 for a published composite assessment. */
export async function materializeCompositePublicationPlan(
  compositeId: string,
  db: Db = prisma,
): Promise<CompositePublicationPlanV1> {
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
              instrumentVersion: true,
              instrumentClass: true,
              standardSourceKind: true,
              standardToolKey: true,
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
  const isRootDb = db === prisma
  if (isRootDb) {
    const cached = planByCompositeCache.get(cacheKey)
    if (cached) return cached
  }

  // Preload declared scale reference sets in 1 query
  const scaleRefRequests: Array<{ instrumentKey: string; referenceVersions: string[] }> = []
  const parsedScaleDefs = new Map<string, ReturnType<typeof scaleDefinitionSchema.parse>>()
  for (const item of composite.items) {
    if (item.type !== 'SCALE' || !item.scale?.definition) continue
    const def = scaleDefinitionSchema.parse(item.scale.definition)
    parsedScaleDefs.set(item.id, def)
    if (def.referencePolicy.type === 'declared') {
      const instrumentKey = scaleRuntimeInstrumentKey(item.scale) ?? item.scale.code
      const versions = [...new Set(def.referencePolicy.selections.map(s => s.referenceVersion))]
      scaleRefRequests.push({ instrumentKey, referenceVersions: versions })
    }
  }
  const refSetsByInstrument = await loadScaleReferenceSetsForDefinitions(db, scaleRefRequests)

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
      const media = collectMediaFromUnknown(def.items, `SCALE:${compiledRuntime.compiledRuntimeHash}`)
      slots.push({
        slotKey: compositeItemSlotKey(item.id, 'SCALE'),
        unitType: 'SCALE',
        itemId: item.id,
        scaleId: item.scale.id,
        instrumentKey,
        instrumentVersion: item.scale.instrumentVersion,
        name: item.scale.name,
        title: item.scale.name,
        required: item.required,
        position: item.position,
        definitionHash,
        instruction: item.scale.instruction ?? null,
        definition: def,
        compiledRuntime,
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
  await saveCompositePublicationPlan(plan)
  if (isRootDb) {
    planByCompositeCache.set(cacheKey, plan, 256 * 1024)
  }
  return plan
}

export async function resolveCompositePublicationPlanForAttempt(
  attempt: { compositeAssessmentId: string; publicationHash?: string | null },
  db: Db = prisma,
): Promise<CompositePublicationPlanV1> {
  if (attempt.publicationHash) {
    return loadCompositePublicationPlan(attempt.publicationHash)
  }
  return materializeCompositePublicationPlan(attempt.compositeAssessmentId, db)
}

interface LoadedAttemptRow {
  id: string
  compositeAssessmentId: string
  userId: string | null
  recoveryTokenHash: string | null
  attemptEpoch: number
  status: string
  receiptOnly: boolean
  startedAt: Date
  publicationHash: string | null
  unitSeedsEncrypted: string | null
  deliveryCourseId: string | null
}

async function loadAttemptRow(attemptId: string): Promise<LoadedAttemptRow> {
  const attempt = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      compositeAssessmentId: true,
      userId: true,
      recoveryTokenHash: true,
      attemptEpoch: true,
      status: true,
      receiptOnly: true,
      startedAt: true,
      publicationHash: true,
      unitSeedsEncrypted: true,
      deliveryCourseId: true,
    },
  })
  if (!attempt) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
  }
  return attempt
}

async function loadEducationRunBinding(
  attemptId: string,
): Promise<{ executionId: string; assignmentId: string; organizationId: string } | undefined> {
  const rows = await prisma.$queryRaw<Array<{
    executionId: string
    assignmentId: string
    organizationId: string
  }>>(Prisma.sql`
    SELECT id AS "executionId",
           relational_assignment_id AS "assignmentId",
           organization_id AS "organizationId"
    FROM assessment_run_executions
    WHERE runtime_binding_kind = 'COMPOSITE'
      AND runtime_binding_ref = ${attemptId}
    LIMIT 1
  `)
  return rows[0]
}

export async function authorizeTrainingAuthenticatedWholeV2(req: Request): Promise<AuthorizedWholeV2Attempt> {
  const attempt = await loadAttemptRow(req.params.attemptId)
  if (!req.user?.userId || attempt.userId !== req.user.userId) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权访问此综合测评', 403)
  }
  const plan = await resolveCompositePublicationPlanForAttempt(attempt)
  return {
    attempt: {
      id: attempt.id,
      compositeAssessmentId: attempt.compositeAssessmentId,
      attemptEpoch: attempt.attemptEpoch,
      receiptOnly: attempt.receiptOnly,
      startedAt: attempt.startedAt,
      publicationHash: attempt.publicationHash ?? plan.publicationHash,
      unitSeedsEncrypted: attempt.unitSeedsEncrypted,
      deliveryCourseId: attempt.deliveryCourseId,
    },
    plan,
    audience: 'authenticated',
  }
}

export async function authorizeTrainingPublicWholeV2(req: Request): Promise<AuthorizedWholeV2Attempt> {
  const rawToken = req.headers['x-recovery-token']
  if (!isValidRecoveryToken(rawToken)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '缺少有效的匿名恢复凭证', 403)
  }
  const recoveryTokenHash = hashRecoveryToken(rawToken)
  const attempt = await loadAttemptRow(req.params.attemptId)
  if (attempt.userId !== null || !attempt.recoveryTokenHash || attempt.recoveryTokenHash !== recoveryTokenHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权访问此综合测评', 403)
  }
  const plan = await resolveCompositePublicationPlanForAttempt(attempt)
  return {
    attempt: {
      id: attempt.id,
      compositeAssessmentId: attempt.compositeAssessmentId,
      attemptEpoch: attempt.attemptEpoch,
      receiptOnly: attempt.receiptOnly,
      startedAt: attempt.startedAt,
      publicationHash: attempt.publicationHash ?? plan.publicationHash,
      unitSeedsEncrypted: attempt.unitSeedsEncrypted,
      deliveryCourseId: attempt.deliveryCourseId,
    },
    plan,
    audience: 'public',
  }
}

export async function authorizeEducationWholeV2(req: Request): Promise<AuthorizedWholeV2Attempt> {
  // Entry middleware (campusWholeAccess / wholeBound) has already verified School / Teacher authority.
  const attempt = await loadAttemptRow(req.params.attemptId)
  const [plan, runBinding] = await Promise.all([
    resolveCompositePublicationPlanForAttempt(attempt),
    loadEducationRunBinding(attempt.id),
  ])
  return {
    attempt: {
      id: attempt.id,
      compositeAssessmentId: attempt.compositeAssessmentId,
      attemptEpoch: attempt.attemptEpoch,
      receiptOnly: attempt.receiptOnly,
      startedAt: attempt.startedAt,
      publicationHash: attempt.publicationHash ?? plan.publicationHash,
      unitSeedsEncrypted: attempt.unitSeedsEncrypted,
      deliveryCourseId: attempt.deliveryCourseId,
      organizationId: runBinding?.organizationId ?? null,
    },
    plan,
    audience: 'authenticated',
    ...(runBinding
      ? {
          educationRun: {
            executionId: runBinding.executionId,
            assignmentId: runBinding.assignmentId,
          },
        }
      : {}),
  }
}
