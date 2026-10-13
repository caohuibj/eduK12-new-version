import { createHash } from 'node:crypto'
import { statfs } from 'node:fs/promises'
import { Prisma } from '@prisma/client'
import { config } from '../config'
import { cacheService } from './cacheService'
import { configuredInteger } from './boundedAdmissionGate'

export const REMOTE_VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024 - 1
export const REMOTE_VIDEO_TIMEOUT_MS = 15 * 60 * 1000
export const LOCAL_VIDEO_MAX_BYTES = 500 * 1024 * 1024
export const LOCAL_VIDEO_UPLOAD_SENTINEL = 'pending_upload'
export const LOCAL_VIDEO_UPLOAD_DEADLINE_MS = 5 * 60 * 1000
export const VIDEO_THUMBNAIL_MAX_BYTES = 8 * 1024 * 1024
const outputMinimumBytes = 16 * 1024 * 1024
const processingAuxiliaryBytes = 8 * 1024 * 1024

/** The worker enforces this same bound before any derivative is catalogued. */
export function videoOutputMaxBytes(inputBytes: number): number {
 if (!Number.isSafeInteger(inputBytes) || inputBytes <= 0 || inputBytes > REMOTE_VIDEO_MAX_BYTES)
  throw new RemoteVideoAdmissionError('视频文件大小无效', 400)
 return Math.min(REMOTE_VIDEO_MAX_BYTES, Math.max(outputMinimumBytes, inputBytes * 2))
}

export interface VideoCapacityRequest {
 inputBytes: number
 originalRetained?: boolean
}
const attempts = 3
const maxPending = configuredInteger('VIDEO_URL_MAX_PENDING', 4)
const maxPrincipalPending = configuredInteger('VIDEO_URL_MAX_PRINCIPAL_PENDING', 2)
const maxPrincipalStored = configuredInteger('VIDEO_URL_MAX_PRINCIPAL_STORED_BYTES', 8 * 1024 ** 3)
const maxStored = configuredInteger('VIDEO_URL_MAX_STORED_BYTES', 32 * 1024 ** 3)
const diskFloor = configuredInteger('VIDEO_URL_MIN_FREE_BYTES', 5 * 1024 ** 3)
const globalPeriodBytes = configuredInteger('VIDEO_URL_GLOBAL_BYTE_BUDGET', 72 * 1024 ** 3)
const periodBytes = configuredInteger('VIDEO_URL_BYTE_BUDGET', 18 * 1024 ** 3)
export class RemoteVideoAdmissionError extends Error {
 constructor(message: string, public status = 503, public retryAfterSeconds = 30) { super(message) }
}
/** Charge the remote maximum for all automatic attempts, never the tiny JSON body. */
export async function reserveRemoteVideoBudget(principal: string): Promise<void> {
 if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') return
 const key = createHash('sha256').update(principal).digest('hex')
 const result = await cacheService.consumeWeightedRateLimit('video:url:bytes:' + key, periodBytes, 900, REMOTE_VIDEO_MAX_BYTES * attempts)
 if (!result) throw new RemoteVideoAdmissionError('视频下载预算服务暂时不可用')
 if (!result.allowed) throw new RemoteVideoAdmissionError('视频链接下载额度不足，请稍后重试', 429, result.retryAfterSeconds)
 const global = await cacheService.consumeWeightedRateLimit('video:url:bytes:global', globalPeriodBytes, 900, REMOTE_VIDEO_MAX_BYTES * attempts)
 if (!global) throw new RemoteVideoAdmissionError('视频下载预算服务暂时不可用')
 if (!global.allowed) throw new RemoteVideoAdmissionError('视频下载服务繁忙，请稍后重试', 503, global.retryAfterSeconds)
}
/** Durable PENDING/PROCESSING rows reserve local and remote work together. The
 * caller publishes the row/job identity in this same transaction. Rechecking an
 * existing reservation excludes that row before adding its current demand.
 * Soft deletion does not release a queue job's disk/storage reservation.
 */
