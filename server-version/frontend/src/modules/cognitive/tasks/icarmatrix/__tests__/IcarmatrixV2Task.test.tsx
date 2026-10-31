import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { IcarmatrixV2Task } from '../IcarmatrixV2Task'
import { generateIcarmatrixV2Plan, ICARMATRIX_V2_BANK, icarmatrixV2OptionOrder } from '../generator-v2'

const config = {
  totalTrials: 2,
  matrixType: '3x3' as const,
  stimulusSetVersion: 'matgen-bank-v1.0.0' as const,
  fixationMs: 400,
  timeoutMs: 30000,
  validRtFloorMs: 500,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'icarmatrix',
  engineVersion: '2.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0-adolescent',
  attemptNo: 1,
  config,
  randomSeed: 'seed-1',
}

let currentTime = 1000

beforeEach(() => {
  vi.useFakeTimers()
  currentTime = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const practiceCorrectDisplay = (): number => {
  const practiceItem = ICARMATRIX_V2_BANK.find((item) => item.matrixType === '3x3')!
  const order = icarmatrixV2OptionOrder(`${'seed-1'}:practice`, 0, practiceItem.responses.length)
  return order.indexOf(0)
}

const enterFormal = async (onTrialComplete: ReturnType<typeof vi.fn>) => {
  render(<IcarmatrixV2Task taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => { vi.advanceTimersByTime(300) })
  fireEvent.click(screen.getAllByRole('button')[practiceCorrectDisplay()])
  await act(async () => { vi.advanceTimersByTime(0) })
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
  await act(async () => { vi.advanceTimersByTime(400) })
}

describe('IcarmatrixV2Task', () => {
  it('renders bank SVGs and submits the correct option with echoed bankItemId', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    render(<IcarmatrixV2Task taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(300) })
    fireEvent.click(screen.getAllByRole('button')[practiceCorrectDisplay()])
    await act(async () => { vi.advanceTimersByTime(0) })
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => {})
    await act(async () => { vi.advanceTimersByTime(400) })
    const plan = generateIcarmatrixV2Plan('seed-1', 2, '3x3')
    const bankItem = ICARMATRIX_V2_BANK[plan[0]]
    expect(screen.getAllByRole('button', { name: /选项/ })).toHaveLength(6)
    const order = icarmatrixV2OptionOrder('seed-1', 0, bankItem.responses.length)
    const correctDisplay = order.indexOf(0)
    currentTime += 2500
    fireEvent.pointerDown(screen.getByLabelText(`选项 ${correctDisplay + 1}`))
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({
      trialIndex: 0,
      bankItemId: bankItem.itemId,
      responseIndex: correctDisplay,
    })
    expect(onTrialComplete.mock.calls[0][0].rtMs).toBe(2500)
    expect(onTaskComplete).not.toHaveBeenCalled()
  })

  it('records a timeout as null response when nothing is clicked', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    await act(async () => { vi.advanceTimersByTime(30000) })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ trialIndex: 0, responseIndex: null, rtMs: null })
  })
})
