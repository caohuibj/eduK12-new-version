import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Prisma, PrismaClient } from '@prisma/client'
import { GIT_RELEASE_ACTOR_ID } from '../../utils/gitReleaseIdentity'

const declarationDirectories = {
  scale: 'scale/instruments',
  bundle: 'assessment-bundle/packages',
} as const

type Family = keyof typeof declarationDirectories

export function parseContentSelector(selector: string): { family: Family; toolKey: string } {
  const match = /^([a-z]+):([a-z][a-z0-9_-]{0,100})$/.exec(selector)
  if (!match || !Object.prototype.hasOwnProperty.call(declarationDirectories, match[1])) {
    throw new Error('Expected a supported family:toolKey (scale or bundle)')
  }
  const family = match[1] as Family
  const toolKey = match[2]
  if (!/^[a-z][a-z0-9_]*$/.test(toolKey)) {
    throw new Error('Invalid tool key')
  }
  return { family, toolKey }
}

function requireDirectory(path: string): string {
  if (!lstatSync(path).isDirectory()) throw new Error('Expected a real declaration directory: ' + path)
  return path
}

export async function checkContentRelease(repoRoot: string, selector: string) {
  const { family, toolKey } = parseContentSelector(selector)
  const modules = join(repoRoot, 'server-version/backend/src/modules')
  const root = requireDirectory(join(modules, declarationDirectories[family]))
  requireDirectory(join(root, toolKey))
  if (family === 'scale') {
    const { checkDeclaredScaleReleases } = await import('../scale/declarative/check')
    const releases = checkDeclaredScaleReleases(root, { repoRoot, toolKeys: [toolKey] })
    return { family, toolKey, releases: releases.map(({ releaseKey, state, triplet }) => ({
      releaseKey, state, combinationHash: triplet.combinationHash, contentHash: triplet.parts.CONTENT.hash,
    })) }
  }
  const { checkBundleGitRelease } = await import('../bundle-product/git-release')
  return { family, toolKey, releases: (await checkBundleGitRelease(root, toolKey)).versions }
}

export async function syncContentReleases(
  db: PrismaClient,
  inputRoot: string,
  options: { actorId: string; gitCommitSha: string },
) {
  const { actorId, gitCommitSha } = options
  if (actorId !== GIT_RELEASE_ACTOR_ID || !/^[0-9a-f]{40}$/.test(gitCommitSha)) {
    throw new Error('Content sync requires the reserved deployment identity and an exact main SHA')
  }
  requireDirectory(inputRoot)
  const scaleRoot = requireDirectory(join(inputRoot, 'scale'))
  const hasScaleControl = readdirSync(scaleRoot, { withFileTypes: true }).some(entry =>
    /^[a-z][a-z0-9_]*$/.test(entry.name) && entry.isDirectory() &&
    lstatSync(join(scaleRoot, entry.name, 'releases.json'), { throwIfNoEntry: false })?.isFile())
  if (!hasScaleControl) throw new Error('The committed snapshot must contain a Scale release control file')
  const bundleRoot = requireDirectory(join(inputRoot, 'bundle'))
  const { loadDeclaredScaleReleases } = await import('../scale/declarative/load')
  const { assertLiveScaleReportArtwork } = await import('../scale/declarative/live-artwork')
  const releases = loadDeclaredScaleReleases(scaleRoot)
  assertLiveScaleReportArtwork(scaleRoot, releases)
  const { syncGitScaleReleasesInTransaction } = await import('../scale/onboarding/git-release-publication')
  const { syncBundleGitReleases } = await import('../bundle-product/git-release')

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Hold the existing Scale sync lock to serialize this entire snapshot
    // against another content sync or a legacy Scale-only deployment.
    const scale = await syncGitScaleReleasesInTransaction(tx, { actorId, gitCommitSha, releases })
    const bundle = await syncBundleGitReleases(bundleRoot, tx, actorId, gitCommitSha)
    return { gitCommitSha, scale, bundle }
  }, { timeout: 120_000 })
}
