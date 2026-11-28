import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'
import { discoverPackages, writePackage } from '../../modules/assessment-bundle/onboarding/loader'
import { scaffoldPackage } from '../../modules/assessment-bundle/onboarding/template'
import { checkBundleGitRelease, syncBundleGitReleases } from '../../modules/bundle-product/git-release'

describe('Bundle Git release declarations', () => {
  const key = 'git_release_check_fixture'
  let root: string, hash: string
  const manifest = (releases: unknown[], toolKey = key) =>
    fs.writeFileSync(path.join(root, key, 'releases.json'), JSON.stringify({ schemaVersion: 1, toolKey, releases }))
  const online = (releaseKey: string, contentHash: string) => ({
    releaseKey, state: 'ONLINE', allowedEntries: ['SURVEY'], contentHash,
    review: { contentHash, claims: ['independent_summary'] },
  })
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-git-check-'))
    const pack = scaffoldPackage(key)
    hash = hashDeclarativePackage(pack)
    writePackage(path.join(root, key, '1.0.0'), pack)
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  it('checks all four fixtures and leaves unlisted versions inert', async () => {
    const expected = { releaseKey: '1.0.0', fixtureCount: 4, contentHash: hash }
    expect(checkBundleGitRelease(root, key)).toEqual({ key, versions: [{ ...expected, state: 'UNLISTED', effectiveState: 'UNLISTED' }] })
    // No release manifest means no database access required.
    await expect(syncBundleGitReleases(root, {} as never, 'unused', 'a'.repeat(40))).resolves.toEqual([])
    manifest([online('1.0.0', hash)])
    expect(checkBundleGitRelease(root, key)).toEqual({ key, versions: [{ ...expected, state: 'ONLINE', effectiveState: 'ONLINE', allowedEntries: ['SURVEY'] }] })
    expect(discoverPackages(root)).toHaveLength(1)
  })

  it('rejects missing approvals, mismatched hashes, and a replacement with no declared predecessor', () => {
    const { review, ...release } = online('1.0.0', hash)
    manifest([release])
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_GIT_REVIEW_HASH_REQUIRED')
    manifest([{ ...release, review: { ...review, claims: [] } }])
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_CLAIM_NOT_APPROVED')
    manifest([{ ...release, contentHash: 'f'.repeat(64), review: { ...review, contentHash: 'f'.repeat(64) } }])
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_GIT_PACKAGE_HASH')
    manifest([{ ...release, review, replaces: '0.9.0' }])
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_GIT_REPLACEMENT_NOT_FOUND')
  })

  it('requires the matching tool key and the supported Survey entry', () => {
    const release = online('1.0.0', hash)
    manifest([release], 'another_bundle')
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_GIT_TOOL_KEY_MISMATCH')
    manifest([{ ...release, allowedEntries: ['TRAINING'] }])
    expect(() => checkBundleGitRelease(root, key)).toThrow()
  })

  it('resolves an ONLINE replacement without editing the predecessor selection', () => {
    const next = scaffoldPackage(key)
    next.manifest.definition.bundleVersion = '2.0.0'
    writePackage(path.join(root, key, '2.0.0'), next)
    manifest([online('1.0.0', hash), { ...online('2.0.0', hashDeclarativePackage(next)), replaces: '1.0.0' }])
    expect(checkBundleGitRelease(root, key).versions).toMatchObject([
      { releaseKey: '1.0.0', state: 'ONLINE', effectiveState: 'WITHDRAWN' },
      { releaseKey: '2.0.0', state: 'ONLINE', effectiveState: 'ONLINE' },
    ])
  })

  it('rejects a symlinked control file and unsafe key', () => {
    const file = path.join(root, key, 'releases.json')
    fs.symlinkSync(path.join(root, key, '1.0.0', 'publication.json'), file)
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_GIT_MANIFEST_REJECTED')
    expect(() => discoverPackages(root)).toThrow('PACKAGE_DIRECTORY_REQUIRED')
    expect(() => checkBundleGitRelease(root, '../elsewhere')).toThrow()
  })
})
