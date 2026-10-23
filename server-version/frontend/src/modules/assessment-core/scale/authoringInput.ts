/** Plain-text authoring only; saving and publication retain the existing API. */
export function parseScaleItemPaste(text: string) {
  const marker = /^(?:\[反向\]|【反向】|\(R\)|（R）)\s*|\s*(?:\[反向\]|【反向】|\(R\)|（R）)$/gi
  const lines = text.split(/\r\n?|\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length > 200) throw new Error('一次最多录入 200 道题，请分批追加。')
  return lines.map(line => {
    const content = line.replace(marker, '').trim()
    if (!content) throw new Error('反向标记旁还需要填写题干。')
    return { content, reverse: content !== line }
  })
}

export interface AuthoringOption { value: string | number; label: string; score: number }
export function resizeScaleOptions(options: AuthoringOption[], count: number): AuthoringOption[] {
  if (!Number.isInteger(count) || count < 2 || count > 50) throw new Error('选项数量需为 2–50 项。')
  const next = options.slice(0, count)
  while (next.length < count) {
    next.push({ value: `option_${crypto.randomUUID().replace(/-/g, '')}`, label: `选项 ${next.length + 1}`, score: (next[next.length - 1]?.score ?? 0) + 1 })
  }
  return next
}
export function applyScaleOptionLabels(options: AuthoringOption[], text: string) {
  const labels = text.split(/\r\n?|\n/).map(line => line.trim()).filter(Boolean)
  if (labels.length < 2 || labels.length > 50) throw new Error('请每行填写一个选项，共 2–50 项。')
  return resizeScaleOptions(options, labels.length).map((option, index) => ({ ...option, label: labels[index] }))
}
export const scaleOptionPresets = [
  { label: '5级同意程度', labels: ['非常不同意', '不同意', '一般', '同意', '非常同意'] },
  { label: '5级频率', labels: ['从不', '很少', '有时', '经常', '总是'] },
  { label: '是／否', labels: ['否', '是'] },
] as const
