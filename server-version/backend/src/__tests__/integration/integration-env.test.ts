import { afterEach, expect, it, vi } from 'vitest'
import { isActionsServiceDatabase, requireIsolatedReleaseDatabase } from './integration-env'
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

const actionsUrl = 'postgresql://ptool:ptool123@localhost:5432/ptool?schema=public'
const actionsService = (runner = 'self-hosted') => {
  for (const [key, value] of Object.entries({ CI: 'true', GITHUB_ACTIONS: 'true',
    NODE_ENV: 'test', RUNNER_ENVIRONMENT: runner, CI_POSTGRES_SERVICE_ID: 'a'.repeat(64),
    DATABASE_URL: actionsUrl })) vi.stubEnv(key, value)
}
it.each(['self-hosted', 'github-hosted'])('allows the explicit Actions service on %s', runner => {
  actionsService(runner)
  expect(isActionsServiceDatabase(actionsUrl)).toBe(true)
})
it.each([['CI', 'false'], ['GITHUB_ACTIONS', 'false'], ['NODE_ENV', 'production'],
  ['RUNNER_ENVIRONMENT', 'unknown'], ['CI_POSTGRES_SERVICE_ID', ''],
  ['CI_POSTGRES_SERVICE_ID', 'not-a-service'], ['DATABASE_URL', target('production')]])(
  'refuses incomplete or mismatched Actions service context %s', (key, value) => {
    actionsService(); vi.stubEnv(key, value)
    expect(isActionsServiceDatabase(actionsUrl)).toBe(false)
  })
it.each([actionsUrl.replace('localhost', 'production.example'),
  actionsUrl.replace('/ptool?', '/production?'), actionsUrl.replace('ptool123', 'other'),
  actionsUrl.replace('5432', '5433')])('refuses another selected connection', selected => {
  actionsService(); vi.stubEnv('DATABASE_URL', selected)
  expect(isActionsServiceDatabase(selected)).toBe(false)
})
