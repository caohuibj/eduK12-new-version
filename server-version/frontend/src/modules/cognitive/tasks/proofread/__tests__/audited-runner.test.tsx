import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ProofreadTask } from '../ProofreadTask'
import { PROOFREAD_PRACTICE_ITEM as practice, buildProofreadItems } from '../prng'

let now = 1000
const config = { totalTrials: 1, stimulusSetVersion: 'proofread-zh-v1.1.0', fixationMs: 400, timeoutMs: 15000, validRtFloorMs: 300, report: { reportVersion: '1.1.0', referenceMode: 'none' as const } }
const context = { sessionId: 's1', testType: 'proofread', engineVersion: '1.1.0', scoringVersion: '1.1.0', configVersion: '1.1.0', attemptNo: 1, config, randomSeed: 'audit-seed' }
const tick = async (ms = 400) => { now += ms; await act(async () => { vi.advanceTimersByTime(ms) }) }
const choose = (index: number) => fireEvent.keyDown(window, { key: String(index + 1) })
async function startFormal() {
  fireEvent.click(screen.getByText('开始练习')); await tick()
  choose(practice.answer)
  fireEvent.click(screen.getByText('开始正式测评')); await tick()
}
beforeEach(() => { vi.useFakeTimers(); now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now) })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('proofread audited runner', () => {
  it('shows the real instruction and requires successful independent practice', async () => {
    const submit = vi.fn()
    render(<ProofreadTask taskContext={context} trialIndex={0} onTrialComplete={submit} />)
    expect(screen.queryByText(/医生 对于 病人/)).toBeNull()
    fireEvent.click(screen.getByText('开始练习')); await tick()
    expect(screen.getByText(practice.stem)).toBeTruthy()
    choose((practice.answer + 1) % 4)
    expect(screen.queryByText('开始正式测评')).toBeNull()
    fireEvent.click(screen.getByText('重读说明后再练习'))
    expect(screen.getByText('开始练习')).toBeTruthy()
    await startFormal()
    expect(submit).not.toHaveBeenCalled()
    const item = buildProofreadItems(context.randomSeed, 1)[0]
    expect(screen.getByText(item.stem)).toBeTruthy()
  })
  it('records one first response and ignores held keys and duplicate clicks', async () => {
    const submit = vi.fn().mockResolvedValue(true), finish = vi.fn()
    render(<ProofreadTask taskContext={context} trialIndex={0} onTrialComplete={submit} onTaskComplete={finish} />)
    await startFormal()
    fireEvent.keyDown(window, { key: '1', repeat: true })
    expect(submit).not.toHaveBeenCalled()
    now += 600
    const button = screen.getAllByRole('button')[0]
    fireEvent.click(button); fireEvent.click(button); choose(2)
    await act(async () => {})
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0]).toMatchObject({ responseIndex: 0, rtMs: 600 })
    expect(finish).toHaveBeenCalledTimes(1)
  })
  it('keeps the exact first answer and RT across a failed submission retry', async () => {
    const submit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), finish = vi.fn()
    render(<ProofreadTask taskContext={context} trialIndex={0} onTrialComplete={submit} onTaskComplete={finish} />)
    await startFormal(); now += 750; choose(1); await act(async () => {})
    const first = { ...submit.mock.calls[0][0] }
    expect(finish).not.toHaveBeenCalled()
    now += 9000; choose(3)
    fireEvent.click(screen.getByText('重试提交')); await act(async () => {})
    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit.mock.calls[1][0]).toEqual(first)
    expect(finish).toHaveBeenCalledTimes(1)
  })
  it('records an unanswered deadline as null and a delayed late click as timeout', async () => {
    const submit = vi.fn().mockResolvedValue(true)
    render(<ProofreadTask taskContext={context} trialIndex={0} onTrialComplete={submit} />)
    await startFormal(); now += 15001; choose(0); await act(async () => {})
    expect(submit.mock.calls[0][0]).toMatchObject({ responseIndex: null, rtMs: null })
    await tick(15000)
    expect(submit).toHaveBeenCalledTimes(1)
  })
  it('submits a true unanswered deadline exactly once', async () => {
    const submit = vi.fn().mockResolvedValue(true), finish = vi.fn()
    render(<ProofreadTask taskContext={context} trialIndex={0} onTrialComplete={submit} onTaskComplete={finish} />)
    await startFormal(); await tick(14999)
    expect(submit).not.toHaveBeenCalled()
    await tick(1)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0]).toMatchObject({ responseIndex: null, rtMs: null })
    expect(finish).toHaveBeenCalledTimes(1)
  })
  it('records visibility interruption', async () => {
    const submit = vi.fn().mockResolvedValue(true)
    render(<ProofreadTask taskContext={context} trialIndex={0} onTrialComplete={submit} />)
    await startFormal()
    const prior = Object.getOwnPropertyDescriptor(document, 'hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    fireEvent(document, new Event('visibilitychange')); now += 500; choose(0); await act(async () => {})
    expect(submit.mock.calls[0][0].interrupted).toBe(true)
    if (prior) Object.defineProperty(document, 'hidden', prior); else delete (document as unknown as { hidden?: boolean }).hidden
  })
  it.each([18, 30, 36])('completes exactly %i formal items without a silent short bank', async count => {
    const submit = vi.fn(), finish = vi.fn()
    function Host() {
      const [index, setIndex] = useState(0)
      return <ProofreadTask taskContext={{ ...context, config: { ...config, totalTrials: count } }} trialIndex={index} onTrialComplete={async payload => { submit(payload); setIndex(value => value + 1); return true }} onTaskComplete={finish} />
    }
    render(<Host />); await startFormal()
    for (let index = 0; index < count; index++) { now += 700; choose(0); await act(async () => {}); if (index + 1 < count) await tick(600) }
    expect(submit).toHaveBeenCalledTimes(count)
    expect(new Set(submit.mock.calls.map(call => call[0].itemId)).size).toBe(count)
    expect(submit.mock.calls.some(call => call[0].itemId === practice.id)).toBe(false)
    expect(finish).toHaveBeenCalledTimes(1)
  })
  it('blocks a bank/version mismatch before practice', () => {
    render(<ProofreadTask taskContext={{ ...context, config: { ...config, totalTrials: 37 } }} trialIndex={0} onTrialComplete={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByText('开始练习')).toBeNull()
  })
})
