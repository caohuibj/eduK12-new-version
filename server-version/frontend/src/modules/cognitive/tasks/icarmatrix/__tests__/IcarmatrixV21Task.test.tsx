import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { IcarmatrixV21Task } from '../IcarmatrixV21Task'
import { generateIcarmatrixV2Plan, ICARMATRIX_V2_BANK, icarmatrixV2OptionOrder } from '../generator-v21'
import { PRACTICE_MATRIX_ITEMS } from '../practice-items'

const config = {
  totalTrials: 4,
  matrixType: '3x3' as const,
  stimulusSetVersion: 'matgen-reviewed-v1.0.0' as const,
  fixationMs: 400,
  timeoutMs: 30000,
  validRtFloorMs: 500,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'none' as const },
}

const context = {
  sessionId: 's1',
  testType: 'icarmatrix',
  engineVersion: '2.1.0',
  scoringVersion: '1.1.0',
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
  const practiceItem = PRACTICE_MATRIX_ITEMS['3x3']
  const order = icarmatrixV2OptionOrder(`${'seed-1'}:practice`, 0, practiceItem.responses.length)
  return order.indexOf(0)
}

const enterFormal = async (onTrialComplete: ReturnType<typeof vi.fn<(payload: Record<string, unknown>) => Promise<void | boolean>>>) => {
  const view = render(<IcarmatrixV21Task taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => { vi.advanceTimersByTime(300) })
  fireEvent.click(screen.getAllByRole('button', { name: /练习选项/ })[practiceCorrectDisplay()])
  await act(async () => { vi.advanceTimersByTime(0) })
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
  await act(async () => { vi.advanceTimersByTime(400) })
  return view
}

describe('IcarmatrixV21Task', () => {
  it('requires reviewing instructions and repeating practice after a wrong choice', async () => {
    const onTrialComplete = vi.fn()
    render(<IcarmatrixV21Task taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(300) })
    const wrong = (practiceCorrectDisplay() + 1) % 6
    fireEvent.click(screen.getAllByRole('button', { name: /练习选项/ })[wrong])
    expect(screen.queryByText('开始正式测评')).toBeNull()
    fireEvent.click(screen.getByText('重新阅读说明并练习'))
    expect(screen.getByText('开始练习')).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('records a click after the deadline as no response even before the timer callback runs', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    currentTime += 30001
    fireEvent.click(screen.getByLabelText('选项 1'))
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ responseIndex: null, rtMs: null })
  })

  it('uses three choices per row on small screens and announces practice choices', async () => {
    render(<IcarmatrixV21Task taskContext={context} trialIndex={0} onTrialComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(300) })
    const choices = screen.getAllByRole('button', { name: /练习选项/ })
    expect(choices).toHaveLength(6)
    expect(choices[0].closest('.grid')?.className).toContain('grid-cols-3 sm:grid-cols-6')
    fireEvent.click(choices[practiceCorrectDisplay()])
    expect(choices[practiceCorrectDisplay()].className).toContain('ring-2')
    expect(choices.every((node) => (node as HTMLButtonElement).disabled)).toBe(true)
  })

  it('never shares practice figures with scored-bank SVGs', () => {
    const realSvgs = new Set(ICARMATRIX_V2_BANK.flatMap((item) =>
      [...item.cells, ...item.responses.map((response) => response.svg)]))
    expect(PRACTICE_MATRIX_ITEMS['2x2'].cells).toHaveLength(3)
    expect(PRACTICE_MATRIX_ITEMS['3x3'].cells).toHaveLength(8)
    for (const practice of Object.values(PRACTICE_MATRIX_ITEMS)) {
      for (const svg of [...practice.cells, ...practice.responses.map((response) => response.svg)]) {
        expect(realSvgs.has(svg)).toBe(false)
      }
    }
  })

  it('ignores a late acknowledgement after the parent advances to the next trial', async () => {
    let acknowledge!: (accepted: boolean) => void
    const pending = new Promise<boolean>((resolve) => { acknowledge = resolve })
    const onTrialComplete = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(true)
    const view = await enterFormal(onTrialComplete)
    fireEvent.click(screen.getByLabelText('选项 1'))
    await act(async () => { view.rerender(
      <IcarmatrixV21Task taskContext={context} trialIndex={1}
        onTrialComplete={onTrialComplete} onTaskComplete={vi.fn().mockResolvedValue(undefined)} />
    ) })
    await act(async () => { acknowledge(true); await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(screen.getByText('第 2 / 4 题')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('选项 1'))
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(onTrialComplete).toHaveBeenCalledTimes(2)
    expect(onTrialComplete.mock.calls[1][0].trialIndex).toBe(1)
  })

  it('preserves the original trial payload on a failed-save retry', async () => {
    const onTrialComplete = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(undefined)
    await enterFormal(onTrialComplete)
    currentTime += 1800
    fireEvent.click(screen.getByLabelText('选项 1'))
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(screen.getByText('重试提交')).toBeTruthy()
    currentTime += 10000
    fireEvent.click(screen.getByText('重试提交'))
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(onTrialComplete).toHaveBeenCalledTimes(2)
    expect(onTrialComplete.mock.calls[0][0]).toEqual(onTrialComplete.mock.calls[1][0])
    expect(onTrialComplete.mock.calls[1][0].rtMs).toBe(1800)
  })

  it('renders bank SVGs and submits the correct option with echoed bankItemId', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    render(<IcarmatrixV21Task taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(300) })
    fireEvent.click(screen.getAllByRole('button', { name: /练习选项/ })[practiceCorrectDisplay()])
    await act(async () => { vi.advanceTimersByTime(0) })
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => {})
    await act(async () => { vi.advanceTimersByTime(400) })
    const plan = generateIcarmatrixV2Plan('seed-1', 4, '3x3')
    const bankItem = ICARMATRIX_V2_BANK[plan[0]]
    const formalChoices = screen.getAllByRole('button', { name: /^选项/ })
    expect(formalChoices).toHaveLength(6)
    expect(formalChoices[0].closest('.grid')?.className).toContain('grid-cols-3 sm:grid-cols-6')
    const order = icarmatrixV2OptionOrder('seed-1', 0, bankItem.responses.length)
    const correctDisplay = order.indexOf(0)
    currentTime += 2500
    fireEvent.click(screen.getByLabelText(`选项 ${correctDisplay + 1}`))
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
