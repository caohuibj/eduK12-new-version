import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { UserRole, type ExportArtifact } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../config/database'
import { validateStorageKey, type ExportActor } from './exportArtifactService'
import { EXPORT_RETENTION_HOURS, EXPORT_MAX_RECORDS } from './exportStorage'
import { trainingAnalysisProvenanceSchema, assertTrainingAnalysisExportIdentity } from '../modules/training-analysis/export'

export const provenanceSchema = z.object({
  version: z.literal(1),
  generation: z.string().uuid(),
  creatorRole: z.enum(['ADMIN', 'TEACHER']),
  audience: z.literal('teacher'),
  detail: z.enum(['summary', 'full', 'research']),
  dateRange: z.object({ start: z.string().optional(), end: z.string().optional() }).strict(),
  projectionFingerprint: z.string().min(1),
  attemptIds: z.array(z.string().min(1)).max(EXPORT_MAX_RECORDS),
}).strict()

type ResourceType = 'COGNITIVE' | 'COMPOSITE'
export async function registerAssessmentExport(input: {
  resourceType: ResourceType; resourceId: string; actor: ExportActor;
  anonymized: boolean; filePath: string; format: string;
  detail: 'summary' | 'full' | 'research'; dateRange?: { start?: string; end?: string };
  projectionFingerprint: string; attemptIds?: string[];
}) {
  const storageKey = path.basename(input.filePath)
  const filePath = validateStorageKey(storageKey)
  if (path.resolve(input.filePath) !== filePath || path.extname(filePath) !== `.${input.format}`) {
    throw new Error('Invalid export file identity')
  }
  const provenance = provenanceSchema.parse({
    version: 1, generation: randomUUID(), creatorRole: input.actor.role,
    audience: 'teacher', detail: input.detail, dateRange: input.dateRange ?? {},
    projectionFingerprint: input.projectionFingerprint,
    attemptIds: [...new Set(input.attemptIds ?? [])],
  })
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) throw new Error('Invalid export file')
    return await prisma.exportArtifact.create({ data: {
      resourceType: input.resourceType, resourceId: input.resourceId,
      createdBy: input.actor.userId, anonymized: input.anonymized,
      storageKey, format: input.format, status: 'READY', provenance,
      expiresAt: new Date(Date.now() + EXPORT_RETENTION_HOURS * 3600_000),
    } })
  } catch (error) {
    await fs.unlink(filePath).catch(() => undefined)
    throw error
  }
}

/** Filenames locate registered metadata; they never confer authority. Unbound
 * pre-migration exports fail closed. The caller must also perform its existing
 * live assignment/Composite authority check before invoking this resolver. */
type ResolveAssessmentExportInput = {
  resourceType: ResourceType | 'TRAINING_ANALYSIS'; resourceId: string; actor: ExportActor;
  fileName: string; projectionFingerprint?: string; metadataOnly?: boolean;
}
export async function resolveAssessmentExport(input: ResolveAssessmentExportInput): Promise<string | null> {
  if (path.basename(input.fileName) !== input.fileName) return null
  const artifact = await prisma.exportArtifact.findFirst({ where: {
    resourceType: input.resourceType, resourceId: input.resourceId, storageKey: input.fileName,
  } })
  return validateAssessmentExport(input, artifact)
}

/** The HTTP id and its response metadata now refer to the same verified row. */
export async function resolveAssessmentExportById(input: Omit<ResolveAssessmentExportInput, 'fileName'> & {artifactId:string}) {
  const artifact = await prisma.exportArtifact.findUnique({where:{id:input.artifactId}})
  if (!artifact) return null
  const filePath = await validateAssessmentExport({...input,fileName:artifact.storageKey}, artifact)
  return filePath ? {artifact,filePath} : null
}

async function validateAssessmentExport(input: ResolveAssessmentExportInput, artifact: ExportArtifact | null): Promise<string | null> {
  if (path.basename(input.fileName) !== input.fileName) return null
  if (!artifact || (!input.metadataOnly && artifact.status !== 'READY')
    || !Number.isFinite(artifact.expiresAt.getTime()) || artifact.expiresAt.getTime() <= Date.now()
    || artifact.resourceType !== input.resourceType || artifact.resourceId !== input.resourceId
    || artifact.storageKey !== input.fileName) return null
  if (input.resourceType === 'TRAINING_ANALYSIS') {
    const parsed = trainingAnalysisProvenanceSchema.safeParse(artifact.provenance)
    if (!parsed.success || !artifact.anonymized || artifact.createdBy !== input.actor.userId
      || parsed.data.creatorRole !== input.actor.role) return null
    try {
      assertTrainingAnalysisExportIdentity(parsed.data.trainingAnalysis, { courseId: input.resourceId,
        createdBy: input.actor.userId, creatorRole: input.actor.role })
      const { revalidateTrainingAnalysisManifest } = await import('../modules/training-analysis/service')
      await revalidateTrainingAnalysisManifest({ id: input.actor.userId, role: parsed.data.creatorRole }, parsed.data.trainingAnalysis.manifest)
      if (input.metadataOnly) return artifact.storageKey
      const filePath = validateStorageKey(artifact.storageKey)
      if ((artifact.format !== 'csv' && artifact.format !== 'zip') || path.extname(filePath) !== `.${artifact.format}`) return null
      if (!(await fs.stat(filePath)).isFile()) return null
      return filePath
    } catch { return null }
  }
  const parsed = provenanceSchema.safeParse(artifact.provenance)
  if (!parsed.success || parsed.data.projectionFingerprint !== input.projectionFingerprint) return null
  if (input.actor.role !== UserRole.ADMIN && (
    input.actor.role !== UserRole.TEACHER || artifact.createdBy !== input.actor.userId
    || !artifact.anonymized || parsed.data.creatorRole !== input.actor.role
  )) return null
  if (input.resourceType === 'COMPOSITE' && artifact.status === 'READY') {
    const { teacherRelationalExportVisibility } = await import('../modules/composite/composite-export.service')
    const visibility = await teacherRelationalExportVisibility(input.actor)
    const ids = parsed.data.attemptIds
    const count = await prisma.compositeAssessmentAttempt.count({ where: { AND: [
      { id: { in: ids }, compositeAssessmentId: input.resourceId, status: 'COMPLETED' },
      ...(visibility ? [visibility] : []),
    ] } })
    if (count !== ids.length) return null
  }
  if (input.metadataOnly) return artifact.storageKey
  try {
    const filePath = validateStorageKey(artifact.storageKey)
    if (path.extname(filePath) !== `.${artifact.format}`) return null
    if (!(await fs.stat(filePath)).isFile()) return null
    return filePath
  } catch { return null }
}
