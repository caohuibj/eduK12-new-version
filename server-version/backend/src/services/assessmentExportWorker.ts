import { UserRole } from '@prisma/client'
import { prisma } from '../config/database'
import { loadCurrentPrincipal } from '../modules/organization/principal'
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
export const revalidateAssessmentExport = async (claim: ClaimedExportBatch, ids?: string[]) => {
  const principal = await loadCurrentPrincipal(claim.createdBy)
  if (!principal || inactiveAccountMessage(principal) || principal.mustChangePassword || principal.role !== claim.options.creatorRole
    || (!claim.options.anonymize && principal.role !== UserRole.ADMIN)) throw new Error('Export authority revoked')
  if (claim.resourceType === 'COGNITIVE') {
    const assignment = await assignmentService.getAssignmentForTeacher(principal.userId, principal.role, claim.resourceId)
    if (isCompositeWrapper(assignment)) throw new Error('Standalone wrapper export forbidden')
  } else {
    await getExportContext(principal.userId, principal.role, claim.resourceId)
    const binding = await resolveCompositeExportProjectionBinding(claim.resourceId, 'teacher')
    if (binding.fingerprint !== claim.options.projectionFingerprint) throw new Error('Export disclosure changed')
    if (ids) {
      const visibility = await teacherRelationalExportVisibility(principal)
      const count = await prisma.compositeAssessmentAttempt.count({ where: { AND: [
        { id: { in: ids }, compositeAssessmentId: claim.resourceId, status: 'COMPLETED' }, ...(visibility ? [visibility] : []) ] } })
      if (count !== ids.length) throw new Error('Export row authority revoked')
    }
  }
  return { userId: principal.userId, role: principal.role }
}
export const prepareAssessmentExport = async (claim: ClaimedExportBatch) => {
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
  const compositeOptions = { ...options, detail: claim.options.detail === 'full' ? 'full' as const : 'summary' as const }
  const binding = await resolveCompositeExportProjectionBinding(claim.resourceId, 'teacher')
  const data = projectCompositeExportData(await compositeExportService.getExportData(claim.resourceId, compositeOptions), binding)
  const provenance = provenanceSchema.parse({ version: 1, generation: claim.batchId, creatorRole: actor.role,
    audience: 'teacher', detail: data.detail, dateRange, projectionFingerprint: binding.fingerprint,
    attemptIds: data.rows.map(row => String(row.A_attempt_id)) })
  return { data, provenance, save: async (format: string) => (await compositeExportService.saveExportFiles(claim.resourceId, compositeOptions, format as CompositeExportFormat, data)).filePath }
}
