import { CognitiveConfigStatus } from '@prisma/client'

/**
 * CognitiveTestConfig 不可变规则（见 Milestone D v1.2 P0-6 / Session D-1 §13）。
 *
 * 命名说明：
 *  - 这里检查的是「核心字段是否可改」，因此叫 assertConfigCoreMutable。
 *  - PUBLISHED → RETIRED 本身是合法的 status 转换（见 assertConfigStatusTransition，D2/manage API 再实现），
 *    不应被本 helper 误伤；本 helper 只禁止在 PUBLISHED / RETIRED 状态下修改核心字段。
 */

export const assertConfigCoreMutable = (status: CognitiveConfigStatus): void => {
  if (status === 'PUBLISHED' || status === 'RETIRED') {
    throw new Error(
      `CognitiveTestConfig in status ${status} is immutable; ` +
        `create a new configVersion instead of editing core fields`
    )
  }
}

// 延迟到 D2 / manage API 实现：
// export const assertConfigStatusTransition = (
//   from: CognitiveConfigStatus,
//   to: CognitiveConfigStatus
// ): void => { ... }
