import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { VisualwmTaskV11 } from '../VisualwmTaskV11'
import { visualwmTrial } from '../generator'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

it('isolates the two-item practice while keeping formal seed, index, timing and payload unchanged', async () => {
  vi.useFakeTimers()
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const save = vi.fn().mockResolvedValue(undefined)
  const complete = vi.fn()
  const context = {
    sessionId: 'visualwm-v11', testType: 'visualwm',
    engineVersion: '1.1.0', scoringVersion: '1.0.0', configVersion: '1.1.0',
    attemptNo: 1, randomSeed: 'visualwm-practice-reproduction',
    config: { totalTrials: 8, studyMs: 500, retentionMs: 900, validRtFloorMs: 200,
      report: { reportVersion: '1.1.0', referenceMode: 'none' as const } },
  }
  const view = render(<VisualwmTaskV11 taskContext={context} trialIndex={0} onTrialComplete={save} onTaskComplete={complete} />)
  const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms) }) }
  const colors = () => Array.from(view.container.querySelectorAll<HTMLElement>('.absolute.rounded')).map((square) => square.style.backgroundColor)
  const css = (color: string) => { const node = document.createElement('div'); node.style.backgroundColor = color; return node.style.backgroundColor }

  fireEvent.click(screen.getByText('开始练习'))
  await advance(399)
  expect(colors()).toEqual([])
  await advance(1)
  const practiceColors = colors()
  expect(practiceColors).toHaveLength(2)
  await advance(500)
  expect(colors()).toEqual([])
  await advance(899)
  expect(screen.queryByText('2 · 改变')).toBeNull()
  await advance(1)
  fireEvent.click(screen.getByText('2 · 改变'), { detail: 0 })
  expect(screen.getByText('正确：颜色变了！')).toBeTruthy()
  expect(save).not.toHaveBeenCalled()

  fireEvent.click(screen.getByText('开始正式测评'))
  await advance(400)
  const firstFormal = visualwmTrial(context.randomSeed, 0)
  expect(colors()).toEqual(firstFormal.colors.map(css))
  expect(colors()).not.toEqual(practiceColors)
  await advance(500)
  await advance(900)
  const probeColors = firstFormal.colors.map(css)
  probeColors[firstFormal.probePosition] = css(firstFormal.probeColor)
  expect(colors()).toEqual(probeColors)
  now = 1321
  fireEvent.keyDown(window, { key: firstFormal.isChange ? '2' : '1' })
  await act(async () => {})
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith({ setSize: firstFormal.setSize, isChange: firstFormal.isChange,
    response: firstFormal.isChange ? 'change' : 'same', rtMs: 321, interrupted: false })
  expect(complete).not.toHaveBeenCalled()

  view.rerender(<VisualwmTaskV11 taskContext={context} trialIndex={1} onTrialComplete={save} onTaskComplete={complete} />)
  await advance(400)
  expect(colors()).toEqual(visualwmTrial(context.randomSeed, 1).colors.map(css))
  expect(colors()).toHaveLength(4)
})
