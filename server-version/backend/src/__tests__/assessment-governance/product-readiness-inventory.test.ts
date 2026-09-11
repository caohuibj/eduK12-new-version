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

describe('published assessment product readiness inventory', () => {
  it('keeps every PUBLISHED Scale package executable-ready', () => {
    for (const pkg of listScalePackages().filter((candidate) => candidate.releaseStatus === 'PUBLISHED')) {
      const readiness = evaluateScaleProductReadiness(pkg)
      expect(readiness.ready, readinessMessage(`${pkg.key}@${pkg.instrumentVersion}`, readiness.blockers)).toBe(true)
    }
  })

  it('keeps every PUBLISHED Cognitive identity backend-ready and backed by an exact frontend runner', () => {
    const frontendRegistry = readFileSync(resolve(frontendRoot, 'registry.ts'), 'utf8')
    const published = listCognitiveV2TaskDefinitions().filter((definition) => definition.publication.status === 'PUBLISHED')
    expect(published.length).toBeGreaterThan(0)
    for (const definition of published) {
      const identity = `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`
      const readiness = evaluateCognitiveProductReadiness(definition)
      expect(readiness.ready, readinessMessage(identity, readiness.blockers)).toBe(true)

      const registryFile = resolve(frontendRoot, 'tasks', definition.testType, `${definition.testType}.registry.ts`)
      expect(existsSync(registryFile), `${identity}: frontend runner registry file missing`).toBe(true)
      const taskRegistry = readFileSync(registryFile, 'utf8')
      expect(taskRegistry, `${identity}: frontend runner does not declare exact engineVersion`).toContain(definition.engineVersion)
      expect(frontendRegistry, `${identity}: frontend root registry does not register task runner`).toContain(`registerCognitiveRunner(${definition.testType}RegistryEntry)`)
    }
  })

  it('keeps every production PUBLISHED Situational package executable-ready', () => {
    const published = listSituationPackages().filter((candidate) => candidate.releaseStatus === 'PUBLISHED')
    expect(published.length).toBeGreaterThan(0)
    for (const pkg of published) {
      const readiness = evaluateSituationalProductReadiness(pkg)
      expect(readiness.ready, readinessMessage(`${pkg.key}@${pkg.instrumentVersion}`, readiness.blockers)).toBe(true)
    }
  })
})
