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
    expect(summary.warnings.join(' ')).toMatch(/安全重挂/)
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
      warnings: ['当前冻结认知任务版本没有可展示的 readiness profile。'],
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
      facts: ['Bundle 嵌入运行：支持', '当前 runtime 支持状态：支持'],
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
