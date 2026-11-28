import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Prisma, PrismaClient } from '@prisma/client'
import { GIT_RELEASE_ACTOR_ID } from '../../utils/gitReleaseIdentity'

const declarationDirectories = {
  scale: 'scale/instruments',
  bundle: 'assessment-bundle/packages',
  cognitive: 'cognitive/tasks',
  sjt: 'situational/instruments',
  form: 'form/templates',
} as const

type Family = keyof typeof declarationDirectories

export function parseContentSelector(selector: string): { family: Family; toolKey: string } {
  const match = /^([a-z]+):([a-z][a-z0-9_-]{0,100})$/.exec(selector)
  if (!match || !Object.prototype.hasOwnProperty.call(declarationDirectories, match[1])) {
    throw new Error('Expected a supported family:toolKey: ' + Object.keys(declarationDirectories).join(', '))
  }
  const family = match[1] as Family
  const toolKey = match[2]
  if ((family === 'scale' || family === 'bundle') && !/^[a-z][a-z0-9_]*$/.test(toolKey)) {
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
    const { scaleDeclarationStates } = await import('../scale/declarative/replacement')
    const releases = checkDeclaredScaleReleases(root, { repoRoot, toolKeys: [toolKey] })
    const states = scaleDeclarationStates(releases)
    return { family, toolKey, releases: releases.map(({ releaseKey, state, triplet }) => ({
      releaseKey, state, effectiveState: states.get(releaseKey), combinationHash: triplet.combinationHash, contentHash: triplet.parts.CONTENT.hash,
    })) }
  }
  if (family === 'cognitive') {
    const { checkCognitiveGitRelease } = await import('../cognitive/git-release')
    return { family, toolKey, releases: await checkCognitiveGitRelease(root, toolKey) }
  }
  if (family === 'sjt') {
    const { checkSjtGitRelease } = await import('../situational/git-release')
    const result = checkSjtGitRelease(root, toolKey)
    return { family, ...result }
  }
  if (family === 'form') {
    const { checkFormGitRelease } = await import('../form/git-release')
    const { releases } = checkFormGitRelease(root, toolKey)
    return { family, toolKey, releases: releases.map(({ releaseKey, contentVersion, reportVersion, contentHash, reportHash, state, effectiveState }) => ({
      releaseKey, contentVersion, reportVersion, contentHash, reportHash, state, effectiveState,
    })) }
  }
  const { checkBundleGitRelease } = await import('../bundle-product/git-release')
  return { family, toolKey, releases: (await checkBundleGitRelease(root, toolKey)).versions }
}

const releaseToolNames: Record<Family, RegExp> = {
  scale: /^[a-z][a-z0-9_]*$/,
  bundle: /^[a-z][a-z0-9_]*$/,
  cognitive: /^[a-z][a-z0-9_-]{0,79}$/,
  sjt: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  form: /^[a-z][a-z0-9_-]{0,100}$/,
}

function selectedFamilyRoot(inputRoot: string, family: Family) {
  const root = join(inputRoot, family)
  const directory = lstatSync(root, { throwIfNoEntry: false })
  if (!directory) return undefined
  if (!directory.isDirectory()) throw new Error('Expected a real content family directory: ' + root)

  let selected = false
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!releaseToolNames[family].test(entry.name)) continue
    const toolRoot = join(root, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Expected a real declaration directory: ' + toolRoot)
    if (!entry.isDirectory()) continue
    const control = join(toolRoot, 'releases.json')
    const stat = lstatSync(control, { throwIfNoEntry: false })
    if (!stat) continue
    if (!stat.isFile()) throw new Error('Expected a regular release control file: ' + control)
    selected = true
  }
  return selected ? root : undefined
}

function contentTransactionTimeout() {
  const value = process.env.CONTENT_RELEASE_TRANSACTION_TIMEOUT_MS
  if (value === undefined) return 120_000
  const milliseconds = Number(value)
  if (!/^[1-9][0-9]*$/.test(value) || milliseconds > 2_147_483_647) {
    throw new Error('CONTENT_RELEASE_TRANSACTION_TIMEOUT_MS must be a positive number of milliseconds (up to 2147483647)')
  }
  return milliseconds
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
  const timeout = contentTransactionTimeout()
  requireDirectory(inputRoot)
  const scaleRoot = selectedFamilyRoot(inputRoot, 'scale')
  const cognitiveRoot = selectedFamilyRoot(inputRoot, 'cognitive')
  const sjtRoot = selectedFamilyRoot(inputRoot, 'sjt')
  const formRoot = selectedFamilyRoot(inputRoot, 'form')
  const bundleRoot = selectedFamilyRoot(inputRoot, 'bundle')
  if (!scaleRoot && !cognitiveRoot && !sjtRoot && !formRoot && !bundleRoot) {
    throw new Error('The committed snapshot must contain a supported content release control file')
  }

  const { prepareGitScaleReleases, lockGitReleaseSnapshot, applyGitScaleReleases } = await import('../scale/onboarding/git-release-publication')
  const { prepareCognitiveGitReleases, applyCognitiveGitReleases } = await import('../cognitive/git-release')
  const { prepareSjtGitReleases, applySjtGitReleases } = await import('../situational/git-publish')
  const { prepareFormGitReleases, applyFormGitReleases } = await import('../form/git-release')
  const { prepareBundleGitReleases, applyBundleGitReleases } = await import('../bundle-product/git-release')

  let scalePlan: ReturnType<typeof prepareGitScaleReleases> | undefined
  if (scaleRoot) {
    const { loadDeclaredScaleReleases } = await import('../scale/declarative/load')
    const { assertLiveScaleReportArtwork } = await import('../scale/declarative/live-artwork')
    const releases = loadDeclaredScaleReleases(scaleRoot)
    assertLiveScaleReportArtwork(scaleRoot, releases)
    scalePlan = prepareGitScaleReleases(releases)
  }
  const cognitivePlan = cognitiveRoot ? prepareCognitiveGitReleases(cognitiveRoot) : undefined
  const sjtPlan = sjtRoot ? prepareSjtGitReleases(sjtRoot) : undefined
  const formPlan = formRoot ? await prepareFormGitReleases(formRoot) : undefined
  const bundlePlan = bundleRoot ? await prepareBundleGitReleases(bundleRoot) : undefined

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockGitReleaseSnapshot(tx, actorId)
    const scale = scalePlan ? await applyGitScaleReleases(scalePlan, tx, actorId, gitCommitSha) : []
    const cognitive = cognitivePlan ? await applyCognitiveGitReleases(cognitivePlan, tx, actorId, gitCommitSha) : []
    const sjt = sjtPlan ? await applySjtGitReleases(sjtPlan, tx, actorId, gitCommitSha) : []
    const form = formPlan ? await applyFormGitReleases(formPlan, tx, actorId, gitCommitSha) : []
    const bundle = bundlePlan ? await applyBundleGitReleases(bundlePlan, tx, actorId, gitCommitSha) : []
    return { gitCommitSha, scale, cognitive, sjt, form, bundle }
  }, { timeout })
}
