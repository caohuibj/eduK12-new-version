import { z } from 'zod'

/**
 * Cognitive 跨阶段共享 schema/helper（D2 Step 6）。
 *
 * D2 只放真正跨 D3–D6 会复用的轻量 schema/helper；
 * 不要在这里预写 Assignment / Session / Completion request schema ——
 * "D3 的 API body schema 到 D3 再加"（D2 §10）。
 */

/** 通用 trialIndex：non-negative integer（envelope 字段，不属于 payload）。 */
export const trialIndexSchema = z.number().int().min(0)

/** Registry 版本键基础 string schema。 */
export const versionStringSchema = z.string().min(1)
