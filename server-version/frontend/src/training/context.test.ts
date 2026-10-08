import { describe, expect, it } from 'vitest'
import { isTrainingHost, trainingNavigation } from './context'

describe('training edition is presentation only', () => {
  it('matches the exact training hostname and rejects lookalikes', () => {
    expect(isTrainingHost('training.eduk12.top')).toBe(true)
    expect(isTrainingHost('TRAINING.EDUK12.TOP.')).toBe(true)
    for (const name of ['eduk12.top', 'www.eduk12.top', 'training.eduk12.top.evil.test', 'mytraining.eduk12.top']) {
      expect(isTrainingHost(name)).toBe(false)
    }
  })

  it('shows only the appropriate course and account navigation', () => {
    expect(trainingNavigation('STUDENT').map(item => item.label)).toEqual(['我的课程', '我的账户'])
    expect(trainingNavigation('TEACHER').map(item => item.label)).toEqual(['我的课程', '我的账户'])
    expect(trainingNavigation('ADMIN')).toEqual([])
    expect(trainingNavigation('PARENT')).toEqual([])
  })
})
