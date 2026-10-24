import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import originalTeacherDemo from '../../modules/situational/authoring/examples/teacher-demonstration.json'
import { sjtNativeStagedTemplate } from '../fixtures/sjt-native-staged.fixture'
import { assertSjtReleaseReady, compileSjtTemplate } from '../../modules/situational/authoring/template'
import { deriveAuthoritativeSituationalTrajectory, projectReachableSituationDefinitionForScoring } from '../../modules/situational/situation-trajectory'
import { scoreSituationalModel } from '../../modules/situational/situation-model-resolver'

const mocks = vi.hoisted(() => ({
  lock: vi.fn(), retain: vi.fn(),
  db: {
    $transaction: vi.fn(), $queryRaw: vi.fn(),
    storedAsset: { findMany: vi.fn() },
    user: { findUnique: vi.fn() }, course: { findUnique: vi.fn() },
    sjtAuthorRelease: { findUnique: vi.fn() }, sjtReleaseGrant: { findMany: vi.fn() },
    sjtAuthorDraft: { findUnique: vi.fn(), create: vi.fn() }, sjtAuthorAudit: { create: vi.fn() },
  },
}))
vi.mock('../../config/database', () => ({ prisma: mocks.db }))
vi.mock('../../services/assetStorage', () => ({ lockStoredAssetRows: mocks.lock }))
vi.mock('../../modules/assessment-media/assessment-asset', () => ({ retainAssessmentAssetReferences: mocks.retain }))
import { assertSjtAuthorMedia, retainSjtAuthorReleaseMedia, sjtAuthorImages,
  SJT_AUTHOR_MAX_IMAGE_BYTES, SJT_AUTHOR_MEDIA_SCOPE, type SjtAuthorImage } from '../../modules/situational/authoring/media'
import { adaptSjtRelease } from '../../modules/situational/authoring/service'

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const image = (): SjtAuthorImage => ({
  asset: { assetId: 'synthetic-upload-image', contentHash: 'a'.repeat(64), mimeType: 'image/png' },
  altText: 'Two fictional blank classroom display panels.',
  caption: 'Synthetic contract image, not a real licensed asset.',
  rightsStatus: 'self_authored', rightsNote: 'Synthetic test metadata only; no real asset or license is asserted.',
})
const withImage = (picture = image()) => {
  const template = structuredClone(sjtNativeStagedTemplate)
  template.nodes[1]!.image = picture
  return template
}
const stored = () => ({ id: image().asset.assetId, ownerId: 'author', accessScope: 'PRIVATE',
  scopeId: SJT_AUTHOR_MEDIA_SCOPE, provider: 'local', objectKey: 'synthetic/upload-image.png',
  deletedAt: null, mimeType: 'image/png', sha256: image().asset.contentHash, sizeBytes: 20 })
const now = new Date('2026-10-24T12:00:00.000Z')
const sourceTemplate = withImage()
const sourceCompiled = compileSjtTemplate(sourceTemplate)
const release = { id: 'synthetic-upload-release', instrumentKey: sourceTemplate.instrumentKey,
  instrumentVersion: sourceTemplate.instrumentVersion, definitionHash: sourceCompiled.definitionHash,
  contentDigest: sourceCompiled.contentDigest, status: 'PUBLISHED', authorizationPolicy: 'COURSE_GRANT_V1',
  sourceDraftId: 'synthetic-upload-draft', authorId: 'author' }
const sourceDraft = { id: release.sourceDraftId, ownerId: 'author', status: 'PUBLISHED',
  contentDigest: release.contentDigest, template: sourceTemplate }
