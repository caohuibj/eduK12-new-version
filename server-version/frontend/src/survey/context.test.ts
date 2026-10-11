import { describe, expect, it } from 'vitest'
import { isSurveyHost } from './context'
describe('Survey exact product host selection',()=>{
  it('accepts only its own hostname',()=>{
    expect(isSurveyHost('survey.eduk12.top')).toBe(true)
    expect(isSurveyHost('SURVEY.EDUK12.TOP.')).toBe(true)
    for(const name of ['school.eduk12.top','training.eduk12.top','teacher.eduk12.top',
      'survey.eduk12.top.attacker.test','mysurvey.eduk12.top','eduk12.top']){
      expect(isSurveyHost(name)).toBe(false)
    }
  })
})
