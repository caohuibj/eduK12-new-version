import fs from 'node:fs'
import path from 'node:path'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { packageEntry } from '../assessment-bundle/onboarding/catalog'
import { hashDeclarativePackage, PACKAGE_LIMITS, type DeclarativePackage } from '../assessment-bundle/onboarding/contract'
import { verifyPackageFixtures } from '../assessment-bundle/onboarding/fixtures'
import { loadPackage } from '../assessment-bundle/onboarding/loader'
import { publicDeclarationDependencies } from '../assessment-bundle/onboarding/public-check'
import { BUNDLE_KEY, EXACT_VERSION, HEX_HASH } from '../assessment-bundle/schema'
import { BundleDefinitionProvider } from './definition-provider'
import { applyGitBundleRelease, assertApprovedBundleClaims, gitBundleReviewSchema, lockBundleRelease, type GitBundleAction } from './package-release'

const keySchema = z.string().regex(BUNDLE_KEY).max(100)
const versionSchema = z.string().regex(EXACT_VERSION).max(64)
const hashSchema = z.string().regex(HEX_HASH)
const releaseManifest = z.object({
  schemaVersion: z.literal(1),
  releases: z.array(z.object({
    version: versionSchema,
    contentHash: hashSchema,
    status: z.enum(['ONLINE', 'HOLD', 'RETIRED']),
    review: gitBundleReviewSchema.optional(),
    replaces: versionSchema.optional(),
  }).strict()).max(100),
}).strict()
type Release = z.infer<typeof releaseManifest>['releases'][number]
export type BundleGitCheck = {
  key: string
  versions: Array<{ version: string; contentHash: string; fixtureCount: number; status: 'UNLISTED' | Release['status'] }>
}
export type BundleGitSyncResult = {
  key: string
  version: string
  contentHash: string
  status: Release['status']
  action: GitBundleAction
  releaseId?: string
}

