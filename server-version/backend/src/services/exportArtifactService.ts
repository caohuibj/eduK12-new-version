import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '../config/database'
import { Prisma, UserRole } from '@prisma/client'

export type ExportResourceType = 'SCALE' | 'QUESTIONNAIRE'
export type ExportActor = { userId: string; role: UserRole }

const EXPORT_ROOT = path.resolve(process.env.EXPORT_DIR || path.join(__dirname, '../../exports'))
const ALLOWED_EXTENSIONS = new Set(['.csv', '.sav', '.sps'])

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

export async function createExportArtifact(params: {
  resourceType: ExportResourceType
  resourceId: string
  createdBy: string
  format: string
  anonymized: boolean
  storageKey: string
  expiresAt?: Date
}, db: typeof prisma | Prisma.TransactionClient = prisma) {
  validateStorageKey(params.storageKey)
  const expiresAt = params.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000)
  return db.exportArtifact.create({
    data: {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      createdBy: params.createdBy,
      format: params.format.toLowerCase(),
      anonymized: params.anonymized,
      storageKey: params.storageKey,
      expiresAt,
    },
  })
}

export async function authorizeExportDownload(actor: ExportActor, artifact: { createdBy: string; anonymized: boolean; expiresAt: Date; resourceType: string; resourceId: string }, resource: { creatorId?: string } | null): Promise<boolean> {
  if (artifact.expiresAt <= new Date()) return false
  if (!resource) return false
  if (actor.role !== UserRole.ADMIN && artifact.createdBy !== actor.userId) return false
  if (!artifact.anonymized && actor.role !== UserRole.ADMIN) return false
  if (actor.role !== UserRole.ADMIN && resource.creatorId && resource.creatorId !== actor.userId) return false
  return true
}

export async function resolveArtifactForDownload(artifactId: string, actor: ExportActor) {
  const artifact = await prisma.exportArtifact.findUnique({ where: { id: artifactId } })
  if (!artifact) return { artifact: null, filePath: null, reason: 'not-found' as const }
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
