import { describe, expect, it } from 'vitest'
import { isSchoolHost } from './context'

describe('Huischool is a distinct presentation realm',()=>{
  it('allows the exact campus host and rejects lookalikes or training host',()=>{
    expect(isSchoolHost('school.eduk12.top')).toBe(true)
    expect(isSchoolHost('SCHOOL.EDUK12.TOP.')).toBe(true)
    for(const host of [
      'training.eduk12.top','teacher.eduk12.top','survey.eduk12.top',
      'school.eduk12.top.evil.example','myschool.eduk12.top','eduk12.top',
    ]) expect(isSchoolHost(host)).toBe(false)
  })
})
