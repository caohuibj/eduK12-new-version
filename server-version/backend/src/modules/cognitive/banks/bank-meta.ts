import { z } from 'zod'

/**
 * COG-Intelligence Roadmap v2.0 PR1 — 题库身份、来源、授权元数据。
 *
 * 规则（docs/cognitive-intelligence-roadmap.md §二/§四）：
 *  - 内容入库（onboarding / 内部科研）与正式向公众施测（publish）是两个独立状态。
 *  - 对外发布题目的 license 必须 ∈ PUBLIC_RELEASE_LICENSES；research-restricted
 *    题库只能用于内部研发与科研，publish 脚本默认拒绝。
 *  - itemSetRole（form/anchor/parallel）为阶段二等值设计预留身份；锚题池名单
 *    属于科研资产，不得在前端或报告暴露。
 *  - calibrationRef 为阶段二 IRT 标定预留引用；标定快照由 calibrationVersion
 *    独立管理，本字段只引用、不承载参数。
 */

export const COGNITIVE_BANK_LICENSE_VALUES = [
  'internal-generated',
  'public-domain',
  'verified',
  'research-restricted',
] as const

export type CognitiveBankLicense = (typeof COGNITIVE_BANK_LICENSE_VALUES)[number]

/** 对外发布（cognitive:configs:publish --apply）允许的 license 集合。 */
export const PUBLIC_RELEASE_LICENSES: readonly CognitiveBankLicense[] = [
  'internal-generated',
  'public-domain',
  'verified',
]

export const cognitiveBankItemSetRoleValues = ['form', 'anchor', 'parallel'] as const
export type CognitiveBankItemSetRole = (typeof cognitiveBankItemSetRoleValues)[number]

export const cognitiveBankMetaSchema = z
  .object({
    stimulusSetVersion: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'version-like identifier required'),
    source: z.string().min(1),
    license: z.enum(COGNITIVE_BANK_LICENSE_VALUES),
    licenseNote: z.string().optional(),
    rightsEvidenceRef: z.string().min(1).optional(),
    itemSetRole: z.enum(cognitiveBankItemSetRoleValues).default('form'),
    itemSize: z.number().int().positive().optional(),
    ruleTags: z.array(z.string().min(1)).optional(),
    calibrationRef: z
      .object({
        calibrationVersion: z.string().min(1),
        parameterCount: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((meta) => meta.license !== 'verified' || Boolean(meta.rightsEvidenceRef), {
    message: 'verified bank license requires a traceable rightsEvidenceRef',
    path: ['rightsEvidenceRef'],
  })

export type CognitiveBankMeta = z.infer<typeof cognitiveBankMetaSchema>

export type BankReleaseState = 'public-release-eligible' | 'research-restricted'

export const resolveBankReleaseState = (meta: CognitiveBankMeta): BankReleaseState =>
  PUBLIC_RELEASE_LICENSES.includes(meta.license) ? 'public-release-eligible' : 'research-restricted'

export const isBankPublicReleaseAllowed = (meta: CognitiveBankMeta): boolean =>
  resolveBankReleaseState(meta) === 'public-release-eligible'
