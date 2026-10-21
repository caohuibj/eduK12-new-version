import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadProductApp } from './product-entry'

const evaluated = vi.fn()

describe('product entry only imports the selected application', () => {
  beforeEach(() => {
    vi.resetModules()
    evaluated.mockClear()
    for (const [path, name] of [
      ['./App', 'platform'], ['./school/SchoolApp', 'school'],
      ['./huiteacher/HuiteacherApp', 'teacher'], ['./survey/SurveyApp', 'survey'],
      ['./survey/SurveyPublicApp', 'participant'],
    ]) vi.doMock(path, () => { evaluated(name); return { default: name } })
  })
  it.each([
    ['eduk12.top', '/', 'platform'],
    ['training.eduk12.top', '/learner/courses/example', 'platform'],
    ['school.eduk12.top', '/workspace/reports', 'school'],
    ['SCHOOL.EDUK12.TOP.', '/', 'school'],
    ['teacher.eduk12.top', '/participate', 'teacher'],
    ['survey.eduk12.top', '/', 'survey'],
    ['survey.eduk12.top', '/r/example', 'participant'],
    ['survey.eduk12.top', '/r', 'survey'],
    ['survey.eduk12.top.evil.example', '/r/example', 'platform'],
  ])('%s%s loads %s only', async (hostname, pathname, expected) => {
    const result = await loadProductApp(hostname, pathname)
    expect(result.default).toBe(expected)
    expect(evaluated.mock.calls).toEqual([[expected]])
  })
})
