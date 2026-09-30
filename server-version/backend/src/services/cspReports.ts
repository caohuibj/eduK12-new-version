import type { RequestHandler } from 'express'
const directives = new Set(['default-src', 'base-uri', 'form-action', 'frame-ancestors', 'object-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'media-src', 'frame-src', 'worker-src', 'child-src'])
const counts = new Map<string, number>()
/** Never retain blocked URLs, document URLs, snippets, user-agent or credentials. */
export const recordCspReport: RequestHandler = (req, res) => {
  const directive = req.body?.['csp-report']?.['effective-directive']
  const key = typeof directive === 'string' && directives.has(directive) ? directive : 'other'
  counts.set(key, (counts.get(key) ?? 0) + 1)
  res.sendStatus(204)
}
export const cspMetricLines = () => ['# TYPE ptool_csp_report_total counter', ...[...counts].map(([key, value]) => `ptool_csp_report_total{directive="${key}"} ${value}`)]
