import type { CognitiveTaskProps } from './core/runner.types'
// 模块加载期注册 Fake（单向依赖：fake.registry 不反向 import 本文件，避免循环）
import { fakeRegistryEntry } from './tasks/fake/fake.registry'
import { reactionRegistryEntry } from './tasks/reaction/reaction.registry'
import { memoryRegistryEntry } from './tasks/memory/memory.registry'
import { stroopRegistryEntry } from './tasks/stroop/stroop.registry'
import { gonogoRegistryEntry } from './tasks/gonogo/gonogo.registry'
import { cptRegistryEntry } from './tasks/cpt/cpt.registry'
import { nbackRegistryEntry } from './tasks/nback/nback.registry'
import { corsiRegistryEntry } from './tasks/corsi/corsi.registry'

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

/**
 * 指标展示定义（Milestone E §18 / 用户确认 R1：前端静态 metadata，非独立 Report Engine）。
 * key 必须对应后端 scorer 返回的 metrics 字段名；displayType 决定渲染样式。
 */
export interface MetricDefinition {
  key: string
  label: string
  unit?: string
  displayType: 'number' | 'percentage' | 'ms' | 'text'
}

/**
 * 即时报告定义（Milestone E §74）：标题 + headline 指标 + summary 指标 + 免责声明。
 * 后端只负责 metrics JSON + scoringVersion + qualityFlags；展示层解释全部在前端。
 */
export interface ReportDefinition {
  title: string
  headlineMetric: string
  summaryMetrics: string[]
  indexLabel?: string
  practicalTips?: string[]
  disclaimer?: string
}

export interface CognitiveFrontendRegistryEntry {
  testType: string
  /** 展示名（中文），如 “反应速度”。 */
  name: string
  engineVersion: string
  /** 与后端 registry key 对齐；前端不权威评分，仅透传。 */
  scoringVersion: string
  RunnerComponent: React.ComponentType<CognitiveTaskProps>
  metricDefinitions: MetricDefinition[]
  reportDefinition: ReportDefinition
  /** Memory 等自适应任务由任务本身决定何时完成。 */
  completionMode?: 'manual' | 'task'
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

// 注册 Reaction Test：reaction / 1.0.0（Milestone E Session 2）
registerCognitiveRunner(reactionRegistryEntry)

// 注册 Memory Test：memory / 1.0.0（Milestone E Session 3）
registerCognitiveRunner(memoryRegistryEntry)

// 注册 Stroop Test：stroop / 1.0.0（Milestone E Session 4）
registerCognitiveRunner(stroopRegistryEntry)
registerCognitiveRunner(gonogoRegistryEntry)
registerCognitiveRunner(cptRegistryEntry)
registerCognitiveRunner(nbackRegistryEntry)
registerCognitiveRunner(corsiRegistryEntry)
