import { createHash } from 'node:crypto'
import { statfs } from 'node:fs/promises'
import { Prisma } from '@prisma/client'
import { config } from '../config'
import { cacheService } from './cacheService'
import { configuredInteger } from './boundedAdmissionGate'

export const REMOTE_VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024 - 1
export const REMOTE_VIDEO_TIMEOUT_MS = 15 * 60 * 1000
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
/** Durable Video status owns the reservation, including lost queue acknowledgements.
 * Serialize URL create/retry/recovery before publishing PENDING; no expiring semaphore
 * can silently release a still-queued job. Existing assets remain untouched.
 */
export async function assertRemoteVideoCapacity(tx: Prisma.TransactionClient, principal: string, currentVideoId?: string): Promise<void> {
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(1480215341, 1)`
 const pending = await tx.$queryRaw<Array<{ total: bigint; principal: bigint }>>`
  SELECT COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE teacher_id=${principal})::bigint AS principal
  FROM videos WHERE status IN ('PENDING','PROCESSING')
    AND (${currentVideoId ?? null}::text IS NULL OR id <> ${currentVideoId ?? null})
 `
 if (Number(pending[0]?.total ?? 0) >= maxPending || Number(pending[0]?.principal ?? 0) >= maxPrincipalPending)
  throw new RemoteVideoAdmissionError('视频处理队列已满，请稍后重试')
 const stored = await tx.$queryRaw<Array<{ total: bigint; principal: bigint }>>`
  SELECT COALESCE(SUM(size_bytes),0)::bigint AS total,
    COALESCE(SUM(size_bytes) FILTER (WHERE owner_id=${principal}),0)::bigint AS principal
  FROM stored_assets WHERE deleted_at IS NULL
 `
 const pendingBytes = (Number(pending[0]?.total ?? 0) + 1) * REMOTE_VIDEO_MAX_BYTES * 3
 if (Number(stored[0]?.principal ?? 0) + (Number(pending[0]?.principal ?? 0) + 1) * REMOTE_VIDEO_MAX_BYTES * 3 > maxPrincipalStored || Number(stored[0]?.total ?? 0) + pendingBytes > maxStored)
  throw new RemoteVideoAdmissionError('视频存储额度不足', 429, 900)
 let available: number
 try { const disk = await statfs(config.uploadDir); available = Number(disk.bavail) * Number(disk.bsize) }
 catch { throw new RemoteVideoAdmissionError('无法核实视频存储余量') }
 if (available - pendingBytes < diskFloor) throw new RemoteVideoAdmissionError('视频存储空间不足，请联系管理员')
}
