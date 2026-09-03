import { describe, expect, it } from 'vitest'
import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import {
  classifyDecryptedRuntimeSnapshot,
  parseFrozenRuntimeSnapshot,
} from '../../modules/assessment-bundle/compatibility'
import { compileBundleRuntimeFromFrozenRead } from '../../modules/assessment-bundle/compile'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import {
  buildFrozenAssessmentBundleSnapshot,
  encryptFrozenAssessmentBundleSnapshot,
} from '../../modules/assessment-bundle/snapshot'
import { cognitiveSelfBundle } from './fixtures'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected BundleContractError')
  } catch (error) {
    if (error instanceof BundleContractError) return error.code
    throw error
  }
}

const legacyProtocolV1 = {
  snapshotVersion: 1 as const,
  protocolKey: 'attention_stability_v1',
  protocolVersion: '1.0.0',
  profile: 'standard' as const,
  protocolDefinition: { key: 'attention_stability_v1', version: '1.0.0' },
  cognitiveMeasurements: [{ slotKey: 'reaction', resolvedConfigHash: 'a'.repeat(64), resolvedReportHash: 'b'.repeat(64) }],
}

const legacyPackageV1 = {
  snapshotVersion: 1 as const,
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  profile: 'standard' as const,
  packageDefinition: { key: 'attention_stability_v1', version: '1.0.0', name: '注意与稳定性' },
  analysisProtocolSnapshot: legacyProtocolV1,
}

const legacyPackageV2 = {
  snapshotVersion: 2 as const,
  packageKey: 'inhibitory_control_multisource_v1',
  packageVersion: '1.0.0',
  profile: 'research' as const,
  packageDefinition: { key: 'inhibitory_control_multisource_v1', version: '1.0.0', name: '跨来源' },
  analysisProtocolSnapshot: {
    ...legacyProtocolV1,
    snapshotVersion: 2 as const,
    protocolKey: 'inhibitory_control_multisource_v1',
    scaleMeasurements: [{
      slotKey: 'adexi_inhibition',
      scaleId: 'scale-1',
      scaleCode: 'adexi_v1',
      dimensionCode: 'inhibition',
      scaleDefinitionHash: 'a'.repeat(64),
      mappingKey: 'adexi_v1.inhibition.response_inhibition.v1',
      mappingVersion: '1.0.0',
      mappingDomain: 'response_inhibition',
      mappingFacet: 'inhibition',
      mappingRole: 'primary',
      mappingDirectionClass: 'more_difficulty',
      respondentType: 'participant_self_report',
      valueSelector: 'dimensionScore',
    }],
  },
}

describe('compatibility reader', () => {
  it('classifies by outer structure, not snapshotVersion 1|2 alone', () => {
    expect(classifyDecryptedRuntimeSnapshot(legacyPackageV1)).toBe('LEGACY_REPORT_PACKAGE')
    expect(classifyDecryptedRuntimeSnapshot(legacyProtocolV1)).toBe('LEGACY_ANALYSIS_PROTOCOL')
    expect(classifyDecryptedRuntimeSnapshot(legacyPackageV2)).toBe('LEGACY_REPORT_PACKAGE')
    expect(classifyDecryptedRuntimeSnapshot({
      snapshotFamily: 'ASSESSMENT_BUNDLE',
      snapshotVersion: 3,
    })).toBe('ASSESSMENT_BUNDLE')
  })

  it('reads existing report package v1 and v2 without synthesizing identity fields', () => {
    const v1 = parseFrozenRuntimeSnapshot(encryptCognitivePayload(legacyPackageV1))
    const v2 = parseFrozenRuntimeSnapshot(encryptCognitivePayload(legacyPackageV2))
    expect(v1).toMatchObject({
      family: 'LEGACY_REPORT_PACKAGE',
      snapshotVersion: 1,
      unavailable: {
        respondent: 'unavailable',
        rights: 'unavailable',
        context: 'unavailable',
        consent: 'unavailable',
        subject: 'unavailable',
      },
    })
    expect(v2.family).toBe('LEGACY_REPORT_PACKAGE')
    expect(v2.snapshotVersion).toBe(2)
    if (v1.family !== 'LEGACY_REPORT_PACKAGE' || v2.family !== 'LEGACY_REPORT_PACKAGE') {
      throw new Error('expected legacy package reads')
    }
    expect(v1.snapshot).not.toHaveProperty('respondent')
    expect(v1.snapshot).not.toHaveProperty('subject')
    expect(v1.snapshot).not.toHaveProperty('bundleKey')
    expect(Object.keys(v1.unavailable).sort()).toEqual(['consent', 'context', 'respondent', 'rights', 'subject'])
    const compiled = compileBundleRuntimeFromFrozenRead(v2)
    expect(compiled.instrumentType).toBe('BUNDLE')
    expect(compiled.instrumentKey).toBe('report-package:inhibitory_control_multisource_v1')
  })

  it('reads a legacy analysis protocol without falling through from version 1|2', () => {
    const read = parseFrozenRuntimeSnapshot(encryptCognitivePayload(legacyProtocolV1))
    expect(read.family).toBe('LEGACY_ANALYSIS_PROTOCOL')
    if (read.family !== 'LEGACY_ANALYSIS_PROTOCOL') throw new Error('expected protocol')
    expect(read.unavailable.consent).toBe('unavailable')
    expect(read.snapshot).not.toHaveProperty('userId')
  })

  it('does not fall a damaged v3 snapshot back into legacy parsers', () => {
    const valid = buildFrozenAssessmentBundleSnapshot(cognitiveSelfBundle())
    const poisoned = {
      ...valid,
      snapshotHash: 'e'.repeat(64),
      packageKey: 'attention_stability_v1',
      packageVersion: '1.0.0',
      packageDefinition: { key: 'attention_stability_v1' },
      analysisProtocolSnapshot: legacyProtocolV1,
    }
    expect(classifyDecryptedRuntimeSnapshot(poisoned)).toBe('ASSESSMENT_BUNDLE')
    expect(failCode(() => parseFrozenRuntimeSnapshot(encryptCognitivePayload(poisoned))))
      .toBe('SNAPSHOT_HASH_MISMATCH')
    const withLegacyKeys = parseFrozenRuntimeSnapshot(encryptCognitivePayload({
      ...valid,
      packageKey: 'attention_stability_v1',
      packageDefinition: { key: 'attention_stability_v1' },
      analysisProtocolSnapshot: legacyProtocolV1,
    }))
    expect(withLegacyKeys.family).toBe('ASSESSMENT_BUNDLE')
  })

  it('rejects unsupported families after a single decrypt', () => {
    expect(failCode(() => parseFrozenRuntimeSnapshot(encryptCognitivePayload({ hello: 'world' }))))
      .toBe('UNSUPPORTED_SNAPSHOT')
    const valid = encryptFrozenAssessmentBundleSnapshot(buildFrozenAssessmentBundleSnapshot(cognitiveSelfBundle()))
    expect(parseFrozenRuntimeSnapshot(valid).family).toBe('ASSESSMENT_BUNDLE')
  })
})
