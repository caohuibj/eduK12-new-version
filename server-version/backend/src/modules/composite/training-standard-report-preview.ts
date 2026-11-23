import type {Prisma} from '@prisma/client'
import {AdminPermissionError} from '../admin-permissions/service'
import {ContentReleaseError} from '../measurement-content/release'
import {standardCombinationContentInputs} from '../measurement-content/standard-combination-content'
import {evaluateTrainingItemReportEligibility, type ToolParticipantReportEligibility} from '../assessment-policy/tool-report-eligibility'
import {verifyStoredTrainingStandardItem} from './training-standard-combination'

/** Read-only draft hints from the exact approved REPORT axis. Mechanical release
 * materialization belongs to publication and must not block the draft choice. */
export async function previewTrainingStandardReportEligibility(db: Prisma.TransactionClient, composite: any) {
  const eligibility = new Map<string, ToolParticipantReportEligibility>()
  for (const item of composite.items ?? []) {
    if (item.standardCombinationSource == null) continue
    let configured = false
    try {
      const source = await verifyStoredTrainingStandardItem(db, composite, item)
      configured = standardCombinationContentInputs(source.resolved.row, source.resolved.measurement).report !== null
    } catch (cause) {
      if (!(cause instanceof ContentReleaseError) && !(cause instanceof AdminPermissionError)) throw cause
      eligibility.set(item.id, {eligible: false, mode: 'DATA_COLLECTION_ONLY', source: 'NONE',
        reason: '固定配置当前授权或来源不可用，请核对授权后重新运行发布前自检。'})
      continue
    }
    eligibility.set(item.id, configured
      ? {eligible: true, mode: 'CONFIGURED_REPORT', source: 'STANDARD_TRIPLET_REPORT', reason: null}
      : evaluateTrainingItemReportEligibility(item, {itemId: item.id, source: {standardCombination: item.standardCombinationSource}}))
  }
  return eligibility
}
