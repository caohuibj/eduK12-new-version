import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as oldSource } from '../../../modules/scale/instruments/chime_s24_zh_cn_research/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/chime_s24_zh_cn_research/1.0.1/instrument'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'

const description = '反向题规则转换后，更多表示较少急于避开不愉快情绪或疼痛体验；不表示疼痛或不适更多，不作人群高低或临床判断。'
const oldFileHashes: Record<string, string> = {
  "THIRD_PARTY_LICENSE.md": "7bbf33ae85aa6623ef5880ecf5dae35f6b1976e60e545567331f0534226a9e77",
  "instrument.ts": "47ab5f4601d09c6939028f9304a5a90e350410cdbeb24c0f458c6daa1323136f",
  "source.json": "6917748d9ac9a5c32f0deebd4c8793f2eda5b976269ac14cecaae1afadc0eb64"
}

it('CHIME-S24 1.0.1 changes only openness score wording and version identities, preserving all eight golden vectors', () => {
  const previous = projectScalePackage(oldSource)!, current = projectScalePackage(source)!
  const before = previous.definition, after = current.definition
  expect(source.identity).toEqual({ instrumentKey: 'chime_s24_zh_cn_research', instrumentVersion: '1.0.1' })
  expect(current.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogManifestVersion).toBe(1)
  expect(after.scoring.scoringVersion).toBe('1.0.1')
  expect(after.report.reportVersion).toBe('1.0.0')
  expect(after.versionAxes?.localizationVersion).toBe('1.0.0')
  expect(after.scoring.scores.find(s => s.key === 'openness')?.description).toBe(description)
  for (const [filename, sha256] of Object.entries(oldFileHashes)) {
    const path = resolve(__dirname, '../../../modules/scale/instruments/chime_s24_zh_cn_research/1.0.0', filename)
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(sha256)
  }
  const restored = structuredClone(source)
  restored.identity.instrumentVersion = oldSource.identity.instrumentVersion
  restored.executable!.definition.scoring.scoringVersion = before.scoring.scoringVersion
  restored.executable!.definition.scoring.scores.find(s => s.key === 'openness')!.description = before.scoring.scores.find(s => s.key === 'openness')!.description
  expect(restored).toEqual(oldSource)
  expect(after.scoring.itemRules).toEqual(before.scoring.itemRules)
  expect(current.goldenCases).toEqual(previous.goldenCases)
  expect(current.goldenCases).toHaveLength(8)
  for (const fixture of current.goldenCases) {
    const oldOutput = scoreScale(before, fixture.answers), newOutput = scoreScale(after, fixture.answers)
    expect(newOutput.itemScores).toEqual(oldOutput.itemScores)
    expect(newOutput.quality).toEqual(oldOutput.quality)
    expect(Object.fromEntries(newOutput.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
    expect(newOutput.quality.status).toBe(fixture.expected.quality)
    expect(newOutput.scores.map(s => s.key)).toEqual(fixture.expected.totalScoreKeys)
    expect(newOutput.scores.map(s => ({ ...s, description: undefined }))).toEqual(oldOutput.scores.map(s => ({ ...s, description: undefined })))
  }
  const fixture = current.goldenCases.find(f => f.name === 'mixed_independent')!
  const result = parseScaleResultV2(buildScaleResult({ scaleId: 'synthetic-chime-revision-1.0.1', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: after, answers: fixture.answers }))
  expect(result.instrument.instrumentVersion).toBe('1.0.1')
  expect(result.method).toMatchObject({ instrumentVersion: '1.0.1', scoringVersion: '1.0.1', reportVersion: '1.0.0', localizationVersion: '1.0.0' })
  expect(result.scores.find(s => s.key === 'openness')?.description).toBe(description)
  expect(result.interpretations.find(s => s.scoreKey === 'openness')?.interpretation).toContain('更多表示较少急于避开这些体验')
  expect(after.report).toEqual(before.report)
  expect(result.interpretations).toHaveLength(9)
  if (process.env.CHIME_REVISION_REPORT_PATH) writeFileSync(process.env.CHIME_REVISION_REPORT_PATH, JSON.stringify(result, null, 2) + '\n')
})
