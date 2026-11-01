import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { VisualwmTask } from '../VisualwmTask'
import { visualwmTrial } from '../generator'

afterEach(() => { vi.useRealTimers() })

it('reproduces the frozen 1.0.1 practice repeating formal trial zero', async () => {
  vi.useFakeTimers()
  const seed = 'visualwm-practice-reproduction'
  const save = vi.fn()
  const { container } = render(<VisualwmTask taskContext={{
    sessionId: 'visualwm-legacy-reproduction', testType: 'visualwm',
    engineVersion: '1.0.1', scoringVersion: '1.0.0', configVersion: '1.0.1',
    attemptNo: 1, randomSeed: seed,
    config: { totalTrials: 8, studyMs: 500, retentionMs: 900, validRtFloorMs: 200,
      report: { reportVersion: '1.0.1', referenceMode: 'none' } },
  }} trialIndex={0} onTrialComplete={save} />)
  const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms) }) }
  const squares = () => Array.from(container.querySelectorAll<HTMLElement>('.absolute.rounded'))
    .map((square) => ({ color: square.style.backgroundColor, border: square.style.border }))

  fireEvent.click(screen.getByText('开始练习'))
  await advance(400)
  const practiceStudy = squares()
  expect(practiceStudy).toHaveLength(3)
  await advance(500)
  await advance(900)
  const practiceProbe = squares()
  fireEvent.click(screen.getByText(visualwmTrial(seed, 0).isChange ? '2 · 改变' : '1 · 相同'), { detail: 0 })
  expect(screen.getByText(/正确：颜色/)).toBeTruthy()
  expect(save).not.toHaveBeenCalled()

  fireEvent.click(screen.getByText('开始正式测评'))
  await advance(400)
  expect(squares()).toEqual(practiceStudy)
  await advance(500)
  await advance(900)
  expect(squares()).toEqual(practiceProbe)
})
