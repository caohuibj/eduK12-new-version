import { runExportBatch } from './exportBatchTask'
import { closeQueues } from '../config/queue'
import { prisma } from '../config/database'
process.once('message', async job => {
  let exitCode = 0
  try { const result = await runExportBatch(job); process.send?.({ ok: true, result }) }
  catch { exitCode = 1; process.send?.({ ok: false }) }
  finally { await closeQueues(true).catch(() => undefined); await prisma.$disconnect(); process.exit(exitCode) }
})
