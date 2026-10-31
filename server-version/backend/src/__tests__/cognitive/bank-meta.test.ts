import { describe, expect, it } from 'vitest'
import {
  cognitiveBankMetaSchema,
  isBankPublicReleaseAllowed,
  PUBLIC_RELEASE_LICENSES,
  resolveBankReleaseState,
} from '../../modules/cognitive/banks/bank-meta'
import { collectBankPublishBlockers } from '../../modules/cognitive/banks/publish-gate'
import { COGNITIVE_BANK_REGISTRY } from '../../modules/cognitive/banks/registry'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

describe('cognitive bank meta (roadmap v2.0 PR1)', () => {
  it('validates the schema and rejects unknown fields', () => {
    expect(cognitiveBankMetaSchema.parse({
      stimulusSetVersion: 'wordanalogy-zh-v1.0.0',
      source: 'internal-authored',
      license: 'internal-generated',
    }).itemSetRole).toBe('form')
    expect(cognitiveBankMetaSchema.safeParse({
      stimulusSetVersion: 'x-v1',
      source: 's',
      license: 'research-restricted',
      unlisted: true,
    }).success).toBe(false)
  })

  it('gates public release to the allowlist and keeps research-restricted internal', () => {
    const meta = (license: (typeof PUBLIC_RELEASE_LICENSES)[number] | 'research-restricted') =>
      cognitiveBankMetaSchema.parse({
        stimulusSetVersion: 'x-v1.0.0', source: 's', license,
        ...(license === 'verified' ? { rightsEvidenceRef: 'reviewed-rights/approval-1' } : {}),
      })
    expect(cognitiveBankMetaSchema.safeParse({ stimulusSetVersion: 'x-v1', source: 's', license: 'verified' }).success).toBe(false)
    expect(cognitiveBankMetaSchema.safeParse({ stimulusSetVersion: 'x-v1', source: 's', license: 'verified', rightsEvidenceRef: 'rights/approval-1' }).success).toBe(true)
    for (const license of PUBLIC_RELEASE_LICENSES) {
      expect(resolveBankReleaseState(meta(license))).toBe('public-release-eligible')
      expect(isBankPublicReleaseAllowed(meta(license))).toBe(true)
    }
    expect(resolveBankReleaseState(meta('research-restricted'))).toBe('research-restricted')
    expect(isBankPublicReleaseAllowed(meta('research-restricted'))).toBe(false)
  })

  it('keeps the production compiled registry aligned with every bank-declaring package', () => {
    const root = path.resolve('src/modules/cognitive/tasks')
    const declared = readdirSync(root).filter((task) => {
      const file = path.join(root, task, 'task-package.json')
      try {
        const pkg = JSON.parse(readFileSync(file, 'utf8'))
        return Array.isArray(pkg.banks) && pkg.banks.length > 0
      } catch { return false }
    }).sort()
    expect(Object.keys(COGNITIVE_BANK_REGISTRY).sort()).toEqual(declared)
    for (const task of declared) {
      const pkg = JSON.parse(readFileSync(path.join(root, task, 'task-package.json'), 'utf8'))
      expect(COGNITIVE_BANK_REGISTRY[task].length).toBe(pkg.banks.length)
    }
  })

  it('parses every declared bank in the product catalog and flags none as research-restricted today', async () => {
    const tasksDir = path.resolve('src/modules/cognitive/tasks')
    const declared = ['icarmatrix', 'cogest', 'logicdeduce', 'proofread', 'readingcomp', 'semanticfluency', 'seriescomplete', 'wordanalogy', 'wordmeaning', 'wordproblem']
    for (const task of declared) {
      const declaration = JSON.parse(readFileSync(path.join(tasksDir, task, 'task-package.json'), 'utf8'))
      expect(declaration.banks?.length ?? 0, `${task} declares banks`).toBeGreaterThan(0)
      const bankModule = await import(path.join(tasksDir, task, declaration.banks[0].file))
      const parsed = cognitiveBankMetaSchema.safeParse(bankModule[declaration.banks[0].export])
      expect(parsed.success, `${task} bankMeta parses`).toBe(true)
      if (parsed.success) expect(parsed.data.license).toBe('internal-generated')
    }
  })

  it('collectBankPublishBlockers resolves declared banks and would block restricted licenses', async () => {
    const eligible = await collectBankPublishBlockers([
      { testType: 'wordanalogy', config: { stimulusSetVersion: 'wordanalogy-zh-v1.0.0' } },
      { testType: 'icarmatrix', config: { stimulusSetVersion: 'matgen-bank-v1.0.0' } },
      { testType: 'icarmatrix', config: { stimulusSetVersion: 'icarmatrix-gen-v1.0.0' } },
    ])
    expect(eligible).toEqual([])

    const mismatch = await collectBankPublishBlockers([{ testType: 'icarmatrix', config: { stimulusSetVersion: 'unknown-bank' } }])
    expect(mismatch.map((entry) => entry.code)).toContain('BANK_VERSION_MISMATCH')

    const missing = await collectBankPublishBlockers([{ testType: 'nonexistent-task', config: {} }])
    expect(missing.map((entry) => entry.code)).toContain('BANK_DECLARATION_INVALID')
    const procedural = await collectBankPublishBlockers([{ testType: 'reaction', config: {} }])
    expect(procedural).toEqual([])
    const unversioned = await collectBankPublishBlockers([{ testType: 'wordanalogy', config: {} }])
    expect(unversioned.map((entry) => entry.code)).toContain('BANK_VERSION_MISMATCH')
  })
})
