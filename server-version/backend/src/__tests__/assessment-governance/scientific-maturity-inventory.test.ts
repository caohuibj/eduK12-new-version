import { describe, expect, it } from 'vitest'
import { qualificationAllowsScientificMaturity } from '../../modules/assessment-governance/scientific-qualification'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import { WAVE0_SCALE_CATALOG_MANIFESTS } from '../../modules/scale/library/wave0-catalog'
import { evaluateScaleScientificQualification } from '../../modules/scale/library/scientific-qualification'
import { listCognitiveV2TaskDefinitions, getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { evaluateCognitiveScientificQualification } from '../../modules/cognitive/library/scientific-qualification'
import { resolveCognitiveScientificMaturity } from '../../modules/cognitive/library/scientific-maturity'
import { listSituationPackages, getSituationPackage } from '../../modules/situational/situation-package.registry'
import { evaluateSituationalScientificQualification } from '../../modules/situational/scientific-qualification'
import { resolveSituationalScientificMaturity } from '../../modules/situational/scientific-maturity'

const qualificationMessage = (
  identity: string,
  declared: string,
  maxEligible: string,
): string => `${identity}: declared=${declared}, maxEligible=${maxEligible}`

describe('scientific maturity inventory qualification', () => {
  it('never lets any Scale identity declare maturity above its evidence qualification', () => {
    for (const pkg of listScalePackages()) {
      const manifest = WAVE0_SCALE_CATALOG_MANIFESTS.find((candidate) => (
        candidate.identity.instrumentKey === pkg.key
        && candidate.identity.instrumentVersion === pkg.instrumentVersion
      ))
      expect(manifest, `${pkg.key}@${pkg.instrumentVersion}: catalog manifest missing`).toBeDefined()
      const qualification = evaluateScaleScientificQualification(pkg)
      const declared = manifest!.scientificMaturity
      expect(
        qualificationAllowsScientificMaturity(declared, qualification),
        qualificationMessage(`${pkg.key}@${pkg.instrumentVersion}`, declared, qualification.maxEligibleMaturity),
      ).toBe(true)
    }
  })

  it('never lets any real Cognitive identity declare maturity above its evidence qualification', () => {
    const definitions = listCognitiveV2TaskDefinitions().filter((definition) => definition.testType !== 'fake')
    expect(definitions.length).toBeGreaterThan(0)
    for (const definition of definitions) {
      const qualification = evaluateCognitiveScientificQualification(definition)
      const declared = resolveCognitiveScientificMaturity(
        definition.testType,
        definition.engineVersion,
        definition.scoringVersion,
      )
      const identity = `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`
      expect(
        qualificationAllowsScientificMaturity(declared, qualification),
        qualificationMessage(identity, declared, qualification.maxEligibleMaturity),
      ).toBe(true)
    }
  })

  it('never lets any Situational identity declare maturity above its evidence qualification', () => {
    const packages = listSituationPackages()
    expect(packages.length).toBeGreaterThan(0)
    for (const pkg of packages) {
      const qualification = evaluateSituationalScientificQualification(pkg)
      const declared = resolveSituationalScientificMaturity(pkg.key, pkg.instrumentVersion)
      expect(
        qualificationAllowsScientificMaturity(declared, qualification),
        qualificationMessage(`${pkg.key}@${pkg.instrumentVersion}`, declared, qualification.maxEligibleMaturity),
      ).toBe(true)
    }
  })

  it('does not inherit unscoped Cognitive catalog literature as exact-identity qualification', () => {
    const definition = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')
    if (!definition) throw new Error('reaction definition missing')
    const qualification = evaluateCognitiveScientificQualification(definition)
    expect(qualification.researchReady.eligible).toBe(false)
    expect(qualification.maxEligibleMaturity).toBe('PILOT')
    expect(qualification.researchGrade.eligible).toBe(false)
  })

  it('does not mistake Situational self-authored provenance for a research foundation', () => {
    const pkg = getSituationPackage('sjt-assertiveness-golden', '1.0.0')
    if (!pkg) throw new Error('situational package missing')
    const qualification = evaluateSituationalScientificQualification(pkg)
    expect(qualification.pilot.eligible).toBe(true)
    expect(qualification.researchReady.eligible).toBe(false)
    expect(qualification.researchReady.blockers).toContain('RESEARCH_FOUNDATION_MISSING')
    expect(qualification.researchReady.blockers).not.toContain('TRACEABLE_PROVENANCE_MISSING')
    expect(qualification.maxEligibleMaturity).toBe('PILOT')
  })
})
