import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { discoverSources, renderManifest } from '../../../scripts/generate-situational-instruments.mjs'
import { GENERATED_SITUATIONAL_INSTRUMENT_SOURCES } from '../../modules/situational/onboarding/instruments.generated'
import { instrumentSourceSchema, publicationContentDigest } from '../../modules/situational/onboarding/schema'
import { evaluateSituationalPublicationGate } from '../../modules/situational/onboarding/publication-gate'
import { createSituationalInstrumentRegistry, immutableReleaseIssues } from '../../modules/situational/onboarding/instrument-registry'
import { classifySituationalPath } from '../../modules/situational/onboarding/path-policy'
import { verifyGitHubPublicationReview } from '../../modules/situational/onboarding/review-authority'
import { selectPublishedSituationPackage } from '../../modules/situational/situation-package.registry'
import { SJT_BRANCHING_E2E_PACKAGE } from '../../modules/situational/packages/sjt-branching-e2e-fixture'

import { unknownSource, publish } from './fixtures/unknown-source'

describe('data-only situational onboarding', () => {
  it.each([1, 2] as const)('discovers and compiles an unknown V%s without a handwritten registration', version => {
    const root = mkdtempSync(path.join(tmpdir(), 'sjt-onboarding-'))
    try {
      const source = unknownSource(version)
      const dir = path.join(root, source.content.identity.instrumentKey, '1.0.0'); mkdirSync(dir, { recursive: true })
      for (const [name, value] of Object.entries({ instrument: source.content, publication: source.publication, scientific: source.scientific })) writeFileSync(path.join(dir, name + '.json'), JSON.stringify(value))
      const discovered = discoverSources(root)
      expect(renderManifest(discovered)).toBe(renderManifest(discoverSources(root)))
      const { content, publication, scientific } = discovered[0]!
      const parsed = instrumentSourceSchema.parse({ content, publication, scientific })
      expect(evaluateSituationalPublicationGate(parsed), JSON.stringify(evaluateSituationalPublicationGate(parsed).errors)).toMatchObject({ eligibleToPublish: true, scorerKey: 'situational.default' })
      const draft = createSituationalInstrumentRegistry([parsed])
      expect(selectPublishedSituationPackage(draft.packages, source.content.identity.instrumentKey)).toBeUndefined()
      const registry = createSituationalInstrumentRegistry([publish(parsed)])
      expect(selectPublishedSituationPackage(registry.packages, source.content.identity.instrumentKey)?.definition.schemaVersion).toBe(version)
      for (const filename of ['situation-package.registry.ts', 'situation-definition.ts', 'situation-scoring.ts', 'situational-runtime.service.ts']) expect(readFileSync(path.resolve(__dirname, '../../modules/situational', filename), 'utf8')).not.toContain(source.content.identity.instrumentKey)
      expect(() => createSituationalInstrumentRegistry([parsed, parsed])).toThrow(/Duplicate/)
      symlinkSync(path.join(dir, 'instrument.json'), path.join(dir, 'escape.json'))
      expect(() => discoverSources(root)).toThrow(/Symlink/)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('blocks malformed, incomplete and inaccurate content with stable errors', () => {
    expect(evaluateSituationalPublicationGate({})).toMatchObject({ eligibleToPublish: false, errors: expect.arrayContaining([expect.objectContaining({ code: 'SOURCE_SCHEMA' })]) })
    const source = unknownSource(); source.content.goldenCases = []
    expect(evaluateSituationalPublicationGate(source).eligibleToPublish).toBe(false)
    const broken = unknownSource(); delete broken.content.goldenCases[0]!.expected.metrics[broken.content.goldenCases[0]!.expected.metricKeys[0]!]
    expect(evaluateSituationalPublicationGate(broken).errors).toContainEqual(expect.objectContaining({ code: 'GOLDEN_METRIC_COVERAGE' }))
    const wrong = unknownSource(); wrong.content.goldenCases[0]!.expected.quality = 'invalid'
    expect(evaluateSituationalPublicationGate(wrong).eligibleToPublish).toBe(false)
    const v2 = unknownSource(2); v2.content.goldenCases = v2.content.goldenCases.slice(0, 1)
    expect(evaluateSituationalPublicationGate(v2).eligibleToPublish).toBe(false)
  })
  it('keeps scientific provenance outside executable publication', () => {
    const source = unknownSource(); source.content.definition.source = {}; source.content.definition.license = { status: 'unknown', redistribution: 'unknown' }
    expect(evaluateSituationalPublicationGate(source).eligibleToPublish).toBe(true)
  })
  it('requires content-bound publication, rejects fake migration, and preserves retired identity', () => {
    const source = unknownSource(); source.publication.releaseStatus = 'PUBLISHED'
    expect(() => createSituationalInstrumentRegistry([source])).toThrow(/PUBLICATION_REVIEW/)
    publish(source); source.content.definition.scenes[0]!.title += ' changed'
    expect(() => createSituationalInstrumentRegistry([source])).toThrow(/PUBLICATION_REVIEW/)
    source.publication.review = { kind: 'migration', baselineCommit: 'a'.repeat(40), contentDigest: publicationContentDigest(source.content) }
    expect(() => createSituationalInstrumentRegistry([source])).toThrow(/UNRECOGNIZED/)
    publish(source); source.publication.releaseStatus = 'RETIRED'
    const registry = createSituationalInstrumentRegistry([source])
    expect(registry.get(source.content.identity.instrumentKey, '1.0.0')).toBeDefined()
    expect(selectPublishedSituationPackage(registry.packages, source.content.identity.instrumentKey)).toBeUndefined()
  })
  it('prevents replacing or deleting an already-published identity', () => {
    const previous = publish(unknownSource()), next = structuredClone(previous)
    expect(immutableReleaseIssues([previous], [next])).toEqual([])
    next.content.definition.scenes[0]!.title += ' edited'
    expect(immutableReleaseIssues([previous], [next])[0]).toMatch(/PUBLISHED_CONTENT_CHANGED/)
    expect(immutableReleaseIssues([previous], [])[0]).toMatch(/PUBLISHED_IDENTITY_REMOVED/)
    next.content.identity.instrumentVersion = '1.0.1'
    expect(immutableReleaseIssues([previous], [previous, next])).toEqual([])
  })
  it('classifies content and generated paths without allowing core or traversal', () => {
    const root = 'server-version/backend/src/modules/situational/'
    expect(classifySituationalPath(root + 'instruments/new-task/1.0.0/instrument.json')).toBe('INSTRUMENT_OWNED')
    expect(classifySituationalPath(root + 'onboarding/instruments.generated.ts')).toBe('GENERATED')
    for (const p of ['situation-scoring.ts', 'onboarding/path-policy.ts', 'instruments/new-task/1.0.0/../../evil.ts']) expect(classifySituationalPath(root + p)).toBe('SHARED_CORE')
  })
  it('checks real review authority and exact reviewed content rather than an APPROVED string', async () => {
    const source = publish(unknownSource())
    const approval = { id: 123, state: 'APPROVED', commit_id: 'a'.repeat(40), user: { login: 'reviewer', type: 'User' } }
    let permission = 'write'
    const get = async (route: string) => route.includes('/permission') ? { permission } : route.includes('/reviews?') ? [approval] : route.endsWith('/reviews/123') ? approval : { user: { login: 'author' }, base: { repo: { full_name: 'caohuibj/eduK12-new-version' } } }
    await expect(verifyGitHubPublicationReview(source, get, () => source.content)).resolves.toBeUndefined()
    permission = 'read'
    await expect(verifyGitHubPublicationReview(source, get, () => source.content)).rejects.toThrow(/permission/)
    permission = 'write'
    await expect(verifyGitHubPublicationReview(source, get, () => ({ ...source.content, catalogOrder: 99 }))).rejects.toThrow(/current content/)
    approval.state = 'DISMISSED'
    await expect(verifyGitHubPublicationReview(source, get, () => source.content)).rejects.toThrow(/approval/)
  })
})
