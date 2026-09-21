import { describe, expect, it } from 'vitest'
import { resolveCognitiveFrontendParticipantPresentation } from '../participant-presentation'

describe('Cognitive task-owned participant presentation', () => {
  it('keeps same metric keys isolated by task', () => {
    const stroop = resolveCognitiveFrontendParticipantPresentation('stroop')
    const flanker = resolveCognitiveFrontendParticipantPresentation('flanker')
    expect(stroop?.metricCopy.incongruentAccuracy).toBeDefined()
    expect(flanker?.metricCopy.incongruentAccuracy).toBeDefined()
    expect(stroop?.metricCopy).not.toBe(flanker?.metricCopy)
  })

  it('has no fallback presentation for an unknown task', () => {
    expect(resolveCognitiveFrontendParticipantPresentation('unknown-task')).toBeNull()
  })
})
