import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SCIENTIFIC_MATURITY_LEVELS } from '../../modules/assessment-governance/scientific-maturity'
import { compileCognitiveRuntime } from '../../modules/assessment-runtime/compiler'
import { assertConfigStatusTransition } from '../../modules/cognitive/config-immutability'
import {
  COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY,
  resolveCognitiveScientificMaturity,
} from '../../modules/cognitive/library/scientific-maturity'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'

const MODULE_ROOT = resolve(process.cwd(), 'src/modules')
const REACTION_IDENTITY = 'reaction/1.0.0/1.1.0'

const source = (relativePath: string): string => readFileSync(resolve(MODULE_ROOT, relativePath), 'utf8')

const runtimeProjection = (runtime: ReturnType<typeof compileCognitiveRuntime>) => ({
  sourceDefinitionHash: runtime.sourceDefinitionHash,
  compiledRuntimeHash: runtime.compiledRuntimeHash,
  scorerKey: runtime.scorerKey,
  scorerVersion: runtime.scorerVersion,
  metricDefinitions: runtime.metricDefinitions,
  qualityDefinitions: runtime.qualityDefinitions,
  reportDefinition: runtime.reportDefinition,
  aggregateProjection: runtime.aggregateProjection,
  referenceBindingDefinition: runtime.referenceBindingDefinition,
  runtimeCapabilities: runtime.runtimeCapabilities,
})

afterEach(() => {
  COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.clear()
})

describe('Cognitive scientific maturity orthogonality', () => {
  it('keeps maturity promotion metadata-only for an exact identity', () => {
    const definition = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')
    if (!definition) throw new Error('reaction v1.1 definition missing')

    const frozenDefinition = JSON.stringify(definition)
    const pilotRuntime = runtimeProjection(compileCognitiveRuntime({ definition }))
    expect(resolveCognitiveScientificMaturity('reaction', '1.0.0', '1.1.0')).toBe('PILOT')

    COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.set(REACTION_IDENTITY, 'RESEARCH_READY')
    expect(resolveCognitiveScientificMaturity('reaction', '1.0.0', '1.1.0')).toBe('RESEARCH_READY')
    expect(JSON.stringify(definition)).toBe(frozenDefinition)
    expect(runtimeProjection(compileCognitiveRuntime({ definition }))).toEqual(pilotRuntime)

    COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.set(REACTION_IDENTITY, 'RESEARCH_GRADE')
    expect(resolveCognitiveScientificMaturity('reaction', '1.0.0', '1.1.0')).toBe('RESEARCH_GRADE')
    expect(JSON.stringify(definition)).toBe(frozenDefinition)
    expect(runtimeProjection(compileCognitiveRuntime({ definition }))).toEqual(pilotRuntime)
  })

  it('does not let a reviewed scorer identity grant maturity to a sibling identity', () => {
    COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.set(REACTION_IDENTITY, 'RESEARCH_READY')
    expect(resolveCognitiveScientificMaturity('reaction', '1.0.0', '1.1.0')).toBe('RESEARCH_READY')
    expect(resolveCognitiveScientificMaturity('reaction', '1.0.0', '1.0.0')).toBe('PILOT')
  })

  it('keeps product lifecycle transitions identical at every scientific maturity', () => {
    for (const maturity of SCIENTIFIC_MATURITY_LEVELS) {
      expect(maturity).toBeTruthy()
      expect(() => assertConfigStatusTransition('DRAFT', 'PUBLISHED')).not.toThrow()
      expect(() => assertConfigStatusTransition('PUBLISHED', 'RETIRED')).not.toThrow()
      expect(() => assertConfigStatusTransition('PUBLISHED', 'DRAFT')).toThrow()
      expect(() => assertConfigStatusTransition('RETIRED', 'PUBLISHED')).toThrow()
    }
  })

  it('keeps release/readiness code and maturity governance mutually isolated', () => {
    for (const file of [
      'cognitive/release.service.ts',
      'cognitive/assignment.service.ts',
      'cognitive/library/product-readiness.ts',
    ]) {
      expect(source(file), file).not.toMatch(/scientific-maturity|scientific-qualification|ScientificMaturity/u)
    }

    for (const file of [
      'assessment-governance/scientific-qualification.ts',
      'cognitive/library/scientific-maturity.ts',
      'cognitive/library/scientific-qualification.ts',
    ]) {
      expect(source(file), file).not.toMatch(/product-readiness|release\.service|publication\.status|CognitiveTestConfig/u)
    }
  })
})
