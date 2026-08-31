import {
  getAnalysisProtocolDefinition,
  listAnalysisProtocolDefinitions,
} from './analysis-protocol.registry'
import type {
  AnalysisProtocolStatus,
  AnalysisProtocolDefinition,
  CognitiveProtocolSlotDefinition,
  CognitiveAnalysisProfile,
  ScaleProtocolSlotDefinition,
} from './cognitive-analysis.types'
import {
  listMentalHealthBundleReportPackages,
  validateMentalHealthBundleDefinitions,
} from '../mental-health-bundle/mental-health-bundle.registry'
import {
  MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
} from '../mental-health-bundle/mental-health-bundle.types'
import type { MentalHealthBundleDefinition } from '../mental-health-bundle/mental-health-bundle.types'

export type ReportPackageAudience = 'participant' | 'teacher' | 'researcher'

export interface ReportPackageDefinition {
  key: string
  version: string
  status: AnalysisProtocolStatus
  name: string
  description: string
  profiles: CognitiveAnalysisProfile[]
  estimatedMinutes: AnalysisProtocolDefinition['estimatedMinutes']
  slots: Array<CognitiveProtocolSlotDefinition | ScaleProtocolSlotDefinition>
  /** Defaults to cognitive-v1 for historical package definitions. */
  analysisEngineKey?: 'cognitive-v1' | typeof MENTAL_HEALTH_ANALYSIS_ENGINE_KEY
  analysisProtocolKey: string
  analysisProtocolVersion: string
  /** Mental-health packages retain their own bundle definition beside the
   * legacy protocol-shaped package fields for shared persistence. */
  bundleDefinition?: unknown
  reportDefinitionVersion: string
  audience: ReportPackageAudience[]
  disabledReason?: string
}

const REPORT_PACKAGE_DEFINITION_VERSION = 'report-package-v1'

const packageFromProtocol = (protocol: AnalysisProtocolDefinition): ReportPackageDefinition => ({
  analysisEngineKey: 'cognitive-v1',
  key: protocol.key,
  version: protocol.version,
  status: protocol.status,
  name: protocol.name,
  description: protocol.description,
  profiles: [...protocol.profiles],
  estimatedMinutes: {
    standard: [...protocol.estimatedMinutes.standard],
    research: [...protocol.estimatedMinutes.research],
  },
  slots: [
    ...protocol.cognitiveSlots.map((slot) => ({ ...slot })),
    ...protocol.scaleSlots.map((slot) => ({ ...slot })),
  ].sort((left, right) => left.position - right.position),
  analysisProtocolKey: protocol.key,
  analysisProtocolVersion: protocol.version,
  reportDefinitionVersion: REPORT_PACKAGE_DEFINITION_VERSION,
  audience: ['participant', 'teacher', 'researcher'],
  ...(protocol.disabledReason ? { disabledReason: protocol.disabledReason } : {}),
})

const PACKAGE_DEFINITIONS: ReportPackageDefinition[] = [
  ...listAnalysisProtocolDefinitions().map(packageFromProtocol),
  ...listMentalHealthBundleReportPackages(),
]

const packageResourceId = (key: string, version: string) => `${key}@${version}`

export const reportPackageResourceId = packageResourceId

const packageKey = (definition: ReportPackageDefinition) => packageResourceId(definition.key, definition.version)

