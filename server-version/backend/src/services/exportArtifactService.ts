import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '../config/database'
import { ExportArtifactStatus, Prisma, UserRole } from '@prisma/client'
import type { ScaleDisclosureAudience } from '../modules/scale/policy/types'
import {
  bindExportStorageKey,
  projectionBindingFromStorageKey,
  resolveExportProjectionBinding,
  storageKeyMatchesProjection,
} from './exportProjectionPolicy'

export type ExportResourceType = 'SCALE' | 'QUESTIONNAIRE'
export type ExportActor = { userId: string; role: UserRole }

const EXPORT_ROOT = path.resolve(process.env.EXPORT_DIR || path.join(__dirname, '../../exports'))
const ALLOWED_EXTENSIONS = new Set(['.csv', '.sav', '.sps', '.xlsx', '.zip'])

export const exportRoot = (): string => EXPORT_ROOT

export const validateStorageKey = (storageKey: string): string => {
  if (!storageKey || path.isAbsolute(storageKey) || storageKey.includes('\0')) throw new Error('导出文件路径无效')
  const normalized = path.normalize(storageKey)
  const resolved = path.resolve(EXPORT_ROOT, normalized)
  const relative = path.relative(EXPORT_ROOT, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('导出文件路径越界')
  if (path.basename(relative) !== relative) throw new Error('导出文件路径无效')
  if (!ALLOWED_EXTENSIONS.has(path.extname(relative).toLowerCase())) throw new Error('导出文件类型不受支持')
  return resolved
}

const extensionForFormat = (format: string): string => {
  const normalized = format.toLowerCase()
  if (normalized === 'spss') return '.sps'
  if (normalized === 'csv' || normalized === 'sav' || normalized === 'sps') return `.${normalized}`
  throw new Error('导出格式无效')
}

export async function createExportArtifact(params: {
  resourceType: ExportResourceType
  resourceId: string
  createdBy: string
  format: string
  anonymized: boolean
  storageKey: string
  projectionAudience?: ScaleDisclosureAudience
  expiresAt?: Date
  status?: ExportArtifactStatus
  batchId?: string
  errorCode?: string
}, db: typeof prisma | Prisma.TransactionClient = prisma) {
  const originalPath = validateStorageKey(params.storageKey)
  if (path.extname(originalPath).toLowerCase() !== extensionForFormat(params.format)) {
    throw new Error('导出文件扩展名与格式不一致')
  }
  // Generic Scale/Questionnaire export routes are teacher-facing. Research
  // exports must opt in explicitly and receive a distinct persisted binding.
  const binding = await resolveExportProjectionBinding(
    params.resourceType,
    params.resourceId,
    params.projectionAudience ?? 'teacher',
  )
  const storageKey = bindExportStorageKey(params.storageKey, binding)
  const storagePath = validateStorageKey(storageKey)
  if (fs.existsSync(originalPath) && originalPath !== storagePath) fs.renameSync(originalPath, storagePath)
  const expiresAt = params.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000)
  return db.exportArtifact.create({
    data: {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      createdBy: params.createdBy,
      format: params.format.toLowerCase(),
      anonymized: params.anonymized,
      storageKey,
      expiresAt,
      status: params.status,
      batchId: params.batchId,
      errorCode: params.errorCode,
    },
  })
}

export async function authorizeExportDownload(actor: ExportActor, artifact: { createdBy: string; anonymized: boolean; expiresAt: Date; resourceType: string; resourceId: string; storageKey: string }, resource: { creatorId?: string } | null): Promise<boolean> {
  if (artifact.expiresAt <= new Date()) return false
  if (!resource) return false
  if (actor.role !== UserRole.ADMIN && artifact.createdBy !== actor.userId) return false
  if (!artifact.anonymized && actor.role !== UserRole.ADMIN) return false
  if (actor.role !== UserRole.ADMIN && resource.creatorId && resource.creatorId !== actor.userId) return false
  if (artifact.resourceType !== 'SCALE' && artifact.resourceType !== 'QUESTIONNAIRE') return false
  const storedBinding = projectionBindingFromStorageKey(artifact.storageKey)
  // Pre-PR-2 artifacts have no disclosure binding and fail closed rather than
  // being re-used after a policy change.
  if (!storedBinding) return false
  try {
    const currentBinding = await resolveExportProjectionBinding(
      artifact.resourceType,
      artifact.resourceId,
      storedBinding.audience,
    )
    if (!storageKeyMatchesProjection(artifact.storageKey, currentBinding)) return false
  } catch {
    return false
  }
  return true
}

export async function resolveArtifactForDownload(artifactId: string, actor: ExportActor) {
  const artifact = await prisma.exportArtifact.findUnique({ where: { id: artifactId } })
  if (!artifact) return { artifact: null, filePath: null, reason: 'not-found' as const }
  if (artifact.resourceType !== 'SCALE' && artifact.resourceType !== 'QUESTIONNAIRE') return { artifact: null, filePath: null, reason: 'not-found' as const }
  if (artifact.status !== ExportArtifactStatus.READY) return { artifact: null, filePath: null, reason: artifact.status === ExportArtifactStatus.PROCESSING ? 'processing' as const : 'failed' as const }
  const resource = artifact.resourceType === 'SCALE'
    ? await prisma.scale.findUnique({ where: { id: artifact.resourceId }, select: { creatorId: true } })
    : await prisma.questionnaire.findUnique({ where: { id: artifact.resourceId }, select: { creatorId: true } })
  if (!(await authorizeExportDownload(actor, artifact, resource))) return { artifact: null, filePath: null, reason: 'forbidden' as const }
  let filePath: string
  try {
    filePath = validateStorageKey(artifact.storageKey)
  } catch {
    return { artifact: null, filePath: null, reason: 'invalid-path' as const }
  }
  if (!fs.existsSync(filePath)) return { artifact: null, filePath: null, reason: 'missing' as const }
  return { artifact, filePath, reason: null }
}

export async function getExportArtifactStatus(artifactId: string, actor: ExportActor) {
  const artifact = await prisma.exportArtifact.findUnique({ where: { id: artifactId } })
  if (!artifact) return { artifact: null, reason: 'not-found' as const }
  if (artifact.resourceType !== 'SCALE' && artifact.resourceType !== 'QUESTIONNAIRE') return { artifact: null, reason: 'not-found' as const }
  const resource = artifact.resourceType === 'SCALE'
    ? await prisma.scale.findUnique({ where: { id: artifact.resourceId }, select: { creatorId: true } })
    : await prisma.questionnaire.findUnique({ where: { id: artifact.resourceId }, select: { creatorId: true } })
  if (!(await authorizeExportDownload(actor, artifact, resource))) return { artifact: null, reason: 'forbidden' as const }
  return {
    artifact: {
      id: artifact.id,
      status: artifact.status,
      batchId: artifact.batchId,
      errorCode: artifact.errorCode,
      format: artifact.format,
      fileName: path.basename(artifact.storageKey),
      expiresAt: artifact.expiresAt,
      downloadUrl: `/api/${artifact.resourceType === 'SCALE' ? 'scales' : 'questionnaires'}/exports/${artifact.id}`,
    },
    reason: null,
  }
}