export async function assertVideoCapacity(tx: Prisma.TransactionClient, principal: string, request: VideoCapacityRequest, currentVideoId?: string): Promise<void> {
 const outputBytes = videoOutputMaxBytes(request.inputBytes)
 const originalBytes = request.originalRetained ? 0 : request.inputBytes
 const storedBytes = originalBytes + outputBytes + VIDEO_THUMBNAIL_MAX_BYTES
 // The input and derivatives coexist with their catalog copies until the
 // worker exits and removes its temporary directory.
 const diskBytes = originalBytes + request.inputBytes + 2 * outputBytes + 2 * VIDEO_THUMBNAIL_MAX_BYTES + processingAuxiliaryBytes
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(1480215341, 1)`
 const pending = await tx.$queryRaw<Array<{ total: bigint; principal: bigint; stored: bigint; principalStored: bigint; disk: bigint }>>`
  WITH reservations AS (
   SELECT v.teacher_id,
    CASE WHEN a.id IS NOT NULL THEN a.size_bytes::bigint
     WHEN v.original_url ~* '^https?://' OR v.file_path='pending_download' THEN ${REMOTE_VIDEO_MAX_BYTES}::bigint
     WHEN v.file_size > 0 THEN v.file_size::bigint ELSE ${REMOTE_VIDEO_MAX_BYTES}::bigint END AS input_bytes,
    a.id IS NOT NULL AS original_retained
   FROM videos v LEFT JOIN stored_assets a ON a.id=v.original_asset_id AND a.deleted_at IS NULL
   WHERE v.status IN ('PENDING','PROCESSING')
    AND (${currentVideoId ?? null}::text IS NULL OR v.id <> ${currentVideoId ?? null})
  ), demand AS (
   SELECT teacher_id,input_bytes,
    CASE WHEN original_retained THEN 0 ELSE input_bytes END AS original_bytes,
    LEAST(${REMOTE_VIDEO_MAX_BYTES}::bigint,GREATEST(${outputMinimumBytes}::bigint,input_bytes*2)) AS output_bytes
   FROM reservations
  )
  SELECT COUNT(*)::bigint AS total,COUNT(*) FILTER (WHERE teacher_id=${principal})::bigint AS principal,
   COALESCE(SUM(original_bytes+output_bytes+${VIDEO_THUMBNAIL_MAX_BYTES}),0)::bigint AS stored,
   COALESCE(SUM(original_bytes+output_bytes+${VIDEO_THUMBNAIL_MAX_BYTES}) FILTER (WHERE teacher_id=${principal}),0)::bigint AS "principalStored",
   COALESCE(SUM(original_bytes+input_bytes+2*output_bytes+${2 * VIDEO_THUMBNAIL_MAX_BYTES + processingAuxiliaryBytes}),0)::bigint AS disk
  FROM demand
 `
 if (Number(pending[0]?.total ?? 0) >= maxPending || Number(pending[0]?.principal ?? 0) >= maxPrincipalPending)
  throw new RemoteVideoAdmissionError('视频处理队列已满，请稍后重试')
 const stored = await tx.$queryRaw<Array<{ total: bigint; principal: bigint }>>`
  SELECT COALESCE(SUM(size_bytes),0)::bigint AS total,
    COALESCE(SUM(size_bytes) FILTER (WHERE owner_id=${principal}),0)::bigint AS principal
  FROM stored_assets WHERE deleted_at IS NULL
 `
 const amounts = [pending[0]?.total, pending[0]?.principal, pending[0]?.stored, pending[0]?.principalStored,
  pending[0]?.disk, stored[0]?.total, stored[0]?.principal]
 if (amounts.some(value => typeof value !== 'bigint' || value < 0n || !Number.isSafeInteger(Number(value))))
  throw new RemoteVideoAdmissionError('无法核实视频存储预约')
 if (Number(stored[0]?.principal ?? 0) + Number(pending[0]?.principalStored ?? 0) + storedBytes > maxPrincipalStored
  || Number(stored[0]?.total ?? 0) + Number(pending[0]?.stored ?? 0) + storedBytes > maxStored)
  throw new RemoteVideoAdmissionError('视频存储额度不足', 429, 900)
 let available: number
 try { const disk = await statfs(config.uploadDir); available = Number(disk.bavail) * Number(disk.bsize) }
 catch { throw new RemoteVideoAdmissionError('无法核实视频存储余量') }
 if (!Number.isFinite(available) || available - Number(pending[0]?.disk ?? 0) - diskBytes < diskFloor)
  throw new RemoteVideoAdmissionError('视频存储空间不足，请联系管理员')
}

export async function assertRemoteVideoCapacity(tx: Prisma.TransactionClient, principal: string, currentVideoId?: string): Promise<void> {
 return assertVideoCapacity(tx, principal, { inputBytes: REMOTE_VIDEO_MAX_BYTES }, currentVideoId)
}
