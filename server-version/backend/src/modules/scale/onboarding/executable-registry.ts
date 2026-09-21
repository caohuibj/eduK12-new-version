import { getScaleCustomScorerKeys, registerScaleCustomScorer } from '../scale-scoring'
import { GENERATED_EXECUTABLE_SCALE_PACKAGES, GENERATED_SCALE_SCORER_PLUGINS, GENERATED_SCALE_INSTRUMENT_SOURCES } from './instruments.generated'
import type { ScalePackageV2, VersionedScorerRegistration } from './types'

const identityKey = (key: string, instrumentVersion: string): string => `${key}:${instrumentVersion}`

const buildExecutableRegistry = (packages: readonly ScalePackageV2[]): Map<string, ScalePackageV2> => {
  const map = new Map<string, ScalePackageV2>()
  packages.forEach((pkg) => {
    const key = identityKey(pkg.key, pkg.instrumentVersion)
    if (map.has(key)) throw new Error(`Duplicate scale executable identity: ${key}`)
    // Preserve the pre-PR-1 compatibility behavior: registry-complete legacy
    // executables are surfaced as PUBLISHED regardless of old source literals.
    map.set(key, { ...pkg })
  })
  return map
}

const bootstrapScorerPlugins = (plugins: readonly VersionedScorerRegistration[]): void => {
  const descriptors = new Set<string>()
  const scorerKeys = new Set<string>()
  plugins.forEach((plugin) => {
    const descriptor = `${plugin.key}:${plugin.version}`
    if (descriptors.has(descriptor)) throw new Error(`Duplicate scale scorer plugin descriptor: ${descriptor}`)
    if (scorerKeys.has(plugin.key)) throw new Error(`Multiple versions for active scale scorer key are not supported: ${plugin.key}`)
    descriptors.add(descriptor)
    scorerKeys.add(plugin.key)
  })
  const alreadyRegistered = getScaleCustomScorerKeys()
  plugins.forEach((plugin) => {
    if (alreadyRegistered.has(plugin.key)) throw new Error(`Scale scorer key already registered before bootstrap: ${plugin.key}`)
    registerScaleCustomScorer(plugin.key, plugin.scorer)
  })
}

bootstrapScorerPlugins([...GENERATED_SCALE_SCORER_PLUGINS, ...GENERATED_SCALE_INSTRUMENT_SOURCES.flatMap(source => source.executable?.scorerPlugins ?? [])])
const executableByIdentity = buildExecutableRegistry([
  ...GENERATED_EXECUTABLE_SCALE_PACKAGES.map(pkg => ({ ...pkg, releaseStatus: 'PUBLISHED' as const })),
  ...GENERATED_SCALE_INSTRUMENT_SOURCES.flatMap(source => source.executable ? [{
    key: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion,
    releaseStatus: source.executable.releaseStatus, definition: source.executable.definition,
    references: source.executable.references, goldenCases: source.executable.goldenCases,
  }] : []),
])

export const getExecutableScalePackage = (key: string, instrumentVersion: string): ScalePackageV2 | undefined => (
  executableByIdentity.get(identityKey(key, instrumentVersion))
)

/** Preserve the legacy public ordering exactly; generated source order is deterministic. */
export const listExecutableScalePackages = (): ScalePackageV2[] => [...executableByIdentity.values()]

export const hasExecutableScalePackage = (key: string, instrumentVersion: string): boolean => (
  executableByIdentity.has(identityKey(key, instrumentVersion))
)

export const assertUniqueExecutablePackagesForTest = (packages: readonly ScalePackageV2[]): void => {
  buildExecutableRegistry(packages)
}

export const assertUniqueScorerPluginsForTest = (plugins: readonly VersionedScorerRegistration[]): void => {
  const descriptors = new Set<string>()
  const keys = new Set<string>()
  plugins.forEach((plugin) => {
    const descriptor = `${plugin.key}:${plugin.version}`
    if (descriptors.has(descriptor)) throw new Error(`Duplicate scale scorer plugin descriptor: ${descriptor}`)
    if (keys.has(plugin.key)) throw new Error(`Multiple versions for active scale scorer key are not supported: ${plugin.key}`)
    descriptors.add(descriptor)
    keys.add(plugin.key)
  })
}
