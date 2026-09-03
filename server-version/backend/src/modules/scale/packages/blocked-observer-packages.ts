/**
 * SDQ / TEXI Scale packages are intentionally BLOCKED until official item text
 * and authorized electronic-administration artifacts are available in-repo.
 * Do NOT invent SDQ or TEXI item content here.
 */

export type BlockedScalePackageReasonV1 =
  | 'MISSING_OFFICIAL_ITEM_SOURCE'
  | 'ELECTRONIC_ADMIN_AUTHORIZATION_REQUIRED'
  | 'LOCALIZATION_MANIFEST_UNSIGNED'

export interface BlockedScalePackageDescriptorV1 {
  key: string
  instrumentVersion: string
  releaseStatus: 'BLOCKED'
  respondentTypes: Array<'PARENT' | 'TEACHER' | 'SELF'>
  officialSourceUrl: string
  reasons: BlockedScalePackageReasonV1[]
  notes: string[]
}

export const SDQ_PARENT_ZH_CN_BLOCKED: BlockedScalePackageDescriptorV1 = {
  key: 'sdq_parent_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'BLOCKED',
  respondentTypes: ['PARENT'],
  officialSourceUrl: 'https://www.sdqinfo.org/py/sdqinfo/c0.py',
  reasons: [
    'MISSING_OFFICIAL_ITEM_SOURCE',
    'ELECTRONIC_ADMIN_AUTHORIZATION_REQUIRED',
  ],
  notes: [
    'Official SDQ Chinese forms exist on sdqinfo.org, but redistributable electronic item text was not available for this commit.',
    'Computer scoring / electronic administration must bind an APPROVED InstrumentAuthorization with electronicAdministration+scoring.',
    'Do not invent SDQ items, translations, or scoring rules.',
  ],
}

export const SDQ_TEACHER_ZH_CN_BLOCKED: BlockedScalePackageDescriptorV1 = {
  key: 'sdq_teacher_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'BLOCKED',
  respondentTypes: ['TEACHER'],
  officialSourceUrl: 'https://www.sdqinfo.org/py/sdqinfo/c0.py',
  reasons: [
    'MISSING_OFFICIAL_ITEM_SOURCE',
    'ELECTRONIC_ADMIN_AUTHORIZATION_REQUIRED',
  ],
  notes: [
    'Teacher-observer SDQ blocked pending official electronic source + approved authorization.',
    'Do not invent SDQ items, translations, or scoring rules.',
  ],
}

export const TEXI_PARENT_ZH_CN_BLOCKED: BlockedScalePackageDescriptorV1 = {
  key: 'texi_parent_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'BLOCKED',
  respondentTypes: ['PARENT'],
  officialSourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/32090688/',
  reasons: [
    'MISSING_OFFICIAL_ITEM_SOURCE',
    'LOCALIZATION_MANIFEST_UNSIGNED',
  ],
  notes: [
    'TEXI ages 13–19; fixed source version + item codes required; translation/back-translation/terminology/mainland language review + signed manifest required.',
    'Descriptive only — no mainland norms claims.',
    'Official redistributable item text unavailable in this environment; package blocked.',
  ],
}

export const TEXI_TEACHER_ZH_CN_BLOCKED: BlockedScalePackageDescriptorV1 = {
  key: 'texi_teacher_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'BLOCKED',
  respondentTypes: ['TEACHER'],
  officialSourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/32090688/',
  reasons: [
    'MISSING_OFFICIAL_ITEM_SOURCE',
    'LOCALIZATION_MANIFEST_UNSIGNED',
  ],
  notes: [
    'TEXI teacher-observer blocked pending official source + signed localization manifest.',
    'Descriptive only — no mainland norms claims.',
  ],
}

export const BLOCKED_SCALE_PACKAGES_V1 = [
  SDQ_PARENT_ZH_CN_BLOCKED,
  SDQ_TEACHER_ZH_CN_BLOCKED,
  TEXI_PARENT_ZH_CN_BLOCKED,
  TEXI_TEACHER_ZH_CN_BLOCKED,
] as const

export const getBlockedScalePackage = (
  key: string,
  instrumentVersion: string,
): BlockedScalePackageDescriptorV1 | undefined => (
  BLOCKED_SCALE_PACKAGES_V1.find((row) => (
    row.key === key && row.instrumentVersion === instrumentVersion
  ))
)
