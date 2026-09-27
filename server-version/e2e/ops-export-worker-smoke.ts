import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { ExportArtifactStatus, UserRole } from '../backend/node_modules/@prisma/client'
import { prisma } from '../backend/src/config/database'
import { closeQueues } from '../backend/src/config/queue'
import { enqueueExportJob } from '../backend/src/services/exportJobService'
import { validateStorageKey } from '../backend/src/services/exportArtifactService'
import '../backend/src/workers/exportProcessor'

const expected = process.env.OPS_EXPORT_EXPECT === 'FAILED'
  ? ExportArtifactStatus.FAILED
  : ExportArtifactStatus.READY

async function main(): Promise<void> {
  const suffix = randomUUID()
  let batchId = ''
  let scaleId = ''
  let userId = ''
  const deadline = Date.now() + 60_000
  
  try {
    const user = await prisma.user.create({
      data: {
        username: `ops-export-${suffix}`,
        passwordHash: 'test-only',
        role: UserRole.ADMIN,
        nickname: 'Ops export worker smoke',
      },
    })
    userId = user.id
  
    const definition = {
      schemaVersion: 2,
      items: [{ itemCode: 'I1', content: 'Header-only export fixture' }],
      scoring: {
        scores: [{ key: 'total', label: 'Total', type: 'total' }],
      },
    }
    const scale = await prisma.scale.create({
      data: {
        code: `OPS-EXPORT-${suffix}`,
        name: 'Ops export worker smoke',
        creatorId: user.id,
        status: 'PUBLISHED',
        visibility: 'HIDDEN',
        instrumentClass: 'CUSTOM_DESCRIPTIVE',
        instrumentVersion: '1.0.0',
        definition,
        definitionHash: 'b'.repeat(64),
        itemCount: 1,
        dimensionCount: 0,
      },
    })
    scaleId = scale.id
  
    const accepted = await enqueueExportJob({
      resourceType: 'SCALE',
      resourceId: scale.id,
      createdBy: user.id,
      anonymized: true,
      format: 'csv',
      options: { anonymize: true, minProgress: 100 },
      recordCount: 0,
      requestKey: `ops-export-${randomUUID()}`,
    })
    batchId = accepted.batchId
  
    let batch = await prisma.exportBatch.findUnique({ where: { id: batchId } })
    while (batch?.status === ExportArtifactStatus.PROCESSING && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      batch = await prisma.exportBatch.findUnique({ where: { id: batchId } })
    }
    if (!batch) throw new Error('export batch disappeared')
    if (batch.status !== expected) {
      throw new Error(`expected ${expected}, got ${batch.status} (${batch.errorCode || 'no error code'})`)
    }
  
    const artifact = await prisma.exportArtifact.findFirst({ where: { batchId } })
    if (!artifact) throw new Error('export artifact missing')
    if (artifact.status !== expected) throw new Error(`artifact expected ${expected}, got ${artifact.status}`)
  
    if (expected === ExportArtifactStatus.READY) {
      const filePath = validateStorageKey(artifact.storageKey)
      const body = await fs.readFile(filePath, 'utf8')
      if (!body.includes('U_id')) throw new Error('ready CSV header missing')
      console.log('PASS durable export worker generated and published READY file')
    } else {
      if (batch.generation < 2) throw new Error(`failure did not exercise Bull retry generation: ${batch.generation}`)
      console.log('PASS durable export worker retried real file failure before terminal FAILED')
    }
  } finally {
    if (batchId) {
      const artifacts = await prisma.exportArtifact.findMany({ where: { batchId }, select: { storageKey: true } }).catch(() => [])
      for (const artifact of artifacts) {
        try { await fs.rm(validateStorageKey(artifact.storageKey), { force: true }) } catch {}
      }
      await prisma.exportArtifact.deleteMany({ where: { batchId } }).catch(() => undefined)
      await prisma.exportBatch.deleteMany({ where: { id: batchId } }).catch(() => undefined)
    }
    if (scaleId) await prisma.scale.deleteMany({ where: { id: scaleId } }).catch(() => undefined)
    if (userId) await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined)
    await closeQueues(true).catch(() => undefined)
    await prisma.$disconnect().catch(() => undefined)
  }
  
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