function entries(directory: string) {
  if (!fs.lstatSync(directory).isDirectory()) throw new Error('BUNDLE_GIT_DIRECTORY_REQUIRED:' + directory)
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
}
function manifestFor(directory: string) {
  const manifestPath = path.join(directory, 'releases.json')
  const info = fs.lstatSync(manifestPath, { throwIfNoEntry: false })
  if (!info) return []
  if (!info.isFile() || info.size > PACKAGE_LIMITS.bytes) throw new Error('BUNDLE_GIT_MANIFEST_REJECTED:' + directory)
  const { releases } = releaseManifest.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
  if (new Set(releases.map(release => release.version)).size !== releases.length) {
    throw new Error('BUNDLE_GIT_DUPLICATE_VERSION:' + directory)
  }
  for (const release of releases) {
    if (release.status === 'ONLINE' && release.review?.contentHash !== release.contentHash) {
      throw new Error('BUNDLE_GIT_REVIEW_HASH_REQUIRED:' + release.version)
    }
    if (release.replaces && release.status === 'ONLINE' && (release.replaces === release.version ||
      !releases.some(prior => prior.version === release.replaces && prior.status === 'HOLD'))) {
      throw new Error('BUNDLE_GIT_REPLACEMENT_MUST_HOLD_PRIOR:' + release.version)
    }
  }
  return releases
}
function readBundle(root: string, key: string, checkedOnly: boolean) {
  keySchema.parse(key)
  const directory = path.join(root, key)
  const children = entries(directory)
  const releases = manifestFor(directory)
  const packages = new Map<string, { content: DeclarativePackage; fixtureCount: number; contentHash: string }>()
  for (const child of children) {
    if (child.name === 'releases.json') continue
    if (!child.isDirectory()) throw new Error('BUNDLE_GIT_VERSION_DIRECTORY_REQUIRED:' + child.name)
    const version = versionSchema.parse(child.name)
    const declaration = releases.find(item => item.version === version)
    if (!checkedOnly && !declaration) continue
    const content = loadPackage(path.join(directory, version))
    if (content.manifest.definition.bundleKey !== key || content.manifest.definition.bundleVersion !== version) {
      throw new Error('BUNDLE_GIT_PACKAGE_IDENTITY:' + key + '@' + version)
    }
    const contentHash = hashDeclarativePackage(content)
    if (declaration && declaration.contentHash !== contentHash) {
      throw new Error('BUNDLE_GIT_PACKAGE_HASH:' + key + '@' + version)
    }
    // Known, publicly listed private-source draft stubs can be checked without
    // installing private test material. The exception never applies to ONLINE.
    const dependencies = publicDeclarationDependencies(content)
    if (dependencies.blockers.length || declaration?.status === 'ONLINE' && dependencies.unavailablePrivateSources.length) {
      throw new Error([...dependencies.blockers, ...dependencies.unavailablePrivateSources].join('; '))
    }
    if (declaration?.status === 'ONLINE') {
      assertApprovedBundleClaims(content, declaration.review!.claims)
      const provider = new BundleDefinitionProvider([packageEntry(content)])
      const blockers = provider.publicationBlockers(key, version).filter(item => item !== 'BUNDLE_NOT_PUBLISHED')
      if (blockers.length) throw new Error(blockers.join('; '))
    }
    packages.set(version, { content, contentHash, fixtureCount: verifyPackageFixtures(content).length })
  }
  for (const release of releases) {
    if (!packages.has(release.version)) throw new Error('BUNDLE_GIT_UNKNOWN_VERSION:' + key + '@' + release.version)
  }
  if (checkedOnly && packages.size === 0) throw new Error('BUNDLE_GIT_NO_VERSION:' + key)
  return { releases, packages }
}
export function checkBundleGitRelease(root: string, key: string): BundleGitCheck {
  if (!fs.lstatSync(root).isDirectory()) throw new Error('BUNDLE_GIT_DIRECTORY_REQUIRED:' + root)
  const { releases, packages } = readBundle(root, key, true)
  return { key, versions: [...packages].map(([version, pack]) => ({
    version, contentHash: pack.contentHash, fixtureCount: pack.fixtureCount,
    status: releases.find(item => item.version === version)?.status ?? 'UNLISTED',
  })) }
}

/** Consume repository declarations in the caller's single deployment transaction.
 * A missing control file performs no publication or withdrawal. */
export async function syncBundleGitReleases(
  root: string, tx: Prisma.TransactionClient, actorId: string, gitCommitSha: string
): Promise<BundleGitSyncResult[]> {
  const tools = entries(root).map(dir => {
    if (!dir.isDirectory()) throw new Error('BUNDLE_GIT_TOOL_DIRECTORY_REQUIRED:' + dir.name)
    return { key: dir.name, ...readBundle(root, dir.name, false) }
  }).filter(tool => tool.releases.length > 0)
  if (!tools.length) return []
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bundle-git-release-sync'))`
  const results: BundleGitSyncResult[] = []
  for (const { key, releases, packages } of tools) {
    for (const { version } of [...releases].sort((a, b) => a.version.localeCompare(b.version))) {
      await lockBundleRelease(tx, key, version)
    }
    const replaced = new Set(releases.filter(item => item.status === 'ONLINE').flatMap(item => item.replaces ? [item.replaces] : []))
    // Stop the previous version before publication in this transaction. A later
    // failure rolls back both operations together.
    for (const release of [...releases].sort((a, b) => Number(a.status === 'ONLINE') - Number(b.status === 'ONLINE'))) {
      const { version, contentHash, status, review, replaces } = release
      const outcome = await applyGitBundleRelease(tx, {
        actorId, gitCommitSha, pack: packages.get(version)!.content, contentHash, status, review, replaces,
      })
      if (replaced.has(version) && (outcome.action === 'MANUAL_HOLD' || outcome.action === 'MANUAL_OVERRIDE')) {
        throw new Error('BUNDLE_GIT_REPLACEMENT_PREDECESSOR_CHANGED:' + key + '@' + version)
      }
      results.push({ key, version, contentHash, status, ...outcome })
    }
  }
  return results
}
