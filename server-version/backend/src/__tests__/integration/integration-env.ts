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
