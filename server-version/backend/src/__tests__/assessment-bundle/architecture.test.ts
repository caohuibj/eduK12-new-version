import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const moduleDir = resolve(__dirname, '../../modules/assessment-bundle')

const source = (relativePath: string): string => readFileSync(
  resolve(moduleDir, relativePath),
  'utf8',
)

const moduleFiles = (): string[] => readdirSync(moduleDir).filter((name) => name.endsWith('.ts'))

describe('assessment-bundle architecture', () => {
  it('stays a contract layer and does not open a second runtime', () => {
    const joined = moduleFiles().map(source).join('\n')
    expect(moduleFiles().length).toBeGreaterThan(0)
    expect(joined).not.toMatch(/from ['"]@prisma\/client['"]/)
    expect(joined).not.toMatch(/from ['"].*questionnaire-form-section/)
    expect(joined).not.toMatch(/from ['"].*composite\.service/)
    expect(joined).not.toMatch(/unified-final-submit/)
    expect(joined).not.toMatch(/finalizeQuestionnaireAttemptIfReady/)
    expect(joined).not.toMatch(/finalizeCompositeAttemptIfReady/)
    expect(joined).not.toMatch(/readLegacyOrPackageSnapshot/)
  })

  it('classifies snapshots without exception-driven parser fallback', () => {
    const compatibility = source('compatibility.ts')
    expect(compatibility).toContain('classifyDecryptedRuntimeSnapshot')
    expect(compatibility).toContain("family === 'ASSESSMENT_BUNDLE'")
    expect(compatibility).not.toMatch(/try\s*\{[\s\S]*parseLegacyReportPackage[\s\S]*catch/)
    expect(compatibility).not.toMatch(/try\s*\{[\s\S]*readFrozenReportPackageSnapshot[\s\S]*catch/)
  })

  it('keeps FACET off the generic evidence role', () => {
    const types = source('types.ts')
    expect(types).toMatch(/export type EvidenceRoleV1 = 'PRIMARY' \| 'SUPPORTING' \| 'CONTEXT' \| 'SAFETY'/)
    expect(types).toMatch(/export type MentalHealthRuleTierV1 = 'CORE' \| 'FACET' \| 'CONTEXT' \| 'SAFETY'/)
  })
})
