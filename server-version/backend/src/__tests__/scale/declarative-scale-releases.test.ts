import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {checkDeclaredScaleReleases} from '../../modules/scale/declarative/check'
import {loadDeclaredScaleReleases} from '../../modules/scale/declarative/load'
import {assertLiveScaleReportArtwork} from '../../modules/scale/declarative/live-artwork'
import type {AssessmentReferenceSetDefinition} from '../../modules/assessment-reference/reference'
import {sourceParts, type Part} from '../../modules/survey/standard-triplet.model'
import type {ScaleDefinitionV2} from '../../modules/scale/scale-definition'

const toolKey = 'academic_self_concept_chinese_zh_cn'
const contentVersion = '1.0.0'
const parameterVersion = '1.1.0-test'
const reportVersion = '1.1.0-test'
const base = Object.fromEntries(sourceParts(toolKey, contentVersion).map(part => [part.axis, part])) as Record<string, Part>
const release = {releaseKey: 'trial-1', contentVersion, contentHash: base.CONTENT.hash, parameterVersion, reportVersion, allowedEntries: ['TRAINING'], state: 'ONLINE'}
const baseReport = base.REPORT.payload as ScaleDefinitionV2['report']
const baseParameters = base.PARAMETERS.payload as {
  referencePolicy: Extract<ScaleDefinitionV2['referencePolicy'],{type:'declared'}>
  references: AssessmentReferenceSetDefinition[]
}
const parameter = {
  toolKey, contentVersion, version: parameterVersion,
  scoringVersion: (base.CONTENT.payload as Pick<ScaleDefinitionV2,'scoring'>).scoring.scoringVersion,
  referencePolicy: {
    ...baseParameters.referencePolicy,
    selections: baseParameters.referencePolicy.selections.map(selection => ({...selection, referenceVersion: parameterVersion})),
  },
  references: baseParameters.references.map(reference => ({...reference, referenceVersion: parameterVersion})),
}
const report = {
  toolKey, contentVersion, parameterVersion, version: reportVersion, report: {...baseReport, reportVersion},
  reportVisibility: {
    schemaVersion: 1, policyVersion: 'test-report', unknownAudience: 'DENY',
    audiences: {subject: {
      numericScores: true, references: true, scoreDerivedLabels: true,
      individualInterpretations: true, educationalContent: true, artwork: false,
    }},
  },
}

describe('Scale content directories', () => {
  let root: string
  const write = (path: string, value: unknown) => writeFileSync(join(root, toolKey, path), JSON.stringify(value))
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'scale-declarations-'))
    mkdirSync(join(root, toolKey, 'parameters'), {recursive: true})
    mkdirSync(join(root, toolKey, 'reports'))
  })
  afterEach(() => rmSync(root, {recursive: true, force: true}))

  it('loads and checks a new immutable P/R pair against the existing C', () => {
    write(`parameters/${parameterVersion}.json`, parameter)
    write(`reports/${reportVersion}.json`, report)
    write('releases.json', {toolKey, releases: [release]})
    const [result] = checkDeclaredScaleReleases(root, {toolKeys: [toolKey]})
    expect(result.allowedEntries).toEqual(['TRAINING'])
    expect(result.triplet.parts.CONTENT).toEqual(base.CONTENT)
    expect(result.triplet.parts.PARAMETERS.version).toBe(parameterVersion)
    expect(result.triplet.parts.REPORT.version).toBe(reportVersion)
    expect(result.triplet.parts.REPORT.hash).not.toBe(base.REPORT.hash)
    expect(loadDeclaredScaleReleases(root)[0].triplet.combinationHash).toBe(result.triplet.combinationHash)
    write('releases.json', {toolKey, releases: [{...release,contentHash:'0'.repeat(64)}]})
    expect(() => loadDeclaredScaleReleases(root)).toThrow('does not match the approved contentHash')
  })

  it('checks standalone parameters and reports and refuses a mismatched release', () => {
    write(`parameters/${parameterVersion}.json`, {...parameter, scoringVersion: 'wrong'})
    expect(() => checkDeclaredScaleReleases(root)).toThrow('wrong scoring version')
    write(`parameters/${parameterVersion}.json`, {...parameter, ...baseParameters})
    expect(() => checkDeclaredScaleReleases(root)).toThrow('identical content')
    write(`parameters/${parameterVersion}.json`, parameter)
    write(`reports/${reportVersion}.json`, {...report, parameterVersion: 'nonexistent'})
    expect(() => checkDeclaredScaleReleases(root)).toThrow('P nonexistent is missing')
    write(`reports/${reportVersion}.json`, report)
    write('releases.json', {toolKey, releases: [{...release, parameterVersion: 'default'}]})
    expect(() => loadDeclaredScaleReleases(root)).toThrow('bound to another C/P')
  })

  it('accepts an empty Git declaration for a known tool after revert', () => {
    expect(checkDeclaredScaleReleases(root, {toolKeys: [toolKey]})).toEqual([])
    expect(() => checkDeclaredScaleReleases(root, {toolKeys: ['typo']})).toThrow('unknown Scale tool')
  })

  it('requires named predecessors in the same Git declaration and still accepts the legacy default', () => {
    write(`parameters/${parameterVersion}.json`, parameter)
    write(`reports/${reportVersion}.json`, report)
    const changed = {...release, replaces: 'previous'}
    write('releases.json', {toolKey, releases: [changed]})
    expect(() => loadDeclaredScaleReleases(root)).toThrow('STANDARD_GIT_REPLACEMENT_NOT_FOUND:trial-1:previous')
    const previous = {...release, releaseKey: 'previous', parameterVersion: 'default', reportVersion: 'default', state: 'WITHDRAWN'}
    write('releases.json', {toolKey, releases: [previous, changed]})
    expect(loadDeclaredScaleReleases(root).map(item => item.releaseKey)).toEqual(['previous', 'trial-1'])
    write('releases.json', {toolKey, releases: [{...release, replaces: '1.0.0/default'}]})
    expect(loadDeclaredScaleReleases(root)[0].replaces).toBe('1.0.0/default')
  })

  it('requires the approved artwork to match every installed frontend inventory before publishing', () => {
    const key = `${toolKey}/${contentVersion}/${reportVersion}`
    write(`parameters/${parameterVersion}.json`, parameter)
    write(`reports/${reportVersion}.json`, {...report, report: {...report.report, artworkKey: key}})
    write('releases.json', {toolKey, releases: [release]})
    const releases = loadDeclaredScaleReleases(root)
    expect(() => assertLiveScaleReportArtwork(root, releases)).toThrow('inventories are required')
    const evidence = join(root, '.artwork')
    mkdirSync(evidence)
    const files = {
      [key + '/report-artwork.json']: 'a'.repeat(40),
      [key + '/picture.webp']: 'b'.repeat(40),
    }
    const inventory = (name: string, map: Record<string, string>) =>
      writeFileSync(join(evidence, name + '.json'), JSON.stringify({schemaVersion: 1, files: map}))
    inventory('approved', files)
    inventory('live-aaa', files)
    inventory('live-bbb', {...files, [key + '/picture.webp']: 'c'.repeat(40)})
    expect(() => assertLiveScaleReportArtwork(root, releases)).toThrow('missing or stale Scale artwork')
    inventory('live-bbb', files)
    expect(() => assertLiveScaleReportArtwork(root, releases)).not.toThrow()
    expect(() => assertLiveScaleReportArtwork('/irrelevant', releases.map(item => ({...item, state: 'WITHDRAWN'})))).not.toThrow()
  })
})
