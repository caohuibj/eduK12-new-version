import { Prisma } from '@prisma/client'
import type { ToolLicenseProduct } from './contracts'

export class ToolLicenseAccessError extends Error {
  readonly statusCode = 409
  readonly code = 'TOOL_PUBLICATION_LICENSE'
}

const pilotFlags: Record<ToolLicenseProduct, string> = {
  SURVEY: 'SURVEY_STANDARD_TOOL_LICENSING_ENABLED',
  TRAINING: 'TRAINING_STANDARD_TOOL_LICENSING_ENABLED',
  SCHOOL: 'SCHOOL_STANDARD_TOOL_LICENSING_ENABLED',
  TEACHER: 'TEACHER_STANDARD_TOOL_LICENSING_ENABLED',
}

export function isToolLicensingEnabled(product: ToolLicenseProduct) {
  return process.env[pilotFlags[product]] === 'true' || isExpandedToolLicensingEnabled(product)
}

export function isExpandedToolLicensingEnabled(product: ToolLicenseProduct) {
  return process.env[`${product}_TOOL_LICENSING_ENABLED`] === 'true'
}

type RuntimeLicense = {
  id: string
  startsAt: Date
  expiresAt: Date
  terminatedAt: Date | null
}

export type EducationToolAllocation = { key: string; quantity: number; trackIds: readonly string[] }

async function charge(tx: Prisma.TransactionClient, licenseId: string, publicationId: string,
  allocations: readonly EducationToolAllocation[], closesAt: Date | null) {
  // The durable receipt and quota move with the publisher's transaction.
  const [result] = await tx.$queryRaw<Array<{ receipts: number; charged: number; failure?: { name:string; quantity:number; remaining:number } }>>(Prisma.sql`
    WITH registered AS (
      INSERT INTO tool_license_charges (license_id, tool_key, publication_id, quantity, settle_after, track_ids)
      SELECT ${licenseId}, key, ${publicationId}, quantity, ${closesAt}::timestamptz, "trackIds"
      FROM jsonb_to_recordset(${JSON.stringify(allocations)}::jsonb) AS wanted(key text,quantity integer,"trackIds" text[])
      ORDER BY key
      ON CONFLICT (license_id,tool_key,publication_id) DO NOTHING
      RETURNING tool_key,quantity
    ), locked AS MATERIALIZED (
      SELECT item.tool_key,item.name,registered.quantity,item.usage_limit-item.used AS remaining FROM tool_license_items item JOIN registered USING(tool_key)
      WHERE item.license_id=${licenseId} ORDER BY item.tool_key FOR NO KEY UPDATE OF item
    ), changed AS (
      UPDATE tool_license_items item SET used=item.used+locked.quantity FROM locked
      WHERE item.license_id=${licenseId} AND item.tool_key=locked.tool_key AND item.removed_at IS NULL
        AND item.usage_limit IS NOT NULL AND item.usage_limit-item.used>=locked.quantity
      RETURNING item.tool_key
    )
    SELECT (SELECT count(*)::int FROM registered) AS receipts,(SELECT count(*)::int FROM changed) AS charged,
      (SELECT to_jsonb(shortage) FROM (SELECT name,quantity,remaining FROM locked WHERE remaining<quantity ORDER BY tool_key LIMIT 1) shortage) AS failure
  `)
  if (result.receipts !== result.charged) {
    const failure = result.failure
    throw new ToolLicenseAccessError(failure
      ? `${failure.name}剩余额度不足，本次需要${closesAt ? '预留' : '使用'} ${failure.quantity} 份，可用 ${failure.remaining} 份。请联系系统管理员调整许可`
      : '工具授权的剩余额度不足，请联系系统管理员核对许可')
  }
}

/** Only for the formal publish transaction. Participant entry and answer
 * paths deliberately have no dependency on commercial tool licensing. */
export async function authorizeToolPublication(tx: Prisma.TransactionClient, input: {
  product: ToolLicenseProduct
  subjectId: string
  toolKeys: readonly string[]
  publicationId: string
  requireIssuedLicense?: boolean
  education?: { closesAt: Date | null; maxResponses?: number; frozenResponses: number; allocations?: readonly EducationToolAllocation[] }
}) {
  if (!input.toolKeys.length || !isToolLicensingEnabled(input.product)) return
  const keys = [...new Set(input.toolKeys)].sort()
  const [license] = await tx.$queryRaw<RuntimeLicense[]>(Prisma.sql`
    SELECT id,starts_at AS "startsAt",expires_at AS "expiresAt",terminated_at AS "terminatedAt" FROM tool_licenses
    WHERE product=${input.product} AND subject_id=${input.subjectId}
    ORDER BY (terminated_at IS NULL AND starts_at<=statement_timestamp() AND expires_at>statement_timestamp()) DESC,
      starts_at DESC,id
    LIMIT 1 FOR SHARE
  `)
  if (!license) {
    if (input.requireIssuedLicense) throw new ToolLicenseAccessError('请联系系统管理员开通此工具许可，再发布该投放任务')
    return
  }
  // Both the clock and membership must be read after the lock wait. An
  // administrator may have changed the items or the period may have elapsed.
  const [{ evaluatedAt, items }] = await tx.$queryRaw<Array<{
    evaluatedAt: Date; items: Array<{ key: string; limit: number | null }>
  }>>(Prisma.sql`
    SELECT clock_timestamp() AS "evaluatedAt",COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key',tool_key,'limit',usage_limit)) FROM tool_license_items
      WHERE license_id=${license.id} AND removed_at IS NULL AND tool_key IN (${Prisma.join(keys)})
    ),'[]'::jsonb) AS items
  `)
  if (license.terminatedAt || evaluatedAt < license.startsAt || evaluatedAt >= license.expiresAt)
    throw new ToolLicenseAccessError('当前工具许可尚未生效或已结束，请联系系统管理员核对许可期限')
  if (keys.length !== items.length) throw new ToolLicenseAccessError('当前许可不包含所选工具 '+keys.filter(key=>!items.some(item=>item.key===key)).join('、')+'，请联系系统管理员补充许可')
  const education = input.product === 'SCHOOL' || input.product === 'TEACHER' ? input.education : undefined
  if (input.product === 'SCHOOL' || input.product === 'TEACHER') {
    const cap = education?.maxResponses
    if (cap === undefined || !Number.isSafeInteger(cap) || cap < 1 || cap > 2_147_483_647
      || cap !== education?.frozenResponses) {
      throw new ToolLicenseAccessError('请确认作答上限与发布时冻结的名额一致。名单有变动时请重新预览')
    }
    const closesAt = education?.closesAt
    if (!closesAt || !Number.isFinite(closesAt.getTime()) || closesAt <= evaluatedAt || closesAt > license.expiresAt) {
      throw new ToolLicenseAccessError('请设置活动截止时间，且不得晚于当前授权到期时间')
    }
  }
  const scoped = education?.allocations
  const byKey = new Map(scoped?.map(row => [row.key, row]))
  if (education && scoped && (scoped.length !== keys.length || keys.some(key => !byKey.has(key))
    || scoped.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > education.frozenResponses
      || !row.trackIds.length || new Set(row.trackIds).size !== row.trackIds.length))) {
    throw new ToolLicenseAccessError('工具的冻结作答名额与发布内容不一致，请重新预览')
  }
  const metered = items.filter(item => item.limit !== null).map(({ key }) =>
    byKey.get(key) ?? { key, quantity: education?.maxResponses ?? 1, trackIds: [] })
  if (metered.length) await charge(tx, license.id, input.publicationId, metered, education?.closesAt ?? null)
}
