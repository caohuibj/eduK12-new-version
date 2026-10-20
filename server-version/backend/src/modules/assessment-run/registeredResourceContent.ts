import { Prisma, type Scale } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { trainingContentSnapshotSchema } from '../composite/training-content-binding'
import { readPublishedScaleMeasurementSource } from '../scale/measurement-source'
import { ContentReleaseError } from '../measurement-content/release'
import { reportingFail } from '../reporting/types'

/** Trusted registration only, after the existing system/source-license gates;
 * publication also requires the existing independent review. Content consumption,
 * not School/Teacher authoring or permission to use Training-private reports.
 *
 * The registered lane currently admits only original descriptive scales. Freeze
 * an explicit empty reference candidate set, never a "latest" reference, and do
 * not select a staff report. Existing audience-gated descriptive reports remain
 * authoritative; absent report means NOT_SELECTED in the shared FINAL receipt.
 */
export async function prepareRegisteredResourceContentSnapshot(
  tx: Prisma.TransactionClient,
  input: { compositeId: string; scale: Scale; purpose: 'REGISTER' | 'PUBLISH' },
) {
  const target = await tx.compositeAssessment.findUnique({
    where: { id: input.compositeId },
    select: {
      id: true, productKind: true, status: true,
      trainingContentSnapshot: true, trainingContentSnapshotHash: true,
      items: { select: { id: true, type: true, scaleId: true } },
    },
  })
  if (!target || target.productKind !== 'ORGANIZATION_RESOURCE' || target.status !== 'DRAFT'
    || target.items.length !== 1 || target.items[0].type !== 'SCALE'
    || target.items[0].scaleId !== input.scale.id) {
    return reportingFail('RESOURCE_CONTENT_TARGET_INVALID', '注册资源运行目标不匹配', 409)
  }
  if (input.purpose === 'REGISTER' && (target.trainingContentSnapshot != null || target.trainingContentSnapshotHash != null)) {
    return reportingFail('RESOURCE_CONTENT_ALREADY_FROZEN', '注册资源版本已冻结，请重新登记新版本', 409)
  }
  if (input.purpose === 'PUBLISH' && (target.trainingContentSnapshot == null || target.trainingContentSnapshotHash == null)) {
    return reportingFail('RESOURCE_CONTENT_REREGISTRATION_REQUIRED', '旧注册资源须显式重新登记新版本，不能补造冻结身份', 409)
  }
  // Missing source pointers require explicit conversion by the source owner.
  // Never publish, infer an old identity, or rewrite the source from this lane.
  if (!input.scale.measurementReleaseId) {
    return reportingFail('RESOURCE_CONTENT_SOURCE_RELEASE_REQUIRED', '请先显式发布或转换来源量表的测量版本，再登记资源', 409)
  }
  const { release, definition } = await readPublishedScaleMeasurementSource(tx, input.scale).catch(error => {
    if (error instanceof ContentReleaseError) {
      return reportingFail('RESOURCE_CONTENT_SOURCE_INVALID', '来源测量发布版本、指纹或许可不匹配，请检查来源版本', 409)
    }
    throw error
  })
  if (input.scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE'
    || definition.referencePolicy.type !== 'none'
    || definition.report.interpretations.some(value => value.source.type !== 'score_only' || value.bands.length > 0)) {
    return reportingFail('RESOURCE_CONTENT_POLICY_UNSUPPORTED', '注册入口仅支持无参考规则的描述性量表', 409)
  }
  if (release.layer !== 'MEASUREMENT') {
    return reportingFail('RESOURCE_CONTENT_SOURCE_INVALID', '注册资源的测量发布身份无效', 409)
  }
  const snapshot = trainingContentSnapshotSchema.parse({
    schemaVersion: 1, compositeId: target.id,
    units: [{
      itemId: target.items[0].id, family: 'SCALE',
      source: { kind: 'SCALE', id: input.scale.id, ownerId: input.scale.creatorId },
      measurement: {
        releaseId: release.releaseId, contentHash: release.contentHash,
        measurementHash: release.content.measurementHash,
      },
      referencePolicy: {
        policyVersion: 'EXACT_POPULATION_PRIORITY_V1',
        measurementReleaseId: release.releaseId, choices: [],
      },
    }],
  })
  const snapshotHash = canonicalHash(snapshot)
  if (input.purpose === 'PUBLISH' && (target.trainingContentSnapshotHash !== snapshotHash
    || canonicalHash(target.trainingContentSnapshot) !== snapshotHash)) {
    return reportingFail('RESOURCE_CONTENT_SOURCE_CHANGED', '已冻结的资源来源已变化，请重新登记新版本', 409)
  }
  return { snapshot, snapshotHash }
}
