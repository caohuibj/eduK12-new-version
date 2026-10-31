import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cognitiveBankMetaSchema, isBankPublicReleaseAllowed, type CognitiveBankLicense } from './bank-meta'

/**
 * One publication decision per *frozen config*, not per taskType.
 * Tasks without a declared item bank retain their existing publication contract.
 * A task that declares a bank must provide an exact stimulusSetVersion match.
 */
export interface BankPublishInput {
  testType: string
  config: unknown
}

export interface BankPublishBlocker {
  testType: string
  stimulusSetVersion: string
  license: CognitiveBankLicense | 'unknown'
  source: string
  declarationFile: string
  code: 'BANK_DECLARATION_INVALID' | 'BANK_METADATA_INVALID' | 'BANK_VERSION_MISMATCH'
    | 'BANK_VERSION_AMBIGUOUS' | 'BANK_RIGHTS_RESTRICTED'
}

const TASKS_DIR = path.resolve('src/modules/cognitive/tasks')
const asRecord = (input: unknown): Record<string, unknown> | null =>
  input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : null

export const collectBankPublishBlockers = async (
  configs: ReadonlyArray<BankPublishInput>,
): Promise<BankPublishBlocker[]> => {
  const blockers: BankPublishBlocker[] = []
  for (const { testType, config } of configs) {
    const declarationFile = path.join(TASKS_DIR, testType, 'task-package.json')
    const selectedVersion = asRecord(config)?.stimulusSetVersion
    const version = typeof selectedVersion === 'string' ? selectedVersion : 'unknown'
    const block = (code: BankPublishBlocker['code'], source: string, license: BankPublishBlocker['license'] = 'unknown') => {
      blockers.push({ testType, stimulusSetVersion: version, license, source, declarationFile, code })
    }

    if (!/^[a-z][a-z0-9-]*$/.test(testType)) {
      block('BANK_DECLARATION_INVALID', 'invalid task identity')
      continue
    }
    let declaration: Record<string, unknown>
    try {
      declaration = asRecord(JSON.parse(readFileSync(declarationFile, 'utf8'))) ?? {}
    } catch {
      block('BANK_DECLARATION_INVALID', 'task package missing or unreadable')
      continue
    }

    // No bank declaration is valid for procedural tasks; malformed declarations are not.
    if (declaration.banks === undefined) continue
    if (!Array.isArray(declaration.banks) || declaration.banks.length === 0) {
      block('BANK_DECLARATION_INVALID', 'bank declaration is empty or invalid')
      continue
    }
    if (typeof selectedVersion !== 'string' || !selectedVersion) {
      block('BANK_VERSION_MISMATCH', 'frozen config does not specify a bank version')
      continue
    }

    let matches = 0
    for (const ref of declaration.banks) {
      const bankRef = asRecord(ref)
      if (!bankRef || typeof bankRef.file !== 'string' || typeof bankRef.export !== 'string'
          || !/^[-\w./]+$/.test(bankRef.file)
          || path.isAbsolute(bankRef.file) || bankRef.file.split('/').includes('..')) {
        block('BANK_DECLARATION_INVALID', 'invalid bank module reference')
        continue
      }
      try {
        const bankModule = await import(path.join(TASKS_DIR, testType, bankRef.file)) as Record<string, unknown>
        const parsed = cognitiveBankMetaSchema.safeParse(bankModule[bankRef.export])
        if (!parsed.success) {
          block('BANK_METADATA_INVALID', 'bank metadata failed schema validation')
          continue
        }
        if (parsed.data.stimulusSetVersion !== selectedVersion) continue
        matches += 1
        if (!isBankPublicReleaseAllowed(parsed.data)) {
          block('BANK_RIGHTS_RESTRICTED', parsed.data.source, parsed.data.license)
        }
      } catch {
        block('BANK_METADATA_INVALID', 'bank module could not be loaded')
      }
    }
    if (matches === 0) block('BANK_VERSION_MISMATCH', 'no declared bank matches frozen config')
    else if (matches > 1) block('BANK_VERSION_AMBIGUOUS', 'multiple bank declarations match frozen config')
  }
  return blockers
}
