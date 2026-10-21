import { assertCompositeCourseScope } from '../modules/composite/composite-course-scope'
import { UserRole } from '@prisma/client'
import { prisma } from '../config/database'
import { asBusinessPrincipal, loadCurrentPrincipal } from '../modules/organization/principal'
import { inactiveAccountMessage } from '../utils/accountStatus'
import * as assignmentService from '../modules/cognitive/assignment.service'
import { isCompositeWrapper } from '../modules/cognitive/assignment.access'
import { cognitiveExportService, type CognitiveExportFormat } from '../modules/cognitive/export.service'
import { compositeExportService, teacherRelationalExportVisibility, type CompositeExportFormat } from '../modules/composite/composite-export.service'
import { getExportContext } from '../modules/composite/composite.service'
import { resolveCompositeExportProjectionBinding, projectCompositeExportData } from '../modules/composite/composite-export-projection'
import type { ClaimedExportBatch } from './exportJobService'
import { provenanceSchema } from './assessmentExportArtifact'
import { exportIntentDateRange } from './exportIntentDateRange'
import { trainingAnalysisExportOptionsSchema, trainingAnalysisProvenanceSchema, assertTrainingAnalysisExportIdentity, saveTrainingAnalysisExport } from '../modules/training-analysis/export'
const authorizeCurrentExportPrincipal = async (claim: ClaimedExportBatch) => {
  const current = await loadCurrentPrincipal(claim.createdBy)
  const principal=current&&claim.options.creatorRole===UserRole.TEACHER?asBusinessPrincipal(current):current
  if (!principal || inactiveAccountMessage(principal) || principal.mustChangePassword || principal.role !== claim.options.creatorRole
    || claim.options.authorityTokenVersion !== principal.tokenVersion
    || (!claim.options.anonymize && principal.role !== UserRole.ADMIN)) throw new Error('Export authority revoked')
  return principal
}
const trainingAuthorityVersion = (claim: ClaimedExportBatch): number => {
  const version = claim.options.authorityTokenVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) throw new Error('Export authority revoked')
  return version
}

