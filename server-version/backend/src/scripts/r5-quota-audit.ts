import { prisma } from '../config/database'

/** Read-only inventory. Equal configuration is evidence for review, never a lineage mapping. */
async function main() {
  const wrappers = await prisma.cognitiveAssignment.findMany({
    where: { listedStandalone: false, quotaSourceAssignmentId: null },
    select: {
      id: true, createdBy: true, configId: true, maxAttempts: true,
      compositeItems: { select: { id: true, compositeAssessmentId: true } },
      _count: { select: { sessions: true } },
    },
    orderBy: { id: 'asc' },
  })
  const list = []
  for (const row of wrappers) {
    const possibleSources = await prisma.cognitiveAssignment.findMany({
      where: { createdBy: row.createdBy, configId: row.configId, quotaSourceAssignmentId: null, listedStandalone: true },
      select: { id: true, maxAttempts: true }, orderBy: { id: 'asc' },
    })
    list.push({ assignmentId: row.id, maxAttempts: row.maxAttempts, sessionCount: row._count.sessions,
      itemBindings: row.compositeItems, possibleSources, resolution: 'REQUIRES_EXPLICIT_SOURCE_EVIDENCE' })
  }
  process.stdout.write(JSON.stringify({ schemaVersion: 1, readOnly: true, generatedAt: new Date().toISOString(),
    meaning: 'Candidates share creator and configuration only. Do not infer or backfill quota lineage from this report. Frozen attempts and reports remain unchanged.', list }, null, 2) + '\n')
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Inventory failed'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
