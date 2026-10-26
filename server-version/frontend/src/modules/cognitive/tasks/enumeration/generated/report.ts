// Generated closed projection from scorer SHA256: f89b3ccc3b3f33afd72bd8c1948a4a220d4ffab30ad039a491b5aa762a0bbd72
export interface EnumerationPublicResult { metrics: Record<string, unknown>; quality: { state: 'interpretable'|'limited'|'invalid'; flags: Record<string,boolean>; reasons:string[] } }
export function projectEnumerationReport(result: EnumerationPublicResult) {
  return { state: 'invalid' as const, headline: null, rows: [] as never[],
    interpretationPolicy: 'research_provisional' as const,
    reasons: [...new Set(['本候选尚未获准生成个人表现结论。', ...result.quality.reasons])] }
}
