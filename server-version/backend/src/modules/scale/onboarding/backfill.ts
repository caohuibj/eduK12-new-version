import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { withSerializableScaleTransaction } from '../deployment/transactions'
import {
  activateScaleDeploymentRevision,
  readActiveScaleDeployment,
  rollbackScaleDeploymentActivation,
} from '../deployment/repository'
import { getScaleInstrumentSource } from './instrument-registry'
import { planScaleInstrumentInstall } from './install'
import { scaleDeploymentPolicyV1Schema } from '../policy/deployment'
import { hashScaleDefinition } from '../scale-definition'

const entrySchema = z.object({
  instrumentKey: z.string().min(1),
  instrumentVersion: z.string().min(1),
  deploymentPolicy: scaleDeploymentPolicyV1Schema,
}).strict()

export const scaleOnboardingBackfillPlanSchema = z.object({
  schemaVersion: z.literal(1),
  actorUserId: z.string().min(1),
  entries: z.array(entrySchema).min(1),
}).strict().superRefine((plan, ctx) => {
  const seen = new Set<string>()
  plan.entries.forEach((entry, index) => {
    const key = `${entry.instrumentKey}@${entry.instrumentVersion}`
    if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries', index], message: `duplicate identity ${key}` })
    seen.add(key)
  })
})
export type ScaleOnboardingBackfillPlan = z.infer<typeof scaleOnboardingBackfillPlanSchema>

const checkpointEntrySchema = z.object({
  instrumentKey: z.string(),
  instrumentVersion: z.string(),
  scaleId: z.string(),
  appliedRevision: z.number().int().positive(),
  deploymentPolicyHash: z.string().regex(/^[0-9a-f]{64}$/),
  previousActiveRevision: z.number().int().positive().nullable(),
  status: z.enum(['PREPARED', 'APPLIED', 'NOOP', 'ROLLED_BACK']),
}).strict()
export const scaleOnboardingBackfillCheckpointSchema = z.object({
  schemaVersion: z.literal(1),
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
  entries: z.array(checkpointEntrySchema),
}).strict()
export type ScaleOnboardingBackfillCheckpoint = z.infer<typeof scaleOnboardingBackfillCheckpointSchema>

export const auditScaleOnboardingState = async (db: PrismaClient) => {
  const rows = await db.scale.findMany({
    where: { instrumentClass: 'STANDARD' },
    select: { id: true, code: true, instrumentVersion: true, status: true, visibility: true, definitionHash: true },
    orderBy: { code: 'asc' },
  })
  const entries = []
  for (const row of rows) {
    const source = getScaleInstrumentSource(row.code, row.instrumentVersion)
    const active = await readActiveScaleDeployment(db, row.id)
    const blockers: string[] = []
    if (!source) blockers.push('SOURCE_MISSING')
    else if (!source.executable) blockers.push('SOURCE_NOT_EXECUTABLE')
    else if (row.definitionHash !== hashScaleDefinition(source.executable.definition)) blockers.push('DEFINITION_HASH_MISMATCH')
    if (!active) blockers.push('DEPLOYMENT_BINDING_MISSING')
    entries.push({
      scaleId: row.id,
      instrumentKey: row.code,
      instrumentVersion: row.instrumentVersion,
      lifecycle: { status: row.status, visibility: row.visibility },
      sourceFound: Boolean(source),
      activeDeployment: active ? { revision: active.revision, policyHash: active.policyHash } : null,
      blockers,
    })
  }
  return { schemaVersion: 1 as const, entries, blockerCount: entries.reduce((sum, entry) => sum + entry.blockers.length, 0) }
}

