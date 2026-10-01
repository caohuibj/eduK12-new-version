import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import example from '../../modules/situational/authoring/examples/teacher-demonstration.json'
import {
  compileSjtTemplate,
  assertSjtReleaseReady,
} from '../../modules/situational/authoring/template'
import { buildSjtNarrative } from '../../modules/situational/authoring/narrative'
import {
  readSjtWorkbook,
  validateSjtXlsxContainer,
  SJT_WORKBOOK_TABLES,
} from '../../modules/situational/authoring/workbook'
import { buildSituationalResearchArtifact } from '../../modules/situational/situation-research-export'
import { createSituationalRawSubmissionPayload } from '../../modules/situational/situational-raw-submission'
import { prepareCanonicalSubmission } from '../../services/instrumentFinalSubmit'
import { validateBranchingSituationDefinition } from '../../modules/situational/situation-branching'
import {
  deriveAuthoritativeSituationalTrajectory,
  projectReachableSituationDefinitionForScoring,
} from '../../modules/situational/situation-trajectory'
import { asLinearSituationDefinition } from '../../modules/situational/situation-runtime-definition'
import { createSituationalResponseValidator } from '../../modules/situational/situation-scoring'
import { scoreSituationalModel } from '../../modules/situational/situation-model-resolver'
import {
  freezeSituationalRuntimeAtAttemptStart,
  parseFrozenSituationalRuntimeSnapshot,
} from '../../modules/assessment-runtime/situational-runtime-snapshot'

