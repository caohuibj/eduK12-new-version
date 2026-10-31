import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cognitiveBankMetaSchema, isBankPublicReleaseAllowed, type CognitiveBankLicense } from './bank-meta'

/**
 * COG-Intelligence Roadmap v2.0 PR1 — 公开发布闸门。
 *
 * publish-cognitive-configs 在 --apply 前调用：任何声明为 research-restricted
 * 的题库都会拦截公开发布；内部 pilot 轮次可用 --allow-research-restricted 显式
 * 放行（roadmap §四：入库与公开发布是两个独立状态）。
 */

export interface BankPublishBlocker {
  testType: string
  stimulusSetVersion: string
  license: CognitiveBankLicense
  source: string
  declarationFile: string
}

const TASKS_DIR = path.resolve('src/modules/cognitive/tasks')

export const collectBankPublishBlockers = async (
  configs: ReadonlyArray<{ testType: string }>,
): Promise<BankPublishBlocker[]> => {
  const blockers: BankPublishBlocker[] = []
  const seenTasks = new Set<string>()
  for (const config of configs) {
    const testType = config.testType
    if (seenTasks.has(testType)) continue
    seenTasks.add(testType)
    const declarationFile = path.join(TASKS_DIR, testType, 'task-package.json')
    let declaration: { banks?: Array<{ file: string; export: string }> }
    try {
      declaration = JSON.parse(readFileSync(declarationFile, 'utf8'))
    } catch {
      continue
    }
    for (const bankRef of declaration.banks ?? []) {
      try {
        const modulePath = path.join(TASKS_DIR, testType, bankRef.file)
        const bankModule = (await import(modulePath)) as Record<string, unknown>
        const parsed = cognitiveBankMetaSchema.safeParse(bankModule[bankRef.export])
        if (!parsed.success) continue
        if (!isBankPublicReleaseAllowed(parsed.data)) {
          blockers.push({
            testType,
            stimulusSetVersion: parsed.data.stimulusSetVersion,
            license: parsed.data.license,
            source: parsed.data.source,
            declarationFile,
          })
        }
      } catch {
        // 题库加载失败由 onboarding-check 的 COG_BANK_META_INVALID 把关，此处不重复。
      }
    }
  }
  return blockers
}
