import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadProductApp } from './product-entry'

const evaluated = vi.fn()

describe('explicit Survey development entry', () => {
  beforeEach(() => {
    vi.resetModules()
    evaluated.mockClear()
    for (const [path, name] of [
      ['./App', 'platform'], ['./school/SchoolApp', 'school'],
      ['./huiteacher/HuiteacherApp', 'teacher'], ['./survey/SurveyApp', 'survey'],
      ['./survey/SurveyPublicApp', 'participant'],
    ]) vi.doMock(path, () => { evaluated(name); return { default: name } })
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DEV_PRODUCT', 'survey')
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(['localhost', 'LOCALHOST.', '127.0.0.1'])(
    'selects Survey and its participant app only on loopback %s', async host => {
      expect((await loadProductApp(host, '/workspace')).default).toBe('survey')
      expect((await loadProductApp(host, '/r/synthetic')).default).toBe('participant')
      expect(evaluated.mock.calls).toEqual([['survey'], ['participant']])
    },
  )
  it.each(['/admin', '/admin/', '/admin/login', '/admin/security/enroll', '/admin/survey-researchers'])(
    'preserves the existing platform administrator entry %s', async path => {
      expect((await loadProductApp('localhost', path)).default).toBe('platform')
      expect(evaluated.mock.calls).toEqual([['platform']])
    },
  )
  it.each(['', 'training', 'SURVEY', ' survey'])(
    'keeps default routing for unset or unknown config %j', async value => {
      vi.stubEnv('VITE_DEV_PRODUCT', value)
      expect((await loadProductApp('localhost', '/')).default).toBe('platform')
    },
  )
  it.each(['localhost', '127.0.0.1'])(
    'ignores the option in a production build on %s', async host => {
      vi.stubEnv('DEV', false)
      expect((await loadProductApp(host, '/')).default).toBe('platform')
      expect((await loadProductApp(host, '/r/synthetic')).default).toBe('platform')
      expect(evaluated.mock.calls).toEqual([['platform']])
    },
  )
  it.each([
    ['eduk12.top', 'platform'], ['training.eduk12.top', 'platform'],
    ['school.eduk12.top', 'school'], ['teacher.eduk12.top', 'teacher'],
    ['survey.eduk12.top', 'survey'], ['survey.localhost', 'survey'],
    ['localhost.attacker.test', 'platform'], ['127.0.0.1.attacker.test', 'platform'],
    ['192.168.1.2', 'platform'], ['survey.localhost.attacker.test', 'platform'],
  ])('does not override the existing routing of %s', async (host, expected) => {
    expect((await loadProductApp(host, '/')).default).toBe(expected)
  })
})
