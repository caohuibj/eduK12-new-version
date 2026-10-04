import * as fs from 'fs/promises'
import { ExportArtifactStatus } from '@prisma/client'
import { prisma } from '../config/database'
import { exportRoot, validateStorageKey } from '../services/exportArtifactService'
import {
  getScaleExportData,
  getQuestionnaireExportData,
  writeExportDataFile,
} from '../services/exportService'
import { assertExportLimits, EXPORT_MAX_BYTES } from '../services/exportStorage'
import {
  claimExportBatch,
  failExportBatchFinal,
  isFinalExportAttempt,
  publishExportBatch,
  reconcilePendingExportBatches,
  releaseExportBatchAttempt,
  type ExportJobPayload,
} from '../services/exportJobService'
import { logger } from '../utils/logger'

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { prepareAssessmentExport, revalidateAssessmentExport } from '../services/assessmentExportWorker'
const PROJECTION_MARKER = '__projection_v1_'

const generationStorageKey = (storageKey: string, generation: number): string => {
  const marker = storageKey.indexOf(PROJECTION_MARKER)
  if (marker < 1) {
    if (!/^(cognitive|composite)_/.test(storageKey)) throw new Error('导出 artifact 缺少 projection binding')
    const ext = path.extname(storageKey)
    return `${storageKey.slice(0, -ext.length)}__generation_${generation}${ext}`
  }
  return `${storageKey.slice(0, marker)}__generation_${generation}${storageKey.slice(marker)}`
}

const cleanupPaths = async (paths: string[]): Promise<void> => {
  await Promise.all(paths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)))
}

export const runExportBatch = async (job: any) => {
    const payload = job.data as ExportJobPayload
    const claim = await claimExportBatch(payload.batchId, String(job.id))
    if (!claim) return { batchId: payload.batchId, skipped: true }

    const artifacts = await prisma.exportArtifact.findMany({
      where: {
        id: { in: claim.artifactIds },
        batchId: claim.batchId,
        status: ExportArtifactStatus.PROCESSING,
      },
      select: { id: true, storageKey: true, format: true },
      orderBy: { id: 'asc' },
    })
    if (artifacts.length !== claim.artifactIds.length) {
      await failExportBatchFinal(claim.batchId, claim.generation, 'EXPORT_METADATA_INCOMPLETE')
      throw new Error('导出任务元数据不完整')
    }

    const temporaryPaths: string[] = []
    const generationPaths: string[] = []
    try {
      const assessment = claim.resourceType === 'COGNITIVE' || claim.resourceType === 'COMPOSITE'
        ? await prepareAssessmentExport(claim) : null
      const data = assessment?.data ?? (claim.resourceType === 'SCALE'
        ? await getScaleExportData(claim.resourceId, { ...claim.options, actor: { userId: claim.createdBy } })
        : await getQuestionnaireExportData(claim.resourceId, claim.options))
      assertExportLimits({ records: data.rows.length, fields: data.fields.length })

      const publishedKeys: Array<{ artifactId: string; storageKey: string; provenance?: any }> = []
      for (const artifact of artifacts) {
        const storageKey = generationStorageKey(artifact.storageKey, claim.generation)
        const finalPath = validateStorageKey(storageKey)
        const tempPath = `${finalPath}.tmp-${String(job.id).replace(/[^A-Za-z0-9_-]/g, '_')}`
        temporaryPaths.push(tempPath)
        if (assessment) {
          const generated = await assessment.save(artifact.format)
          temporaryPaths.push(generated)
          await fs.rename(generated, tempPath)
        } else await writeExportDataFile(tempPath, data, artifact.format as 'csv' | 'sav' | 'sps', EXPORT_MAX_BYTES)
        const stat = await fs.stat(tempPath)
        assertExportLimits({ bytes: stat.size })
        await fs.rename(tempPath, finalPath)
        generationPaths.push(finalPath)
        publishedKeys.push({ artifactId: artifact.id, storageKey, ...(assessment ? { provenance: { ...assessment.provenance, generation: randomUUID() } } : {}) })
      }

      if (assessment) await revalidateAssessmentExport(claim, assessment.provenance.attemptIds)
      const published = await publishExportBatch({
        batchId: claim.batchId,
        generation: claim.generation,
        fieldCount: data.fields.length, recordCount: data.rows.length,
        storageKeys: publishedKeys,
      })
      if (!published) {
        await cleanupPaths(generationPaths)
        return { batchId: claim.batchId, skipped: true, staleGeneration: claim.generation }
      }
      return {
        batchId: claim.batchId,
        status: ExportArtifactStatus.READY,
        artifactCount: artifacts.length,
        generation: claim.generation,
      }
    } catch (error) {
      await cleanupPaths([...temporaryPaths, ...generationPaths])
      if (isFinalExportAttempt(job)) {
        await failExportBatchFinal(claim.batchId, claim.generation)
      } else {
        await releaseExportBatchAttempt(claim.batchId, claim.generation)
      }
      logger.error('异步导出任务失败', {
        batchId: claim.batchId,
        generation: claim.generation,
        finalAttempt: isFinalExportAttempt(job),
        errorType: error instanceof Error ? error.name : 'unknown',
        exportRoot: exportRoot(),
      })
      throw error
    }
}
