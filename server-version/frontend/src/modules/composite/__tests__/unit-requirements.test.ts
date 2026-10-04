import { describe, expect, it } from 'vitest'
import type { CompositeCurrentItem } from '../types'
import { describeCompositeUnitRequirements } from '../unit-requirements'

const base = {
  id: 'slot-1',
  position: 0,
  required: true,
} as const

describe('Bundle unit requirement summary', () => {
  it('uses the exact Cognitive readiness profile instead of viewport inference', () => {
    const item: CompositeCurrentItem = {
      ...base,
      type: 'COGNITIVE',
      cognitiveSession: {
        sessionId: 'session-1',
        testType: 'reaction',
        engineVersion: '1.0.0',
      } as CompositeCurrentItem['cognitiveSession'],
    }

    const summary = describeCompositeUnitRequirements(item)
    expect(summary.status).toBe('known')
    expect(summary.facts).toContain('可用输入：键盘、鼠标/指针、触控')
    expect(summary.warnings.join(' ')).toMatch(/重新开始/)
  })

  it('keeps unknown Cognitive versions unknown', () => {
    const item: CompositeCurrentItem = {
      ...base,
      type: 'COGNITIVE',
      cognitiveSession: {
        sessionId: 'session-1',
        testType: 'unknown-task',
        engineVersion: '9.9.9',
      } as CompositeCurrentItem['cognitiveSession'],
    }

    expect(describeCompositeUnitRequirements(item)).toEqual({
      status: 'unknown',
      facts: [],
      warnings: ['设备要求暂不可用，开始任务后请按页面提示检查设备。'],
    })
  })

  it('describes only frozen Situational runtime capabilities', () => {
    const item: CompositeCurrentItem = {
      ...base,
      type: 'SITUATIONAL',
      instrument: {
        key: 'sjt-1',
        version: '1.0.0',
        definitionHash: 'definition',
        compiledRuntimeHash: 'runtime',
        scoringVersion: '1.0.0',
        definition: {},
        runtimeCapabilities: {
          standalone: true,
          embedded: true,
          aggregateEligible: true,
          collectionFacts: true,
          supported: true,
        },
      },
    }

    expect(describeCompositeUnitRequirements(item)).toEqual({
      status: 'partial',
      facts: ['问卷内参与：支持', '当前任务：支持'],
      warnings: [],
    })
  })

  it('does not invent requirements for Form or Scale when parent data does not declare them', () => {
    expect(describeCompositeUnitRequirements({ ...base, type: 'FORM_SECTION' })).toEqual({
      status: 'unknown', facts: [], warnings: [],
    })
    expect(describeCompositeUnitRequirements({ ...base, type: 'SCALE', scale: { id: 'scale-1', name: 'Scale' } })).toEqual({
      status: 'unknown', facts: [], warnings: [],
    })
  })
})
