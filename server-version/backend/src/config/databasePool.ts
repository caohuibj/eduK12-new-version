export const DEFAULT_PRISMA_CONNECTION_POOL_SIZE = 10
export const DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS = 30

type PoolUrlParamSpec = {
  parameter:
    | 'connection_limit'
    | 'pool_timeout'
    | 'statement_cache_size'
    | 'max_idle_connection_lifetime'
    | 'max_connection_lifetime'
  envName:
    | 'PRISMA_CONNECTION_POOL_SIZE'
    | 'PRISMA_POOL_TIMEOUT'
    | 'PRISMA_STATEMENT_CACHE_SIZE'
    | 'PRISMA_MAX_IDLE_CONNECTION_LIFETIME_SECONDS'
    | 'PRISMA_MAX_CONNECTION_LIFETIME_SECONDS'
  min: number
  max: number
  fallback?: number
}

const POOL_URL_PARAM_SPECS: readonly PoolUrlParamSpec[] = [
  { parameter: 'connection_limit', envName: 'PRISMA_CONNECTION_POOL_SIZE', min: 1, max: 1000, fallback: DEFAULT_PRISMA_CONNECTION_POOL_SIZE },
  { parameter: 'pool_timeout', envName: 'PRISMA_POOL_TIMEOUT', min: 1, max: 1000, fallback: DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS },
  { parameter: 'statement_cache_size', envName: 'PRISMA_STATEMENT_CACHE_SIZE', min: 0, max: 1000 },
  { parameter: 'max_idle_connection_lifetime', envName: 'PRISMA_MAX_IDLE_CONNECTION_LIFETIME_SECONDS', min: 0, max: 86400 },
  { parameter: 'max_connection_lifetime', envName: 'PRISMA_MAX_CONNECTION_LIFETIME_SECONDS', min: 0, max: 86400 },
]

const boundedInteger = (value: string | undefined, min: number, max: number, fallback: number | undefined, name: string): number | undefined => {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be an integer from ${min} to ${max}`)
  return parsed
}

/**
 * Apply the Prisma pool and connection-lifecycle contract at runtime while
 * preserving explicit parameters already present in DATABASE_URL.
 */
export const buildDatabaseUrl = (
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined => {
  if (!databaseUrl) return undefined

  const url = new URL(databaseUrl)
  for (const spec of POOL_URL_PARAM_SPECS) {
    if (url.searchParams.has(spec.parameter)) {
      boundedInteger(url.searchParams.get(spec.parameter)!, spec.min, spec.max, undefined, spec.parameter)
    }
    const envValue = boundedInteger(env[spec.envName], spec.min, spec.max, spec.fallback, spec.envName)
    if (!url.searchParams.has(spec.parameter) && envValue !== undefined) {
      url.searchParams.set(spec.parameter, String(envValue))
    }
  }
  return url.toString()
}

export type DatabasePoolConfigConflict = {
  parameter: PoolUrlParamSpec['parameter']
  urlValue: number
  envName: PoolUrlParamSpec['envName']
  envValue: number
}

/**
 * Detect silent overrides where DATABASE_URL explicitly pins pool/cache/lifetime
 * parameters to a different value than PRISMA_* environment variables.
 */
export const detectDatabasePoolConfigConflicts = (
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): DatabasePoolConfigConflict[] => {
  if (!databaseUrl) return []
  let url: URL
  try { url = new URL(databaseUrl) } catch { return [] }
  const conflicts: DatabasePoolConfigConflict[] = []
  for (const { parameter, envName, min, max } of POOL_URL_PARAM_SPECS) {
    const rawUrl = url.searchParams.get(parameter)
    const rawEnv = env[envName]
    if (rawUrl === null || rawEnv === undefined || rawEnv.trim() === '') continue
    const urlValue = Number(rawUrl)
    const envValue = Number(rawEnv)
    if (
      Number.isSafeInteger(urlValue) && urlValue >= min && urlValue <= max
      && Number.isSafeInteger(envValue) && envValue >= min && envValue <= max
      && urlValue !== envValue
    ) {
      conflicts.push({ parameter, urlValue, envName, envValue })
    }
  }
  return conflicts
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

export const DEFAULT_RUN_START_MAX_CONCURRENT = 8

/** Default bound for the bounded Training START admission gate: at most 3/4 of
 * the effective pool, reserving the remainder for every other business that
 * shares the database. An explicit TRAINING_START_MAX_CONCURRENT overrides. */
export const defaultStartAdmissionBound = (
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number => Math.max(1, Math.floor(effectivePrismaPoolSize(databaseUrl, env) * 0.75))

/** Run START acquires multi-table row locks and authority checks inside a
 * write transaction. Keep the implicit per-instance default capped even when
 * PRISMA_CONNECTION_POOL_SIZE is raised for lightweight reads/submits so dual
 * backends do not oversubscribe PostgreSQL memory; explicit envs still win. */
export const defaultRunStartAdmissionBound = (
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number => Math.min(defaultStartAdmissionBound(databaseUrl, env), DEFAULT_RUN_START_MAX_CONCURRENT)

/** Reserve API pool headroom for Definition/Submit when an old explicit START
 * limit exceeds the current pool budget. This is a cap, not reserved sockets. */
export const boundedTrainingStartConcurrency = (requested: number, databaseUrl = process.env.DATABASE_URL, env: NodeJS.ProcessEnv = process.env): number =>
  Math.max(1, Math.min(requested, Math.floor(effectivePrismaPoolSize(databaseUrl, env) * 0.6)))
