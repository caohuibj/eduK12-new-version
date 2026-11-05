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

/** Effective Prisma connection pool size for the CURRENT database URL, using
 * the exact same precedence as buildDatabaseUrl: an explicit connection_limit
 * in DATABASE_URL wins, then PRISMA_CONNECTION_POOL_SIZE, then the default. */
export const effectivePrismaPoolSize = (
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number => {
  if (databaseUrl) {
    try {
      const limit = new URL(databaseUrl).searchParams.get('connection_limit')
      if (limit !== null) {
        const parsed = Number(limit)
        if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 1000) return parsed
      }
    } catch { /* malformed URL falls through to the env/default chain */ }
  }
  const raw = env.PRISMA_CONNECTION_POOL_SIZE
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = Number(raw)
    if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 1000) return parsed
  }
  return DEFAULT_PRISMA_CONNECTION_POOL_SIZE
}

/** Default bound for the bounded Training START admission gate: at most 3/4 of
 * the effective pool, reserving the remainder for every other business that
 * shares the database. An explicit TRAINING_START_MAX_CONCURRENT overrides. */
export const defaultStartAdmissionBound = (
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number => Math.max(1, Math.floor(effectivePrismaPoolSize(databaseUrl, env) * 0.75))
