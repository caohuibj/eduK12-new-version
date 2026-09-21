import { parseScaleInstrumentSourceSchema } from './schema'
import { validateScaleInstrumentSource } from './validate-instrument'
import type { ScaleInstrumentSourceV1, ScalePackageV2 } from './types'

export const defineScaleInstrumentSource = (input: unknown): ScaleInstrumentSourceV1 => {
  const source = parseScaleInstrumentSourceSchema(input)
  const validation = validateScaleInstrumentSource(source)
  const errors = validation.issues.filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Invalid ScaleInstrumentSourceV1: ${errors.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`)
  }
  return source
}

export const projectScalePackage = (source: ScaleInstrumentSourceV1): ScalePackageV2 | undefined => (
  source.executable
    ? {
        key: source.identity.instrumentKey,
        instrumentVersion: source.identity.instrumentVersion,
        releaseStatus: source.executable.releaseStatus,
        definition: source.executable.definition,
        references: [...source.executable.references],
        goldenCases: [...source.executable.goldenCases],
      }
    : undefined
)
