import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SimonTask } from '../tasks/simon/SimonTask'
import { simonSequence } from '../tasks/simon/sequence'
import type { CognitiveTaskContext } from '../core/runner.types'
const context: CognitiveTaskContext = { sessionId: 'synthetic', testType: 'simon', engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', attemptNo: 1, requiredInput: 'KEYBOARD', randomSeed: 'golden', config: { totalTrials: 100, practiceTrials: 20, responseWindowMs: 2000, feedbackMs: 1000, isiMinMs: 500, isiMaxMs: 999 } }
const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms) }) }
describe('Simon keyboard runner', () => {
 beforeEach(() => { vi.useFakeTimers(); vi.spyOn(document, 'hasFocus').mockReturnValue(true); vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => window.setTimeout(() => cb(performance.now()), 16)); vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => window.clearTimeout(id)) })
 afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
 it('blocks nonfrozen configs', () => { render(<SimonTask taskContext={{ ...context, config: {} }} trialIndex={0} onTrialComplete={vi.fn()} />); expect(screen.getByRole('alert').textContent).toContain('不受支持') })
 it('does not persist 20 practice trials; waits full window plus feedback; formal uses keyboard only', async () => {
  const submit = vi.fn().mockResolvedValue(undefined)
  render(<SimonTask taskContext={context} trialIndex={0} onTrialComplete={submit} />)
  fireEvent.click(screen.getByText('开始练习'))
  const practice = simonSequence('golden', 20, true)
  for (let i = 0; i < 20; i++) {
   await advance(32); await advance(1999)
   expect(screen.queryByText('未及时作答')).toBeNull()
   await advance(1); expect(screen.getByRole('status').textContent).toBe('未及时作答')
   await advance(1000 + practice[i].isiMs)
  }
  expect(submit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('开始正式任务'))
  await advance(32)
  fireEvent.pointerDown(screen.getByTestId('simon-stimulus'))
  fireEvent.keyDown(window, { code: 'ArrowLeft', repeat: true })
  await advance(1999); expect(submit).not.toHaveBeenCalled()
  await advance(1 + simonSequence('golden',100)[0].isiMs)
  expect(submit).toHaveBeenCalledTimes(1)
  expect(submit.mock.calls[0][0]).toMatchObject({ responseSide: null, rtMs: null, timeout: true, interrupted: false })
 })
 it('marks loss of focus during the window as interrupted and clears pending work on unmount', async () => {
  const submit = vi.fn(), view = render(<SimonTask taskContext={context} trialIndex={0} onTrialComplete={submit} />)
  fireEvent.click(screen.getByText('开始练习')); await advance(32); fireEvent.blur(window); await advance(2000)
  expect(screen.getByRole('status').textContent).toBe('本次被中断')
  view.unmount(); await advance(10000); expect(submit).not.toHaveBeenCalled()
 })
 it('accepts only the first non-repeat arrow, hides immediately, waits window and flags focus loss', async () => {
  const submit = vi.fn().mockResolvedValue(undefined)
  render(<SimonTask taskContext={context} trialIndex={0} onTrialComplete={submit} />)
  fireEvent.click(screen.getByText('开始练习'))
  for (const trial of simonSequence('golden', 20, true)) await advance(32 + 2000 + 1000 + trial.isiMs)
  fireEvent.click(screen.getByText('开始正式任务')); await advance(32); await advance(100)
  const key = new KeyboardEvent('keydown', { code: 'ArrowLeft' })
  Object.defineProperty(key, 'timeStamp', { value: performance.now() })
  fireEvent(window, key)
  expect(screen.getByTestId('simon-stimulus').getAttribute('data-visible')).toBe('false')
  const second = new KeyboardEvent('keydown', { code: 'ArrowRight' })
  Object.defineProperty(second, 'timeStamp', { value: performance.now() + 1 })
  fireEvent(window, second); fireEvent.blur(window)
  expect(submit).not.toHaveBeenCalled()
  await advance(1900 + simonSequence('golden', 100)[0].isiMs)
  expect(submit).toHaveBeenCalledTimes(1)
  expect(submit.mock.calls[0][0]).toMatchObject({ responseSide: 'left', timeout: false, interrupted: true, timing: { strategy: 'double-raf-performance-v1' } })
 })

 it('keeps consecutive formal trials technically invalid while focus remains lost', async () => {
  const submit = vi.fn().mockResolvedValue(undefined)
  const view = render(<SimonTask taskContext={context} trialIndex={0} onTrialComplete={submit} />)
  fireEvent.click(screen.getByText('开始练习'))
  for (const t of simonSequence('golden', 20, true)) await advance(32 + 2000 + 1000 + t.isiMs)
  fireEvent.click(screen.getByText('开始正式任务')); await advance(32)
  vi.mocked(document.hasFocus).mockReturnValue(false); fireEvent.blur(window)
  await advance(2000 + simonSequence('golden', 100)[0].isiMs)
  expect(submit.mock.calls[0][0].interrupted).toBe(true)
  view.rerender(<SimonTask taskContext={context} trialIndex={1} onTrialComplete={submit} />)
  await advance(32 + 2000 + simonSequence('golden', 100)[1].isiMs)
  expect(submit.mock.calls[1][0]).toMatchObject({ interrupted: true, timeout: true })
  view.rerender(<SimonTask taskContext={context} trialIndex={2} onTrialComplete={submit} />)
  await advance(32); vi.mocked(document.hasFocus).mockReturnValue(true); fireEvent.focus(window)
  await advance(2000 + simonSequence('golden', 100)[2].isiMs)
  expect(submit.mock.calls[2][0].interrupted).toBe(true)
 })

})
