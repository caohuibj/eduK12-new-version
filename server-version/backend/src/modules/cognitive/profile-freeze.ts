import { createHash } from 'crypto'
import { encryptCognitivePayload } from './cognitive.security'
import { BAD_REQUEST } from './cognitive.errors'
import type { CognitiveProfile, RegistryEntry } from './cognitive.types'

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

export const hashResolvedConfig = (config: unknown): string =>
  createHash('sha256').update(JSON.stringify(sortValue(config))).digest('hex')

export const mergeProfileConfig = <TConfig, TTrial>(
  entry: RegistryEntry<TConfig, TTrial>,
  baseConfig: unknown,
  profile: CognitiveProfile,
): TConfig => {
  const definition = entry.profiles[profile]
  if (!definition) {
    throw BAD_REQUEST(`该任务未声明 Profile ${profile}`)
  }
  const merged = {
    ...(baseConfig as Record<string, unknown>),
    ...definition.configPatch,
  }
  const parsed = entry.configSchema.safeParse(merged)
  if (!parsed.success) {
    throw BAD_REQUEST('Profile 配置与任务 schema 不匹配')
  }
  return parsed.data
}

export const freezeAssignmentProfile = <TConfig, TTrial>(input: {
  entry: RegistryEntry<TConfig, TTrial>
  baseConfig: unknown
  profile: CognitiveProfile
}) => {
  const resolvedConfig = mergeProfileConfig(input.entry, input.baseConfig, input.profile)
  return {
    profile: input.profile,
    profileDefinitionVersion: input.entry.profileDefinitionVersion,
    resolvedConfig,
    resolvedConfigHash: hashResolvedConfig(resolvedConfig),
    resolvedConfigSnapshotEncrypted: encryptCognitivePayload(resolvedConfig),
  }
}
