/**
 * Resolve an opt-in integration database URL without ever falling back to a
 * developer or production database.  The normal unit suite intentionally
 * skips these tests; CI and the release verifier must fail loudly when a
 * required URL is missing instead of reporting a green run with no coverage.
 */
export const integrationDatabaseUrl = (...names: string[]): string | undefined => {
  const value = names
    .map((name) => process.env[name]?.trim())
    .find((candidate): candidate is string => Boolean(candidate))

  if (!value && (process.env.CI === 'true' || process.env.RELEASE_VERIFY_LOCAL === 'true')) {
    throw new Error(`Required integration database variable is missing: ${names.join(' or ')}`)
  }
  return value
}

/** Destructive release fixtures must select the same disposable loopback DB. */
export const requireIsolatedReleaseDatabase = (selectedUrl: string): void => {
  const selected = new URL(selectedUrl)
  const actual = new URL(process.env.DATABASE_URL ?? '')
  const local = ['127.0.0.1', 'localhost'].includes(selected.hostname)
  const hosted = process.env.CI === 'true' && selected.pathname === '/ptool'
  const release = process.env.RELEASE_VERIFY_LOCAL === 'true' && selected.pathname === '/eduk12_release'
  if (!local || selected.href !== actual.href || (!/test|ci/i.test(selected.pathname) && !hosted && !release)) {
    throw new Error('explicitly selected isolated loopback test database required')
  }
}
