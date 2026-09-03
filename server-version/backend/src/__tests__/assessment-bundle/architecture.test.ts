import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const moduleDir = resolve(__dirname, '../../modules/assessment-bundle')

const source = (absolutePath: string): string => readFileSync(absolutePath, 'utf8')

/** Recursively collect every `.ts` file under assessment-bundle/ (covers engines/). */
const moduleTsFiles = (dir: string = moduleDir): string[] => {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const name of entries) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...moduleTsFiles(full))
    } else if (name.endsWith('.ts')) {
      files.push(full)
    }
  }
  return files
}

describe('assessment-bundle architecture', () => {
  it('stays a contract layer and does not open a second runtime', () => {
    const files = moduleTsFiles()
    const joined = files.map(source).join('\n')
    expect(files.length).toBeGreaterThan(0)
    expect(joined).not.toMatch(/from ['"]@prisma\/client['"]/)
    expect(joined).not.toMatch(/from ['"].*questionnaire-form-section/)
    expect(joined).not.toMatch(/from ['"].*composite\.service/)
    expect(joined).not.toMatch(/unified-final-submit/)
    expect(joined).not.toMatch(/finalizeQuestionnaireAttemptIfReady/)
    expect(joined).not.toMatch(/finalizeCompositeAttemptIfReady/)
    expect(joined).not.toMatch(/readLegacyOrPackageSnapshot/)
  })

  it('classifies snapshots without exception-driven parser fallback', () => {
    const compatibility = source(join(moduleDir, 'compatibility.ts'))
    expect(compatibility).toContain('classifyDecryptedRuntimeSnapshot')
    expect(compatibility).toContain("family === 'ASSESSMENT_BUNDLE'")
    expect(compatibility).not.toMatch(/try\s*\{[\s\S]*parseLegacyReportPackage[\s\S]*catch/)
    expect(compatibility).not.toMatch(/try\s*\{[\s\S]*readFrozenReportPackageSnapshot[\s\S]*catch/)
  })

  it('keeps FACET off the generic evidence role', () => {
    const types = source(join(moduleDir, 'types.ts'))
    expect(types).toMatch(/export type EvidenceRoleV1 = 'PRIMARY' \| 'SUPPORTING' \| 'CONTEXT' \| 'SAFETY'/)
    expect(types).toMatch(/export type MentalHealthRuleTierV1 = 'CORE' \| 'FACET' \| 'CONTEXT' \| 'SAFETY'/)
  })

  it('scans nested TypeScript files under assessment-bundle/', () => {
    // Guard: recursive walker must include future engines/*.ts once added.
    const files = moduleTsFiles()
    expect(files.every((path) => path.endsWith('.ts'))).toBe(true)
    expect(files.some((path) => path.endsWith(`${join('assessment-bundle', 'registry.ts')}`))).toBe(true)
  })
})
