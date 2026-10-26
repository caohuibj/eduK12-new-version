import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { SCALE_INSTRUMENT_SOURCE as previous } from '../../../modules/scale/instruments/ffmq15_zh_cn_research/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as current } from '../../../modules/scale/instruments/ffmq15_zh_cn_research/1.0.1/instrument'
import { defineScaleInstrumentSource } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { parseScaleResultV2 } from '../../../modules/scale/scale-result'

const oldDefinition = previous.executable!.definition, definition = current.executable!.definition
const description = "按反向题规则转换后，三题等权求和3–15，更多表示该侧面自报更符合，不能推断疗效。"
const immutablePreviousFiles: Record<string, string> = {
  "src/modules/scale/instruments/ffmq15_zh_cn_research/1.0.0/THIRD_PARTY_LICENSE.md": "56df40b1f2f12630a11ed6169c1731d97dfa82a09d31d30dc0bf380ef3b805b5",
  "src/modules/scale/instruments/ffmq15_zh_cn_research/1.0.0/instrument.ts": "9d0a31071b0e2df3edc98c8c2945dc6e926a4be28e6158e042014b3895473498",
  "src/modules/scale/instruments/ffmq15_zh_cn_research/1.0.0/source.json": "14cb5952f23bfce7fa4a56595444fe892908164b3c19af13ea24da9225d7c7ff",
  "../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/validation.md": "4ac3788d53feac46bb192396f34f919b16ea385108e0da14271fd1c629265018",
  "../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/instruction.for-pr356.json": "52b2ebc57765d94173931fbb2f425f8fb9e9dd69b142f709e06378704b46cb25",
  "../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/report-example.md": "c7338e8fa01eb9533c347ec45e2df1d578eb2ddabccc7bc8d23afbf881233e55",
  "../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/bilingual-content.json": "8fdcd7b30b62143495f165c049bda8c2fef44c4978c83d486b081a57ef6a111a",
  "../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/README.md": "ca16c833c77ebe0b7e035010d5a933dd274e44f2b96abaeb444f9bbe9b975cdc",
  "../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/take-home-message.md": "64c30f7ef2c11f1f9262b7d16d917324932af34c64f2b33b84b7525979340222",
  "../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/references.md": "9985e8cc66312c4d8626a9e1c14f049634df748bf37d2c7585fb002076b905d1",
  "../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/administration.md": "36ef45ca5e43b9a7e14b025558f4729b4e2d571940f58f45bf34a8156ad7ecfa",
  "../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/report-result.synthetic.json": "1bd27f1b1d1b3959c603881f81e79595b09b9019ccd100ae07326ca2ca1acd97",
  "../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/scoring-and-parameters.md": "0adb806d73ee78547c3d3f7db12ee9ded01dcdddc5f98cb1148cb67f720b9747",
  "src/__tests__/scale/instruments/ffmq15_zh_cn_research.test.ts": "e22c491d3db50e66c2e82829fb109d84a72ddce7b19b21dcd07b791114019384"
}

describe('ffmq15 1.0.1 scoring-description revision only', () => {
  it('validates the new identity and retained independent report/localization/catalog versions', () => {
    expect(() => defineScaleInstrumentSource(current)).not.toThrow()
    expect(current.identity).toEqual({ instrumentKey: 'ffmq15_zh_cn_research', instrumentVersion: '1.0.1' })
    expect(current.executable!.releaseStatus).toBe('DRAFT')
    expect(definition.scoring.scoringVersion).toBe('1.0.1')
    expect(definition.report.reportVersion).toBe('1.0.0')
    expect(current.localization?.localizationVersion).toBe('1.0.0')
    expect(definition.versionAxes?.localizationVersion).toBe('1.0.0')
    expect(current.catalog.catalogManifestVersion).toBe(1)
    for (const policy of [current.applicability, current.disclosure, current.usageRequirements]) expect(policy?.policyVersion).toBe('ffmq15_zh_cn_research-1.0.1')
  })
  it('preserves pinned bytes of the old source package, research files and original test', () => {
    for (const [path, hash] of Object.entries(immutablePreviousFiles)) expect(createHash('sha256').update(readFileSync(resolve(path))).digest('hex'), path).toBe(hash)
  })
  it('corrects five descriptions and changes only declared revision metadata', () => {
    expect(definition.scoring.scores.map(s => s.description)).toEqual(Array(5).fill(description))
    expect(definition.scoring.scores.every(s => !s.description?.includes('三题反向后'))).toBe(true)
    const normalized = structuredClone(current)
    normalized.identity.instrumentVersion = previous.identity.instrumentVersion
    normalized.executable!.definition.scoring.scoringVersion = oldDefinition.scoring.scoringVersion
    normalized.executable!.definition.scoring.scores.forEach((s, i) => { s.description = oldDefinition.scoring.scores[i].description })
    normalized.applicability!.policyVersion = previous.applicability!.policyVersion
    normalized.disclosure!.policyVersion = previous.disclosure!.policyVersion
    normalized.usageRequirements!.policyVersion = previous.usageRequirements!.policyVersion
    expect(normalized).toEqual(previous)
  })
  it('checks all retained vectors for old/new numeric equivalence in one contract', () => {
    expect(current.executable!.goldenCases).toEqual(previous.executable!.goldenCases)
    const numeric = (o: ReturnType<typeof scoreScale>) => ({ quality: o.quality, itemScores: o.itemScores, scores: o.scores.map(({ key, value, range, status, prorated }) => ({ key, value, range, status, prorated })) })
    for (const v of previous.executable!.goldenCases) expect(numeric(scoreScale(definition, v.answers)), v.name).toEqual(numeric(scoreScale(oldDefinition, v.answers)))
  })
  it('validates actual mixed raw result descriptions and instrument/scoring/report versions', () => {
    const result = parseScaleResultV2(JSON.parse(readFileSync(resolve('../../docs/scale-instruments/research-drafts/ffmq15/1.0.1/report-result.synthetic.json'), 'utf8')))
    expect(result.instrument.instrumentVersion).toBe('1.0.1')
    expect(result.method.instrumentVersion).toBe('1.0.1')
    expect(result.method.scoringVersion).toBe('1.0.1')
    expect(result.method.reportVersion).toBe('1.0.0')
    expect(result.method.localizationVersion).toBe('1.0.0')
    expect(result.scores.map(s => s.description)).toEqual(Array(5).fill(description))
    const mixed = previous.executable!.goldenCases.find(v => v.name === 'mixed_independent')!
    expect(Object.fromEntries(result.scores.map(s => [s.key, s.value]))).toEqual(mixed.expected.scores)
    expect(result.quality.status).toBe(mixed.expected.quality)
    expect(result.interpretations.map(i => i.interpretation)).toEqual(definition.report.interpretations.map(i => i.summary))
  })
})
