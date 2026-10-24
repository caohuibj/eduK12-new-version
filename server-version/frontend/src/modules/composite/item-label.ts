import type { CompositeItemType } from './types'

const labels: Record<CompositeItemType, string> = {
  SCALE: '量表', COGNITIVE: '认知测验', FORM: '表单', FORM_SECTION: '表单', SITUATIONAL: '情境判断',
}

/** Display only: preserve authored titles while translating protocol identifiers. */
export function compositeItemLabel(item: { type: CompositeItemType; label?: string | null }) {
  const title = item.label?.trim()
  if (!title || title === item.type || (item.type === 'SITUATIONAL' && /^(?:SJT|文字情境测评|情境化测评)$/i.test(title))) return labels[item.type]
  return title
}
