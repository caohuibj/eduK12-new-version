import type { Prisma } from '@prisma/client'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { syncSjtGitReleases } from '../../modules/situational/git-publish'

const { references, publishContentRelease, reconcileGitGovernedArtifact } = vi.hoisted(() => ({
  references: vi.fn(),
  publishContentRelease: vi.fn(),
  reconcileGitGovernedArtifact: vi.fn(),
}))

vi.mock('../../modules/situational/git-release', () => ({
  readSjtGitReleasePlan: () => ({ declarations: [{
    effectiveState: 'ONLINE',
    pkg: { key: 'sample-sjt', instrumentVersion: '1.0.0' },
    release: { releaseKey: 'first', contentVersion: '1.0.0', parameterVersion: '1.0.0', reportVersion: '1.0.0', state: 'ONLINE', allowedEntries: ['SURVEY'] },
    axes: { content: 'content', parameters: 'parameters', report: 'report' },
    content: {},
  }] }),
}))
vi.mock('../../modules/situational/standard-release.artifact', () => ({
  prepareSjtSurveyPublication: () => ({ artifact: { report: { template: {} } }, unit: { provenance: {} } }),
  sjtStandardMeasurementInput: () => ({}),
}))
vi.mock('../../modules/survey/governed-tool.media', () => ({ governedMediaRefs: references }))
vi.mock('../../modules/measurement-content/repository', () => ({ publishContentRelease }))
vi.mock('../../modules/scale/onboarding/git-release-actor', () => ({ assertGitScalePublisher: vi.fn() }))
vi.mock('../../modules/survey/governed-tool.service', () => ({ reconcileGitGovernedArtifact }))

const actor = 'system-actor'
const asset = { assetId: '45904853-6b9a-4ca6-a360-ea069fdc36a1', contentHash: 'a'.repeat(64), mimeType: 'image/png' }
const storedAsset = { id: asset.assetId, sha256: asset.contentHash, mimeType: asset.mimeType,
  objectKey: 'assessment/fixture.png', provider: 'local', sizeBytes: 120, deletedAt: null }
let root: string

beforeEach(() => {
  vi.resetAllMocks()
  root = mkdtempSync(join(tmpdir(), 'sjt-git-asset-rights-'))
  mkdirSync(join(root, 'sample-sjt'))
  references.mockReturnValue([asset, asset])
  publishContentRelease
    .mockResolvedValueOnce({ layer: 'MEASUREMENT', status: 'PUBLISHED', releaseId: 'measurement', content: { metrics: [] } })
    .mockResolvedValueOnce({ layer: 'REPORT', status: 'PUBLISHED', releaseId: 'report' })
  reconcileGitGovernedArtifact.mockResolvedValue({ action: 'PUBLISHED' })
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

function sync(findMany: ReturnType<typeof vi.fn>) {
  const tx = { $executeRaw: vi.fn(), $queryRaw: vi.fn().mockResolvedValue([]), storedAsset: { findMany } }
  return syncSjtGitReleases(root, tx as unknown as Prisma.TransactionClient, actor, 'a'.repeat(40))
}

it('checks publication rights once per distinct asset ID and retains a repeated reference', async () => {
  const findMany = vi.fn().mockResolvedValueOnce([{ id: asset.assetId }]).mockResolvedValueOnce([storedAsset])
  await expect(sync(findMany)).resolves.toEqual([{ action: 'PUBLISHED' }])
  expect(findMany).toHaveBeenNthCalledWith(1, {
    where: { id: { in: [asset.assetId] }, deletedAt: null,
      OR: [{ accessScope: 'PUBLIC' }, { accessScope: 'PRIVATE', ownerId: actor }] },
    select: { id: true },
  })
  expect(reconcileGitGovernedArtifact).toHaveBeenCalledWith(expect.anything(), actor, expect.objectContaining({
    unit: { provenance: expect.objectContaining({ governedMedia: { schemaVersion: 1, references: [asset, asset], sharedBy: actor } }) },
  }), expect.anything())
})

it('requires rights for every distinct ID before publishing', async () => {
  const missing = { ...asset, assetId: '91fe4f91-bcac-47c8-9789-82d09ccdbd22' }
  references.mockReturnValue([asset, asset, missing])
  const findMany = vi.fn().mockResolvedValueOnce([{ id: asset.assetId }])
  await expect(sync(findMany)).rejects.toThrow('SJT_GIT_ASSET_RIGHTS_REQUIRED')
  expect(findMany).toHaveBeenCalledTimes(1)
  expect(publishContentRelease).not.toHaveBeenCalled()
})

it('still validates every reference digest against the shared asset verifier', async () => {
  references.mockReturnValue([asset, { ...asset, contentHash: 'b'.repeat(64) }])
  const findMany = vi.fn().mockResolvedValueOnce([{ id: asset.assetId }]).mockResolvedValueOnce([storedAsset])
  await expect(sync(findMany)).rejects.toMatchObject({
    name: 'AssessmentAssetValidationError',
    issues: [expect.objectContaining({ path: 'references.1.contentHash' })],
  })
  expect(publishContentRelease).not.toHaveBeenCalled()
})
