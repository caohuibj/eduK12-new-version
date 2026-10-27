import { canonicalHash } from '../../assessment-runtime/canonical'
import { hashScaleDefinition } from '../scale-definition'
import type { ScaleInstrumentSourceV1 } from './types'

/** A legacy row is a compatibility source for that exact installed definition,
 * never an approval of a new source package or a migration of formal wording. */
export interface InstalledScaleInstructionRow {
  instrumentClass: string
  instrumentVersion: string
  definitionHash: string | null
  definition: unknown
  instruction?: string | null
}

export const resolveScaleAdmissionInstruction = (
  source: ScaleInstrumentSourceV1,
  installed?: InstalledScaleInstructionRow | null,
) => {
  if (source.instruction) return {
    blockers: [] as string[],
    binding: { origin: 'INSTRUMENT_SOURCE' as const, ...source.instruction },
  }
  if (source.executable && installed?.instrumentClass === 'STANDARD'
    && installed.instrumentVersion === source.identity.instrumentVersion
    && installed.definitionHash === hashScaleDefinition(source.executable.definition)
    && installed.definition && canonicalHash(installed.definition) === canonicalHash(source.executable.definition)
    && installed.instruction?.trim()) return {
      blockers: [] as string[],
      binding: { origin: 'SCALE_FIELD' as const, text: installed.instruction },
    }
  return { blockers: ['instruction:INSTRUCTION_NOT_DECLARED'], binding: null }
}
