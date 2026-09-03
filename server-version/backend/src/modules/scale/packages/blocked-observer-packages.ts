/**
 * Observer Scale package release blockers that remain after official sources landed.
 * MISSING_OFFICIAL_ITEM_SOURCE removed — PDFs are in docs/unified-assessment-bundle-v1/source-instruments/.
 * Keep fail-closed where authorization, translation signing, or localization is incomplete.
 */

export type BlockedScalePackageReasonV1 =
  | 'MISSING_OFFICIAL_ITEM_SOURCE'
  | 'ELECTRONIC_ADMIN_AUTHORIZATION_REQUIRED'
  | 'LOCALIZATION_MANIFEST_UNSIGNED'
  | 'ZH_CN_TRANSLATION_PENDING_SIGNED_MANIFEST'

export interface BlockedScalePackageDescriptorV1 {
  key: string
  instrumentVersion: string
  releaseStatus: 'BLOCKED' | 'SOURCE_LANDED_GATES_PENDING'
  respondentTypes: Array<'PARENT' | 'TEACHER' | 'SELF'>
  officialSourceUrl: string
  reasons: BlockedScalePackageReasonV1[]
  notes: string[]
}

/** Parent SDQ zh-Hans items landed; publish still requires electronic admin authorization. */
export const SDQ_PARENT_ZH_CN_GATE: BlockedScalePackageDescriptorV1 = {
  key: 'sdq_parent_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'SOURCE_LANDED_GATES_PENDING',
  respondentTypes: ['PARENT'],
  officialSourceUrl: 'https://www.sdqinfo.org/py/sdqinfo/c0.py',
  reasons: ['ELECTRONIC_ADMIN_AUTHORIZATION_REQUIRED'],
  notes: [
    'Official zh-Hans parent items transcribed from sdq-parent-zh-hans.pdf.',
    'Computer scoring / electronic administration must bind APPROVED InstrumentAuthorization with electronicAdministration+scoring.',
    'Goodman UK 4-band cut-points cited descriptively only — not mainland CN norms.',
  ],
}

/** Teacher SDQ English T4-10 locked; zh-CN translation not invented. */
export const SDQ_TEACHER_ZH_CN_GATE: BlockedScalePackageDescriptorV1 = {
  key: 'sdq_teacher_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'SOURCE_LANDED_GATES_PENDING',
  respondentTypes: ['TEACHER'],
  officialSourceUrl: 'https://www.sdqinfo.org/py/sdqinfo/c0.py',
  reasons: [
    'ELECTRONIC_ADMIN_AUTHORIZATION_REQUIRED',
    'ZH_CN_TRANSLATION_PENDING_SIGNED_MANIFEST',
  ],
  notes: [
    'Official English T4-10 items locked from sdq-teacher-t4-10-en.pdf.',
    'Do not invent Simplified Chinese teacher items; zh-CN requires signed translation manifest.',
    'Form ages 4–10. Electronic admin/scoring require approved authorization.',
  ],
}

export const TEXI_PARENT_ZH_CN_GATE: BlockedScalePackageDescriptorV1 = {
  key: 'texi_parent_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'SOURCE_LANDED_GATES_PENDING',
  respondentTypes: ['PARENT'],
  officialSourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/32090688/',
  reasons: ['LOCALIZATION_MANIFEST_UNSIGNED'],
  notes: [
    'English TEXI parent/teacher items locked; ages 13–19; Thorell et al. 2020 scoring (WM/Inhibition means).',
    'zh-CN translation/back-translation/terminology/mainland language review + signed manifest required.',
    'Descriptive only — no mainland norms claims.',
  ],
}

export const TEXI_TEACHER_ZH_CN_GATE: BlockedScalePackageDescriptorV1 = {
  key: 'texi_teacher_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'SOURCE_LANDED_GATES_PENDING',
  respondentTypes: ['TEACHER'],
  officialSourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/32090688/',
  reasons: ['LOCALIZATION_MANIFEST_UNSIGNED'],
  notes: [
    'English TEXI teacher items locked (same parent/teacher form).',
    'zh-CN signed localization manifest required before claiming Simplified Chinese content.',
    'Descriptive only — no mainland norms claims.',
  ],
}

/** Packages that still cannot publish as zh-CN without remaining gates. */
export const BLOCKED_SCALE_PACKAGES_V1 = [
  SDQ_PARENT_ZH_CN_GATE,
  SDQ_TEACHER_ZH_CN_GATE,
  TEXI_PARENT_ZH_CN_GATE,
  TEXI_TEACHER_ZH_CN_GATE,
] as const

export const getBlockedScalePackage = (
  key: string,
  instrumentVersion: string,
): BlockedScalePackageDescriptorV1 | undefined => (
  BLOCKED_SCALE_PACKAGES_V1.find((row) => (
    row.key === key && row.instrumentVersion === instrumentVersion
  ))
)
