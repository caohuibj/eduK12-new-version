export const DEFAULT_PRISMA_CONNECTION_POOL_SIZE = 10
export const DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS = 30

const positiveInteger = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Apply the Prisma pool contract at runtime while preserving an explicit
 * connection_limit/pool_timeout already present in DATABASE_URL.
 */
export const buildDatabaseUrl = (
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined => {
  if (!databaseUrl) return undefined

  const url = new URL(databaseUrl)
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set(
      'connection_limit',
      String(positiveInteger(env.PRISMA_CONNECTION_POOL_SIZE, DEFAULT_PRISMA_CONNECTION_POOL_SIZE)),
    )
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set(
      'pool_timeout',
      String(positiveInteger(env.PRISMA_POOL_TIMEOUT, DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS)),
    )
  }
  return url.toString()
}
