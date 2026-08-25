import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WordlistTask } from '../tasks/wordlist/WordlistTask'
import { normalizeWordlistResponse } from '../tasks/wordlist/wordlist.utils'
import { LexicaldecisionTask } from '../tasks/lexicaldecision/LexicaldecisionTask'
import { EmotionrecognitionTask } from '../tasks/emotionrecognition/EmotionrecognitionTask'
import {
  emotionRecognitionSequence,
  lexicalDecisionSequence,
  wordlistStages,
} from '../tasks/shared/pr13Stimuli'
import { emotionAssetFor } from '../tasks/emotionrecognition/emotionAssets'

const baseContext = {
  sessionId: 'pr13-session',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  randomSeed: 'pr13-frontend-seed',
}

const emotionLabels: Record<string, string> = {
  happy: '快乐',
  sad: '悲伤',
  angry: '愤怒',
  fear: '害怕',
  disgust: '厌恶',
  surprise: '惊讶',
}

describe('PR13 frontend task contracts', () => {
  it('mirrors deterministic PR13 seed sequences and local emotion assets', () => {
    expect(wordlistStages('pr13-a', 8, 2, true)).toEqual(wordlistStages('pr13-a', 8, 2, true))
    expect(wordlistStages('pr13-a', 8, 2, true)).not.toEqual(wordlistStages('pr13-b', 8, 2, true))
    expect(wordlistStages('pr13-a', 8, 2, true).map((stage) => stage.phase)).toEqual(['immediate', 'immediate', 'delayed'])
    expect(lexicalDecisionSequence('pr13-a', 40)).toEqual(lexicalDecisionSequence('pr13-a', 40))
    expect(lexicalDecisionSequence('pr13-a', 40)).not.toEqual(lexicalDecisionSequence('pr13-b', 40))
    expect(emotionRecognitionSequence('pr13-a', 24, 4)).toEqual(emotionRecognitionSequence('pr13-a', 24, 4))
    expect(emotionRecognitionSequence('pr13-a', 24, 4)).not.toEqual(emotionRecognitionSequence('pr13-b', 24, 4))

    expect(normalizeWordlistResponse(' Ａｐｐｌｅ，  苹果！ ')).toBe('apple苹果')
    const asset = emotionAssetFor('emotion-identity-20-surprise')
    expect(asset.url).toBeTruthy()
    expect(asset.backgroundPosition).toBe('100% 100%')
    expect(asset.label).toContain('20-6')
  })

  it('keeps Wordlist practice local and exposes delayed stages without client scoring', () => {
    const onTrialComplete = vi.fn()
    render(
      <WordlistTask
        taskContext={{
          ...baseContext,
          testType: 'wordlist',
          config: { listLength: 8, learningRounds: 2, delayedEnabled: true, delayedDelayMs: 1, studyMsPerWord: 100, recallTimeoutMs: 1000 },
        }}
        trialIndex={0}
        onTrialComplete={onTrialComplete}
      />,
    )
    fireEvent.click(screen.getByText('开始练习'))
    expect(screen.getByText(/练习 1 \/ 4/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
    expect(screen.queryByText('任务表现指数')).toBeNull()
  })

  it('lets Wordlist users remove recall chips and stops at the server schema limit', async () => {
    vi.useFakeTimers()
    try {
      const onTrialComplete = vi.fn()
      render(
        <WordlistTask
          taskContext={{
            ...baseContext,
            testType: 'wordlist',
            config: { listLength: 8, learningRounds: 2, delayedEnabled: false, delayedDelayMs: 1, studyMsPerWord: 1, recallTimeoutMs: 1000 },
          }}
          trialIndex={0}
          onTrialComplete={onTrialComplete}
        />,
      )
      fireEvent.click(screen.getByText('开始练习'))
      for (let tick = 0; tick < 10; tick += 1) {
        await act(async () => {
          vi.advanceTimersByTime(1000)
          await Promise.resolve()
        })
      }
      const input = screen.getByLabelText('输入回忆词')
      for (let index = 0; index < 65; index += 1) {
        fireEvent.change(input, { target: { value: `词${index}` } })
        fireEvent.keyDown(input, { key: 'Enter' })
      }
      expect(screen.getByText(/最多输入 64 个词/)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: '删除第 1 个输入' }))
      expect(screen.queryByText('词0')).toBeNull()
      expect(screen.getAllByRole('button', { name: /删除第/ })).toHaveLength(63)
      expect(onTrialComplete).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps Lexical Decision practice out of storage and submits verified metadata only', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    const context = {
      ...baseContext,
      testType: 'lexicaldecision',
          config: { totalTrials: 40, stimulusMs: 1200, trialTimeoutMs: 3000, isiMs: 0, validRtFloorMs: 150 },
    }
    const practice = lexicalDecisionSequence('lexicaldecision-practice-v1.0.0', 4)
    render(<LexicaldecisionTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    practice.forEach((item, index) => {
      fireEvent.click(screen.getByRole('button', { name: item.lexicality === 'real' ? /真词/ : /伪词/ }))
      fireEvent.click(screen.getByText(index === practice.length - 1 ? '查看练习结果' : '下一题'))
    })
    expect(onTrialComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('开始正式测验'))
    fireEvent.click(screen.getByRole('button', { name: /真词/ }))
    await waitFor(() => expect(onTrialComplete).toHaveBeenCalledTimes(1))
    const payload = onTrialComplete.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual([
      'frequencyBand', 'interrupted', 'lexicality', 'pseudowordGeneratorVersion',
      'response', 'rtMs', 'stimulusId', 'stimulusVersion', 'wordLength',
    ])
    expect(payload).not.toHaveProperty('correct')
    expect(payload).not.toHaveProperty('text')
  })

  it('blocks Lexical Decision keyboard responses during the frozen ISI', async () => {
    vi.useFakeTimers()
    try {
      const onTrialComplete = vi.fn().mockResolvedValue(true)
      const context = {
        ...baseContext,
        testType: 'lexicaldecision',
        config: { totalTrials: 40, stimulusMs: 1200, trialTimeoutMs: 3000, isiMs: 300, validRtFloorMs: 150 },
      }
      const practice = lexicalDecisionSequence('lexicaldecision-practice-v1.0.0', 4)
      render(<LexicaldecisionTask taskContext={context} trialIndex={1} onTrialComplete={onTrialComplete} />)
      fireEvent.click(screen.getByText('开始练习'))
      practice.forEach((item, index) => {
        fireEvent.click(screen.getByRole('button', { name: item.lexicality === 'real' ? /真词/ : /伪词/ }))
        fireEvent.click(screen.getByText(index === practice.length - 1 ? '查看练习结果' : '下一题'))
      })
      fireEvent.click(screen.getByText('开始正式测验'))
      await act(async () => { await Promise.resolve() })
      fireEvent.keyDown(window, { key: '1' })
      expect(onTrialComplete).not.toHaveBeenCalled()
      await act(async () => { vi.advanceTimersByTime(300) })
      fireEvent.keyDown(window, { key: '1' })
      await act(async () => { await Promise.resolve() })
      expect(onTrialComplete).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows Emotion Recognition feedback for all six practice categories and submits local stimulus metadata', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    const context = {
      ...baseContext,
      testType: 'emotionrecognition',
      config: { totalTrials: 24, stimulusMs: 3000, trialTimeoutMs: 5000, isiMs: 0, validRtFloorMs: 200 },
    }
    const practice = emotionRecognitionSequence('emotionrecognition-practice-v1.0.0', 6, 1)
    render(<EmotionrecognitionTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    practice.forEach((item, index) => {
      fireEvent.click(screen.getByRole('button', { name: `选择${emotionLabels[item.emotion]}` }))
      fireEvent.click(screen.getByText(index === practice.length - 1 ? '查看练习结果' : '下一题'))
    })
    expect(screen.getByText(/练习正确 6 \/ 6/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('开始正式测验'))
    fireEvent.click(screen.getAllByRole('button', { name: /选择/ })[0])
    await waitFor(() => expect(onTrialComplete).toHaveBeenCalledTimes(1))
    const payload = onTrialComplete.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['interrupted', 'responseEmotion', 'rtMs', 'stimulusId', 'stimulusVersion'])
    expect(payload).not.toHaveProperty('expectedEmotion')
    expect(payload).not.toHaveProperty('correct')
  })

  it('blocks Emotion Recognition keyboard responses during the frozen ISI', async () => {
    vi.useFakeTimers()
    try {
      const onTrialComplete = vi.fn().mockResolvedValue(true)
      const context = {
        ...baseContext,
        testType: 'emotionrecognition',
        config: { totalTrials: 24, stimulusMs: 3000, trialTimeoutMs: 5000, isiMs: 300, validRtFloorMs: 200 },
      }
      const practice = emotionRecognitionSequence('emotionrecognition-practice-v1.0.0', 6, 1)
      render(<EmotionrecognitionTask taskContext={context} trialIndex={1} onTrialComplete={onTrialComplete} />)
      fireEvent.click(screen.getByText('开始练习'))
      practice.forEach((item, index) => {
        fireEvent.click(screen.getByRole('button', { name: `选择${emotionLabels[item.emotion]}` }))
        fireEvent.click(screen.getByText(index === practice.length - 1 ? '查看练习结果' : '下一题'))
      })
      fireEvent.click(screen.getByText('开始正式测验'))
      await act(async () => { await Promise.resolve() })
      fireEvent.keyDown(window, { key: '1' })
      expect(onTrialComplete).not.toHaveBeenCalled()
      await act(async () => { vi.advanceTimersByTime(300) })
      fireEvent.keyDown(window, { key: '1' })
      await act(async () => { await Promise.resolve() })
      expect(onTrialComplete).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
