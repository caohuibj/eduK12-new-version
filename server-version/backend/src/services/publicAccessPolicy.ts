export const MAX_PUBLIC_LINK_TTL_MS = 365 * 24 * 60 * 60 * 1000

export const publicAccessExpiryWithinPolicy = (
  expiresAt: Date,
  options: { now?: number; upperBound?: Date | null } = {},
): boolean => {
  const now = options.now ?? Date.now()
  const value = expiresAt.getTime()
  if (!Number.isFinite(value) || value <= now || value > now + MAX_PUBLIC_LINK_TTL_MS) return false
  const upperBound = options.upperBound?.getTime()
  return upperBound === undefined || !Number.isFinite(upperBound) || value <= upperBound
}
