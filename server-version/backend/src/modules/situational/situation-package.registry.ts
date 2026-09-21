import { isAssessmentOperationallyPaused } from '../assessment-governance/operational-hold'
import type { SituationPackage } from './situation-package'
export * from './situation-package'
import { GENERATED_SITUATIONAL_INSTRUMENT_SOURCES } from './onboarding/instruments.generated'
import { createSituationalInstrumentRegistry } from './onboarding/instrument-registry'
import { listEnabledSituationalFixtures } from './fixtures/fixture-registry'

const production = createSituationalInstrumentRegistry(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES)
const packages: SituationPackage[] = [...production.packages, ...listEnabledSituationalFixtures()]

const packageIdentityKey = (key: string, instrumentVersion: string): string => JSON.stringify([key, instrumentVersion])
const packageByKey = new Map<string, SituationPackage>()
for (const situationPackage of packages) {
  const identity = packageIdentityKey(situationPackage.key, situationPackage.instrumentVersion)
  if (packageByKey.has(identity)) {
    throw new Error(`Duplicate situation package identity: ${situationPackage.key}@${situationPackage.instrumentVersion}`)
  }
  packageByKey.set(identity, situationPackage)
}

export const getSituationPackage = (key: string, instrumentVersion: string): SituationPackage | undefined => (
  packageByKey.get(packageIdentityKey(key, instrumentVersion))
)

export const listSituationPackages = (): SituationPackage[] => [...packages]

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

