import * as fs from 'fs/promises'
import { ExportArtifactStatus } from '@prisma/client'
import { exportQueue, RESOURCE_LIMITS } from '../config/queue'
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

const PROJECTION_MARKER = '__projection_v1_'

const generationStorageKey = (storageKey: string, generation: number): string => {
  const marker = storageKey.indexOf(PROJECTION_MARKER)
  if (marker < 1) throw new Error('导出 artifact 缺少 projection binding')
  return `${storageKey.slice(0, marker)}__generation_${generation}${storageKey.slice(marker)}`
}

const cleanupPaths = async (paths: string[]): Promise<void> => {
  await Promise.all(paths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)))
}

/**
 * PostgreSQL export_batches is the durable authority. Bull only delivers a
 * batch id. Each attempt claims a new generation and may publish the whole
 * batch only while that generation is still current.
 */
exportQueue.process(
  RESOURCE_LIMITS.exportConcurrency,
  async (job) => {
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
      const data = claim.resourceType === 'SCALE'
        ? await getScaleExportData(claim.resourceId, claim.options)
        : await getQuestionnaireExportData(claim.resourceId, claim.options)
      assertExportLimits({ records: data.rows.length, fields: data.fields.length })

      const publishedKeys: Array<{ artifactId: string; storageKey: string }> = []
      for (const artifact of artifacts) {
        const storageKey = generationStorageKey(artifact.storageKey, claim.generation)
        const finalPath = validateStorageKey(storageKey)
        const tempPath = `${finalPath}.tmp-${String(job.id).replace(/[^A-Za-z0-9_-]/g, '_')}`
        temporaryPaths.push(tempPath)
        await writeExportDataFile(tempPath, data, artifact.format as 'csv' | 'sav' | 'sps', EXPORT_MAX_BYTES)
        const stat = await fs.stat(tempPath)
        assertExportLimits({ bytes: stat.size })
        await fs.rename(tempPath, finalPath)
        generationPaths.push(finalPath)
        publishedKeys.push({ artifactId: artifact.id, storageKey })
      }

      const published = await publishExportBatch({
        batchId: claim.batchId,
        generation: claim.generation,
        fieldCount: data.fields.length,
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
  },
)

let reconciliationStopped = false
const reconcile = () => {
  if (reconciliationStopped) return
  void reconcilePendingExportBatches().catch(() => {
    logger.error('导出 PROCESSING reconciliation 失败')
  })
}
const reconciliationStart = setTimeout(reconcile, 1_000)
const reconciliationInterval = setInterval(reconcile, 30_000)
reconciliationStart.unref?.()
reconciliationInterval.unref?.()

export const stopExportProcessingRecovery = (): void => {
  reconciliationStopped = true
  clearTimeout(reconciliationStart)
  clearInterval(reconciliationInterval)
}
