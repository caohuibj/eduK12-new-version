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
    if (!session) return { status: 'unknown', facts: [], warnings: ['任务信息暂未加载，请按任务页面提示操作。'] }
    const profile = resolveCognitiveReadinessProfile(session.testType, session.engineVersion)
    if (!profile) return { status: 'unknown', facts: [], warnings: ['设备要求暂不可用，开始任务后请按页面提示检查设备。'] }
    return {
      status: 'known',
      facts: [
        `可用输入：${profile.inputs.map((input) => inputLabel[input]).join('、')}`,
        '屏幕方向：不限',
      ],
      warnings: profile.resumeDisposition === 'restart-required'
        ? ['任务中断后可能需要重新开始，请按任务页面提示继续。']
        : [],
    }
  }

  if (item.type === 'SITUATIONAL') {
    const capabilities = item.instrument?.runtimeCapabilities
    if (!capabilities) return { status: 'unknown', facts: [], warnings: ['任务信息暂未加载，请按任务页面提示操作。'] }
    const facts = [
      `问卷内参与：${capabilities.embedded ? '支持' : '未声明支持'}`,
      `当前任务：${capabilities.supported ? '支持' : '未支持'}`,
    ]
    const warnings: string[] = []
    if (!capabilities.embedded) warnings.push('该任务暂不支持在问卷内参与，请按任务页面提示操作。')
    if (!capabilities.supported) warnings.push('该任务暂不可参与，请联系老师。')
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