export const revalidateAssessmentExport = async (claim: ClaimedExportBatch, ids?: string[]) => {
  if (claim.resourceType === 'TRAINING_ANALYSIS') {
    const options = trainingAnalysisExportOptionsSchema.parse(claim.options.trainingAnalysis)
    assertTrainingAnalysisExportIdentity(options, { courseId: claim.resourceId, createdBy: claim.createdBy, creatorRole: claim.options.creatorRole })
    if (!claim.options.anonymize) throw new Error('Training analysis export must be anonymized')
    const { revalidateTrainingAnalysisManifest } = await import('../modules/training-analysis/service')
    await revalidateTrainingAnalysisManifest({ id: claim.createdBy, role: options.manifest.actor.role }, options.manifest, trainingAuthorityVersion(claim))
    return { userId: claim.createdBy, role: options.manifest.actor.role }
  }
  const principal = await authorizeCurrentExportPrincipal(claim)
  if (claim.resourceType === 'COGNITIVE') {
    const assignment = await assignmentService.getAssignmentForTeacher(principal.userId, principal.role, claim.resourceId)
    if (isCompositeWrapper(assignment)) throw new Error('Standalone wrapper export forbidden')
  } else {
    await getExportContext(principal.userId, principal.role, claim.resourceId)
    if (claim.options.courseId) {
      if (!claim.options.anonymize) throw new Error('Course export must be anonymized')
      await assertCompositeCourseScope(principal.userId, principal.role, claim.resourceId, claim.options.courseId)
    }
    const binding = await resolveCompositeExportProjectionBinding(claim.resourceId, 'teacher')
    if (binding.fingerprint !== claim.options.projectionFingerprint) throw new Error('Export disclosure changed')
    if (ids) {
      const visibility = await teacherRelationalExportVisibility(principal)
      const count = await prisma.compositeAssessmentAttempt.count({ where: { AND: [
        { id: { in: ids }, compositeAssessmentId: claim.resourceId, status: 'COMPLETED', ...(claim.options.courseId ? { deliveryCourseId: claim.options.courseId } : {}) }, ...(visibility ? [visibility] : []) ] } })
      if (count !== ids.length) throw new Error('Export row authority revoked')
    }
  }
  return { userId: principal.userId, role: principal.role }
}
export const prepareAssessmentExport = async (claim: ClaimedExportBatch) => {
  if (claim.resourceType === 'TRAINING_ANALYSIS') {
    const trainingAnalysis = trainingAnalysisExportOptionsSchema.parse(claim.options.trainingAnalysis)
    assertTrainingAnalysisExportIdentity(trainingAnalysis, { courseId: claim.resourceId, createdBy: claim.createdBy, creatorRole: claim.options.creatorRole })
    const actor = { userId: claim.createdBy, role: trainingAnalysis.manifest.actor.role }
    if (!claim.options.anonymize) throw new Error('Training analysis export must be anonymized')
    // analyzeTrainingCourse validates live authority and the exact manifest in
    // its single source load. The worker still revalidates after serialization.
    const { analyzeTrainingCourse } = await import('../modules/training-analysis/service')
    const result = await analyzeTrainingCourse({ actor: { id: actor.userId, role: actor.role as 'ADMIN' | 'TEACHER' },
      courseId: claim.resourceId, selector: trainingAnalysis.selector, expectedManifest: trainingAnalysis.manifest,
      expectedTokenVersion: trainingAuthorityVersion(claim) })
    // The exact manifest survives prepare, retries, serialization, publication,
    // and download. A cutoff alone cannot freeze the authorized sample.
    if (result.manifest.manifestHash !== trainingAnalysis.manifest.manifestHash) throw new Error('Training analysis manifest changed')
    const table = result.tables[trainingAnalysis.table]
    const data = { rows: table.rows, fields: table.columns.map(name => ({ name, label: name, type: 'string' as const })) }
    const provenance = trainingAnalysisProvenanceSchema.parse({ version: 2, resourceType: 'TRAINING_ANALYSIS',
      generation: claim.batchId, creatorRole: actor.role, audience: 'teacher', trainingAnalysis })
    return { data, provenance, save: async (format: string) => saveTrainingAnalysisExport({ options: trainingAnalysis,
      tables: result.tables, format, batchId: claim.batchId, generation: claim.generation }) }
  }
  const actor = await revalidateAssessmentExport(claim)
  // Upper bound fixed by durable intent, so late completions cannot enlarge retries.
  const dateRange = exportIntentDateRange(claim.createdAt, claim.options.dateRange)
  const options = { anonymize: claim.options.anonymize, dateRange, actor }
  if (claim.resourceType === 'COGNITIVE') {
    const cognitiveOptions = { ...options, detail: claim.options.detail ?? 'summary' }
    const data = await cognitiveExportService.getCognitiveExportData(claim.resourceId, cognitiveOptions)
    const provenance = provenanceSchema.parse({ version: 1, generation: claim.batchId, creatorRole: actor.role,
      audience: 'teacher', detail: data.detail, dateRange, projectionFingerprint: claim.options.projectionFingerprint, attemptIds: [] })
    return { data, provenance, save: async (format: string) => {
      const files = await cognitiveExportService.saveCognitiveExportFiles(claim.resourceId, cognitiveOptions, format as CognitiveExportFormat, data)
      const generated = files.csvPath || files.savPath || files.xlsxPath || files.zipPath
      if (!generated) throw new Error('Missing export file')
      return generated
    } }
  }
  const compositeOptions = { ...options, ...(claim.options.courseId ? { courseId: claim.options.courseId } : {}), detail: claim.options.detail === 'full' ? 'full' as const : 'summary' as const }
  const binding = await resolveCompositeExportProjectionBinding(claim.resourceId, 'teacher')
  const data = projectCompositeExportData(await compositeExportService.getExportData(claim.resourceId, compositeOptions), binding)
  const provenance = provenanceSchema.parse({ version: 1, generation: claim.batchId, creatorRole: actor.role,
    audience: 'teacher', detail: data.detail, dateRange, projectionFingerprint: binding.fingerprint,
    ...(claim.options.courseId ? { courseId: claim.options.courseId } : {}),
    attemptIds: data.rows.map(row => String(row.A_attempt_id)) })
  return { data, provenance, save: async (format: string) => (await compositeExportService.saveExportFiles(claim.resourceId, compositeOptions, format as CompositeExportFormat, data)).filePath }
}
