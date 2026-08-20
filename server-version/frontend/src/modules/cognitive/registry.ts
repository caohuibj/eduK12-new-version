import type { CognitiveTaskProps } from './core/runner.types'
// 模块加载期注册 Fake（单向依赖：fake.registry 不反向 import 本文件，避免循环）
import { fakeRegistryEntry } from './tasks/fake/fake.registry'

/**
 * 前端 Cognitive Registry（Stage B v1.1 §16）。
 *
 * 职责边界：
 *  - 后端 Registry = schema / scorer / version 权威；
 *  - 前端 Registry 只负责 RunnerComponent + 显示元数据 + frontend engine 映射。
 *
 * 硬性约束：
 *  - 选择键 = testType + engineVersion；**禁止 latest fallback / nearby version**；
 *  - 前端**不得决定 scoringVersion**、不得权威评分；
 *  - 未知版本 → `resolveRunner` 返回 undefined → runner 态 `UNSUPPORTED`。
 */

export interface CognitiveFrontendRegistryEntry {
  testType: string
  engineVersion: string
  RunnerComponent: React.ComponentType<CognitiveTaskProps>
}

const REGISTRY = new Map<string, CognitiveFrontendRegistryEntry>()

const keyOf = (testType: string, engineVersion: string) => `${testType}/${engineVersion}`

export const registerCognitiveRunner = (entry: CognitiveFrontendRegistryEntry): void => {
  const k = keyOf(entry.testType, entry.engineVersion)
  if (REGISTRY.has(k)) {
    throw new Error(`Cognitive frontend registry duplicate key: ${k}`)
  }
  REGISTRY.set(k, entry)
}

export const resolveRunner = (
  testType: string,
  engineVersion: string
): CognitiveFrontendRegistryEntry | undefined => REGISTRY.get(keyOf(testType, engineVersion))

// 注册 Fake Test：fake / 1.0.0
registerCognitiveRunner(fakeRegistryEntry)
