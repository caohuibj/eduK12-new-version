/** Privileged raw-export codebook only. Never import into participant projections. */
export type QualityExportItem = {
  itemCode: string; content: string; purpose?: string; attentionTarget?: string | number; responseSetKey?: string
}
export const isQualityExportItem = (item: { purpose?: string }): boolean =>
  item.purpose === 'ATTENTION_CHECK' || item.purpose === 'SOCIAL_DESIRABILITY'

export function qualityItemCodebook(item: QualityExportItem, definition: {
  responseSets?: Array<{ key: string; options: Array<{ value: string | number; label: string }> }>
}): string {
  return JSON.stringify({
    itemCode: item.itemCode, purpose: item.purpose, prompt: item.content,
    responseSetKey: item.responseSetKey,
    options: (definition.responseSets?.find(set => set.key === item.responseSetKey)?.options ?? [])
      .map(({ value, label }) => ({ value, label })),
    ...(item.purpose === 'ATTENTION_CHECK' && item.attentionTarget !== undefined
      ? { attentionTarget: item.attentionTarget } : {}),
    responseEncoding: 'ACTUAL_OPTION_VALUE', scored: false,
  })
}
