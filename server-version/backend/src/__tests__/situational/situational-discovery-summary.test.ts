import { describe, expect, it } from 'vitest'
import { listSituationalInstrumentSummaries, listSituationalInstruments } from '../../modules/situational/situational-runtime.service'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as fixture } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

describe('Situational discovery summary', () => {
  it('preserves published card content without sending executable scenes or report templates', () => {
    const packages = [{ ...fixture, releaseStatus: 'PUBLISHED' as const }]
    const full = listSituationalInstruments(packages)
    const summary = listSituationalInstrumentSummaries(packages)
    expect(summary).toHaveLength(1)
    expect(summary[0]).toEqual({ title: full[0]!.title, key: full[0]!.key,
      version: full[0]!.version, releaseStatus: full[0]!.releaseStatus,
      scienceMaturity: full[0]!.scienceMaturity, sceneCount: full[0]!.definition.scenes.length,
      description: full[0]!.report.limitations[0] ?? null })
    expect(summary[0]).not.toHaveProperty('definition')
    expect(summary[0]).not.toHaveProperty('report')
    expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(full).length)
  })
  it('retains the existing publication filter', () => {
    expect(listSituationalInstrumentSummaries([{ ...fixture, releaseStatus: 'DRAFT' }])).toEqual([])
    expect(listSituationalInstrumentSummaries([{ ...fixture, releaseStatus: 'RETIRED' }])).toEqual([])
  })
})
