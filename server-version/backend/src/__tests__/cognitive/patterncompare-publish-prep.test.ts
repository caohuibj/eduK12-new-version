import { describe, expect, it } from 'vitest'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { resolveCognitiveProtocolPresentation } from '../../modules/cognitive/protocol-presentation'
import type { FrozenReportSnapshot } from '../../modules/cognitive/profile-freeze'

const entry = getCognitiveRegistryEntry('patterncompare', '1.0.0', '1.0.0')
if (!entry) throw new Error('patterncompare registry entry missing')

const frozenFor = (profile: 'standard' | 'research'): FrozenReportSnapshot => ({
  profile,
  randomizationAlgorithmVersion: entry.randomizationAlgorithmVersion,
  profileDefinitionVersion: entry.profileDefinitionVersion,
  metricDefinitionVersion: entry.metricDefinitionVersion,
  qualityDefinitionVersion: entry.qualityDefinitionVersion,
  reportDefinitionVersion: entry.reportDefinitionVersion,
  reportCaveats: entry.profiles[profile].reportCaveats,
  metricDefinitions: entry.metricDefinitions,
  qualityDefinitions: entry.qualityDefinitions,
  reportDefinition: entry.reportDefinition,
})

const metrics = {
  correctPerMinute: 42,
  accuracy: 0.9,
  medianCorrectRtMs: 620,
  lapseRate: 0.05,
  correctCount: 38,
  completedTrialCount: 42,
}

const build = (profile: 'standard' | 'research') => buildCognitiveSingleTaskReport({
  testType: 'patterncompare',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  profile,
  frozenReport: frozenFor(profile),
  score: 90,
  metrics,
  qualityFlags: { interpretable: true },
  reference: null,
})

describe('Pattern Comparison publish-prep protocol presentation', () => {
  it('maps only the reviewed exact identity to Pilot and Research Ready tiers', () => {
    expect(resolveCognitiveProtocolPresentation({
      testType: 'patterncompare',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      profile: 'standard',
    })).toMatchObject({ tier: 'PILOT', profileLabel: 'Pilot 版', showProductIndex: false })

    expect(resolveCognitiveProtocolPresentation({
      testType: 'patterncompare',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      profile: 'research',
    })).toMatchObject({ tier: 'RESEARCH_READY', profileLabel: 'Research Ready 版', showProductIndex: false })

    expect(resolveCognitiveProtocolPresentation({
      testType: 'flanker',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      profile: 'standard',
    })).toBeNull()
  })

  it('uses tentative task-level language for Pilot without exposing a misleading product index', () => {
    const report = build('standard')
    expect(report).not.toBeNull()
    expect(report?.profileLabel).toBe('Pilot 版')
    expect(report?.interpretationSummary).toContain('提示')
    expect(report?.interpretationSummary).toContain('初步任务表现参考')
    expect(report?.caveats.join(' ')).toContain('60 秒')
    expect(report?.showProductIndex).toBe(false)
    expect(report?.productIndex).toBeNull()
  })

  it('uses stronger but task-bounded language for the Research Ready protocol', () => {
    const report = build('research')
    expect(report).not.toBeNull()
    expect(report?.profileLabel).toBe('Research Ready 版')
    expect(report?.interpretationSummary).toContain('显示')
    expect(report?.interpretationSummary).toContain('较稳定的单次任务证据')
    expect(report?.caveats.join(' ')).toContain('90 秒')
    expect(report?.caveats.join(' ')).toContain('不代表人口常模')
    expect(report?.showProductIndex).toBe(false)
  })
})
