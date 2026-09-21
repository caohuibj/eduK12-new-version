import { describe, expect, it } from 'vitest'
// Build tooling is exercised without importing any instrument module.
import { classifyScaleOnboardingPath, inspectScaleChangedPaths, inspectScaleContent, checkScaleOnboarding } from '../../../scripts/scale-onboarding-check.mjs'
const file = 'src/modules/scale/instruments/unknown/1.0.0/instrument.ts'
describe('Scale content boundary', () => {
  it('allows instrument-local declarations and approved contracts', () => {
    expect(inspectScaleContent(file, "import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'; import { items } from './items'; export const x = { items }", {})).toEqual([])
    expect(checkScaleOnboarding().ok).toBe(true)
  })
  it('fails content-only changes touching shared core, while platform classification is explicit', () => {
    const content = ['server-version/backend/' + file, 'server-version/backend/src/modules/scale/onboarding/instruments.generated.ts']
    expect(inspectScaleChangedPaths(content, 'content')).toEqual([])
    const mixed = [...content, 'server-version/backend/src/modules/scale/scale-scoring.ts']
    expect(inspectScaleChangedPaths(mixed, 'content')).toHaveLength(1)
    expect(inspectScaleChangedPaths(mixed, 'platform')).toEqual([])
  })
  it.each([
    "import fs from 'node:fs'",
    "import db from '../../../../config/database'",
    "import { x } from '../../another/1.0.0/items'",
    "export * from '../../../scale-scoring'",
    "const x = import('node:fs')",
    "const x = process.env.SECRET",
    "const x = () => 1",
    "do {} while (true)",
    "const x = new Date()",
  ])('rejects executable or foreign dependency: %s', text => { expect(inspectScaleContent(file, text, {}).length).toBeGreaterThan(0) })
  it('classifies central registries, scoring, guards and taxonomy as platform changes', () => {
    expect(classifyScaleOnboardingPath('server-version/backend/' + file)).toBe('INSTRUMENT_OWNED')
    expect(classifyScaleOnboardingPath('server-version/backend/src/modules/scale/onboarding/instruments.generated.ts')).toBe('GENERATED')
    for (const path of ['src/modules/scale/scale-scoring.ts', 'src/modules/scale/onboarding/instrument-registry.ts', 'scripts/scale-onboarding-check.mjs']) expect(classifyScaleOnboardingPath('server-version/backend/' + path)).toBe('SHARED_CORE')
  })
})
