import cognitiveManifest from '../../modules/cognitive/generated/identities.json'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import { evaluateScaleProductReadiness } from '../../modules/scale/library/product-readiness'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { previewScaleInstrument } from '../../modules/scale/onboarding/preview'
import { listCognitiveV2TaskDefinitions } from '../../modules/cognitive/v2/registry'
import { evaluateCognitiveProductReadiness } from '../../modules/cognitive/library/product-readiness'
import { listSituationPackages } from '../../modules/situational/situation-package.registry'
import { evaluateSituationalProductReadiness } from '../../modules/situational/product-readiness'

const repositoryRoot = resolve(__dirname, '../../../../..')
const frontendRoot = resolve(repositoryRoot, 'server-version/frontend/src/modules/cognitive')

const readinessMessage = (identity: string, blockers: Array<{ stage: string; code: string; message: string }>): string => (
  `${identity}: ${blockers.map((blocker) => `${blocker.stage}/${blocker.code} ${blocker.message}`).join('; ')}`
)

const cognitiveFrontendReady = (testType: string, engineVersion: string): boolean => {
  const frontendRegistry = readFileSync(resolve(frontendRoot, 'generated/runners.ts'), 'utf8')
  const taskPackage = JSON.parse(readFileSync(resolve(__dirname, '../../modules/cognitive/tasks', testType, 'task-package.json'), 'utf8'))
  const binding = taskPackage.frontend.find((runner: { testType: string; engineVersion: string }) => runner.testType === testType && runner.engineVersion === engineVersion)
  if (!binding || !existsSync(resolve(repositoryRoot, binding.file))) return false
  const taskRegistry = readFileSync(resolve(repositoryRoot, binding.file), 'utf8')
  return taskRegistry.includes(engineVersion)
    && taskRegistry.includes(binding.export)
    && frontendRegistry.includes(`${binding.export} as `)
    && cognitiveManifest.runners.some(r => r.testType === testType && r.engineVersion === engineVersion)
}

describe('assessment product readiness inventory', () => {
  it('keeps Scale release readiness necessary without automatically publishing ready drafts', () => {
    for (const pkg of listScalePackages().filter((candidate) => candidate.releaseStatus !== 'RETIRED')) {
      const readiness = evaluateScaleProductReadiness(pkg)
      const identity = `${pkg.key}@${pkg.instrumentVersion}`
      if (pkg.releaseStatus === 'PUBLISHED') {
        expect(readiness.ready, readinessMessage(identity, readiness.blockers)).toBe(true)
      }
    }
    // Product correctness does not grant publication: these retained candidates
    // must still refuse activation, even when their executable contract is ready.
    for (const [key, version] of [['ctas2_cognitive_en', '1.0.1'], ['skaalvik2016_time_pressure_zh_cn', '1.0.0']]) {
      const source = getScaleInstrumentSource(key, version)!
      expect(source.executable!.releaseStatus).toBe('DRAFT')
      const preview = previewScaleInstrument({ instrumentKey: key, instrumentVersion: version,
        locale: source.executable!.contentLocale, territory: 'CN', deploymentModes: ['STANDALONE'] })
      expect(preview.allowActivation).toBe(false)
      expect(preview.blockers).toContain('EXECUTABLE_NOT_PUBLISHED')
      expect(source.executable!.releaseStatus).toBe('DRAFT')
    }
  })

  it('requires backend + exact frontend readiness for Cognitive publication without promoting drafts', () => {
    const definitions = listCognitiveV2TaskDefinitions().filter((definition) => (
      definition.testType !== 'fake' && definition.publication.status !== 'RETIRED'
    ))
    expect(definitions.length).toBeGreaterThan(0)
    for (const definition of definitions) {
      const identity = `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`
      const originalStatus = definition.publication.status
      const backend = evaluateCognitiveProductReadiness(definition)
      const frontendReady = cognitiveFrontendReady(definition.testType, definition.engineVersion)
      const ready = backend.ready && frontendReady
      if (definition.publication.status === 'PUBLISHED') {
        expect(ready, `${readinessMessage(identity, backend.blockers)}; frontendReady=${frontendReady}`).toBe(true)
      }
      expect(definition.publication.status).toBe(originalStatus)
    }
    const draft = definitions.find(definition => definition.testType === 'lineangle' && definition.engineVersion === '2.0.0')!
    expect(draft.publication.status).toBe('DRAFT')
    expect(evaluateCognitiveProductReadiness(draft).ready).toBe(true)
    expect(cognitiveFrontendReady(draft.testType, draft.engineVersion)).toBe(true)
    expect(draft.publication.status).toBe('DRAFT')
  })

  it('requires executable readiness for Situational publication without promoting drafts', () => {
    const packages = listSituationPackages().filter((candidate) => candidate.releaseStatus !== 'RETIRED')
    expect(packages.length).toBeGreaterThan(0)
    for (const pkg of packages) {
      const originalStatus = pkg.releaseStatus
      const readiness = evaluateSituationalProductReadiness(pkg)
      const identity = `${pkg.key}@${pkg.instrumentVersion}`
      if (pkg.releaseStatus === 'PUBLISHED') {
        expect(readiness.ready, readinessMessage(identity, readiness.blockers)).toBe(true)
      }
      expect(pkg.releaseStatus).toBe(originalStatus)
    }
    const draft = packages.find(pkg => pkg.key === 'tosa-teacher-wd-full' && pkg.instrumentVersion === '0.4.2')!
    expect(draft.releaseStatus).toBe('DRAFT')
    expect(evaluateSituationalProductReadiness(draft).ready).toBe(true)
    expect(draft.releaseStatus).toBe('DRAFT')
  })
})
