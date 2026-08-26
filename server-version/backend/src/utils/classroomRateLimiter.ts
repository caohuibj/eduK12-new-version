import { cacheService, type RateLimitResult } from '../services/cacheService'

export interface ClassroomRateLimitResult {
  available: boolean
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

const LOOKUP_WINDOW_SECONDS = 60
// A normal student uses one HTTP lookup and one Socket.IO join. A school or
// lab may put many students behind one NAT address, so leave room for 100
// students plus reconnects while keeping failed-code checks strict.
const LOOKUP_LIMIT_PER_IP = 300
const FAILED_CODE_LIMIT_PER_IP = 5

const safeKeyPart = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9:._-]/g, '_').slice(0, 80) || 'unknown'
}

const unavailable = (): ClassroomRateLimitResult => ({
  available: false,
  allowed: false,
  remaining: 0,
  retryAfterSeconds: LOOKUP_WINDOW_SECONDS,
})

const toResult = (result: RateLimitResult | null): ClassroomRateLimitResult => {
  if (!result) {
    return unavailable()
  }

  return {
    available: true,
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfterSeconds: result.retryAfterSeconds,
  }
}

export async function checkClassroomLookupRateLimit(
  ipAddress: string
): Promise<ClassroomRateLimitResult> {
  const result = await cacheService.consumeRateLimit(
    'classroom:lookup:ip:' + safeKeyPart(ipAddress),
    LOOKUP_LIMIT_PER_IP,
    LOOKUP_WINDOW_SECONDS
  )

  return toResult(result)
}

export async function checkFailedClassroomCodeRateLimit(
  ipAddress: string,
  code: string
): Promise<ClassroomRateLimitResult> {
  const result = await cacheService.consumeRateLimit(
    'classroom:lookup:failed:' + safeKeyPart(ipAddress) + ':' + safeKeyPart(code),
    FAILED_CODE_LIMIT_PER_IP,
    LOOKUP_WINDOW_SECONDS
  )

  return toResult(result)
}