const compiled = compileSjtTemplate(example)
describe('SJT upload compiler and independent author oracles', () => {
  it('preserves all 128 author paths and six U cases with six logical nodes and two mothers', () => {
    expect(compiled.package.goldenCases).toHaveLength(134)
    expect(
      new Set(
        compiled.package.definition.schemaVersion === 2
          ? compiled.package.definition.flow.nodes.flatMap((n) =>
              n.nodeType === 'SCENE' ? [n.motherSceneKey] : [],
            )
          : [],
      ),
    ).toHaveLength(2)
    expect(() => assertSjtReleaseReady(compiled)).not.toThrow()
    for (const c of compiled.package.goldenCases) {
      const path = deriveAuthoritativeSituationalTrajectory(
        compiled.package.definition,
        c.responses,
      )
      expect(path.sceneKeys).toHaveLength(6)
      const d = projectReachableSituationDefinitionForScoring(compiled.package.definition, path)
      const result = scoreSituationalModel(d, c.responses, { responsesValidated: true })
      expect(Object.fromEntries(result.metrics.map((m) => [m.key, m.value]))).toEqual(
        c.expected.metrics,
      )
      for (const m of result.metrics)
        expect(m.range).toEqual(
          (
            {
              V: { min: 0, max: 4 },
              T: { min: 0, max: 4 },
              E: { min: 0, max: 6 },
              R: { min: 2, max: 5 },
              F: { min: 0, max: 4 },
              P: { min: 0, max: 2 },
            } as Record<string, { min: number; max: number }>
          )[m.key],
        )
      expect(
        buildSjtNarrative(compiled.package.definition, c.responses)?.paragraphs.length,
      ).toBeGreaterThan(6)
    }
  })
  it('freezes the new definition and preserves author provenance', () => {
    const f = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: compiled.package.key,
      instrumentVersion: '1.0.0',
      definition: compiled.package.definition,
      frozenAt: new Date(0),
    })
    expect(parseFrozenSituationalRuntimeSnapshot(f).definitionHash).toBe(f.definitionHash)
    expect(f.definition.scoring.model?.modelKey).toBe('AUTHOR_KEY_SUM')
    expect(f.definition.report.limitations[0]).toContain('作者暂定')
  })
  it('does not change EXPERT_KEY@1 means or provide a zero for U', () => {
    const c = compiled.package.goldenCases[0]!,
      path = deriveAuthoritativeSituationalTrajectory(compiled.package.definition, c.responses)
    const d = projectReachableSituationDefinitionForScoring(compiled.package.definition, path)
    const legacy = structuredClone(d)
    legacy.scoring.model!.modelKey = 'EXPERT_KEY'
    const result = scoreSituationalModel(legacy, c.responses, { responsesValidated: true })
    expect(result.metrics.find((m) => m.key === 'E')?.value).toBe(c.expected.metrics.E! / 3)
    const u = compiled.package.goldenCases.find((c) => c.name === '非回答-C1')!
    const up = deriveAuthoritativeSituationalTrajectory(compiled.package.definition, u.responses)
    const ur = scoreSituationalModel(
      projectReachableSituationDefinitionForScoring(compiled.package.definition, up),
      u.responses,
      { responsesValidated: true },
    )
    expect(ur.metrics.find((m) => m.key === 'E')?.value).toBeNull()
    expect(ur.metrics.find((m) => m.key === 'R')?.value).not.toBeNull()
    expect(ur.metrics.find((m) => m.key === 'E')?.contributions?.[0]?.contribution).toBeNull()
  })
  it.each([
    'cycle',
    'oversized-identity',
    'missing-key',
    'scored-U',
    'duplicate',
    'missing-transition',
    'NA-key',
    'bad-report',
    'bad-comparison',
  ])('rejects %s instead of inventing content', (defect) => {
    const t = structuredClone(example)
    if (defect === 'oversized-identity') t.instrumentKey = 'a'.repeat(81)
    if (defect === 'cycle') t.transitions[0]!.nextNodeKey = 'C1'
    if (defect === 'missing-key') t.scores.shift()
    if (defect === 'scored-U') t.scores.push({ ...t.scores[0]!, optionKey: 'U' })
    if (defect === 'duplicate') t.questions.push(t.questions[0]!)
    if (defect === 'missing-transition') t.transitions.shift()
    if (defect === 'NA-key') t.opportunities[0]!.applicability = 'NA'
    if (defect === 'bad-report') t.feedback[0]!.optionKey = 'UNKNOWN'
    if (defect === 'bad-comparison') t.comparisons[0]!.secondChannelKey = 'C3-P1'
    expect(() => compileSjtTemplate(t)).toThrow()
  })
  it('accepts optional bounded text but does not route, score or echo it', () => {
    const t = structuredClone(example) as unknown as Record<string, unknown>
    const qs = t.questions as unknown[]
    qs.push({
      nodeKey: 'C1',
      questionKey: 'C1-NOTE',
      prompt: '自愿补充',
      kind: 'TEXT',
      purpose: 'APPRAISAL',
      required: false,
      order: 3,
      maxLength: 500,
    })
    const c = compileSjtTemplate(t),
      d = c.package.definition,
      first = d.scenes.find(
        (s) => s.sceneKey === (d.schemaVersion === 2 ? d.flow.entryNodeKey : ''),
      )!
    const validate = createSituationalResponseValidator(asLinearSituationDefinition(d))
    expect(() =>
      validate({ sceneKey: first.sceneKey, channelKey: 'C1-NOTE', responseValue: 'x'.repeat(501) }),
    ).toThrow()
    expect(() =>
      validate({
        sceneKey: first.sceneKey,
        channelKey: 'C1-NOTE',
        responseValue: '保留自己的说明',
      }),
    ).not.toThrow()
    const frozen = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: c.package.key,
      instrumentVersion: '1.0.0',
      definition: d,
      frozenAt: new Date(0),
    })
    expect(
      parseFrozenSituationalRuntimeSnapshot(frozen).runnerDefinition.scenes[0]?.channels.some(
        (c) => c.responseType === 'FREE_TEXT',
      ),
    ).toBe(true)
    const responses = [
      ...c.package.goldenCases[0]!.responses,
      { sceneKey: first.sceneKey, channelKey: 'C1-NOTE', responseValue: '隐私补充' },
    ]
    expect(buildSjtNarrative(d, responses)?.paragraphs.join()).not.toContain('隐私补充')
    const raw = createSituationalRawSubmissionPayload({ attemptEpoch: 1, responses })
    const artifact = buildSituationalResearchArtifact({
      attemptId: 'synthetic-text',
      attemptEpoch: 1,
      snapshot: frozen,
      raw,
      submissionPayloadHash: prepareCanonicalSubmission({ responses }).hash,
      pseudonymKey: 'a'.repeat(64),
      grant: {
        grantId: 'synthetic',
        researcherUserId: 'synthetic',
        attemptIds: ['synthetic-text'],
        definitionHash: frozen.definitionHash,
        expiresAt: '2100-01-01T00:00:00Z',
        approvalReference: 'synthetic-only',
        projection: 'PSEUDONYMOUS_RAW_V1',
      },
    })
    expect(artifact.freeTextProjection).toBe('EXCLUDED')
    expect(JSON.stringify(artifact)).not.toContain('隐私补充')
    expect(artifact.opportunities.find((o) => o.channelKey === 'C1-NOTE')).toMatchObject({
      finalResponse: null,
      freeTextExcluded: true,
    })
  })
  it('rejects unknown narrative references even in a hand-crafted V2 definition', () => {
    const d = structuredClone(compiled.package.definition)
    if (d.schemaVersion !== 2) throw new Error('fixture')
    d.report.narrative!.fragments[0]!.optionKey = 'UNKNOWN'
    expect(
      validateBranchingSituationDefinition(d).issues.some((i) =>
        i.path.startsWith('report.narrative'),
      ),
    ).toBe(true)
  })
  it('does not allow insufficient golden coverage to release', () => {
    const t = structuredClone(example)
    t.cases = t.cases.slice(0, 1)
    expect(() => assertSjtReleaseReady(compileSjtTemplate(t))).toThrow(/模板/)
  })
  it('roundtrips the published sample workbook into identical template values', async () => {
    const input = await readSjtWorkbook(readFileSync('assets/sjt-upload-example-v1.xlsx'))
    expect(compileSjtTemplate(input).contentDigest).toBe(compiled.contentDigest)
  })
  it('rejects executable cells with their worksheet address', async () => {
    const wb = new ExcelJS.Workbook(),
      basic = wb.addWorksheet('基本信息')
    basic.addRow(['字段', '填写值', '说明'])
    basic.addRow(['title', { formula: '1+1', result: 2 }])
    for (const t of SJT_WORKBOOK_TABLES) wb.addWorksheet(t.name).addRow([...t.fields])
    await expect(readSjtWorkbook(Buffer.from(await wb.xlsx.writeBuffer()))).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: '基本信息!B2', code: 'CELL' }),
      ]),
    })
  })
  it('bounds actual inflation and rejects external relationships', async () => {
    const zip = new JSZip()
    zip.file('xl/workbook.xml', '<workbook/>')
    zip.file(
      'xl/_rels/workbook.xml.rels',
      '<Relationships><Relationship TargetMode="External" Target="https://invalid.example/"/></Relationships>',
    )
    const external = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    expect(() => validateSjtXlsxContainer(external)).toThrow(/外部链接/)
    const bomb = new JSZip()
    bomb.file('xl/workbook.xml', 'x'.repeat(9 * 1024 * 1024))
    const bytes = await bomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    const dir = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    bytes.writeUInt32LE(100, dir + 24)
    expect(() => validateSjtXlsxContainer(bytes)).toThrow()
  })
  it('rejects malformed/oversized containers before decompression', () => {
    expect(() => validateSjtXlsxContainer(Buffer.alloc(2 * 1024 * 1024 + 1))).toThrow()
    expect(() => validateSjtXlsxContainer(Buffer.from('not a workbook'))).toThrow()
  })
})
