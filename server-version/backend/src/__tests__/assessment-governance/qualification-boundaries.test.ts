import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateScientificQualification } from '../../modules/assessment-governance/scientific-qualification'

const MODULE_ROOT = resolve(process.cwd(), 'src/modules')

const readModule = (relativePath: string): string => readFileSync(resolve(MODULE_ROOT, relativePath), 'utf8')

const walkTs = (root: string): string[] => readdirSync(root).flatMap((name) => {
  const absolute = resolve(root, name)
  if (statSync(absolute).isDirectory()) return walkTs(absolute)
  return absolute.endsWith('.ts') ? [absolute] : []
})

describe('assessment qualification governance boundaries', () => {
  it('keeps governance evaluators free of Prisma/database access', () => {
    const files = [
      'assessment-governance/product-readiness.ts',
      'assessment-governance/scientific-qualification.ts',
      'assessment-governance/scientific-evidence.ts',
      'assessment-governance/operational-hold.ts',
      'scale/library/product-readiness.ts',
      'scale/library/scientific-qualification.ts',
      'cognitive/library/product-readiness.ts',
      'cognitive/library/scientific-qualification.ts',
      'situational/product-readiness.ts',
      'situational/scientific-qualification.ts',
    ]
    for (const file of files) {
      const source = readModule(file)
      expect(source, file).not.toMatch(/@prisma\/client|config\/database|\bprisma\./u)
    }
  })

  it('keeps qualification and operational-hold evaluators out of save/scorer/FINAL hot paths', () => {
    const hotPathName = /(final|submit|scor|save|attempt-runtime)/iu
    const forbiddenImport = /assessment-governance\/(?:scientific-qualification|scientific-evidence|product-readiness|operational-hold)|library\/(?:product-readiness|scientific-qualification)|situational\/(?:product-readiness|scientific-qualification)/u
    // Only module-relative paths describe runtime responsibilities. Checkout
    // names such as final-review or scoring-audit must not classify every file.
    const hotPaths = walkTs(MODULE_ROOT).filter((file) => hotPathName.test(relative(MODULE_ROOT, file)))
    expect(hotPaths.length).toBeGreaterThan(0)
    for (const file of hotPaths) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(forbiddenImport)
    }
  })

  it('keeps scientific qualification independent of product-readiness and release modules', () => {
    const files = [
      'assessment-governance/scientific-qualification.ts',
      'scale/library/scientific-qualification.ts',
      'cognitive/library/scientific-qualification.ts',
      'situational/scientific-qualification.ts',
    ]
    for (const file of files) {
      const source = readModule(file)
      expect(source, file).not.toMatch(/productReadiness|product-readiness|releaseStatus|publication\.status|CognitiveTestConfig/u)
    }
  })

  it('defines Pilot as the default lowest evidence maturity without research evidence', () => {
    const result = evaluateScientificQualification({
      hasResearchFoundation: false,
      hasTraceableProvenance: false,
      hasEmpiricalReference: false,
      hasFormalResearchOutput: false,
    })
    expect(result.pilot.eligible).toBe(true)
    expect(result.pilot.blockers).toEqual([])
    expect(result.researchReady.eligible).toBe(false)
    expect(result.researchGrade.eligible).toBe(false)
    expect(result.maxEligibleMaturity).toBe('PILOT')
  })

  it('requires research foundation + provenance for Research Ready', () => {
    const result = evaluateScientificQualification({
      hasResearchFoundation: true,
      hasTraceableProvenance: true,
      hasEmpiricalReference: false,
      hasFormalResearchOutput: false,
    })
    expect(result.researchReady.eligible).toBe(true)
    expect(result.researchGrade.blockers).toEqual([
      'EMPIRICAL_REFERENCE_MISSING',
      'FORMAL_RESEARCH_OUTPUT_MISSING',
    ])
    expect(result.maxEligibleMaturity).toBe('RESEARCH_READY')
  })

  it('requires empirical reference evidence and formal output for Research Grade', () => {
    const result = evaluateScientificQualification({
      hasResearchFoundation: true,
      hasTraceableProvenance: true,
      hasEmpiricalReference: true,
      hasFormalResearchOutput: true,
    })
    expect(result.researchGrade.eligible).toBe(true)
    expect(result.maxEligibleMaturity).toBe('RESEARCH_GRADE')
  })
})
