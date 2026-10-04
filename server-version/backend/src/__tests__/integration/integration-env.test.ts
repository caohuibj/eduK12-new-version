import { afterEach, expect, it, vi } from 'vitest'
import { requireIsolatedReleaseDatabase } from './integration-env'
afterEach(() => vi.unstubAllEnvs())
const target = (database: string, host = 'localhost') => `postgresql://fixture:fixture@${host}:5432/${database}?schema=public`
it.each(['web_test', 'qa_ci'])('allows the explicitly matched loopback fixture %s', database => {
  vi.stubEnv('DATABASE_URL', target(database))
  expect(() => requireIsolatedReleaseDatabase(target(database))).not.toThrow()
})
it.each([['CI', 'ptool'], ['RELEASE_VERIFY_LOCAL', 'eduk12_release']])('permits %s reserved target only with its execution mode', (mode, database) => {
  vi.stubEnv('DATABASE_URL', target(database)); vi.stubEnv('CI', 'false'); vi.stubEnv('RELEASE_VERIFY_LOCAL', 'false')
  expect(() => requireIsolatedReleaseDatabase(target(database))).toThrow('isolated')
  vi.stubEnv(mode, 'true')
  expect(() => requireIsolatedReleaseDatabase(target(database))).not.toThrow()
})
it.each(['production', 'production.example', '192.0.2.1'])('rejects remote or ordinary production targets: %s', value => {
  vi.stubEnv('CI', 'true'); vi.stubEnv('RELEASE_VERIFY_LOCAL', 'true')
  const url = value === 'production' ? target(value) : target('web_test', value)
  vi.stubEnv('DATABASE_URL', url)
  expect(() => requireIsolatedReleaseDatabase(url)).toThrow('isolated')
})
it.each([target('other_test'), target('web_test', '127.0.0.1'), target('web_test').replace('schema=public', 'schema=other'), target('web_test').replace('fixture:fixture', 'different:password')])('rejects a different active database/connection', actual => {
  vi.stubEnv('DATABASE_URL', actual)
  expect(() => requireIsolatedReleaseDatabase(target('web_test'))).toThrow('isolated')
})
