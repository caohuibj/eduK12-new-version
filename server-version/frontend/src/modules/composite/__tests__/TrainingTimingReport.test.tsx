import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TrainingTimingReport } from '../TrainingTimingReport'
afterEach(cleanup)
describe('authorized descriptive Training timing report', () => {
  it('distinguishes uncollected and missing without fabricated zero', () => {
    const { rerender } = render(<TrainingTimingReport value={{scope:'LEGACY_UNSCOPED',status:'NOT_COLLECTED',unit:'ms',items:{}}} />)
    expect(screen.getByText('未采集')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    rerender(<TrainingTimingReport value={{scope:'TRAINING_COURSE',status:'MISSING',unit:'ms',items:{}}} />)
    expect(screen.getByText('计时缺失或不完整')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('shows recorded milliseconds and missing first response independently', () => {
    render(<TrainingTimingReport value={{scope:'TRAINING_COURSE',status:'RECORDED',unit:'ms',items:{Q1:{schemaVersion:1,firstResponseMs:null,activeTimeMs:120,changeCount:0,revisitCount:0,visits:1,interrupted:true,recoveredWithoutClock:true}}}} />)
    expect(screen.getByText('120')).toBeTruthy()
    expect(screen.getByText('缺失')).toBeTruthy()
    expect(screen.getByText('恢复时无首次计时')).toBeTruthy()
    expect(screen.getByText(/不用于科学评分或认真度判断/)).toBeTruthy()
  })
})
