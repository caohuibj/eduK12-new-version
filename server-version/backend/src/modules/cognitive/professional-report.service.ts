import { prisma } from '../../config/database'
import type { UserRole } from '../../types'
import { getAssignmentForTeacher } from './assignment.service'
import { FORBIDDEN } from './cognitive.errors'
import { decryptCognitivePayload } from './cognitive.security'
import { parseCognitiveResultSnapshot } from './v2/result-snapshot'
import { isRelationalCohortOnlyCompositeAttempt } from '../assessment-relational/result-authority'
import { createHash } from 'crypto'
import { requireCognitiveCollection } from './collection-data.service'

/** A report-scoped pseudonym of a random session ID, stable across pagination
 * and key rotation. Never expose participant/user/session IDs or join persons. */
const reportReference = (assignmentId: string, sessionId: string): string => `CR-${createHash('sha256')
  .update('cognitive-report-reference:v1\0').update(assignmentId).update('\0').update(sessionId)
  .digest('hex').slice(0, 24).toUpperCase()}`

/** Read the persisted presentation only. No rescoring, raw submissions or research expansion. */
export async function listProfessionalReports(input: { userId: string; role: UserRole; assignmentId: string; offset: number; collectionId?: string }) {
  const assignment = await getAssignmentForTeacher(input.userId, input.role, input.assignmentId)
  if (assignment.listedStandalone === false) throw FORBIDDEN('综合测评任务请从原有群体报告或综合测评流程读取')
  const collection = input.collectionId ? await requireCognitiveCollection({ ...input, collectionId: input.collectionId }) : null
  const where = { assignmentId: collection ? { in: collection.assignmentIds } : input.assignmentId, status: 'COMPLETED' as const,
    ...(collection ? { compositeAttempt: { is: { compositeAssessmentId: collection.id, assignmentRef: null } } } : {}) }
  const [total, sessions] = await Promise.all([
    prisma.cognitiveSession.count({ where }),
    prisma.cognitiveSession.findMany({ where, orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }], skip: input.offset, take: 10,
      select: { id: true, finishedAt: true, attemptNo: true, compositeAttemptId: true, resultSnapshotEncrypted: true } }),
  ])
  const records = []
  for (let index = 0; index < sessions.length; index++) {
    const session = sessions[index]
    if (session.compositeAttemptId && await isRelationalCohortOnlyCompositeAttempt(session.compositeAttemptId)) continue
    const reportId = reportReference(assignment.id, session.id)
    const metadata = { reportId, finishedAt: session.finishedAt?.toISOString() ?? null }
    const label = `${reportId} · 尝试 ${session.attemptNo}`
    if (!session.resultSnapshotEncrypted) {
      records.push({ ...metadata, label, report: null, references: [], unavailableReason: '历史格式未保存版本化报告，请使用原有授权导出入口。' })
      continue
    }
    try {
      const result = parseCognitiveResultSnapshot(decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted))
      const report = result.report
      if (typeof report.title !== 'string' || !Array.isArray(report.headline) || !Array.isArray(report.user)
        || !Array.isArray(report.detail) || !Array.isArray(report.quality) || !report.method || typeof report.method !== 'object'
        || !['interpretable', 'limited', 'invalid'].includes(String(report.qualityState))
        || typeof report.conclusion !== 'string' || typeof report.disclaimer !== 'string' || !Array.isArray(report.practicalTips)) throw new Error('Unsupported frozen report shape')
      const allowedKeys = new Set([...report.headline, ...report.user, ...report.detail].map(metric => metric.key))
      records.push({ ...metadata, finishedAt: result.completedAt, label, report, references: result.quality.state === 'invalid' ? [] : (result.references ?? []).filter(reference => allowedKeys.has(reference.metricKey)), unavailableReason: null })
    } catch {
      // An unreadable record must not abort other reports or be replaced with live registry content.
      records.push({ ...metadata, label, report: null, references: [], unavailableReason: '冻结报告暂不可读，请核查记录完整性；未重算或补值。' })
    }
  }
  return { assignmentId: assignment.id, assignmentTitle: collection ? `${assignment.title} · ${collection.name}` : assignment.title, total, offset: input.offset,
    nextOffset: sessions.length === 10 && input.offset + sessions.length < total ? input.offset + sessions.length : null, records }
}
