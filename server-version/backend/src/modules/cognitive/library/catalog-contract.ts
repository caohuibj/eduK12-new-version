/**
 * COG-P1 Commit 2 — Lightweight Cognitive Library Catalog Contract.
 *
 * 定位（Pilot-first v2 指令 §9）：
 *  - 只保存 Catalog 自有的轻量科学/产品元数据（教育用途、交互族、敏感度、
 *    admin 备注、来源与 rights 指针、已知局限）。
 *  - 不得复制既有真值，以下信息一律通过 authoritative join 在读取时获得：
 *      domain / facet   → cognitive-analysis/evidence-mapping.registry + domain.registry
 *      metric 定义      → cognitive.registry metricDefinitions
 *      product release  → CognitiveTestConfig.status（DRAFT/PUBLISHED/RETIRED）
 *      maturity         → scientific-maturity.ts exact-identity registry
 *      reference        → Reference Core（reference.ts / AssessmentReferenceSet）
 *      scoring          → registry config/trial schema + scorer
 *      estimated burden → registry profiles[*].estimatedMinutes
 *  - scientific maturity 与 product release 完全独立（PUBLISHED + PILOT /
 *    DRAFT + RESEARCH_READY / PUBLISHED + RESEARCH_GRADE 均是合法状态组合）。
 *  - 本模块为 build-time 只读元数据：不得被 scorer / submit / runtime / hash 路径 import。
 */
import type { ScientificMaturity } from '../../assessment-governance/scientific-maturity'

/** 科学成熟度（与 DRAFT/PUBLISHED/RETIRED 产品发布状态完全独立）。 */
export type CognitiveScientificStatus = ScientificMaturity

/**
 * 交互族：按学生实际使用的输入模式划分，供 COG-P2 设备/输入 provenance 审计使用。
 * 这是新的 catalog 自有元数据，现有 registry 中不存在等价物。
 */
export type CognitiveInteractionFamily =
  | 'button_choice' // 离散按键/点选应答（含限时与不限时）
  | 'keypad_sequence' // 键盘/数字键入序列（顺背/倒背）
  | 'click_sequence' // 空间布局中按序点击（Corsi/Trail Making/Tower）
  | 'item_ordering' // 项目排序（图片序列）
  | 'position_selection' // 网格位置选择（配对学习）
  | 'multi_option_selection' // 多选项判断（矩阵/情绪分类）
  | 'typed_recall' // 键盘自由回忆（词表）
  | 'incremental_button' // 增量式按钮提交（BART）

export type CognitiveSensitivity = 'low' | 'moderate' | 'high'

export interface CognitiveLibraryCatalogEntry {
  /** 身份键，必须与 cognitive registry 的 testType 一致（fake 禁止出现）。 */
  testType: string
  /** 面向学生/家长的教育化用途描述（产品语言，不使用科研构念术语）。 */
  educationalPurpose: string
  /** 大致观察的能力（学生/家长可见的一句话，非能力等级）。 */
  plainAbilityHint: string
  interactionFamily: CognitiveInteractionFamily
  /** 任务对反应时差异的敏感度（COG-P2 设备分层的输入）。 */
  rtSensitivity: CognitiveSensitivity
  /** 任务对精细动作/指针操作差异的敏感度。 */
  fineMotorSensitivity: CognitiveSensitivity
  /** 管理员可见的简短科学备注（范式与主要构念的一句话概括）。 */
  adminScientificNotes: string
  /** 已知局限（解释边界；报告与 audience projection 可引用）。 */
  knownLimitations: string[]
  /** 来源文献指针（作者-年份-题名级引用，不复制受保护内容）。 */
  sourceNotes: string[]
  /** 刺激 rights/provenance 指针（内部生成资产的版本标识或 rights 说明）。 */
  rightsProvenance: string
}

/**
 * scientific maturity 是 **exact task identity scoped**：不绑定 task family。
 * protocol/scorer 发生实质变化的新 engine/scoring 版本天然回到 PILOT，
 * 不会继承旧版本的 RESEARCH_READY / RESEARCH_GRADE 资格。
 * 权威解析入口为 scientific-maturity.ts 的 resolveCognitiveScientificMaturity。
 */
