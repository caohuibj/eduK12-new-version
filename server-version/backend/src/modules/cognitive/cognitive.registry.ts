import { RegistryEntry } from './cognitive.types'
import { fakeConfigSchema } from './schemas/fake.config'
import { fakeTrialSchema } from './schemas/fake.trial'
import { scoreFakeV1 } from './scoring/fake.v1'
import { reactionConfigSchema } from './schemas/reaction.config'
import { reactionTrialSchema } from './schemas/reaction.trial'
import { scoreReactionV1 } from './scoring/reaction.v1'

/**
 * Cognitive Registry（D2 Step 5）。
 *
 * 静态 registry：构建时注册，重复 key 立即抛错。
 * 定位键：testType + engineVersion + scoringVersion（错误版本绝不回退到"最新版"）。
 *
 * 明确不提供（D2 §9）：
 *  - runtime register API
 *  - plugin unload / hot reload
 *  - filesystem discovery / remote registry
 */

type AnyRegistryEntry = RegistryEntry<unknown, unknown>

const REGISTRY = new Map<string, AnyRegistryEntry>()

const keyOf = (testType: string, engineVersion: string, scoringVersion: string): string =>
  `${testType}/${engineVersion}/${scoringVersion}`

const registerEntry = <TConfig, TTrial>(entry: RegistryEntry<TConfig, TTrial>): void => {
  const k = keyOf(entry.testType, entry.engineVersion, entry.scoringVersion)
  if (REGISTRY.has(k)) {
    throw new Error(`Cognitive registry duplicate key: ${k}`)
  }
  REGISTRY.set(k, entry as AnyRegistryEntry)
}

export const hasCognitiveRegistryEntry = (
  testType: string,
  engineVersion: string,
  scoringVersion: string
): boolean => REGISTRY.has(keyOf(testType, engineVersion, scoringVersion))

export const getCognitiveRegistryEntry = (
  testType: string,
  engineVersion: string,
  scoringVersion: string
): AnyRegistryEntry | undefined => REGISTRY.get(keyOf(testType, engineVersion, scoringVersion))

/** 缺失直接抛错（供 D4/D6 在"服务端配置错误"场景使用）。 */
export const requireCognitiveRegistryEntry = (
  testType: string,
  engineVersion: string,
  scoringVersion: string
): AnyRegistryEntry => {
  const entry = REGISTRY.get(keyOf(testType, engineVersion, scoringVersion))
  if (!entry) {
    throw new Error(
      `No cognitive registry entry for ${testType}/${engineVersion}/${scoringVersion}`
    )
  }
  return entry
}

// 注册 Fake Test：fake / 1.0.0 / 1.0.0
registerEntry({
  testType: 'fake',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: fakeConfigSchema,
  trialSchema: fakeTrialSchema,
  score: scoreFakeV1,
})

// 注册 Reaction Test：reaction / 1.0.0 / 1.0.0（Milestone E Session 2）
registerEntry({
  testType: 'reaction',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: reactionConfigSchema,
  trialSchema: reactionTrialSchema,
  score: scoreReactionV1,
})