export const validateReportPackageDefinitions = (definitions: ReportPackageDefinition[]): void => {
  const keys = new Set<string>()
  for (const definition of definitions) {
    const resourceId = packageKey(definition)
    if (keys.has(resourceId)) throw new Error(`Duplicate report package: ${resourceId}`)
    keys.add(resourceId)
    if (definition.analysisEngineKey === MENTAL_HEALTH_ANALYSIS_ENGINE_KEY) {
      if (!definition.bundleDefinition || typeof definition.bundleDefinition !== 'object') {
        throw new Error(`Mental health report package has no Bundle definition: ${resourceId}`)
      }
      const bundle = definition.bundleDefinition as MentalHealthBundleDefinition
      try {
        validateMentalHealthBundleDefinitions([bundle])
      } catch (error) {
        throw new Error(`Invalid mental health Bundle definition: ${resourceId}/${error instanceof Error ? error.message : 'unknown error'}`)
      }
      if (
        bundle.key !== definition.key
        || bundle.version !== definition.version
        || bundle.status !== definition.status
      ) {
        throw new Error(`Mental health report package and Bundle identity/status mismatch: ${resourceId}`)
      }
    } else if (definition.bundleDefinition !== undefined) {
      throw new Error(`Non-mental health report package cannot carry a Bundle definition: ${resourceId}`)
    }
    if (definition.status === 'PUBLISHED') {
      if (definition.analysisEngineKey === MENTAL_HEALTH_ANALYSIS_ENGINE_KEY) {
        // validateMentalHealthBundleDefinitions above is the publication gate
        // for exact forms, rights, references, Chinese evidence, and safety.
      } else {
        if (!definition.analysisProtocolKey || !definition.analysisProtocolVersion) {
          throw new Error(`Published report package has no analysis protocol: ${resourceId}`)
        }
        const protocol = getAnalysisProtocolDefinition(
          definition.analysisProtocolKey,
          definition.analysisProtocolVersion,
        )
        if (!protocol || protocol.status !== 'PUBLISHED') {
          throw new Error(`Published report package has unresolved protocol: ${resourceId}`)
        }
      }
    }
    if (definition.profiles.length === 0 || (definition.profiles as string[]).includes('experience')) {
      throw new Error(`Report package must only allow standard/research profiles: ${resourceId}`)
    }
    if (definition.slots.length === 0) throw new Error(`Report package has no slots: ${resourceId}`)
    const positions = new Set<number>()
    for (const slot of definition.slots) {
      if (positions.has(slot.position)) throw new Error(`Duplicate report package slot position: ${resourceId}/${slot.position}`)
      positions.add(slot.position)
      if (slot.required !== true) throw new Error(`Report package slots must be required: ${resourceId}/${slot.key}`)
    }
  }
}

validateReportPackageDefinitions(PACKAGE_DEFINITIONS)

const cloneDefinition = (definition: ReportPackageDefinition): ReportPackageDefinition => ({
  ...definition,
  profiles: [...definition.profiles],
  estimatedMinutes: {
    standard: [...definition.estimatedMinutes.standard],
    research: [...definition.estimatedMinutes.research],
  },
  slots: definition.slots.map((slot) => ({
    ...slot,
    ...('evidenceMappings' in slot && slot.evidenceMappings
      ? { evidenceMappings: slot.evidenceMappings.map((mapping) => ({ ...mapping })) }
      : {}),
  })),
  audience: [...definition.audience],
  ...(definition.bundleDefinition && typeof definition.bundleDefinition === 'object'
    ? { bundleDefinition: JSON.parse(JSON.stringify(definition.bundleDefinition)) }
    : {}),
})

const BY_RESOURCE_ID = new Map(PACKAGE_DEFINITIONS.map((definition) => [packageKey(definition), definition]))

export const listReportPackageDefinitions = (): ReportPackageDefinition[] => PACKAGE_DEFINITIONS.map(cloneDefinition)

export const getReportPackageDefinition = (
  key: string,
  version: string,
): ReportPackageDefinition | undefined => {
  const definition = BY_RESOURCE_ID.get(packageResourceId(key, version))
  return definition ? cloneDefinition(definition) : undefined
}

export const getReportPackageByResourceId = (resourceId: string): ReportPackageDefinition | undefined => {
  const separator = resourceId.lastIndexOf('@')
  if (separator <= 0 || separator === resourceId.length - 1) return undefined
  return getReportPackageDefinition(resourceId.slice(0, separator), resourceId.slice(separator + 1))
}
