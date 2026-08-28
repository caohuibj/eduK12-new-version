import { randomUUID } from 'crypto'
import { ExportArtifactStatus } from '@prisma/client'
import { exportQueue } from '../config/queue'
import { prisma } from '../config/database'
import { createExportArtifact } from './exportArtifactService'

const parseThreshold = (): number => {
  const value = Number(process.env.EXPORT_ASYNC_RECORD_THRESHOLD || 2000)
  return Number.isInteger(value) && value > 0 ? value : 2000
}

export const EXPORT_ASYNC_RECORD_THRESHOLD = parseThreshold()
export type ExportJobFormat = 'csv' | 'sav' | 'sps'

export type ExportJobOptions = {
  anonymize: boolean
  includeProgress?: boolean
  minProgress?: number
  dateRange?: { start?: string; end?: string }
}

export type ExportJobPayload = {
  batchId: string
  resourceType: 'SCALE' | 'QUESTIONNAIRE'
  resourceId: string
  artifactIds: string[]
  options: ExportJobOptions
}

export const formatsForRequest = (resourceType: ExportJobPayload['resourceType'], format: unknown): ExportJobFormat[] => {
  const normalized = typeof format === 'string' ? format.toLowerCase() : 'csv'
  if (resourceType === 'SCALE' && normalized === 'spss') return ['csv', 'sps']
  if (normalized === 'csv' || normalized === 'sav') return [normalized]
  throw new Error('不支持的导出格式')
}

const pendingStorageKey = (resourceType: string, resourceId: string, batchId: string, format: ExportJobFormat): string =>
  `${resourceType.toLowerCase()}_${resourceId.substring(0, 8)}_${batchId}.${format}`

export const enqueueExportJob = async (params: {
  resourceType: ExportJobPayload['resourceType']
  resourceId: string
  createdBy: string
  anonymized: boolean
  format: unknown
  options: ExportJobOptions
}): Promise<{ batchId: string; artifacts: Array<{ id: string; format: string; fileName: string; expiresAt: string; downloadUrl: string }> }> => {
  const batchId = randomUUID()
  const formats = formatsForRequest(params.resourceType, params.format)
  const artifacts = await prisma.$transaction(async (tx) => {
    const rows = []
    for (const format of formats) {
      rows.push(await createExportArtifact({
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        createdBy: params.createdBy,
        format,
        anonymized: params.anonymized,
        storageKey: pendingStorageKey(params.resourceType, params.resourceId, batchId, format),
        status: ExportArtifactStatus.PROCESSING,
        batchId,
      }, tx))
    }
    return rows
  })
  try {
    await exportQueue.add({
      batchId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      artifactIds: artifacts.map((artifact) => artifact.id),
      options: params.options,
    } satisfies ExportJobPayload)
  } catch (error) {
    await prisma.exportArtifact.updateMany({ where: { batchId }, data: { status: ExportArtifactStatus.FAILED, errorCode: 'QUEUE_UNAVAILABLE' } })
    throw error
  }
  return {
    batchId,
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      format: artifact.format,
      fileName: artifact.storageKey.split('/').pop() || artifact.storageKey,
      expiresAt: artifact.expiresAt.toISOString(),
      downloadUrl: `/api/${params.resourceType === 'SCALE' ? 'scales' : 'questionnaires'}/exports/${artifact.id}`,
    })),
  }
}
