import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkSjtGitRelease, readSjtGitReleasePlan } from '../../modules/situational/git-release'
import legacy from '../../modules/situational/instruments/sjt-assertiveness-golden/1.0.0/instrument.json'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

let root: string | undefined
let toolKey = 'sample-sjt'
const contentVersion = '1.0.0'
const entry = {
  releaseKey: 'first',
  contentVersion,
  parameterVersion: '1.0.0',
  reportVersion: '1.0.0',
  state: 'ONLINE',
  allowedEntries: ['SURVEY'],
}
const ceiling = {
  schemaVersion: 1, policyVersion: '1.0.0', unknownAudience: 'DENY',
  audiences: { researcher: { rawAnswers: true, itemScores: true, methods: true, resultQualityDetails: true } },
}
const visibility = {
  schemaVersion: 1, policyVersion: '1.0.0', unknownAudience: 'DENY',
  audiences: { researcher: {
    numericScores: true, references: false, scoreDerivedLabels: false, individualInterpretations: false,
    educationalContent: false, artwork: false,
  } },
}
const { scoring, report, referencePolicy: _reference, ...definition } = legacy.definition
const { scoringVersion, ...weights } = scoring
const c = {
  schemaVersion: 1,
  identity: { instrumentKey: toolKey, instrumentVersion: contentVersion },
  definition: { ...definition, license: { ...definition.license, redistribution: 'allowed' } },
  scorer: { scoringVersion },
  dataCeiling: ceiling,
}
const p = {
  schemaVersion: 1, contentVersion, version: '1.0.0', scoring: weights,
  goldenCases: legacy.goldenCases, scientific: { schemaVersion: 1, scientificMaturity: 'PILOT', governanceRevision: 1 },
}
const r = {
  schemaVersion: 1, contentVersion, parameterVersion: '1.0.0', version: '1.0.0',
  report: { ...report, reportVersion: '1.0.0' }, reportVisibility: visibility,
  template: { title: 'Research report' },
}

function write(path: string, value: unknown) {
  writeFileSync(join(root!, toolKey, path), JSON.stringify(value))
}
function manifest(...releases: typeof entry[]) {
  write('releases.json', { schemaVersion: 1, toolKey, releases })
}
function sample(key = 'sample-sjt') {
  toolKey = key
  root = mkdtempSync(join(tmpdir(), 'sjt-git-release-'))
  for (const path of [contentVersion, 'parameters', 'reports']) mkdirSync(join(root, toolKey, path), { recursive: true })
  write(contentVersion + '/content.json', { ...c, identity: { ...c.identity, instrumentKey: toolKey } })
  write('parameters/1.0.0.json', p)
  write('reports/1.0.0.json', r)
  manifest(entry)
}
afterEach(() => {
  if (root) rmSync(root, { force: true, recursive: true })
  root = undefined
})

