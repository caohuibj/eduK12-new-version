import { prisma } from '../src/config/database'
import { decryptUnifiedRuntimePayload } from '../src/modules/assessment-runtime/security'
import { isSharedScaleRuntimeReference } from '../src/modules/assessment-runtime/shared-scale-runtime'
import { loadFrozenScaleRuntimeSnapshot, encryptFrozenScaleRuntimeSnapshot, decryptFrozenScaleRuntimeSnapshot } from '../src/modules/assessment-runtime/runtime-snapshot'
const apply = process.argv.includes('--apply')
async function main() {
  if (apply && (process.env.ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED === 'true' || !process.argv.includes('--writers-stopped'))) {
    throw new Error('Disable shared writes, stop writers and drain reports before applying rollback')
  }
  let cursor = '', references = 0, restored = 0, conflicts = 0
  while (true) {
    // The v1 writer enforces <=4096 bytes. Do not scan large historical blobs.
    const rows = await prisma.$queryRaw<Array<{ id: string; epoch: number; encrypted: string }>>`SELECT id,
      attempt_epoch AS epoch, runtime_snapshot_encrypted AS encrypted FROM assessments
      WHERE id > ${cursor} AND runtime_snapshot_encrypted IS NOT NULL
        AND octet_length(runtime_snapshot_encrypted) <= 4096 ORDER BY id LIMIT 100`
    if (!rows.length) break
    for (const row of rows) {
      cursor = row.id
      if (!isSharedScaleRuntimeReference(decryptUnifiedRuntimePayload(row.encrypted))) continue
      references++
      const snapshot = await loadFrozenScaleRuntimeSnapshot(row.encrypted)
      const inline = encryptFrozenScaleRuntimeSnapshot(snapshot)
      if (decryptFrozenScaleRuntimeSnapshot(inline).snapshotHash !== snapshot.snapshotHash) throw new Error('Inline rollback validation failed')
      if (apply) {
        const count = await prisma.$executeRaw`UPDATE assessments SET runtime_snapshot_encrypted=${inline}
          WHERE id=${row.id} AND attempt_epoch=${row.epoch} AND runtime_snapshot_encrypted=${row.encrypted}`
        if (count === 1) restored++; else conflicts++
      }
    }
  }
  console.log(JSON.stringify({ apply, references, restored, conflicts, answersAndScoresChanged: false,
    artifactTableRetained: true, status: conflicts ? 'CONFLICT_RECHECK_REQUIRED' : 'COMPLETE' }))
  if (conflicts) process.exitCode = 2
}
void main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => prisma.$disconnect())
