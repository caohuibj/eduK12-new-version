import { resolveCognitiveReadinessProfile } from '../cognitive/core/readiness'
import type { CompositeCurrentItem } from './types'

export interface CompositeUnitRequirementSummary {
  status: 'known' | 'partial' | 'unknown'
  facts: string[]
  warnings: string[]
}

const inputLabel: Record<'keyboard' | 'pointer' | 'touch', string> = {
  keyboard: '键盘',
  pointer: '鼠标/指针',
  touch: '触控',
}

/**
 * Descriptive parent-level summary only. It must never become a substitute for
 * the child runner's readiness/admission checks. Missing frozen facts remain
 * unknown rather than being inferred from viewport, device class or task name.
 */
export const describeCompositeUnitRequirements = (
  item: CompositeCurrentItem | null | undefined,
): CompositeUnitRequirementSummary => {
  if (!item) return { status: 'unknown', facts: [], warnings: [] }

  if (item.type === 'COGNITIVE') {
    const session = item.cognitiveSession
    if (!session) return { status: 'unknown', facts: [], warnings: ['父级尚未返回冻结的认知任务会话信息。'] }
    const profile = resolveCognitiveReadinessProfile(session.testType, session.engineVersion)
    if (!profile) return { status: 'unknown', facts: [], warnings: ['当前冻结认知任务版本没有可展示的 readiness profile。'] }
    return {
      status: 'known',
      facts: [
        `可用输入：${profile.inputs.map((input) => inputLabel[input]).join('、')}`,
        '屏幕方向：不限',
      ],
      warnings: profile.resumeDisposition === 'restart-required'
        ? ['任务中断后不能仅凭已保存试次证明可安全重挂；恢复时以认知任务页面提示为准。']
        : [],
    }
  }

  if (item.type === 'SITUATIONAL') {
    const capabilities = item.instrument?.runtimeCapabilities
    if (!capabilities) return { status: 'unknown', facts: [], warnings: ['父级未提供该情境任务的冻结 runtime capabilities。'] }
    const facts = [
      `Bundle 嵌入运行：${capabilities.embedded ? '支持' : '未声明支持'}`,
      `当前 runtime 支持状态：${capabilities.supported ? '支持' : '未支持'}`,
    ]
    const warnings: string[] = []
    if (!capabilities.embedded) warnings.push('当前冻结 runtime 未声明支持 Bundle 嵌入运行。')
    if (!capabilities.supported) warnings.push('当前冻结 runtime 标记为未支持；进入单元前应由 runner 阻断。')
    return { status: 'partial', facts, warnings }
  }

  if (item.type === 'SCALE') {
    const estimatedTime = item.scale?.estimatedTime
    return Number.isFinite(estimatedTime) && Number(estimatedTime) > 0
      ? { status: 'partial', facts: [`预计用时：约 ${estimatedTime} 分钟`], warnings: [] }
      : { status: 'unknown', facts: [], warnings: [] }
  }

  return { status: 'unknown', facts: [], warnings: [] }
}