describe('SJT declarative content releases', () => {
  it('checks the historical staged branching example without adding a release entitlement', () => {
    const instruments = resolve(__dirname, '../../modules/situational/instruments')
    const key = 'cpj-cj01-sd-baseline'
    expect(checkSjtGitRelease(instruments, key)).toEqual({
      toolKey: key, releases: [], historical: [{ version: '0.4.3', state: 'DRAFT', publicationReady: true }],
    })
    expect(readSjtGitReleasePlan(instruments, key)).toBeNull()
  })

  it('binds report revisions to stable C and P and keeps the original disclosure ceiling', () => {
    sample()
    const nextReport = { ...r, version: '1.0.1', report: { ...r.report, reportVersion: '1.0.1', disclaimer: 'Updated guidance.' },
      reportVisibility: { ...visibility, audiences: { researcher: { ...visibility.audiences.researcher, educationalContent: true } } } }
    write('reports/1.0.1.json', nextReport)
    const second = { ...entry, releaseKey: 'second', reportVersion: '1.0.1', replaces: 'first' }
    manifest(entry, second)
    const [first, latest] = readSjtGitReleasePlan(root!, toolKey)!.declarations
    expect(first.online).toBe(false)
    expect(latest.online).toBe(true)
    expect(first.axes.content).toEqual(latest.axes.content)
    expect(first.axes.parameters).toEqual(latest.axes.parameters)
    expect(first.axes.report).not.toEqual(latest.axes.report)
    expect(latest.effectiveDisclosure.audiences.researcher).toMatchObject({
      rawAnswers: true, itemScores: true, numericScores: true, educationalContent: true,
    })
    expect(latest.effectiveDisclosure.audiences.respondent).toMatchObject({ rawAnswers: false, numericScores: false })
    expect(canonicalHash(first.pkg.definition.scoring)).toEqual(canonicalHash(latest.pkg.definition.scoring))
    manifest(entry, { ...second, state: 'WITHDRAWN' })
    const rollback = checkSjtGitRelease(root!, toolKey)
    expect(rollback.releases.map(release => release.state)).toEqual(['ONLINE', 'WITHDRAWN'])
  })

  it('rejects version drift, a scorer change under an existing C and an incorrect exact golden value', () => {
    sample()
    write('parameters/1.0.0.json', { ...p, contentVersion: '1.0.1' })
    expect(() => checkSjtGitRelease(root!, toolKey)).toThrow('SJT_GIT_AXIS_IDENTITY_MISMATCH')
    write(contentVersion + '/content.json', { ...c, scorer: { ...c.scorer, model: { modelKey: 'AUTHOR_KEY_SUM', modelVersion: '1' } } })
    write('parameters/1.0.0.json', p)
    expect(() => checkSjtGitRelease(root!, toolKey)).toThrow('SJT_GIT_SCORER_CHANGE_REQUIRES_CONTENT_VERSION')
    write(contentVersion + '/content.json', c)
    const cases = structuredClone(p.goldenCases)
    const incorrectMetric = Object.keys(cases[0].expected.metrics)[0]
    Object.assign(cases[0].expected.metrics, { [incorrectMetric]: 100000 })
    write('parameters/1.0.0.json', { ...p, goldenCases: cases })
    expect(() => checkSjtGitRelease(root!, toolKey)).toThrow('SJT_GIT_PACKAGE_INVALID')
  })

  it('blocks an entry or audience whose current Survey adapter cannot enforce', async () => {
    sample()
    manifest({ ...entry, allowedEntries: ['SURVEY', 'TRAINING'] })
    expect(() => checkSjtGitRelease(root!, toolKey)).toThrow('SJT_GIT_ONLY_NATIVE_SURVEY_ENTRY_SUPPORTED')
    manifest(entry)
    write('reports/1.0.0.json', { ...r, reportVisibility: {
      ...visibility, audiences: { ...visibility.audiences, respondent: { ...visibility.audiences.researcher } },
    } })
    expect(() => checkSjtGitRelease(root!, toolKey)).toThrow('SJT_GIT_SURVEY_DISCLOSURE_NOT_SUPPORTED')
    const { evaluateSurveyUnitReportEligibility } = await import('../../modules/assessment-policy/tool-report-eligibility')
    expect(evaluateSurveyUnitReportEligibility({
      kind: 'SJT', executionProtocol: 'SITUATIONAL_NATIVE_V1',
      sourceProvenance: { sjtGitRelease: {} },
    }).eligible).toBe(false)
  })

})


