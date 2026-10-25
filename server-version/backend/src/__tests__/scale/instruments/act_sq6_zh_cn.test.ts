import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/act_sq6_zh_cn/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { hashScaleDefinition, validateScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!
const definition = pkg.definition
const codes = Array.from({ length: 6 }, (_, index) => `ACTSQ_${String(index + 1).padStart(2, '0')}`)
const answers = pkg.goldenCases.find(fixture => fixture.name === 'midpoint')!.answers
const context = 'ACT_PSYCHOTHERAPY_POST_SESSION'
const docs = new URL('../../../../../../docs/scale-instruments/research-drafts/act_sq6_zh_cn/1.0.0/', import.meta.url)
const readDoc = (name: string) => JSON.parse(readFileSync(new URL(name, docs), 'utf8'))
const stems = [
  '…接纳令人不愉快的感受、想法或身体感觉，而不是与它们对抗。',
  '…在心里与令人不愉快的感受、想法或身体感觉拉开更多距离，观察它们，而不是陷入其中。',
  '…把注意力放在此时此地（当下），而不是放在自己的未来和过去。',
  '…认识到我的感受、想法和身体感觉是我的一部分，但我不仅仅是这些感受、想法和身体感觉。',
  '…看清生活中什么对我重要，以及什么为我的生活指明方向。',
  '…在日常生活中，按照那些对我重要、并为我的生活指明方向的事来行动。',
]
const buildResult = (input = answers) => buildScaleResult({
  scaleId: 'synthetic-act-sq6-content-test',
  instrumentKey: source.identity.instrumentKey,
  name: source.catalog.identity.canonicalName,
  instrumentVersion: source.identity.instrumentVersion,
  definition,
  answers: input,
})

describe('act_sq6_zh_cn post-session-only content contract', () => {
  it('validates the new source without invented scientific approval or publication', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(validateScaleDefinition(definition, { instrumentClass: 'STANDARD', forPublish: false }).issues.filter(issue => issue.severity === 'error')).toEqual([])
    expect(source.identity).toEqual({ instrumentKey: 'act_sq6_zh_cn', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.catalog.scientificMaturity).toBe('PILOT')
    expect(source.scientificReview).toBeUndefined()
    expect(source.localization).toMatchObject({
      sourceLocale: 'en', targetLocale: 'zh-CN', adaptationMethod: 'DIRECT_TRANSLATION',
      expertReviewStatus: 'PENDING', cognitiveDebriefStatus: 'NOT_ESTABLISHED', reviewStatus: 'PENDING', localEvidenceRefs: [],
    })
    expect(source.localization?.reviewedAt).toBeUndefined()
  })

  it('retains six ordered working-translation fragments without splicing in the instruction', () => {
    expect(definition.items.map(item => item.itemCode)).toEqual(codes)
    expect(definition.items.map(item => item.content)).toEqual(stems)
    expect(definition.items.map(item => item.sortOrder)).toEqual([0, 1, 2, 3, 4, 5])
    expect(definition.items.every(item => item.required && item.randomizeOptions === false)).toBe(true)
    expect(definition.items.every(item => item.content.startsWith('…') && !item.content.includes('（XY）'))).toBe(true)
    expect(definition.display.randomizeItems).toBe(false)
    const bilingual = readDoc('bilingual-content.json')
    expect(bilingual.items.map((item: { zhWorking: string }) => item.zhWorking)).toEqual(stems)
    expect(bilingual.items.map((item: { order: number }) => item.order)).toEqual([1, 2, 3, 4, 5, 6])
    expect(bilingual.items.every((item: { reverse: boolean; componentIsValidatedSubscale: boolean }) => !item.reverse && !item.componentIsValidatedSubscale)).toBe(true)
    expect(bilingual.instructions.en).toBe('The last (XY) psychotherapy session(s) helped me…')
    expect(bilingual.instructions.zhWorking).toBe('最近的（XY）次心理治疗会谈帮助我……')
    expect(bilingual.instructions.xyMustBeSpecified).toBe(true)
    expect(bilingual.instructions.platformIntegrationStatus).toBe('NOT_INTEGRATED_DO_NOT_ADMINISTER_FROM_ITEMS_ALONE')
  })

  it('preserves all five published applicability anchors, not agreement or symptom frequency', () => {
    expect(definition.responseSets).toEqual([{
      key: 'actsq_applicability_0_4',
      options: ['不符合', '略微符合', '较为符合', '很大程度上符合', '极其符合'].map((label, score) => ({ value: String(score), label, score })),
    }])
    const bilingual = readDoc('bilingual-content.json')
    expect(bilingual.responseOptions.map((option: { en: string }) => option.en)).toEqual([
      'does not apply', 'applies slightly', 'applies fairly well', 'applies to a great extent', 'applies extremely',
    ])
    expect(bilingual.responseOptions.map((option: { zhWorking: string }) => option.zhWorking)).toEqual(definition.responseSets[0].options.map(option => option.label))
  })

  it('uses the original single mean with six positive equal-weight items, not six subscales or a sum', () => {
    expect(definition.scoring.itemRules).toEqual(codes.map(itemCode => ({ itemCode, transform: { type: 'identity' } })))
    expect(definition.scoring.scores).toHaveLength(1)
    expect(definition.scoring.scores[0]).toMatchObject({
      key: 'act_session_mean', type: 'total', direction: 'higher_is_more', canonical: true, displayPrecision: 2,
      source: { type: 'items', aggregation: 'mean', items: codes.map(itemCode => ({ itemCode, weight: 1 })) },
    })
    expect(definition.scoring.defaultMissingPolicy).toEqual({ type: 'complete_required' })
    expect(definition.scoring.scores[0].missingPolicy).toEqual({ type: 'complete_required' })
    expect(definition.report.limitations.join(' ')).toContain('平台保守缺失政策')
  })

  for (const fixture of pkg.goldenCases) {
    it(`scores the source golden case: ${fixture.name}`, () => {
      const result = scoreScale(definition, fixture.answers)
      expect(result.quality.status).toBe(fixture.expected.quality)
      expect(Object.fromEntries(result.scores.map(score => [score.key, score.value]))).toEqual(fixture.expected.scores)
      expect(result.scores.map(score => score.key)).toEqual(fixture.expected.totalScoreKeys)
    })
  }

  it('does not turn any incomplete response into a low score or interpreted result', () => {
    for (let omitted = 0; omitted < 6; omitted += 1) {
      const result = buildResult(answers.filter((_, index) => index !== omitted))
      expect(result.quality.status).toBe('invalid')
      expect(result.scores[0].value).toBeNull()
      expect(result.interpretations).toEqual([])
      expect(result.references).toEqual([])
    }
    expect(buildResult([]).scores[0].value).toBeNull()
  })

  it('rejects invalid values, extra items and duplicate answers rather than coercing them', () => {
    for (const responseValue of ['-1', '5', '1.5', 'INVALID']) {
      expect(() => buildResult([{ ...answers[0], responseValue }, ...answers.slice(1)])).toThrow('量表回答不合法')
    }
    expect(() => buildResult([...answers, { itemCode: 'ACTSQ_07', responseValue: '2' }])).toThrow('量表回答不合法')
    expect(() => buildResult([...answers, answers[0]])).toThrow('量表回答不合法')
  })

  it('requires an adult self-respondent and the exact ACT post-session context', () => {
    const evaluate = (ageMonths?: number, assessmentContext?: string, respondentType: 'SELF' | 'TEACHER' = 'SELF') => evaluateInstrumentEligibility(source.applicability!, {
      respondentType, subject: ageMonths === undefined ? undefined : { ageMonths }, assessmentContext, availableContextKeys: [],
    }).outcome
    expect(source.applicability?.assessmentContexts).toEqual([context])
    expect(source.catalog.population.minAge).toBe(18)
    expect(evaluate(216, context)).toBe('ELIGIBLE')
    expect(evaluate(215, context)).toBe('INELIGIBLE')
    expect(evaluate(undefined, context)).toBe('INDETERMINATE')
    expect(evaluate(216)).toBe('INDETERMINATE')
    expect(evaluate(216, 'GENERAL_SELF_TEST')).toBe('INELIGIBLE')
    expect(evaluate(216, 'K12_SCREENING')).toBe('INELIGIBLE')
    expect(evaluate(216, context, 'TEACHER')).toBe('INELIGIBLE')
    expect(source.catalog.administration.timeFrame).toContain('（XY）次ACT心理治疗会谈')
    expect(source.catalog.administration.layoutConstraints.join(' ')).toContain('现有引擎缺口未补')
    expect(source.applicability?.requiredContextKeys).toEqual([])
    expect(source.disclosure?.audiences.teacher).toBeUndefined()
    expect(source.disclosure?.unknownAudience).toBe('DENY')
  })

  it('records independent supplement-level CC BY 4.0 permission with attribution and changes', () => {
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL', 'COMMERCIAL'])
    expect(definition.license).toMatchObject({ status: 'verified', redistribution: 'allowed' })
    expect(definition.license.note).toContain('https://creativecommons.org/licenses/by/4.0/')
    expect(definition.license.note).toContain('独立补充题本')
    expect(definition.license.note).toContain('10.23668/psycharchives.3462')
    expect(definition.license.note).toContain('不被仓库MIT许可证替代')
    expect(definition.license.note).toContain('未获原作者背书')
    const rights = readDoc('supplement-rights-datacite.json').data.attributes
    expect(rights.doi).toBe('10.23668/psycharchives.3462')
    expect(rights.rightsList.some((entry: { rightsIdentifier?: string }) => entry.rightsIdentifier === 'cc-by-4.0')).toBe(true)
    const evidence = readDoc('source-evidence.json')
    const metadataHash = createHash('sha256').update(readFileSync(new URL('supplement-rights-datacite.json', docs))).digest('hex')
    expect(evidence.archivedResearchInputs.find((entry: { filename: string }) => entry.filename === 'act_sq-supplement-datacite.json').sha256).toBe(metadataHash)
    expect(evidence.supplement.pdfSha256).toBe('ce3b8ba37d2579694a9caa3f60141dcc83ae64fac8bc73442fe91db69ef8ab96')
  })

  it('keeps German clinical evidence separate from the unvalidated English-to-Chinese working form', () => {
    expect(source.catalog.evidence.map(record => record.sampleSize)).toEqual([87, 115, 156])
    expect(source.catalog.evidence.every(record => record.locale === 'de' && record.territory === 'DE')).toBe(true)
    expect(source.catalog.evidence.map(record => record.studyDesign).join(' ')).toMatch(/0\.81.*0\.84.*0\.88/)
    expect(source.catalog.evidence[2].notes).toContain('有17人重叠')
    expect(source.localization?.localEvidenceRefs).toEqual([])
    expect(source.catalog.population.developmentalEvidence).toBe('UNKNOWN')
    expect(source.catalog.population.populationNotes).toContain('不表示中小学生')
    const tags = source.catalog.construct.constructOverlapTags
    for (const axis of ['domain', 'construct', 'orientation', 'population', 'response', 'use', 'license', 'language_validation']) {
      expect(tags.some(tag => tag.startsWith(`${axis}:`))).toBe(true)
    }
    expect(tags).toContain('orientation:ACT')
    expect(tags).toContain('orientation:post_session_only')
    expect(tags).not.toContain('orientation:CBT')
    expect(tags).not.toContain('orientation:DBT')
    expect(tags).toContain('population:not_k12_validated')
  })

  it('returns only a plain-language session reflection without norms, cutoffs or performance judgments', () => {
    const result = parseScaleResultV2(JSON.parse(JSON.stringify(buildResult())))
    expect(result.scores[0].value).toBe(2)
    expect(result.interpretations).toHaveLength(1)
    expect(result.interpretations[0]).toMatchObject({ label: null, referenceVersion: null })
    expect(result.references).toEqual([])
    expect(pkg.references).toEqual([])
    expect(source.catalog.referenceApplicability).toEqual([])
    expect(definition.referencePolicy).toEqual({ type: 'none' })
    expect(definition.report.interpretations[0].source).toEqual({ type: 'score_only' })
    expect(definition.report.interpretations[0].bands).toEqual([])
    expect(definition.report.interpretations[0].summary.length).toBeGreaterThanOrEqual(100)
    expect(definition.report.interpretations[0].guidance.some(entry => entry.category === 'reflection')).toBe(true)
    expect(definition.report.interpretations[0].guidance.some(entry => entry.category === 'support')).toBe(true)
    expect(definition.report.disclaimer).toContain('治疗师绩效评价')
    expect(definition.report.disclaimer).toContain('中文为未经验证的工作译稿')
    expect(Object.values(source.disclosure!.audiences).every(audience => !audience.scoreDerivedLabels && !audience.references)).toBe(true)
    expect(source.catalog.intendedUse.intendedUses.map(entry => entry.use)).toEqual(['RESEARCH', 'INDIVIDUAL_REFLECTION'])
  })

  it('keeps the report example synthetic and descriptive source statistics out of runtime references', () => {
    const example = readDoc('report-example.json')
    expect(example.status).toBe('SYNTHETIC_CONTENT_EXAMPLE_NOT_RUNTIME_OUTPUT')
    expect(example.notRealPatientData).toBe(true)
    expect(example.assessmentContext).toBe(context)
    expect(example.sessionScopeExample.xy).toBe(1)
    expect(scoreScale(definition, example.answers).scores[0].value).toBe(example.expectedRawScore)
    expect(example.expectedRawScore).toBe(11 / 6)
    expect(example.displayScore).toBe('1.83')
    expect(example.percentile).toBeNull()
    expect(example.referenceVersion).toBeNull()
    expect(example.severityBand).toBeNull()
    const dossier = readDoc('external-reference-dossier.json')
    expect(dossier.activationStatus).toBe('SOURCE_EVIDENCE_ONLY_NOT_RUNTIME_NORMS')
    expect(dossier.runtimeReferenceSets).toEqual([])
    expect(dossier.thresholds).toEqual([])
    expect(dossier.severityBands).toEqual([])
    expect(dossier.usedForIndividualComparison).toBe(false)
    expect(dossier.localChineseEvidence).toEqual([])
  })

  it('keeps initial measurement and report version identities distinct', () => {
    expect(definition.versionAxes).toEqual({ schemaVersion: 1, subjectKey: 'act_sq6', locale: 'zh-CN', localizationVersion: '1.0.0' })
    expect(definition.scoring.scoringVersion).toBe('1.0.0')
    expect(definition.report.reportVersion).toBe('1.0.0')
    const changed = structuredClone(definition)
    changed.report.disclaimer += ' 仅文字变更'
    expect(hashScaleDefinition(changed)).toBe(hashScaleDefinition(definition))
    changed.items[0].content += ' 改题'
    expect(hashScaleDefinition(changed)).not.toBe(hashScaleDefinition(definition))
  })
})
