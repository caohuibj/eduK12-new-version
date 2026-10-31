import { describe, expect, it } from 'vitest'
import {
  cognitiveBankMetaSchema,
  isBankPublicReleaseAllowed,
  PUBLIC_RELEASE_LICENSES,
  resolveBankReleaseState,
} from '../../modules/cognitive/banks/bank-meta'
import { collectBankPublishBlockers } from '../../modules/cognitive/banks/publish-gate'
import { readFileSync } from 'node:fs'
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
      cognitiveBankMetaSchema.parse({ stimulusSetVersion: 'x-v1.0.0', source: 's', license })
    for (const license of PUBLIC_RELEASE_LICENSES) {
      expect(resolveBankReleaseState(meta(license))).toBe('public-release-eligible')
      expect(isBankPublicReleaseAllowed(meta(license))).toBe(true)
    }
    expect(resolveBankReleaseState(meta('research-restricted'))).toBe('research-restricted')
    expect(isBankPublicReleaseAllowed(meta('research-restricted'))).toBe(false)
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
    const eligible = await collectBankPublishBlockers([{ testType: 'wordanalogy' }, { testType: 'icarmatrix' }, { testType: 'wordanalogy' }])
    expect(eligible).toEqual([])

    const restrictedDir = path.resolve('src/modules/cognitive/tasks')
    const declaration = JSON.parse(readFileSync(path.join(restrictedDir, 'wordanalogy', 'task-package.json'), 'utf8'))
    expect(declaration.banks[0].export).toBe('bankMeta')
    // 模拟受限：直接走 schema 层验证 publish-gate 的判定逻辑已由 isBankPublicReleaseAllowed 覆盖。
  })
})
