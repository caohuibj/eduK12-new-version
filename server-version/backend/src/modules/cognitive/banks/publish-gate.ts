import { isBankPublicReleaseAllowed, type CognitiveBankLicense } from './bank-meta'
import { COGNITIVE_BANK_REGISTRY } from './registry'
import cognitiveManifest from '../generated/identities.json'

const KNOWN_TASK_TYPES = new Set(cognitiveManifest.identities.map((entry) => entry.testType))

/** One publication decision per frozen config, shared by CLI and release service. */
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
  code: 'BANK_DECLARATION_INVALID' | 'BANK_VERSION_MISMATCH'
    | 'BANK_VERSION_AMBIGUOUS' | 'BANK_RIGHTS_RESTRICTED'
}

const frozenVersion = (config: unknown): string | null => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null
  const value = (config as Record<string, unknown>).stimulusSetVersion
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Operates on compiled metadata in both development and production.
 * Tests verify that every task-package declaring a bank is represented here.
 * Procedural/no-bank tasks remain unaffected.
 */
export const collectBankPublishBlockers = async (
  configs: ReadonlyArray<BankPublishInput>,
): Promise<BankPublishBlocker[]> => {
  const blockers: BankPublishBlocker[] = []
  for (const { testType, config } of configs) {
    const stimulusSetVersion = frozenVersion(config)
    const sourceFile = `compiled cognitive bank registry: ${testType}`
    const block = (code: BankPublishBlocker['code'], source: string, license: BankPublishBlocker['license'] = 'unknown') => {
      blockers.push({
        testType, stimulusSetVersion: stimulusSetVersion ?? 'unknown', license,
        source, declarationFile: sourceFile, code,
      })
    }
    if (!/^[a-z][a-z0-9-]*$/.test(testType)) {
      block('BANK_DECLARATION_INVALID', 'invalid task identity')
      continue
    }
    const banks = COGNITIVE_BANK_REGISTRY[testType]
    if (!banks) {
      // A procedural task may have no item bank; an unknown task must not be
      // mistaken for one merely because it lacks a bank registry entry.
      if (!KNOWN_TASK_TYPES.has(testType)) {
        block('BANK_DECLARATION_INVALID', 'unknown cognitive task identity')
      }
      continue
    }
    if (banks.length === 0) {
      block('BANK_DECLARATION_INVALID', 'empty compiled bank registration')
      continue
    }
    if (!stimulusSetVersion) {
      block('BANK_VERSION_MISMATCH', 'frozen config is missing stimulusSetVersion')
      continue
    }
    const matches = banks.filter((meta) => meta.stimulusSetVersion === stimulusSetVersion)
    if (matches.length === 0) block('BANK_VERSION_MISMATCH', 'no exact bank for frozen stimulusSetVersion')
    if (matches.length > 1) block('BANK_VERSION_AMBIGUOUS', 'duplicate compiled bank versions')
    for (const meta of matches) {
      if (!isBankPublicReleaseAllowed(meta)) {
        block('BANK_RIGHTS_RESTRICTED', meta.source, meta.license)
      }
    }
  }
  return blockers
}