it.skipIf(process.env.SJT_GIT_RELEASE_ISOLATED !== '1')('publishes and rolls back report-only revisions through actual governed transactions', async () => {
  const url = new URL(process.env.DATABASE_URL!)
  if (url.hostname !== '127.0.0.1' || url.port !== '55488' || url.pathname !== '/eduk12_sjt_git_test') {
    throw new Error('A disposable SJT Git release database is required')
  }
  sample('sample-sjt-' + randomUUID().slice(0, 8))
  const { prisma } = await import('../../config/database')
  const { ensureGitScalePublisher } = await import('../../modules/scale/onboarding/git-release-actor')
  const { syncSjtGitReleases } = await import('../../modules/situational/git-publish')
  const { governedRow } = await import('../../modules/survey/governed-tool.service')
  const { snapshotUnit } = await import('../../modules/survey/governed-tool.model')
  const { publishSurveyMeasurementUnit } = await import('../../modules/survey/publication.service')
  const { bindGovernedToolContent } = await import('../../modules/survey/governed-tool.content')
  const { getContentRelease } = await import('../../modules/measurement-content/repository')
  const { sjtGitFrozenBindingSchema } = await import('../../modules/situational/git-release.binding')
  try {
    const actor = await ensureGitScalePublisher(prisma)
    const sync=(commit: string)=>prisma.$transaction(tx=>syncSjtGitReleases(root!,tx,actor,commit),{timeout:30000})
    const [first] = await sync('1'.repeat(40))
    expect(first.action).toBe('PUBLISHED')
    expect(first.id).toBeTruthy()
    const firstRow = await governedRow(prisma, first.id!)
    const firstBinding = sjtGitFrozenBindingSchema.parse(firstRow.snapshot.unit!.provenance.sjtGitRelease)
    expect(firstRow.measurement_release).not.toBeNull()
    expect((await sync('1'.repeat(40)))[0].action).toBe('UNCHANGED')

    const nextReport = { ...r, version: '1.0.1', report: { ...r.report, reportVersion: '1.0.1', disclaimer: 'Revised narrative.' },
      template: { title: 'Revised research report' } }
    write('reports/1.0.1.json', nextReport)
    const second = { ...entry, releaseKey: 'second', reportVersion: '1.0.1', replaces: 'first' }
    manifest(entry, second)
    const activation = await sync('2'.repeat(40))
    expect(activation.map(item => item.action)).toEqual(['PUBLISHED', 'WITHDRAWN'])
    const secondRow = await governedRow(prisma, activation[0].id!)
    const secondBinding = sjtGitFrozenBindingSchema.parse(secondRow.snapshot.unit!.provenance.sjtGitRelease)
    expect(secondRow.measurement_release).toEqual(firstRow.measurement_release)
    expect(firstBinding.reportRelease).not.toEqual(secondBinding.reportRelease)
    expect(firstBinding.axes.content).toEqual(secondBinding.axes.content)
    expect((await getContentRelease(prisma, firstBinding.reportRelease.releaseId))?.status).toBe('PUBLISHED')

    await prisma.$transaction(async tx => {
      const unit = snapshotUnit(secondRow.snapshot.unit!, randomUUID(), 'synthetic-report-unit')
      unit.sourceProvenance = { ...unit.sourceProvenance, surveyToolReleaseId: secondRow.id }
      const measurement = await publishSurveyMeasurementUnit(tx, unit, actor, 'synthetic-project')
      unit.measurementRelease={releaseId:measurement.releaseId,contentHash:measurement.contentHash,measurementHash:measurement.content.measurementHash}
      await bindGovernedToolContent(tx,unit,actor)
      expect(unit.contentSelection?.reportDisclosure).toEqual(secondBinding.effectiveDisclosure)
      const report = await getContentRelease(tx,unit.contentSelection!.reportRelease!.releaseId)
      expect(report?.layer).toBe('REPORT')
      expect(report?.sourceReleaseId).toBe(secondBinding.reportRelease.releaseId)
    })

    manifest(entry, { ...second, state: 'WITHDRAWN' })
    expect((await sync('3'.repeat(40))).map(item => item.action)).toEqual(['RESTORED','WITHDRAWN'])
    expect((await governedRow(prisma, firstRow.id)).state).toBe('ONLINE')
    expect((await governedRow(prisma, secondRow.id)).state).toBe('WITHDRAWN')
  } finally { await prisma.$disconnect() }
}, 100000)
