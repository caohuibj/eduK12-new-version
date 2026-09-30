export const DEFAULT_PRISMA_CONNECTION_POOL_SIZE = 10
export const DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS = 30

const positiveInteger = (value: string | undefined, fallback: number, name: string): number => {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1000) throw new Error(`${name} must be an integer from 1 to 1000`)
  return parsed
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
  for (const key of ['connection_limit', 'pool_timeout']) {
    if (url.searchParams.has(key)) positiveInteger(url.searchParams.get(key)!, 1, key)
  }
  positiveInteger(env.PRISMA_CONNECTION_POOL_SIZE, DEFAULT_PRISMA_CONNECTION_POOL_SIZE, 'PRISMA_CONNECTION_POOL_SIZE')
  positiveInteger(env.PRISMA_POOL_TIMEOUT, DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS, 'PRISMA_POOL_TIMEOUT')
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set(
      'connection_limit',
      String(positiveInteger(env.PRISMA_CONNECTION_POOL_SIZE, DEFAULT_PRISMA_CONNECTION_POOL_SIZE, 'PRISMA_CONNECTION_POOL_SIZE')),
    )
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set(
      'pool_timeout',
      String(positiveInteger(env.PRISMA_POOL_TIMEOUT, DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS, 'PRISMA_POOL_TIMEOUT')),
    )
  }
  return url.toString()
}