const receipt = () => ({ policy: 'COURSE_GRANT_V1', grantId: 'synthetic-adapt-grant', grantVersion: 1,
  permission: 'ADAPT', releaseId: release.id, instrumentKey: release.instrumentKey,
  instrumentVersion: release.instrumentVersion, definitionHash: release.definitionHash,
  contentDigest: release.contentDigest, granteeTeacherId: 'adapter', courseId: 'synthetic-course',
  purpose: 'TRAINING_COURSE', validFrom: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z', admittedAt: now.toISOString() })
const adaptSource = () => ({ template: sourceTemplate, sourceOwnerId: 'author', grantId: receipt().grantId,
  provenance: { protocol: 'sjt-adaptation-v1', sourceDraftId: sourceDraft.id,
    sourceAuthorId: 'author', receipt: receipt() } })
const grant = () => ({ ...receipt(), id: receipt().grantId, version: 1, status: 'ACTIVE',
  validFrom: new Date(receipt().validFrom), expiresAt: new Date(receipt().expiresAt) })
const adaptInput = { instrumentKey: release.instrumentKey, instrumentVersion: release.instrumentVersion,
  definitionHash: release.definitionHash, contentDigest: release.contentDigest,
  courseId: receipt().courseId, grantId: receipt().grantId, grantVersion: 1,
  newInstrumentKey: 'synthetic-upload-image-adapted', newInstrumentVersion: '2.0.0' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
  mocks.db.$transaction.mockImplementation(fn => fn(mocks.db))
  mocks.db.$queryRaw.mockResolvedValue([])
  mocks.db.storedAsset.findMany.mockResolvedValue([stored()])
  mocks.db.user.findUnique.mockResolvedValue({ role: 'TEACHER', isActive: true, isFrozen: false,
    teacherApproved: true, expiresAt: null })
  mocks.db.course.findUnique.mockResolvedValue({ creatorId: 'adapter', courseType: 'TRAINING_COURSE', isLibrary: false })
  mocks.db.sjtReleaseGrant.findMany.mockResolvedValue([grant()])
  mocks.db.sjtAuthorRelease.findUnique.mockResolvedValueOnce(release).mockResolvedValue(null)
  mocks.db.sjtAuthorDraft.findUnique.mockResolvedValue(sourceDraft)
  mocks.db.sjtAuthorDraft.create.mockImplementation(({ data }) => ({ id: 'adapted-draft', ...data }))
})
afterEach(() => vi.useRealTimers())

describe('formal upload single static IMAGE contract', () => {
  it('preserves the original committed text-only compiler bytes and hashes without relicensing its fixture', () => {
    // Captured BEFORE edits from c529e11452d968fe2a725abf238e5ad4515fa858.
    // Original template.ts SHA-256: 00f4a55324219873d549de3204f48e82fd44bd8ee150bd838fac8332231c1864.
    // This legacy input is compatibility-only, not a positive publication/rights fixture.
    const compiled = compileSjtTemplate(originalTeacherDemo)
    expect(sha256(readFileSync('src/modules/situational/authoring/examples/teacher-demonstration.json')))
      .toBe('785f883bca02e6abcdbdc3958f86fb15fa2e03e3d7267fde93bbaaed624cec11')
    expect(sha256(JSON.stringify(compiled))).toBe('b324901915031e85cdf9a3a8420af166a83c5e8d3c93d05e1dfba017a44b11ca')
    expect(Buffer.byteLength(JSON.stringify(compiled))).toBe(634106)
    expect(sha256(JSON.stringify(compiled.package))).toBe('77eff195b400d041cfe46e13181ddfca40fe0ad2e93bb318258be49055260127')
    expect(compiled.definitionHash).toBe('6b2705131e55a445750e0dc503003840ac996b2c0cfa624cf04ace0c1a003d2c')
    expect(compiled.contentDigest).toBe('967a7e6085da7aedcbab7567deb33c0c29d8a92e1d0e746ab54ce349feff94a3')
    expect(compiled.package.goldenCases).toHaveLength(134)
  })

  it('changes only presentation, retaining exact asset/alt, bridge text and independent synthetic scoring oracles', () => {
    const baseline = compileSjtTemplate(sjtNativeStagedTemplate)
    const compiled = compileSjtTemplate(withImage())
    expect(() => assertSjtReleaseReady(compiled)).not.toThrow()
    expect(compiled.package.definition.scenes[0]!.stimulus).toEqual(baseline.package.definition.scenes[0]!.stimulus)
    const stimulus = compiled.package.definition.scenes[1]!.stimulus
    expect(stimulus).toEqual({ type: 'IMAGE', text: baseline.package.definition.scenes[1]!.stimulus.text,
      asset: image().asset, altText: image().altText, caption: image().caption })
    expect(stimulus.text).toBe(sjtNativeStagedTemplate.transitions[0]!.bridgeText + '\n\n' + sjtNativeStagedTemplate.nodes[1]!.stimulus)
    expect(stimulus).not.toHaveProperty('rightsStatus')
    expect(stimulus).not.toHaveProperty('rightsNote')
    expect(compiled.package.goldenCases).toEqual(baseline.package.goldenCases)
    const withoutImage = structuredClone(compiled.package)
    withoutImage.definition.scenes[1]!.stimulus = structuredClone(baseline.package.definition.scenes[1]!.stimulus)
    expect(withoutImage).toEqual(baseline.package)
    expect(compiled.definitionHash).not.toBe(baseline.definitionHash)
    expect(compiled.contentDigest).not.toBe(baseline.contentDigest)
    expect(compiled.template.sourceNote).toBe(sjtNativeStagedTemplate.sourceNote)
    expect(compiled.template.licenseStatus).toBe(sjtNativeStagedTemplate.licenseStatus)
    for (const golden of compiled.package.goldenCases) {
      const trajectory = deriveAuthoritativeSituationalTrajectory(compiled.package.definition, golden.responses)
      const definition = projectReachableSituationDefinitionForScoring(compiled.package.definition, trajectory)
      const scored = scoreSituationalModel(definition, golden.responses, { responsesValidated: true })
      expect(Object.fromEntries(scored.metrics.map(metric => [metric.key, metric.value]))).toEqual(golden.expected.metrics)
    }
  })

  it('expands different incoming bridges without changing the image identity or losing the mandatory text fallback', () => {
    const template = withImage({ ...image(), caption: '' })
    template.transitions[1]!.bridgeText = 'A different synthetic neutral bridge.'
    const compiled = compileSjtTemplate(template)
    const pictures = compiled.package.definition.scenes.filter(scene => scene.stimulus.type === 'IMAGE')
    expect(pictures).toHaveLength(2)
    expect(pictures.map(scene => scene.stimulus.text)).toEqual([
      template.transitions[0]!.bridgeText + '\n\n' + template.nodes[1]!.stimulus,
      template.transitions[1]!.bridgeText + '\n\n' + template.nodes[1]!.stimulus,
    ])
    for (const scene of pictures) expect(scene.stimulus).toMatchObject({ asset: image().asset, altText: image().altText })
    for (const scene of pictures) expect(scene.stimulus).not.toHaveProperty('caption')
  })

  it.each([
    ['empty alt', { ...image(), altText: ' ' }],
    ['long alt', { ...image(), altText: 'x'.repeat(301) }],
    ['raw ID', { assetId: image().asset.assetId }],
    ['bad hash', { ...image(), asset: { ...image().asset, contentHash: 'bad' } }],
    ['video MIME', { ...image(), asset: { ...image().asset, mimeType: 'video/mp4' } }],
    ['animated GIF', { ...image(), asset: { ...image().asset, mimeType: 'image/gif' } }],
    ['SVG', { ...image(), asset: { ...image().asset, mimeType: 'image/svg+xml' } }],
    ['external URL', { ...image(), url: 'https://invalid.example/image.png' }],
    ['multiple images', [image(), image()]],
    ['comic panels', { ...image(), panels: [image()] }],
  ])('rejects %s rather than widening the upload media protocol', (_name, picture) => {
    const template = withImage()
    Object.assign(template.nodes[1]!, { image: picture })
    expect(() => compileSjtTemplate(template)).toThrow()
  })

  it('rejects VIDEO/COMIC node fields and missing fallback text', () => {
    for (const extra of [{ video: {} }, { comic: {} }, { stimulus: '' }]) {
      const template = withImage()
      Object.assign(template.nodes[1]!, extra)
      expect(() => compileSjtTemplate(template)).toThrow()
    }
  })

  it.each([{ rightsStatus: 'unknown' as const }, { rightsNote: '' }])('requires image-specific rights at readiness and media admission: %j', async changes => {
    const template = withImage({ ...image(), ...changes })
    const compiled = compileSjtTemplate(template)
    expect(() => assertSjtReleaseReady(compiled)).toThrow()
    await expect(assertSjtAuthorMedia(mocks.db as never, 'author', template)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.retain).not.toHaveBeenCalled()
  })

  it('uses the same extractor for online and upload documents, without introducing DB work for text-only uploads', async () => {
    expect(sjtAuthorImages(withImage())).toEqual([image()])
    expect(sjtAuthorImages({ templateVersion: 'sjt-online-v1', display: { scenes: [{ image: image() }] } })).toEqual([image()])
    await expect(assertSjtAuthorMedia(mocks.db as never, 'author', sjtNativeStagedTemplate)).resolves.toEqual([])
    await expect(assertSjtAuthorMedia(mocks.db as never, 'author', { templateVersion: 'sjt-upload-v1' })).resolves.toEqual([])
    expect(mocks.lock).not.toHaveBeenCalled()
    expect(mocks.db.storedAsset.findMany).not.toHaveBeenCalled()
  })

  it('locks the private author identity before retaining the existing release reference type', async () => {
    await retainSjtAuthorReleaseMedia(mocks.db as never, 'author', 'synthetic-release', withImage())
    expect(mocks.lock).toHaveBeenCalledWith(mocks.db, [image().asset.assetId])
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.db.storedAsset.findMany.mock.invocationCallOrder[0]!)
    expect(mocks.retain).toHaveBeenCalledWith({ db: mocks.db, references: [image().asset],
      owner: { entityType: 'SjtAuthorRelease', entityId: 'synthetic-release', field: 'media' } })
  })

  it.each([
    ['foreign owner', { ownerId: 'other' }], ['other product', { scopeId: 'survey-project' }],
    ['public asset', { accessScope: 'PUBLIC_CHECKIN' }], ['deleted', { deletedAt: now }],
    ['digest mismatch', { sha256: 'b'.repeat(64) }], ['MIME mismatch', { mimeType: 'image/jpeg' }],
    ['zero bytes', { sizeBytes: 0 }], ['oversize', { sizeBytes: SJT_AUTHOR_MAX_IMAGE_BYTES + 1 }],
    ['external provider', { provider: 'external' }], ['missing object', { objectKey: '' }],
  ])('rejects upload images with %s using unchanged media protections', async (_name, changes) => {
    mocks.db.storedAsset.findMany.mockResolvedValue([{ ...stored(), ...changes }])
    await expect(retainSjtAuthorReleaseMedia(mocks.db as never, 'author', 'synthetic-release', withImage())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.retain).not.toHaveBeenCalled()
  })

  it('rejects missing rows and more than 20 unique images before retaining anything', async () => {
    mocks.db.storedAsset.findMany.mockResolvedValue([])
    await expect(assertSjtAuthorMedia(mocks.db as never, 'author', withImage())).rejects.toThrow()
    vi.clearAllMocks()
    const nodes = Array.from({ length: 21 }, (_, index) => ({ image: {
      ...image(), asset: { ...image().asset, assetId: 'synthetic-image-' + index },
    } }))
    await expect(assertSjtAuthorMedia(mocks.db as never, 'author', { templateVersion: 'sjt-upload-v1', nodes })).rejects.toThrow(/20/)
    expect(mocks.lock).not.toHaveBeenCalled()
    expect(mocks.db.storedAsset.findMany).not.toHaveBeenCalled()
  })

  it('requires exact source ownership, asset identity and ADAPT provenance, never raw ID/hash knowledge', async () => {
    const authorized = withImage({ ...image(), rightsStatus: 'authorized' })
    await expect(assertSjtAuthorMedia(mocks.db as never, 'adapter', authorized)).rejects.toThrow()
    await expect(assertSjtAuthorMedia(mocks.db as never, 'adapter', authorized, { adaptSource: adaptSource() })).resolves.toEqual([image().asset])
    await expect(assertSjtAuthorMedia(mocks.db as never, 'adapter', withImage(), { adaptSource: adaptSource() })).rejects.toThrow()
    const wrongPermission = adaptSource(); wrongPermission.provenance.receipt.permission = 'DISTRIBUTE'
    const wrongAsset = adaptSource(); wrongAsset.template = withImage({ ...image(), asset: { ...image().asset, contentHash: 'b'.repeat(64) } })
    const unknownRights = adaptSource(); unknownRights.template = withImage({ ...image(), rightsStatus: 'unknown' })
    for (const source of [wrongPermission, wrongAsset, unknownRights,
      { ...adaptSource(), grantId: 'forged' }, { ...adaptSource(), sourceOwnerId: 'forged' }])
      await expect(assertSjtAuthorMedia(mocks.db as never, 'adapter', authorized, { adaptSource: source })).rejects.toThrow()
  })

  it('normalizes copied upload images only after the real ADAPT gate, clears golden cases and never mutates source rights', async () => {
    const adapted = await adaptSjtRelease({ userId: 'adapter', admin: false }, release.id, adaptInput)
    const template = compileSjtTemplate(adapted.template).template
    expect(template.nodes[1]!.image).toEqual({ ...image(), rightsStatus: 'authorized' })
    expect(template.cases).toEqual([])
    expect(template.sourceNote).toBe(sourceTemplate.sourceNote)
    expect(template.licenseStatus).toBe(sourceTemplate.licenseStatus)
    expect(adapted.adaptationSource).toMatchObject({ sourceAuthorId: 'author', sourceDraftId: sourceDraft.id,
      receipt: { permission: 'ADAPT', grantId: receipt().grantId } })
    expect(mocks.db.storedAsset.findMany).toHaveBeenCalledTimes(1)
    expect(sourceTemplate.nodes[1]!.image!.rightsStatus).toBe('self_authored')
    expect(sourceTemplate.cases).toEqual(sjtNativeStagedTemplate.cases)
    expect(() => assertSjtReleaseReady(compileSjtTemplate(adapted.template))).toThrow()
  })

  it('does not use redistribution metadata or DISTRIBUTE permission to authorize image adaptation', async () => {
    mocks.db.sjtReleaseGrant.findMany.mockResolvedValue([{ ...grant(), permission: 'DISTRIBUTE' }])
    await expect(adaptSjtRelease({ userId: 'adapter', admin: false }, release.id, adaptInput)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.db.sjtAuthorDraft.create).not.toHaveBeenCalled()
    expect(mocks.db.storedAsset.findMany).not.toHaveBeenCalled()
    expect(sourceTemplate.nodes[1]!.image!.rightsStatus).toBe('self_authored')
  })
})
