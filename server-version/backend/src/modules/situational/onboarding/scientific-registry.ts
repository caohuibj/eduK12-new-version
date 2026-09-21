import { GENERATED_SITUATIONAL_INSTRUMENT_SOURCES } from './instruments.generated'
import { instrumentSourceSchema } from './schema'
import type { SituationalScientificDeclarationV1 } from './scientific-schema'

const identityKey = (key: string, version: string) => JSON.stringify([key, version])

/** Own the parsed data and return copies; callers cannot mutate the authority. */
export function createSituationalScientificRegistry(sources: readonly unknown[]) {
  const declarations = new Map<string, SituationalScientificDeclarationV1>()
  for (const value of sources) {
    const source = instrumentSourceSchema.parse(value)
    const identity = source.content.identity
    const key = identityKey(identity.instrumentKey, identity.instrumentVersion)
    if (declarations.has(key)) throw new Error(`Duplicate situational scientific identity: ${key}`)
    declarations.set(key, source.scientific)
  }
  return {
    get(key: string, version: string): SituationalScientificDeclarationV1 | undefined {
      const declaration = declarations.get(identityKey(key, version))
      return declaration ? structuredClone(declaration) : undefined
    },
  }
}
const registry = createSituationalScientificRegistry(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES)
export const getSituationalScientificDeclaration = registry.get
