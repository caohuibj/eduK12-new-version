export function formatReportCompletedAt(value?: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return new Date(value).toLocaleString('zh-CN')
}
