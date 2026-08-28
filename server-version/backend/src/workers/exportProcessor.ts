import { ExportArtifactStatus } from '@prisma/client'
import { exportQueue, RESOURCE_LIMITS } from '../config/queue'
import { prisma } from '../config/database'
import { exportRoot, validateStorageKey } from '../services/exportArtifactService'
import {
  getScaleExportData,
  getQuestionnaireExportData,
  writeExportDataFile,
} from '../services/exportService'
import { assertExportLimits } from '../services/exportStorage'
import type { ExportJobPayload } from '../services/exportJobService'
import { logger } from '../utils/logger'

/**
 * A single job builds the authoritative dataset once, then writes each
 * requested representation from that same field/row snapshot.
 */
exportQueue.process(
  RESOURCE_LIMITS.exportConcurrency,
  async (job) => {
    const payload = job.data as ExportJobPayload
    const artifacts = await prisma.exportArtifact.findMany({
      where: { id: { in: payload.artifactIds }, batchId: payload.batchId, status: ExportArtifactStatus.PROCESSING },
      select: { id: true, storageKey: true, format: true },
    })
    if (artifacts.length !== payload.artifactIds.length) throw new Error('导出任务元数据不完整')

    try {
      const data = payload.resourceType === 'SCALE'
        ? await getScaleExportData(payload.resourceId, payload.options)
        : await getQuestionnaireExportData(payload.resourceId, payload.options)
      assertExportLimits({ records: data.rows.length, fields: data.fields.length })
      for (const artifact of artifacts) {
        const filePath = validateStorageKey(artifact.storageKey)
        await writeExportDataFile(filePath, data, artifact.format as 'csv' | 'sav' | 'sps')
        assertExportLimits({ bytes: require('fs').statSync(filePath).size })
        await prisma.exportArtifact.update({ where: { id: artifact.id }, data: { status: ExportArtifactStatus.READY, errorCode: null } })
      }
      return { batchId: payload.batchId, status: ExportArtifactStatus.READY, artifactCount: artifacts.length }
    } catch (error) {
      await prisma.exportArtifact.updateMany({
        where: { batchId: payload.batchId, status: ExportArtifactStatus.PROCESSING },
        data: { status: ExportArtifactStatus.FAILED, errorCode: 'EXPORT_FAILED' },
      })
      logger.error('异步导出任务失败', { batchId: payload.batchId, errorType: error instanceof Error ? error.name : 'unknown', exportRoot: exportRoot() })
      throw error
    }
  },
)
