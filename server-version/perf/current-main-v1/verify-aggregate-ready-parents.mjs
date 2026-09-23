import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

if (process.env.NODE_ENV !== 'test' || process.env.PERF_ISOLATED_TEST_MODE !== '1') {
  throw new Error('aggregate verifier requires isolated test mode')
}
const fixtureFile = process.env.FIXTURE_FILE
if (!fixtureFile || !fixtureFile.startsWith('/tmp/')) throw new Error('FIXTURE_FILE under /tmp is required')
const groups = String(process.env.GROUPS || 'parentN5 parentN20 parentN50 parentN100').split(/\s+/).filter(Boolean)
const fixtures = JSON.parse(readFileSync(fixtureFile, 'utf8'))
const prisma = new PrismaClient()
try {
  const results = []
  for (const group of groups) {
    const request = fixtures[group]?.[0]
    if (!request?.parentId) throw new Error(`missing aggregate fixture ${group}`)
    const row = await prisma.questionnaireAssessment.findUnique({
      where: { id: request.parentId },
      select: { id: true, status: true, progress: true, aggregateReportEncrypted: true, aggregateInputHash: true },
    })
    if (!row || row.status !== 'COMPLETED' || row.progress !== 100 || !row.aggregateReportEncrypted || !row.aggregateInputHash) {
      throw new Error(`${group} did not durably finalize`)
    }
    results.push({ group, parentId: row.id, status: row.status, progress: row.progress, aggregateInputHash: row.aggregateInputHash })
  }
  console.log(JSON.stringify({ groups: results }, null, 2))
} finally {
  await prisma.$disconnect()
}
