import { isAssessmentOperationallyPaused } from '../assessment-governance/operational-hold'
import type { SituationPackage, SituationPackageV1 } from './situation-package'
export * from './situation-package'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE_SOURCE } from './packages/sjt-assertiveness-golden-zh-cn-v1'
import { SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE as SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE_SOURCE } from './packages/sjt-responsibility-golden-zh-cn-v1'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE as SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE_SOURCE } from './packages/sjt-anxiety-golden-zh-cn-v1'
import { SJT_STATIC_VISUAL_E2E_PACKAGE } from './packages/sjt-static-visual-e2e-fixture'
import { SJT_BRANCHING_E2E_PACKAGE } from './packages/sjt-branching-e2e-fixture'
import { SJT_VIDEO_E2E_PACKAGE } from './packages/sjt-video-e2e-fixture'

const publishExecutablePackage = (pkg: SituationPackageV1): SituationPackageV1 => ({
  ...pkg,
  releaseStatus: 'PUBLISHED',
})

/**
 * Production V1 packages are executable-complete and therefore PUBLISHED.
 * Their scientific maturity remains PILOT. CI-only fixtures keep their own
 * fixture lifecycle and are never normalized into production availability.
 */
const productionPackages: SituationPackageV1[] = [
  publishExecutablePackage(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE_SOURCE),
  publishExecutablePackage(SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE_SOURCE),
  publishExecutablePackage(SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE_SOURCE),
]

// Production content remains V1 until a later content PR deliberately adds a
// reviewed V2 pilot. CI-only V2 fixtures are isolated behind explicit env flags
// so normal catalog/service typing does not imply production V2 publication.
const packages: SituationPackageV1[] = [
  ...productionPackages,
  ...(process.env.SITUATIONAL_STATIC_VISUAL_FIXTURE === 'true' ? [SJT_STATIC_VISUAL_E2E_PACKAGE] : []),
  ...(process.env.SITUATIONAL_BRANCHING_E2E_FIXTURE === 'true'
    ? [SJT_BRANCHING_E2E_PACKAGE as unknown as SituationPackageV1]
    : []),
  ...(process.env.SITUATIONAL_VIDEO_E2E_FIXTURE === 'true'
    ? [SJT_VIDEO_E2E_PACKAGE as unknown as SituationPackageV1]
    : []),
]

const packageIdentityKey = (key: string, instrumentVersion: string): string => JSON.stringify([key, instrumentVersion])
const packageByKey = new Map<string, SituationPackageV1>()
for (const situationPackage of packages) {
  const identity = packageIdentityKey(situationPackage.key, situationPackage.instrumentVersion)
  if (packageByKey.has(identity)) {
    throw new Error(`Duplicate situation package identity: ${situationPackage.key}@${situationPackage.instrumentVersion}`)
  }
  packageByKey.set(identity, situationPackage)
}

export const getSituationPackage = (key: string, instrumentVersion: string): SituationPackageV1 | undefined => (
  packageByKey.get(packageIdentityKey(key, instrumentVersion))
)

export const listSituationPackages = (): SituationPackageV1[] => [...packages]

export const hasSituationPackage = (key: string, instrumentVersion: string): boolean => (
  packageByKey.has(packageIdentityKey(key, instrumentVersion))
)

/**
 * New participant admission first resolves the exact product version, then
 * applies the manual operational hold. Pausing the latest version never falls
 * back to an older PUBLISHED version. Existing attempts do not call this
 * selector; they continue from their frozen snapshot.
 */
export const selectPublishedSituationPackage = <T extends SituationPackage>(
  availablePackages: readonly T[],
  key: string,
  instrumentVersion?: string,
): T | undefined => {
  const candidates = availablePackages
    .filter((candidate) => (
      candidate.key === key
      && candidate.releaseStatus === 'PUBLISHED'
      && (instrumentVersion === undefined || candidate.instrumentVersion === instrumentVersion)
    ))
    .sort((left, right) => compareSituationalInstrumentVersions(right.instrumentVersion, left.instrumentVersion))
  const selected = candidates[0]
  if (!selected) return undefined
  return isAssessmentOperationallyPaused({
    family: 'SITUATIONAL',
    key: selected.key,
    version: selected.instrumentVersion,
  }) ? undefined : selected
}

/** Compare numeric version segments without treating 1.0.10 as older than 1.0.2. */
export const compareSituationalInstrumentVersions = (left: string, right: string): number => {
  const leftParts = left.split(/[.-]/u)
  const rightParts = right.split(/[.-]/u)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    const leftNumber = /^\d+$/u.test(leftPart) ? Number(leftPart) : null
    const rightNumber = /^\d+$/u.test(rightPart) ? Number(rightPart) : null
    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
      return leftNumber - rightNumber
    }
    const comparison = leftPart.localeCompare(rightPart, 'en')
    if (comparison !== 0) return comparison
  }
  return 0
}

