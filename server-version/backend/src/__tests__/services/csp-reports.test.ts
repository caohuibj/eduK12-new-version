import { expect, it } from 'vitest'
import { recordCspReport, cspMetricLines } from '../../services/cspReports'
it('retains only a fixed directive label and drops URLs, credentials and injected labels', () => {
  const response = { sendStatus: () => undefined }
  recordCspReport({ body: { 'csp-report': { 'effective-directive': 'script-src', 'document-uri': 'https://secret.test?token=credential', 'script-sample': 'private answers' } } } as any, response as any, () => {})
  recordCspReport({ body: { 'csp-report': { 'effective-directive': 'evil"} secret' } } } as any, response as any, () => {})
  const metrics = cspMetricLines().join('\n')
  expect(metrics).toContain('directive="script-src"')
  expect(metrics).toContain('directive="other"')
  expect(metrics).not.toMatch(/credential|private answers|evil|secret/)
})
