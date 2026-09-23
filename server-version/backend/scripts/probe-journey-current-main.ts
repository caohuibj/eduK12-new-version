/** Read-only probe for disposable START/RESUME journey fixtures. */
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

async function main() {
  if (process.env.PERF_ISOLATED_TEST_MODE !== '1') throw new Error('journey probe requires isolated test mode')
  const databaseUrl = new URL(process.env.DATABASE_URL || '')
  if (!process.env.PERF_FIXTURE_DB_NAME || decodeURIComponent(databaseUrl.pathname.slice(1)) !== process.env.PERF_FIXTURE_DB_NAME) {
    throw new Error('PERF_FIXTURE_DB_NAME must match DATABASE_URL')
  }
  const fixtureFile = process.env.PERF_FIXTURE_FILE
  const group = process.env.PERF_FIXTURE_GROUP
  if (!fixtureFile || !group) throw new Error('PERF_FIXTURE_FILE and PERF_FIXTURE_GROUP are required')
  const groups = JSON.parse(readFileSync(fixtureFile, 'utf8')) as Record<string, Array<{
    fixtureClass: string
    subjectUserId?: string
    expectedAttemptId?: string
    mediaAttemptId?: string
    assetId?: string
    expectedSha256?: string
  }>>
  const fixtures = groups[group]
  if (!fixtures?.length) throw new Error(`empty journey fixture group ${group}`)
  const userIds = fixtures.map((fixture) => fixture.subjectUserId).filter((id): id is string => Boolean(id))
  const attemptIds = fixtures.map((fixture) => fixture.expectedAttemptId).filter((id): id is string => Boolean(id))
  const mediaAttemptIds = fixtures.map((fixture) => fixture.mediaAttemptId).filter((id): id is string => Boolean(id))
  const assetIds = fixtures.map((fixture) => fixture.assetId).filter((id): id is string => Boolean(id))
  const db = new PrismaClient()
  try {
    const [starts, resumes, mediaAttempts, mediaAssets] = await Promise.all([
      userIds.length ? db.situationalAttempt.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true, status: true } }) : [],
      attemptIds.length ? db.situationalAttempt.findMany({ where: { id: { in: attemptIds } }, select: { id: true, status: true } }) : [],
      mediaAttemptIds.length ? db.situationalAttempt.findMany({ where: { id: { in: mediaAttemptIds } }, select: { id: true, status: true } }) : [],
      assetIds.length ? db.storedAsset.findMany({ where: { id: { in: assetIds } }, select: { id: true, sha256: true } }) : [],
    ])
    const mediaHashMismatch = fixtures.filter((fixture) => fixture.assetId &&
      mediaAssets.find((asset) => asset.id === fixture.assetId)?.sha256 !== fixture.expectedSha256).length
    console.log(JSON.stringify({
      group, fixtureCount: fixtures.length,
      startedAttempts: starts.length, uniqueStartedUsers: new Set(starts.map((row) => row.userId)).size,
      resumedRowsFound: resumes.length, activeResumedRows: resumes.filter((row) => row.status === 'IN_PROGRESS').length,
      mediaAttemptsFound: mediaAttempts.length, mediaAssetsFound: mediaAssets.length,
      mediaHashMismatch,
    }))
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
