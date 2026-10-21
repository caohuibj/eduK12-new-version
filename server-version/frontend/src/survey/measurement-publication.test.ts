import { describe, expect, it, vi } from 'vitest'
import { publishSurveyMeasurement } from './measurement-publication'

describe('shared Survey measurement publication',()=>{
  it('publishes only the selected saved revision, never a wave or library submission',async()=>{
    const transport=vi.fn().mockResolvedValue({releaseId:'release-4'})
    await expect(publishSurveyMeasurement(transport,'project /1',{id:'scale /1',revision:4})).resolves.toEqual({releaseId:'release-4'})
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledWith('/projects/project%20%2F1/instruments/scale%20%2F1/measurement-release','POST',{revision:4})
  })
  it('preserves rejection instead of pretending publication succeeded',async()=>{
    const transport=vi.fn().mockRejectedValue(new Error('版本冲突'))
    await expect(publishSurveyMeasurement(transport,'p',{id:'s',revision:3})).rejects.toThrow('版本冲突')
    expect(transport).toHaveBeenCalledTimes(1)
  })
})
