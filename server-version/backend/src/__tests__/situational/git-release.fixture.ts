import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import legacy from '../../modules/situational/instruments/sjt-assertiveness-golden/1.0.0/instrument.json'

export const contentVersion = '1.0.0'
export const entry = {
  releaseKey: 'first',
  contentVersion,
  parameterVersion: '1.0.0',
  reportVersion: '1.0.0',
  state: 'ONLINE',
  allowedEntries: ['SURVEY'],
}
export const ceiling = {
  schemaVersion: 1, policyVersion: '1.0.0', unknownAudience: 'DENY',
  audiences: { researcher: { rawAnswers: true, itemScores: true, methods: true, resultQualityDetails: true } },
}
export const visibility = {
  schemaVersion: 1, policyVersion: '1.0.0', unknownAudience: 'DENY',
  audiences: { researcher: {
    numericScores: true, references: false, scoreDerivedLabels: false, individualInterpretations: false,
    educationalContent: false, artwork: false,
  } },
}
const { scoring, report, referencePolicy: _reference, ...definition } = legacy.definition
const { scoringVersion, ...weights } = scoring
export const c = {
  schemaVersion: 1,
  identity: { instrumentKey: 'sample-sjt', instrumentVersion: contentVersion },
  definition: { ...definition, license: { ...definition.license, redistribution: 'allowed' } },
  scorer: { scoringVersion },
  dataCeiling: ceiling,
}
export const p = {
  schemaVersion: 1, contentVersion, version: '1.0.0', scoring: weights,
  goldenCases: legacy.goldenCases, scientific: { schemaVersion: 1, scientificMaturity: 'PILOT', governanceRevision: 1 },
}
export const r = {
  schemaVersion: 1, contentVersion, parameterVersion: '1.0.0', version: '1.0.0',
  report: { ...report, reportVersion: '1.0.0' }, reportVisibility: visibility,
  template: { title: 'Research report' },
}

export function writeSjtDeclaration(root: string, toolKey: string) {
  const directory = join(root, toolKey)
  for (const path of [contentVersion, 'parameters', 'reports']) mkdirSync(join(directory, path), { recursive: true })
  const write = (path: string, value: unknown) => writeFileSync(join(directory, path), JSON.stringify(value))
  write(contentVersion + '/content.json', { ...c, identity: { ...c.identity, instrumentKey: toolKey } })
  write('parameters/1.0.0.json', p)
  write('reports/1.0.0.json', r)
  write('releases.json', { schemaVersion: 1, toolKey, releases: [entry] })
}