export const planScaleOnboardingBackfill = async (db: PrismaClient, value: unknown) => {
  const plan = scaleOnboardingBackfillPlanSchema.parse(value)
  const entries = []
  for (const entry of plan.entries) {
    try {
      const preview = await planScaleInstrumentInstall(db, { ...entry, actorUserId: plan.actorUserId })
      const blockers = [...preview.blockers]
      if (preview.createScale || !preview.scaleId) blockers.push('BACKFILL_REQUIRES_EXISTING_SCALE')
      if (preview.referenceCreates.length > 0) blockers.push(`BACKFILL_REQUIRES_EXISTING_REFERENCES:${preview.referenceCreates.join(',')}`)
      entries.push({ ...entry, preview, blockers: [...new Set(blockers)].sort(), allowApply: blockers.length === 0 })
    } catch (error) {
      entries.push({ ...entry, preview: null, blockers: [error instanceof Error ? error.message : 'BACKFILL_PREVIEW_FAILED'], allowApply: false })
    }
  }
  return {
    schemaVersion: 1 as const,
    planHash: canonicalHash(plan),
    actorUserId: plan.actorUserId,
    entries,
    allowApply: entries.every(entry => entry.allowApply),
  }
}

export const applyScaleOnboardingBackfill = async (input: {
  db: PrismaClient
  plan: unknown
  checkpoint?: unknown
  onCheckpoint?: (checkpoint: ScaleOnboardingBackfillCheckpoint) => Promise<void> | void
}): Promise<ScaleOnboardingBackfillCheckpoint> => {
  const parsed = scaleOnboardingBackfillPlanSchema.parse(input.plan)
  const planHash = canonicalHash(parsed)
  let checkpoint: ScaleOnboardingBackfillCheckpoint = input.checkpoint
    ? scaleOnboardingBackfillCheckpointSchema.parse(input.checkpoint)
    : { schemaVersion: 1, planHash, entries: [] }
  if (checkpoint.planHash !== planHash) throw new Error('Scale onboarding checkpoint does not match plan hash')

  for (const entry of parsed.entries) {
    const identity = `${entry.instrumentKey}@${entry.instrumentVersion}`
    const priorCheckpoint = checkpoint.entries.find(row => row.instrumentKey === entry.instrumentKey && row.instrumentVersion === entry.instrumentVersion)
    if (priorCheckpoint && priorCheckpoint.status !== 'ROLLED_BACK') {
      const scale = await input.db.scale.findUnique({ where: { code: entry.instrumentKey } })
      const active = scale ? await readActiveScaleDeployment(input.db, scale.id) : null
      if (!scale || scale.id !== priorCheckpoint.scaleId || scale.instrumentVersion !== entry.instrumentVersion
        || priorCheckpoint.appliedRevision !== entry.deploymentPolicy.revision
        || priorCheckpoint.deploymentPolicyHash !== canonicalHash(entry.deploymentPolicy)) {
        throw new Error(`Backfill checkpoint no longer matches deployment for ${identity}`)
      }
      const applied = active?.revision === priorCheckpoint.appliedRevision && active.policyHash === priorCheckpoint.deploymentPolicyHash
      if (applied) {
        // A crash after commit but before the final checkpoint must retain rollback ownership.
        if (priorCheckpoint.status === 'PREPARED') {
          checkpoint = { ...checkpoint, entries: checkpoint.entries.map(row => row === priorCheckpoint ? { ...row, status: 'APPLIED' as const } : row) }
          await input.onCheckpoint?.(checkpoint)
        }
        continue
      }
      if (priorCheckpoint.status !== 'PREPARED' || (active?.revision ?? null) !== priorCheckpoint.previousActiveRevision) {
        throw new Error(`Backfill checkpoint no longer matches deployment for ${identity}`)
      }
    }

    const preview = await planScaleOnboardingBackfill(input.db, { schemaVersion: 1, actorUserId: parsed.actorUserId, entries: [entry] })
    const row = preview.entries[0]
    if (!row?.allowApply || !row.preview?.scaleId) throw new Error(`Backfill blocked for ${identity}: ${row?.blockers.join(',') || 'UNKNOWN'}`)

    const applied = await withSerializableScaleTransaction(input.db, async tx => {
      const livePreview = await planScaleInstrumentInstall(tx, { ...entry, actorUserId: parsed.actorUserId })
      if (!livePreview.allowActivation || livePreview.createScale || !livePreview.scaleId || livePreview.referenceCreates.length) {
        throw new Error(`Backfill changed during apply for ${identity}`)
      }
      const previous = await readActiveScaleDeployment(tx, livePreview.scaleId)
      if (previous && previous.revision === entry.deploymentPolicy.revision && previous.policyHash === livePreview.deploymentPolicyHash) {
        return {
          scaleId: livePreview.scaleId,
          previousActiveRevision: previous.revision,
          status: 'NOOP' as const,
          policyHash: livePreview.deploymentPolicyHash,
        }
      }
      // Journal the previous revision before the transaction can commit. A failed
      // journal write aborts the transaction; a crash afterwards can be reconciled.
      checkpoint = {
        ...checkpoint,
        entries: [...checkpoint.entries.filter(row => !(row.instrumentKey === entry.instrumentKey && row.instrumentVersion === entry.instrumentVersion)), {
          instrumentKey: entry.instrumentKey, instrumentVersion: entry.instrumentVersion,
          scaleId: livePreview.scaleId, appliedRevision: entry.deploymentPolicy.revision,
          deploymentPolicyHash: livePreview.deploymentPolicyHash,
          previousActiveRevision: previous?.revision ?? null, status: 'PREPARED',
        }],
      }
      await input.onCheckpoint?.(checkpoint)
      await activateScaleDeploymentRevision({
        db: tx,
        id: randomUUID(),
        scaleId: livePreview.scaleId,
        policy: entry.deploymentPolicy,
        createdByUserId: parsed.actorUserId,
      })
      return {
        scaleId: livePreview.scaleId,
        previousActiveRevision: previous?.revision ?? null,
        status: 'APPLIED' as const,
        policyHash: livePreview.deploymentPolicyHash,
      }
    })

    const nextEntry = {
      instrumentKey: entry.instrumentKey,
      instrumentVersion: entry.instrumentVersion,
      scaleId: applied.scaleId,
      appliedRevision: entry.deploymentPolicy.revision,
      deploymentPolicyHash: applied.policyHash,
      previousActiveRevision: applied.status === 'NOOP' ? null : applied.previousActiveRevision,
      status: applied.status,
    }
    checkpoint = {
      ...checkpoint,
      entries: [...checkpoint.entries.filter(row => !(row.instrumentKey === entry.instrumentKey && row.instrumentVersion === entry.instrumentVersion)), nextEntry],
    }
    await input.onCheckpoint?.(checkpoint)
  }
  return checkpoint
}

export const rollbackScaleOnboardingBackfill = async (input: {
  db: PrismaClient
  checkpoint: unknown
  onCheckpoint?: (checkpoint: ScaleOnboardingBackfillCheckpoint) => Promise<void> | void
}): Promise<ScaleOnboardingBackfillCheckpoint> => {
  let checkpoint = scaleOnboardingBackfillCheckpointSchema.parse(input.checkpoint)
  for (const entry of [...checkpoint.entries].reverse()) {
    if (entry.status !== 'APPLIED' && entry.status !== 'PREPARED') continue
    await withSerializableScaleTransaction(input.db, tx => rollbackScaleDeploymentActivation({
      db: tx,
      scaleId: entry.scaleId,
      appliedRevision: entry.appliedRevision,
      expectedPolicyHash: entry.deploymentPolicyHash,
      previousRevision: entry.previousActiveRevision,
    }))
    checkpoint = {
      ...checkpoint,
      entries: checkpoint.entries.map(row => row.instrumentKey === entry.instrumentKey && row.instrumentVersion === entry.instrumentVersion
        ? { ...row, status: 'ROLLED_BACK' as const }
        : row),
    }
    await input.onCheckpoint?.(checkpoint)
  }
  return checkpoint
}
