import { describe, expect, it } from 'vitest'
import { createCustomScaleDefinition, validateCustomScaleDraft, validateScaleDefinition } from '../../modules/scale/scale-definition'
import { scaleDefinitionFor } from '../integration/mini-scale-definition'

const errors = (result: ReturnType<typeof validateScaleDefinition>) => result.issues.filter(issue => issue.severity === 'error')
const questionsOnly = () => {
  const value = createCustomScaleDefinition()
  value.responseSets[0].options = []
  value.items = [{ itemCode: 'q1', content: '一道题目', type: 'single', required: true, sortOrder: 1, responseSetKey: 'default', randomizeOptions: false }]
  value.scoring.itemRules = [{ itemCode: 'q1', transform: { type: 'identity' } }]
  return value
}

describe('custom scale draft completeness boundary', () => {
  it.each([createCustomScaleDefinition, questionsOnly])('preserves unfinished authoring without making it executable', make => {
    const value = make()
    const saved = validateCustomScaleDraft(value)
    expect(errors(saved)).toEqual([])
    expect(saved.definition).toEqual(value)
    expect(errors(validateScaleDefinition(value, { instrumentClass: 'CUSTOM_DESCRIPTIVE' })).length).toBeGreaterThan(0)
    expect(errors(validateScaleDefinition(value, { instrumentClass: 'CUSTOM_DESCRIPTIVE', forPublish: true })).length).toBeGreaterThan(0)
  })
  it('allows a newly added score before its questions and primary indicator are chosen', () => {
    const value = scaleDefinitionFor(3, 'DRAFT')
    value.scoring.scores.forEach(score => { score.canonical = false; if (score.source.type === 'items') score.source.items = [] })
    value.report.primaryScoreKeys = []
    expect(errors(validateCustomScaleDraft(value))).toEqual([])
    expect(errors(validateScaleDefinition(value, { instrumentClass: 'CUSTOM_DESCRIPTIVE' })).length).toBeGreaterThan(0)
  })
  it('continues to reject broken references and duplicate stable identifiers', () => {
    const value = questionsOnly()
    value.items[0].responseSetKey = 'missing'
    value.items.push({ ...value.items[0] })
    const messages = errors(validateCustomScaleDraft(value)).map(issue => issue.message)
    expect(messages).toContain('题目编码不能重复')
    expect(messages).toContain('响应集不存在：missing')
  })
  it('does not broaden custom scale scoring or reference capabilities', () => {
    const value = questionsOnly()
    value.scoring.scorerKey = 'unauthorized-custom-scorer'
    value.referencePolicy = { type: 'declared', selections: [] }
    const messages = errors(validateCustomScaleDraft(value)).map(issue => issue.message)
    expect(messages).toContain('自定义描述性量表不能配置群体参考')
    expect(messages).toContain('自定义描述性量表不能使用 custom scorer')
  })
  it('retains response value types and rejects malformed option fields', () => {
    const value = questionsOnly()
    value.responseSets[0].options = [{ value: 1, label: '数字', score: 1 }, { value: '1', label: '文本', score: 2 }]
    expect(validateCustomScaleDraft(value).definition?.responseSets[0].options).toEqual(value.responseSets[0].options)
    value.responseSets[0].options[0].label = ''
    expect(errors(validateCustomScaleDraft(value)).some(issue => issue.path === 'responseSets.0.options.0.label')).toBe(true)
  })
})
