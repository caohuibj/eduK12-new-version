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
  const manifest = (releases: unknown[]) => fs.writeFileSync(path.join(root, key, 'releases.json'), JSON.stringify({ schemaVersion: 1, releases }))
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-git-check-'))
    const pack = scaffoldPackage(key)
    hash = hashDeclarativePackage(pack)
    writePackage(path.join(root, key, '1.0.0'), pack)
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  it('checks all four fixtures and leaves unlisted versions inert', async () => {
    const expected = { version: '1.0.0', fixtureCount: 4, contentHash: hash }
    expect(checkBundleGitRelease(root, key)).toEqual({ key, versions: [{ ...expected, status: 'UNLISTED' }] })
    // No release manifest means no database access required.
    await expect(syncBundleGitReleases(root, {} as never, 'unused', 'a'.repeat(40))).resolves.toEqual([])
    manifest([{ version: '1.0.0', status: 'ONLINE', contentHash: hash, review: { contentHash: hash, claims: ['independent_summary'] } }])
    expect(checkBundleGitRelease(root, key)).toEqual({ key, versions: [{ ...expected, status: 'ONLINE' }] })
    expect(discoverPackages(root)).toHaveLength(1)
  })

  it('rejects missing approvals, mismatched hashes, and a replacement with no prior hold', () => {
    const release = { version: '1.0.0', status: 'ONLINE', contentHash: hash }
    const review = { contentHash: hash, claims: ['independent_summary'] }
    manifest([release])
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_GIT_REVIEW_HASH_REQUIRED')
    manifest([{ ...release, review: { ...review, claims: [] } }])
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_CLAIM_NOT_APPROVED')
    manifest([{ ...release, contentHash: 'f'.repeat(64), review: { ...review, contentHash: 'f'.repeat(64) } }])
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_GIT_PACKAGE_HASH')
    manifest([{ ...release, review, replaces: '0.9.0' }])
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_GIT_REPLACEMENT_MUST_HOLD_PRIOR')
  })

  it('rejects a symlinked control file and unsafe key', () => {
    const file = path.join(root, key, 'releases.json')
    fs.symlinkSync(path.join(root, key, '1.0.0', 'publication.json'), file)
    expect(() => checkBundleGitRelease(root, key)).toThrow('BUNDLE_GIT_MANIFEST_REJECTED')
    expect(() => discoverPackages(root)).toThrow('PACKAGE_DIRECTORY_REQUIRED')
    expect(() => checkBundleGitRelease(root, '../elsewhere')).toThrow()
  })
})
