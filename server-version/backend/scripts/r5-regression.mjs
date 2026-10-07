import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// The local probe and Actions component execute this same list. The ordinary
// full regression remains unchanged and still includes every selected file.
const files = [
  'assessment-policy/participant-feedback.test.ts',
  'assessment-runtime/form-context.test.ts',
  'assessment-runtime/v32-1.contract.test.ts',
  'assessment-runtime/v32-3.contract.test.ts',
  'composite/addItem.service.test.ts',
  'composite/copy.service.test.ts',
  'composite/analysis-protocol.service.test.ts',
  'composite/report-package.service.test.ts',
  'composite/frozen-progress.test.ts',
  'composite/composite-report.projector.test.ts',
  'composite/export.service.test.ts',
  'composite/export.controller.test.ts',
  'scale/composite-export-projection.test.ts',
  'services/assessment-export-artifact.test.ts',
  'services/wide-export-package.test.ts',
  'cognitive/session.service.test.ts',
  'cognitive/assignment.service.test.ts',
  'cognitive/collection-data.service.test.ts',
  'cognitive/export.service.test.ts',
  'services/studentTasks.test.ts',
  'questionnaire/product.postgres.integration.test.ts',
  'questionnaire/workbench.postgres.integration.test.ts',
  'cognitive/history.service.test.ts',
  'bundle-product/product.postgres.integration.test.ts',
  'bundle-onboarding/lifecycle.postgres.integration.test.ts',
  'situational/sjt-authoring.postgres.integration.test.ts',
  'situational/sjt-authoring.test.ts',
  'integration/anonymousStudy.postgres.integration.test.ts',
  'integration/registered-resource-catalog.postgres.integration.test.ts',
  'integration/runtime-role.postgres.integration.test.ts',
].map(file => 'src/__tests__/' + file)
for (const file of files) if (!existsSync(file)) throw new Error('Missing R5 regression file: ' + file)
const report = resolve(process.argv[2] || '/tmp/eduk12-r5-vitest.json')
const run = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files, '--no-file-parallelism', '--reporter=default', '--reporter=json', '--outputFile=' + report], { stdio: 'inherit' })
if (run.error) throw run.error
if (run.status !== 0) process.exit(run.status || 1)
const required = files.filter(file => file.endsWith('.postgres.integration.test.ts'))
const evidence = spawnSync(process.execPath, ['scripts/assert-release-test-report.mjs', report, ...required], { stdio: 'inherit' })
if (evidence.error) throw evidence.error
process.exit(evidence.status ?? 1)
