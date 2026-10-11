import { describe,expect,it } from 'vitest'
import { surveyExclusiveSnapshotCutOff } from '../../modules/survey/analytics.source'

describe('Survey source cutoff with PostgreSQL microsecond precision',()=>{
  it('ceil rounds the JS Date snapshot watermark for exclusive queries, including a second rollover',()=>{
    const stamp=new Date('2026-10-11T14:09:00.123Z')
    const fence=surveyExclusiveSnapshotCutOff(stamp)
    expect(fence.toISOString()).toBe('2026-10-11T14:09:00.124Z')
    // PG timestamps in the same millisecond may have hidden fractional microseconds.
    const alreadyCommittedMs=stamp.getTime()+0.999
    expect(alreadyCommittedMs).toBeLessThan(fence.getTime())
    expect(surveyExclusiveSnapshotCutOff(new Date('2026-10-11T14:09:00.999Z')).toISOString())
      .toBe('2026-10-11T14:09:01.000Z')
  })
  it('preserves an explicit cursor fence without incrementing it on another page',()=>{
    const fence=surveyExclusiveSnapshotCutOff(new Date('2026-10-11T14:09:00.123Z'))
    const cursorStamp=new Date(fence.toISOString())
    expect(cursorStamp.getTime()).toBe(fence.getTime())
  })
})
