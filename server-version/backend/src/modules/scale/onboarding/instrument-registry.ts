import { GENERATED_SCALE_INSTRUMENT_SOURCES } from './instruments.generated'
import { compileScalePolicy, type CompiledScalePolicyV1 } from '../policy/compile'
import { parseScaleInstrumentSources, type ScaleSourceSchemaDiagnostic } from './schema'
import { projectScalePackage } from './define-instrument'
import { materializeCatalogManifest, materializeLocalizationManifest, validateScaleInstrumentSource } from './validate-instrument'
import './executable-registry'
import type { ScaleInstrumentSourceV1, ScalePackageV2 } from './types'
import type { LocalizationManifestV1 } from '../library/localization-manifest'
import type { ScaleCatalogManifestV1 } from '../library/catalog-manifest'

const identityKey = (source: Pick<ScaleInstrumentSourceV1, 'identity'>): string => (
  `${source.identity.instrumentKey}:${source.identity.instrumentVersion}`
)

export interface ScaleInstrumentRegistry {
  getSource(instrumentKey: string, instrumentVersion: string): ScaleInstrumentSourceV1 | undefined
  getExecutable(instrumentKey: string, instrumentVersion: string): ScalePackageV2 | undefined
  getRuntimePolicy(instrumentKey: string, instrumentVersion: string): CompiledScalePolicyV1 | undefined
  listSources(): ScaleInstrumentSourceV1[]
  listDiagnostics(): ScaleSourceSchemaDiagnostic[]
  listCatalogEntries(): ScaleCatalogManifestV1[]
  getLocalization(instrumentKey: string, instrumentVersion: string): LocalizationManifestV1 | undefined
}

export const createScaleInstrumentRegistry = (sources: readonly ScaleInstrumentSourceV1[]): ScaleInstrumentRegistry => {
  const byIdentity = new Map<string, ScaleInstrumentSourceV1>()
  const parsed = parseScaleInstrumentSources(sources)
  parsed.sources.forEach((source) => {
    const key = identityKey(source)
    if (byIdentity.has(key)) throw new Error(`Duplicate ScaleInstrumentSource identity: ${key}`)
    byIdentity.set(key, source)
  })

  const sortedSources = (): ScaleInstrumentSourceV1[] => (
    [...byIdentity.values()].sort((left, right) => identityKey(left).localeCompare(identityKey(right)))
  )

  // Catalog discovery may include structurally incomplete candidates. Validate
  // the selected identity at execution/installation, never the whole module on import.
  const validations = new Map<string, ReturnType<typeof validateScaleInstrumentSource>>()
  const executableSource = (instrumentKey: string, instrumentVersion: string) => {
    const source = byIdentity.get(`${instrumentKey}:${instrumentVersion}`)
    if (!source?.executable) return source
    const key = identityKey(source)
    const validation = validations.get(key) ?? validateScaleInstrumentSource(source)
    validations.set(key, validation)
    const errors = validation.issues.filter(issue => issue.severity === 'error')
    if (errors.length) throw new Error(`Invalid ScaleInstrumentSource ${identityKey(source)}: ${errors.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`)
    return source
  }

  return {
    getSource: (instrumentKey, instrumentVersion) => byIdentity.get(`${instrumentKey}:${instrumentVersion}`),
    getExecutable: (instrumentKey, instrumentVersion) => {
      const source = executableSource(instrumentKey, instrumentVersion)
      return source ? projectScalePackage(source) : undefined
    },
    getRuntimePolicy: (instrumentKey, instrumentVersion) => {
      const source = executableSource(instrumentKey, instrumentVersion)
      return source?.executable ? compileScalePolicy(source) : undefined
    },
    listSources: sortedSources,
    listDiagnostics: () => parsed.diagnostics,
    listCatalogEntries: () => sortedSources().map((source) => materializeCatalogManifest(source) as ScaleCatalogManifestV1),
    getLocalization: (instrumentKey, instrumentVersion) => {
      const source = byIdentity.get(`${instrumentKey}:${instrumentVersion}`)
      return source ? materializeLocalizationManifest(source) as LocalizationManifestV1 | undefined : undefined
    },
  }
}

export const SCALE_INSTRUMENT_REGISTRY = createScaleInstrumentRegistry(GENERATED_SCALE_INSTRUMENT_SOURCES)

export const getScaleInstrumentSource = SCALE_INSTRUMENT_REGISTRY.getSource
export const listScaleInstrumentSources = SCALE_INSTRUMENT_REGISTRY.listSources
export const listScaleInstrumentSourceDiagnostics = SCALE_INSTRUMENT_REGISTRY.listDiagnostics
export const listScaleInstrumentCatalogEntries = SCALE_INSTRUMENT_REGISTRY.listCatalogEntries
export const getScaleInstrumentLocalization = SCALE_INSTRUMENT_REGISTRY.getLocalization
export const getScaleInstrumentRuntimePolicy = SCALE_INSTRUMENT_REGISTRY.getRuntimePolicy

/** Resolve the instruction to freeze for a scale about to start an attempt:
 * a STANDARD instrument freezes its source-declared, versioned instruction;
 * everything else (teacher-authored rows, sources without a declared
 * instruction) freezes the current Scale field text. Empty rows freeze an explicit null; legacy attempts without the field keep falling
 * back to the live field at projection time. */
export const resolveFrozenScaleInstructionForScale = (
  scale: { code: string; instrumentVersion: string; instrumentClass?: string; instruction?: string | null },
  registry: ScaleInstrumentRegistry = SCALE_INSTRUMENT_REGISTRY,
): { text: string; language?: string; version?: string; origin: 'INSTRUMENT_SOURCE' | 'SCALE_FIELD' } | null => {
  if (scale.instrumentClass === 'STANDARD') {
    const instruction = registry.getSource(scale.code, scale.instrumentVersion)?.instruction
    if (instruction) return { text: instruction.text, language: instruction.language, version: instruction.version, origin: 'INSTRUMENT_SOURCE' }
  }
  return scale.instruction ? { text: scale.instruction, origin: 'SCALE_FIELD' } : null
}
