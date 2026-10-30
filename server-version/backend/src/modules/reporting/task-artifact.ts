import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import type { TaskGroupProjection } from './group-summary'

type Db = Prisma.TransactionClient
export type TaskArtifactSource = { product: 'SURVEY' | 'TRAINING'; containerId: string; taskId: string }
export interface TaskGroupArtifact {
  artifactId: string
  generatedAt: string
  projection: TaskGroupProjection
}
export interface StoredTaskGroupArtifact extends TaskGroupArtifact {
  source: TaskArtifactSource
  selector: unknown
  sourceBindings: unknown
}

/** Existing organization artifacts require organization/cohort/spec foreign
 * keys. Task artifacts share this small store rather than inventing memberships,
 * copying raw answers or creating a table for each product. */
export async function saveTaskGroupArtifact(db: Db, input: Omit<StoredTaskGroupArtifact, 'artifactId' | 'generatedAt'> & { generatedBy: string }): Promise<TaskGroupArtifact> {
  const artifact: StoredTaskGroupArtifact = { artifactId: randomUUID(), generatedAt: new Date().toISOString(),
    source: input.source, selector: input.selector, sourceBindings: input.sourceBindings, projection: input.projection }
  await db.$executeRaw`
    INSERT INTO reporting_task_artifacts (id,product,container_id,task_id,generated_by,payload_cipher,payload_hash,generated_at)
    VALUES (${artifact.artifactId},${input.source.product},${input.source.containerId},${input.source.taskId},${input.generatedBy},
      ${encryptUnifiedRuntimePayload(artifact)},${canonicalHash(artifact)},${new Date(artifact.generatedAt)})
  `
  return publicTaskGroupArtifact(artifact)
}

export function publicTaskGroupArtifact(artifact: StoredTaskGroupArtifact): TaskGroupArtifact {
  return { artifactId: artifact.artifactId, generatedAt: artifact.generatedAt, projection: artifact.projection }
}

export async function readTaskGroupArtifact(db: Db, source: TaskArtifactSource, artifactId: string): Promise<StoredTaskGroupArtifact | null> {
  const rows = await db.$queryRaw<Array<{ cipher: string; hash: string }>>`
    SELECT payload_cipher AS cipher,payload_hash AS hash FROM reporting_task_artifacts
    WHERE id=${artifactId} AND product=${source.product} AND container_id=${source.containerId} AND task_id=${source.taskId}
  `
  if (!rows.length) return null
  const artifact = decryptUnifiedRuntimePayload<StoredTaskGroupArtifact>(rows[0].cipher)
  if (artifact.artifactId !== artifactId || canonicalHash(artifact.source) !== canonicalHash(source) || canonicalHash(artifact) !== rows[0].hash)
    throw new Error('群体报告快照来源不一致')
  return artifact
}

export async function listTaskGroupArtifacts(db: Db, source: TaskArtifactSource) {
  const rows = await db.$queryRaw<Array<{ artifactId: string; generatedAt: Date }>>`
    SELECT id AS "artifactId",generated_at AS "generatedAt" FROM reporting_task_artifacts
    WHERE product=${source.product} AND container_id=${source.containerId} AND task_id=${source.taskId}
    ORDER BY generated_at DESC,id DESC LIMIT 25
  `
  return rows.map(row => ({ ...row, generatedAt: row.generatedAt.toISOString() }))
}
