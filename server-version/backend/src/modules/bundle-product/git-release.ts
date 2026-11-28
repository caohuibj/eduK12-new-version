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
import { gitReleaseManifestFields, gitReleaseSelectionFields, resolveGitReleaseStates } from '../measurement-content/git-release-manifest'
import { BundleDefinitionProvider } from './definition-provider'
import { applyGitBundleRelease, assertApprovedBundleClaims, gitBundleReviewSchema, lockBundleRelease, type GitBundleAction } from './package-release'

const keySchema = z.string().regex(BUNDLE_KEY).max(100)
const versionSchema = z.string().regex(EXACT_VERSION).max(64)
const hashSchema = z.string().regex(HEX_HASH)
const releaseManifest = z.object({
  ...gitReleaseManifestFields,
  toolKey: keySchema,
  releases: z.array(z.object({
    ...gitReleaseSelectionFields,
    releaseKey: versionSchema,
    state: z.enum(['ONLINE', 'HOLD', 'WITHDRAWN', 'RETIRED']),
    allowedEntries: z.tuple([z.literal('SURVEY')]),
    contentHash: hashSchema,
    review: gitBundleReviewSchema.optional(),
    replaces: versionSchema.optional(),
  }).strict()).max(100),
}).strict()
type Release = z.infer<typeof releaseManifest>['releases'][number]
export type BundleGitCheck = {
  key: string
  versions: Array<{
    releaseKey: string
    contentHash: string
    fixtureCount: number
    state: 'UNLISTED' | Release['state']
    effectiveState: 'UNLISTED' | Release['state']
    allowedEntries?: Release['allowedEntries']
  }>
}
export type BundleGitSyncResult = Pick<Release, 'releaseKey' | 'contentHash' | 'state' | 'allowedEntries'> & {
  key: string
  effectiveState: Release['state']
  action: GitBundleAction
  releaseId?: string
}

function entries(directory: string) {
  if (!fs.lstatSync(directory).isDirectory()) throw new Error('BUNDLE_GIT_DIRECTORY_REQUIRED:' + directory)
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
}
function manifestFor(directory: string, key: string) {
  const manifestPath = path.join(directory, 'releases.json')
  const info = fs.lstatSync(manifestPath, { throwIfNoEntry: false })
  if (!info) return []
  if (!info.isFile() || info.size > PACKAGE_LIMITS.bytes) throw new Error('BUNDLE_GIT_MANIFEST_REJECTED:' + directory)
  const { releases, toolKey } = releaseManifest.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
  if (toolKey !== key) throw new Error('BUNDLE_GIT_TOOL_KEY_MISMATCH:' + key)
  const states = resolveGitReleaseStates(releases, { errorPrefix: 'BUNDLE_GIT' })
  for (const release of releases) {
    if (release.state === 'ONLINE' && release.review?.contentHash !== release.contentHash) {
      throw new Error('BUNDLE_GIT_REVIEW_HASH_REQUIRED:' + release.releaseKey)
    }
  }
  // An explicit withdrawal also has to respect predecessor ownership when
  // it is part of a replacement, even though its effective state is identical.
  const byKey = new Map(releases.map(release => [release.releaseKey, release]))
  const predecessors = new Set<string>()
  for (const release of releases) {
    if (states.get(release.releaseKey) !== 'ONLINE') continue
    let predecessor = release.replaces
    while (predecessor && !predecessors.has(predecessor)) {
      predecessors.add(predecessor)
      predecessor = byKey.get(predecessor)?.replaces
    }
  }
  return releases.map(release => ({
    ...release,
    effectiveState: states.get(release.releaseKey)!,
    isPredecessor: predecessors.has(release.releaseKey),
  }))
}
function readBundle(root: string, key: string, checkedOnly: boolean) {
  keySchema.parse(key)
  const directory = path.join(root, key)
  const children = entries(directory)
  const releases = manifestFor(directory, key)
  const packages = new Map<string, { content: DeclarativePackage; fixtureCount: number; contentHash: string }>()
  for (const child of children) {
    if (child.name === 'releases.json') continue
    if (!child.isDirectory()) throw new Error('BUNDLE_GIT_VERSION_DIRECTORY_REQUIRED:' + child.name)
    const version = versionSchema.parse(child.name)
    const declaration = releases.find(item => item.releaseKey === version)
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
    if (dependencies.blockers.length || declaration?.state === 'ONLINE' && dependencies.unavailablePrivateSources.length) {
      throw new Error([...dependencies.blockers, ...dependencies.unavailablePrivateSources].join('; '))
    }
    if (declaration?.state === 'ONLINE') {
      assertApprovedBundleClaims(content, declaration.review!.claims)
      const provider = new BundleDefinitionProvider([packageEntry(content)])
      const blockers = provider.publicationBlockers(key, version).filter(item => item !== 'BUNDLE_NOT_PUBLISHED')
      if (blockers.length) throw new Error(blockers.join('; '))
    }
    packages.set(version, { content, contentHash, fixtureCount: verifyPackageFixtures(content).length })
  }
  for (const release of releases) {
    if (!packages.has(release.releaseKey)) throw new Error('BUNDLE_GIT_UNKNOWN_VERSION:' + key + '@' + release.releaseKey)
  }
  if (checkedOnly && packages.size === 0) throw new Error('BUNDLE_GIT_NO_VERSION:' + key)
  return { releases, packages }
}
export function checkBundleGitRelease(root: string, key: string): BundleGitCheck {
  if (!fs.lstatSync(root).isDirectory()) throw new Error('BUNDLE_GIT_DIRECTORY_REQUIRED:' + root)
  const { releases, packages } = readBundle(root, key, true)
  return { key, versions: [...packages].map(([releaseKey, pack]) => {
    const release = releases.find(item => item.releaseKey === releaseKey)
    return {
      releaseKey, contentHash: pack.contentHash, fixtureCount: pack.fixtureCount,
      state: release?.state ?? 'UNLISTED',
      effectiveState: release?.effectiveState ?? 'UNLISTED',
      ...(release ? { allowedEntries: release.allowedEntries } : {}),
    }
  }) }
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
    for (const { releaseKey } of [...releases].sort((a, b) => a.releaseKey.localeCompare(b.releaseKey))) {
      await lockBundleRelease(tx, key, releaseKey)
    }
    // Withdrawal and publication share one transaction, including any publisher
    // validation that can reject the entire replacement.
    for (const release of [...releases].sort((a, b) => Number(a.effectiveState === 'ONLINE') - Number(b.effectiveState === 'ONLINE'))) {
      const { releaseKey, contentHash, allowedEntries, effectiveState, state, review, replaces } = release
      const selection = { key, releaseKey, contentHash, allowedEntries, state, effectiveState }
      if (effectiveState === 'HOLD') {
        results.push({ ...selection, action: 'UNCHANGED' })
        continue
      }
      const outcome = await applyGitBundleRelease(tx, {
        actorId, gitCommitSha, pack: packages.get(releaseKey)!.content, contentHash, state, effectiveState, allowedEntries, review, replaces,
      })
      const operatorPaused = outcome.action === 'MANUAL_HOLD' || outcome.action === 'MANUAL_OVERRIDE'
      if (effectiveState === 'WITHDRAWN' && release.isPredecessor && operatorPaused) {
        throw new Error('BUNDLE_GIT_REPLACEMENT_PREDECESSOR_CHANGED:' + key + '@' + releaseKey)
      }
      results.push({ ...selection, ...outcome })
    }
  }
  return results
}
