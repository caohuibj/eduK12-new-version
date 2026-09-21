import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeConfigSchema } from '../../modules/cognitive/schemas/fake.config'
import { fakeTrialSchema } from '../../modules/cognitive/schemas/fake.trial'
import { scoreFakeV1 } from '../../modules/cognitive/scoring/fake.v1'
import { fakeRegistryMeta } from '../../modules/cognitive/tasks/fake/definitions'
import { defineCognitiveTaskPackage } from '../../modules/cognitive/tasks/task-package'
import { fixedCountFinalSubmission } from '../../modules/cognitive/v2/final-submission-budget'
import {
  classifyCognitiveOnboardingPath,
  cognitiveContentOnlyPathsAllowed,
} from '../../modules/cognitive/onboarding/path-policy'

const UNKNOWN = 'test_onboarding_unknown_v1'

describe('Cognitive zero-core structural onboarding', () => {
  it('accepts an unknown exact identity through the task-package contract without central registration', () => {
    const taskPackage = defineCognitiveTaskPackage({
      testType: UNKNOWN,
      protocolPhases: [{ key: 'test', persists: true, required: true }],
      qualityEffects: { interpretable: 'none' },
      entries: [{
        testType: UNKNOWN,
        engineVersion: '1.0.0',
        scoringVersion: '1.0.0',
        configSchema: fakeConfigSchema,
        trialSchema: fakeTrialSchema,
        finalSubmission: fixedCountFinalSubmission('trialCount'),
        score: scoreFakeV1,
        ...fakeRegistryMeta,
      }],
    })
    expect(taskPackage.testType).toBe(UNKNOWN)
    expect(taskPackage.entries).toHaveLength(1)
  })

  it('discovers an unknown backend/frontend package from fixture roots with no production edits', () => {
    const backendRoot = 'src/__tests__/fixtures/cognitive-onboarding/backend'
    const frontendRoot = 'src/__tests__/fixtures/cognitive-onboarding/frontend'
    const output = execFileSync(process.execPath, [
      'scripts/generate-cognitive-manifests.mjs',
      '--discover-only',
      `--backend-root=${backendRoot}`,
      `--frontend-root=${frontendRoot}`,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    const discovered = JSON.parse(output)
    expect(discovered.backend).toMatchObject([{
      task: UNKNOWN,
      packageExport: 'testOnboardingUnknownV1TaskPackage',
      presentationExport: 'testOnboardingUnknownV1ParticipantPresentation',
      seedExport: 'testOnboardingUnknownV1SeedDeclarations',
      catalogExport: 'testOnboardingUnknownV1CatalogEntry',
    }])
    expect(discovered.frontend).toMatchObject([{
      task: UNKNOWN,
      registryExport: 'testOnboardingUnknownV1RegistryEntry',
      presentationExport: 'testOnboardingUnknownV1ParticipantPresentation',
    }])
  })

  it('keeps the synthetic task out of handwritten shared-core sources', () => {
    const sharedFiles = [
      'src/modules/cognitive/cognitive.registry.ts',
      'src/modules/cognitive/registry-definitions.ts',
      'src/modules/cognitive/v2/registry.ts',
      'src/modules/cognitive/protocol-presentation.ts',
      '../frontend/src/modules/cognitive/registry.ts',
    ]
    for (const filePath of sharedFiles) {
      expect(fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8')).not.toContain(UNKNOWN)
    }
  })

  it('classifies task-owned/generated/test paths separately from shared core', () => {
    expect(classifyCognitiveOnboardingPath(
      `server-version/backend/src/modules/cognitive/tasks/${UNKNOWN}/package.ts`,
      UNKNOWN,
    )).toBe('TASK_OWNED')
    expect(classifyCognitiveOnboardingPath(
      'server-version/frontend/src/modules/cognitive/generated/runners.generated.ts',
      UNKNOWN,
    )).toBe('GENERATED')
    expect(classifyCognitiveOnboardingPath(
      'server-version/backend/src/__tests__/cognitive/unknown-task.test.ts',
      UNKNOWN,
    )).toBe('TASK_TEST')
    expect(classifyCognitiveOnboardingPath(
      'server-version/backend/src/modules/cognitive/cognitive.registry.ts',
      UNKNOWN,
    )).toBe('SHARED_CORE')
    expect(cognitiveContentOnlyPathsAllowed([
      `server-version/backend/src/modules/cognitive/tasks/${UNKNOWN}/package.ts`,
      'server-version/backend/src/modules/cognitive/tasks/generated/task-packages.generated.ts',
    ], UNKNOWN)).toBe(true)
    expect(cognitiveContentOnlyPathsAllowed([
      'server-version/backend/src/modules/cognitive/cognitive.registry.ts',
    ], UNKNOWN)).toBe(false)
  })
})
