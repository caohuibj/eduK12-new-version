import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import { evaluateScaleProductReadiness } from '../../modules/scale/library/product-readiness'
import { listCognitiveV2TaskDefinitions } from '../../modules/cognitive/v2/registry'
import { evaluateCognitiveProductReadiness } from '../../modules/cognitive/library/product-readiness'
import { listSituationPackages } from '../../modules/situational/situation-package.registry'
import { evaluateSituationalProductReadiness } from '../../modules/situational/product-readiness'

const frontendRoot = resolve(process.cwd(), '../frontend/src/modules/cognitive')

const readinessMessage = (identity: string, blockers: Array<{ stage: string; code: string; message: string }>): string => (
  `${identity}: ${blockers.map((blocker) => `${blocker.stage}/${blocker.code} ${blocker.message}`).join('; ')}`
)

const cognitiveFrontendReady = (testType: string, engineVersion: string): boolean => {
  const frontendRegistry = readFileSync(resolve(frontendRoot, 'registry.ts'), 'utf8')
  const registryFile = resolve(frontendRoot, 'tasks', testType, `${testType}.registry.ts`)
  if (!existsSync(registryFile)) return false
  const taskRegistry = readFileSync(registryFile, 'utf8')
  return taskRegistry.includes(engineVersion)
    && frontendRegistry.includes(`registerCognitiveRunner(${testType}RegistryEntry)`)
}

describe('assessment product readiness inventory', () => {
  it('keeps Scale release status aligned with executable readiness', () => {
    for (const pkg of listScalePackages().filter((candidate) => candidate.releaseStatus !== 'RETIRED')) {
      const readiness = evaluateScaleProductReadiness(pkg)
      const identity = `${pkg.key}@${pkg.instrumentVersion}`
      if (pkg.releaseStatus === 'PUBLISHED') {
        expect(readiness.ready, readinessMessage(identity, readiness.blockers)).toBe(true)
      } else {
        expect(readiness.ready, `${identity}: DRAFT has no executable blocker and should be PUBLISHED`).toBe(false)
      }
    }
  })

  it('keeps Cognitive product release aligned with backend + exact frontend readiness', () => {
    const definitions = listCognitiveV2TaskDefinitions().filter((definition) => (
      definition.testType !== 'fake' && definition.publication.status !== 'RETIRED'
    ))
    expect(definitions.length).toBeGreaterThan(0)
    for (const definition of definitions) {
      const identity = `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`
      const backend = evaluateCognitiveProductReadiness(definition)
      const frontendReady = cognitiveFrontendReady(definition.testType, definition.engineVersion)
      const ready = backend.ready && frontendReady
      if (definition.publication.status === 'PUBLISHED') {
        expect(ready, `${readinessMessage(identity, backend.blockers)}; frontendReady=${frontendReady}`).toBe(true)
      } else {
        expect(ready, `${identity}: DRAFT has no backend/frontend executable blocker and should be PUBLISHED`).toBe(false)
      }
    }
  })

  it('keeps production Situational release status aligned with executable readiness', () => {
    const packages = listSituationPackages().filter((candidate) => candidate.releaseStatus !== 'RETIRED')
    expect(packages.length).toBeGreaterThan(0)
    for (const pkg of packages) {
      const readiness = evaluateSituationalProductReadiness(pkg)
      const identity = `${pkg.key}@${pkg.instrumentVersion}`
      if (pkg.releaseStatus === 'PUBLISHED') {
        expect(readiness.ready, readinessMessage(identity, readiness.blockers)).toBe(true)
      } else {
        expect(readiness.ready, `${identity}: DRAFT has no executable blocker and should be PUBLISHED`).toBe(false)
      }
    }
  })
})
