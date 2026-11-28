import { isAbsolute } from 'node:path'
import { GIT_RELEASE_ACTOR_ID } from '../utils/gitReleaseIdentity'

async function main() {
  const [inputRoot, gitCommitSha, ...extra] = process.argv.slice(2)
  const actorId = process.env.SYSTEM_GIT_RELEASE_ACTOR_ID
  if (!inputRoot || !isAbsolute(inputRoot) || !/^[0-9a-f]{40}$/.test(gitCommitSha ?? '') || extra.length) {
    throw new Error('Usage: npm run content:sync-releases -- <absolute committed content directory> <main SHA>')
  }
  if (actorId !== GIT_RELEASE_ACTOR_ID) throw new Error('The ops profile must provide the reserved SYSTEM_GIT_RELEASE_ACTOR_ID')
  const { prisma } = await import('../config/database')
  try {
    const { syncContentReleases } = await import('../modules/measurement-content/git-release-plane')
    console.log(JSON.stringify(await syncContentReleases(prisma, inputRoot, { actorId, gitCommitSha })))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
