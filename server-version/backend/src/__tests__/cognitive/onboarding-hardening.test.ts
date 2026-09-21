import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'

/**
 * Historical/release-reviewed seed baseline. This is intentionally explicit:
 * adding a future seed as PUBLISHED must modify this list in the same reviewed
 * change instead of silently bypassing publishCognitiveConfig/Product Readiness.
 */
const APPROVED_PUBLISHED_SEED_BASELINE = new Set([
  'fake/1.0.0',
  'reaction/1.0.1',
  'memory/1.0.1',
  'stroop/1.0.1',
  'reaction/1.1.0',
  'memory/1.1.0',
  'stroop/1.1.0',
  'gonogo/1.0.0',
  'cpt/1.0.0',
  'nback/1.0.0',
  'sst/1.0.0',
  'taskswitch/1.0.0',
  'corsi/1.0.0',
])

const FRONTEND_COGNITIVE_ROOT = resolve(process.cwd(), '../frontend/src/modules/cognitive')
const FRONTEND_REGISTRY_PATH = resolve(FRONTEND_COGNITIVE_ROOT, 'registry.ts')

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('Cognitive onboarding hardening', () => {
  it('requires every non-baseline Cognitive seed to start DRAFT', () => {
    const seen = new Set<string>()
    for (const seed of COGNITIVE_SEEDS) {
      const identity = `${seed.testType}/${seed.configVersion}`
      expect(seen.has(identity), `duplicate Cognitive seed ${identity}`).toBe(false)
      seen.add(identity)

      if (APPROVED_PUBLISHED_SEED_BASELINE.has(identity)) {
        expect(seed.status, `${identity} is an approved historical/release-reviewed seed`).toBe('PUBLISHED')
      } else {
        expect(
          seed.status,
          `${identity} is a new/unapproved seed; onboard it as DRAFT and use explicit Product Readiness + publish review`,
        ).toBe('DRAFT')
      }
    }

    const missingBaseline = [...APPROVED_PUBLISHED_SEED_BASELINE].filter((identity) => !seen.has(identity))
    expect(missingBaseline, 'approved published seed baseline contains stale identities').toEqual([])
  })

  it('keeps every backend engine identity backed by an exact registered frontend runner', () => {
    expect(existsSync(FRONTEND_REGISTRY_PATH), FRONTEND_REGISTRY_PATH).toBe(true)
    const frontendRegistry = readFileSync(FRONTEND_REGISTRY_PATH, 'utf8')
    const engineIdentities = new Map<string, { testType: string; engineVersion: string }>()

    for (const entry of listCognitiveRegistryEntries()) {
      engineIdentities.set(`${entry.testType}/${entry.engineVersion}`, {
        testType: entry.testType,
        engineVersion: entry.engineVersion,
      })
    }

    expect(engineIdentities.size).toBeGreaterThan(0)
    for (const { testType, engineVersion } of engineIdentities.values()) {
      const taskRegistryPath = resolve(FRONTEND_COGNITIVE_ROOT, 'tasks', testType, `${testType}.registry.ts`)
      expect(existsSync(taskRegistryPath), `missing frontend registry file for ${testType}/${engineVersion}`).toBe(true)
      const taskRegistrySource = readFileSync(taskRegistryPath, 'utf8')
      expect(taskRegistrySource, taskRegistryPath).toContain(`testType: '${testType}'`)
      expect(taskRegistrySource, taskRegistryPath).toContain(`engineVersion: '${engineVersion}'`)

      const importPattern = new RegExp(
        `import \\{ ([A-Za-z0-9_]+) \\} from '\\.\\/tasks\\/${escapeRegex(testType)}\\/${escapeRegex(testType)}\\.registry'`,
      )
      const imported = frontendRegistry.match(importPattern)
      expect(imported, `frontend root registry must import ${testType}/${engineVersion}`).not.toBeNull()
      if (!imported) continue
      expect(
        frontendRegistry,
        `frontend root registry must register ${testType}/${engineVersion}`,
      ).toContain(`registerCognitiveRunner(${imported[1]})`)
    }
  })
})
