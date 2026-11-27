import { isAbsolute } from 'node:path'

async function main() {
  const [inputRoot, gitCommitSha, ...extra] = process.argv.slice(2)
  const actorId = process.env.SYSTEM_GIT_RELEASE_ACTOR_ID
  if (!inputRoot || !isAbsolute(inputRoot) || !/^[0-9a-f]{40}$/.test(gitCommitSha ?? '') || extra.length) {
    throw new Error('Usage: npm run scale:sync-releases -- <absolute committed instruments directory> <main SHA>')
  }
  if (!actorId) throw new Error('The ops profile must provide SYSTEM_GIT_RELEASE_ACTOR_ID')

  const { loadDeclaredScaleReleases } = await import('../modules/scale/declarative/load')
  const { assertLiveScaleReportArtwork } = await import('../modules/scale/declarative/live-artwork')
  const releases = loadDeclaredScaleReleases(inputRoot)
  assertLiveScaleReportArtwork(inputRoot, releases)
  const { prisma } = await import('../config/database')
  try {
    const { syncGitScaleReleases } = await import('../modules/scale/onboarding/git-release-publication')
    const result = await syncGitScaleReleases(prisma, { actorId, gitCommitSha, releases })
    console.log(JSON.stringify(result))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
