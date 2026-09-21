import { describe, expect, it } from 'vitest'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { resolveCognitiveProtocolPresentation } from '../../modules/cognitive/protocol-presentation'
import { flankerSequence } from '../../modules/cognitive/randomization'
import {
  freezeAssignmentProfile,
  readFrozenReport,
  type FrozenReportSnapshot,
} from '../../modules/cognitive/profile-freeze'

const entry = getCognitiveRegistryEntry('flanker', '1.0.0', '1.0.0')
if (!entry) throw new Error('flanker registry entry missing')

const baseConfig = {
  totalTrials: 80,
  congruentRatio: 0.5,
  stimulusMs: 1800,
  isiMs: 400,
  validRtFloorMs: 150,
  stimulusSetVersion: 'arrows-v1.0.0',
  report: { reportVersion: '1.0.0', referenceMode: 'none' },
}

const frozenFor = (profile: 'standard' | 'research'): FrozenReportSnapshot => {
  const frozen = freezeAssignmentProfile({ entry, baseConfig, profile })
  const report = readFrozenReport(frozen.resolvedReportSnapshotEncrypted)
  if (!report) throw new Error(`missing frozen report for ${profile}`)
  return report
}

const metrics = {
  flankerEffectMs: 72,
  incongruentAccuracy: 0.85,
  congruentAccuracy: 0.93,
  errorCost: 0.08,
  accuracy: 0.89,
  medianRtCongruent: 520,
  medianRtIncongruent: 592,
  omissionRate: 0.02,
}

const build = (profile: 'standard' | 'research') => buildCognitiveSingleTaskReport({
  testType: 'flanker',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  profile,
  frozenReport: frozenFor(profile),
  score: 89,
  metrics,
  qualityFlags: { interpretable: true },
  reference: null,
})

describe('Flanker publish-prep protocol presentation', () => {
  it('keeps balanced Pilot and Research Ready doses', () => {
    expect(entry.profiles.standard.configPatch).toMatchObject({ totalTrials: 80 })
    expect(entry.profiles.research.configPatch).toMatchObject({ totalTrials: 160 })

    for (const totalTrials of [80, 160]) {
      const sequence = flankerSequence('publish-prep-balance', totalTrials)
      const count = (target: 'left' | 'right', flanker: 'left' | 'right') => sequence
        .filter((trial) => trial.targetDirection === target && trial.flankerDirection === flanker).length
      expect(count('left', 'left')).toBe(totalTrials / 4)
      expect(count('right', 'right')).toBe(totalTrials / 4)
      expect(count('left', 'right')).toBe(totalTrials / 4)
      expect(count('right', 'left')).toBe(totalTrials / 4)
    }
  })

  it('maps the reviewed exact identity to Pilot and Research Ready tiers', () => {
    expect(resolveCognitiveProtocolPresentation({
      testType: 'flanker',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      profile: 'standard',
    })).toMatchObject({ tier: 'PILOT', profileLabel: 'Pilot 版', showProductIndex: false })

    expect(resolveCognitiveProtocolPresentation({
      testType: 'flanker',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      profile: 'research',
    })).toMatchObject({ tier: 'RESEARCH_READY', profileLabel: 'Research Ready 版', showProductIndex: false })
  })

  it('freezes the reviewed tier, wording and product-index policy with the assignment', () => {
    const pilot = frozenFor('standard')
    expect(pilot).toMatchObject({
      protocolTier: 'PILOT',
      profileLabel: 'Pilot 版',
      protocolShowProductIndex: false,
    })
    expect(pilot.participantConclusion).toContain('提示')
    expect(pilot.reportCaveats.join(' ')).toContain('80')

    const ready = frozenFor('research')
    expect(ready).toMatchObject({
      protocolTier: 'RESEARCH_READY',
      profileLabel: 'Research Ready 版',
      protocolShowProductIndex: false,
    })
    expect(ready.participantConclusion).toContain('显示')
    expect(ready.reportCaveats.join(' ')).toContain('160')
  })

  it('uses tentative Pilot language without exposing a misleading 0-100 product index', () => {
    const report = build('standard')
    expect(report).not.toBeNull()
    expect(report?.profileLabel).toBe('Pilot 版')
    expect(report?.interpretationSummary).toContain('提示')
    expect(report?.interpretationSummary).toContain('初步任务表现参考')
    expect(report?.caveats.join(' ')).toContain('80')
    expect(report?.showProductIndex).toBe(false)
    expect(report?.productIndex).toBeNull()
  })

  it('uses stronger but task-bounded Research Ready language', () => {
    const report = build('research')
    expect(report).not.toBeNull()
    expect(report?.profileLabel).toBe('Research Ready 版')
    expect(report?.interpretationSummary).toContain('显示')
    expect(report?.interpretationSummary).toContain('较稳定的单次任务证据')
    expect(report?.caveats.join(' ')).toContain('160')
    expect(report?.caveats.join(' ')).toContain('不代表人口常模')
    expect(report?.showProductIndex).toBe(false)
  })
})
