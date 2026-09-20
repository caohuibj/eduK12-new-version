import { WAVE0_LOCALIZATION_MANIFESTS, WAVE0_SCALE_CATALOG_MANIFESTS } from '../library/wave0-catalog'
import { WAVE1_P1_LOCALIZATION_MANIFESTS, WAVE1_P1_SCALE_CATALOG_MANIFESTS } from '../library/wave1-p1-catalog'
import type { ScaleCatalogManifestV1 } from '../library/catalog-manifest'
import type { LocalizationManifestV1 } from '../library/localization-manifest'
import type { AudienceDisclosurePolicyV1, DisclosureCapabilitiesV1, InstrumentApplicabilityV1 } from '../policy/types'
import { defineScaleInstrumentSource } from './define-instrument'
import { listExecutableScalePackages } from './executable-registry'
import type { ScaleInstrumentSourceV1, ScalePackageV2 } from './types'

const identityKey = (key: string, version: string): string => `${key}:${version}`

const legacyFullCapabilities: DisclosureCapabilitiesV1 = {
  numericScores: true,
  references: true,
  individualInterpretations: true,
  scoreDerivedLabels: true,
  resultQualityDetails: true,
  rawAnswers: false,
  itemScores: true,
  methods: true,
  educationalContent: true,
}

const legacyDisclosure = (): AudienceDisclosurePolicyV1 => ({
  schemaVersion: 1,
  policyVersion: 'legacy-compat-v1',
  audiences: {
    respondent: { ...legacyFullCapabilities },
    subject: { ...legacyFullCapabilities },
    teacher: { ...legacyFullCapabilities },
    researcher: { ...legacyFullCapabilities },
  },
  unknownAudience: 'DENY',
})

const legacyApplicability = (catalog: ScaleCatalogManifestV1): InstrumentApplicabilityV1 => ({
  schemaVersion: 1,
  policyVersion: 'legacy-compat-v1',
  // PR-1 records trusted respondent semantics but deliberately does not turn
  // catalog age/evidence ranges into runtime admission gates. PR-3 performs
  // deployment-by-deployment applicability activation.
  respondentTypes: [...catalog.population.respondentTypes],
  requiredContextKeys: [],
})

const stripCatalogIdentity = (catalog: ScaleCatalogManifestV1): ScaleInstrumentSourceV1['catalog'] => {
  const { instrumentKey: _key, instrumentVersion: _version, ...identityBody } = catalog.identity
  return { ...catalog, identity: identityBody }
}

const stripLocalizationIdentity = (localization: LocalizationManifestV1 | undefined): ScaleInstrumentSourceV1['localization'] => {
  if (!localization) return undefined
  const { instrumentKey: _key, instrumentVersion: _version, ...body } = localization
  return body
}

const adaptLegacySource = (input: {
  catalog: ScaleCatalogManifestV1
  localization?: LocalizationManifestV1
  executable?: ScalePackageV2
}): ScaleInstrumentSourceV1 => {
  const executable = input.executable
    ? {
        releaseStatus: 'PUBLISHED' as const,
        contentLocale: input.localization?.targetLocale ?? input.localization?.sourceLocale ?? 'und',
        definition: input.executable.definition,
        references: input.executable.references,
        goldenCases: input.executable.goldenCases,
      }
    : undefined

  return defineScaleInstrumentSource({
    schemaVersion: 1,
    identity: {
      instrumentKey: input.catalog.identity.instrumentKey,
      instrumentVersion: input.catalog.identity.instrumentVersion,
    },
    catalog: stripCatalogIdentity(input.catalog),
    ...(input.localization ? { localization: stripLocalizationIdentity(input.localization) } : {}),
    ...(executable
      ? {
          applicability: legacyApplicability(input.catalog),
          disclosure: legacyDisclosure(),
          executable,
        }
      : {
          candidatePreview: {
            status: 'CATALOG_ONLY' as const,
            blockers: ['EXECUTABLE_NOT_REGISTERED'],
          },
        }),
  })
}

export const buildLegacyInstrumentSources = (): ScaleInstrumentSourceV1[] => {
  const packages = listExecutableScalePackages()
  const packageByIdentity = new Map(packages.map((pkg) => [identityKey(pkg.key, pkg.instrumentVersion), pkg]))
  const localizations = [...WAVE0_LOCALIZATION_MANIFESTS, ...WAVE1_P1_LOCALIZATION_MANIFESTS]
  const localizationByIdentity = new Map(localizations.map((item) => [identityKey(item.instrumentKey, item.instrumentVersion), item]))
  const catalogs = [...WAVE0_SCALE_CATALOG_MANIFESTS, ...WAVE1_P1_SCALE_CATALOG_MANIFESTS]

  return catalogs.map((catalog) => {
    const key = identityKey(catalog.identity.instrumentKey, catalog.identity.instrumentVersion)
    return adaptLegacySource({
      catalog,
      localization: localizationByIdentity.get(key),
      executable: packageByIdentity.get(key),
    })
  }).sort((left, right) => identityKey(left.identity.instrumentKey, left.identity.instrumentVersion)
    .localeCompare(identityKey(right.identity.instrumentKey, right.identity.instrumentVersion)))
}
