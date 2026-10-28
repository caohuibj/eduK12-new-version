import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_REGISTRY, getScaleInstrumentSource, getScaleInstrumentValidation, resolveFrozenScaleInstructionForScale } from '../../../modules/scale/onboarding/instrument-registry'
import { projectExternalScaleScores } from '../../../modules/scale/projection/serialization'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { previewScaleInstrument } from '../../../modules/scale/onboarding/preview'

const packages = [
  ['ipip_neo_c1_self_efficacy10', '1.0.1'],
  ['ipip_neo_c5_self_discipline10', '1.0.0'],
  ['ipip_nfc10', '1.0.1'],
] as const
for (const [short, reportVersion] of packages) {
  const identity = { instrumentKey: `${short}_zh_cn_research`, instrumentVersion: '1.0.0' }
  const docs = resolve(`../../docs/scale-instruments/research-drafts/${short}/1.0.0`)
  describe(`${short} selected intake`, () => {
    it('binds existing working instructions and preserves manual review states', () => {
      const bilingual = JSON.parse(readFileSync(resolve(docs, 'bilingual-content.json'), 'utf8'))
      const source = getScaleInstrumentSource(identity.instrumentKey, identity.instrumentVersion)!
      expect(source.instruction).toMatchObject({ text: bilingual.instructions, version: '1.0.0', language: 'zh-CN' })
      expect(source.instruction!.source).toContain('b92c69aefa2472775fa7ee86b9c208366886c908')
      expect(getScaleInstrumentValidation(identity.instrumentKey, identity.instrumentVersion)).toEqual({ valid: true, issues: [] })
      expect(SCALE_INSTRUMENT_REGISTRY.listSources().filter(row => row.identity.instrumentKey === identity.instrumentKey)).toHaveLength(1)
      expect(SCALE_INSTRUMENT_REGISTRY.getExecutable(identity.instrumentKey, identity.instrumentVersion)?.definition.items).toHaveLength(10)
      expect(resolveFrozenScaleInstructionForScale({ code: identity.instrumentKey, instrumentVersion: identity.instrumentVersion, instrumentClass: 'STANDARD' })).toEqual({ text: bilingual.instructions, version: '1.0.0', language: 'zh-CN', origin: 'INSTRUMENT_SOURCE' })
      const preview = previewScaleInstrument({ ...identity, locale: 'zh-CN', territory: 'CN', deploymentModes: ['STANDALONE'] })
      expect(preview.allowActivation).toBe(true)
      expect(preview.blockers).toEqual([])
      expect(preview.manualReview.localization).toContain('LOCALIZATION_REVIEW_PENDING')
      expect(source.catalog.catalogStatus).toBe('CANDIDATE')
      expect(source.catalog.scientificMaturity).toBe('PILOT')
      expect(source.localization?.expertReviewStatus).toBe('PENDING')
      expect(source.scientificReview).toBeUndefined()
    })

    it('consumes retained reports with exact versions, score direction and true counts without rescoring', () => {
      const prior = parseScaleResultV2(JSON.parse(readFileSync(resolve(docs, 'synthetic-report-example.json'), 'utf8')))
      const source = getScaleInstrumentSource(identity.instrumentKey, identity.instrumentVersion)!
      expect(prior.instrument.code).toBe(identity.instrumentKey)
      expect(prior.method.instrumentVersion).toBe('1.0.0')
      expect(prior.method.definitionHash).toBe(hashScaleDefinition(source.executable!.definition))
      expect(prior.method.scoringVersion).toBe('1.0.0')
      expect(prior.method.reportVersion).toBe(reportVersion)
      expect(prior.interpretations[0].interpretation).toBe(source.executable!.definition.report.interpretations[0].summary)
      const projected = projectExternalScaleScores(prior.scores)
      expect(projected).toHaveLength(1)
      expect(projected[0].range).toEqual({ min: 10, max: 50 })
      expect(projected[0].expectedItems).toHaveLength(10)
      expect(projected[0].answeredItems).toHaveLength(10)
      expect(projected[0].description).toBe(source.executable!.definition.scoring.scores[0].description)
      expect(projected[0].direction).toBe('higher_is_more')
      expect(prior.references).toEqual([])
      expect(prior.interpretations[0].label).toBeNull()
      expect(prior.interpretations[0].referenceVersion).toBeNull()
    })
  })
}
