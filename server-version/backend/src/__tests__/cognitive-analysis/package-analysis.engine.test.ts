import { describe, expect, it } from 'vitest'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import {
  hashResolvedConfig,
  type FrozenReportSnapshot,
} from '../../modules/cognitive/profile-freeze'
import {
  buildPackageCognitiveAnalysis,
  CognitivePackageAnalysisInputError,
  getAnalysisProtocolDefinition,
  getReportPackageDefinition,
  listCognitiveEvidenceMappingsForTask,
  type CognitiveMetricInterpretation,
  type EvidenceDirectionClass,
  type FrozenCognitiveModuleResult,
  type FrozenReportPackageSnapshot,
} from '../../modules/cognitive-analysis'

const PACKAGE_KEYS = [
  'attention_stability_v1',
  'inhibitory_control_v1',
  'working_memory_v1',
  'executive_control_v1',
  'learning_reasoning_v1',
  'k12_core_profile_v1',
] as const

type FixtureOptions = {
  failedSlots?: string[]
  directionBySlot?: Record<string, EvidenceDirectionClass>
  directionByMetric?: Record<string, EvidenceDirectionClass>
  sourceResultIds?: Record<string, string>
  values?: Record<string, unknown>
}

const makeFrozenReport = (
  slot: FrozenReportPackageSnapshot['analysisProtocolSnapshot']['protocolDefinition']['cognitiveSlots'][number],
  profile: 'standard' | 'research',
): FrozenReportSnapshot => {
  const entry = getCognitiveRegistryEntry(slot.testType, slot.engineVersion, slot.scoringVersion)
  if (!entry) throw new Error(`missing task fixture ${slot.testType}`)
  return {
    profile,
    profileDefinitionVersion: entry.profileDefinitionVersion,
    metricDefinitionVersion: entry.metricDefinitionVersion,
    qualityDefinitionVersion: entry.qualityDefinitionVersion,
    reportDefinitionVersion: entry.reportDefinitionVersion,
    reportCaveats: entry.profiles[profile].reportCaveats,
    metricDefinitions: entry.metricDefinitions,
    qualityDefinitions: entry.qualityDefinitions,
    reportDefinition: entry.reportDefinition,
  }
}

const makePackageSnapshot = (
  packageKey: (typeof PACKAGE_KEYS)[number],
  profile: 'standard' | 'research' = 'standard',
): FrozenReportPackageSnapshot => {
  const packageDefinition = getReportPackageDefinition(packageKey, '1.0.0')
  if (!packageDefinition) throw new Error(`missing package fixture ${packageKey}`)
  const protocol = getAnalysisProtocolDefinition(
    packageDefinition.analysisProtocolKey,
    packageDefinition.analysisProtocolVersion,
  )
  if (!protocol) throw new Error(`missing protocol fixture ${packageKey}`)
  return {
    snapshotVersion: 1,
    packageKey: packageDefinition.key,
    packageVersion: packageDefinition.version,
    profile,
    packageDefinition,
    analysisProtocolSnapshot: {
      snapshotVersion: 1,
      protocolKey: protocol.key,
      protocolVersion: protocol.version,
      profile,
      protocolDefinition: protocol,
      cognitiveMeasurements: protocol.cognitiveSlots.map((slot) => {
        const report = makeFrozenReport(slot, profile)
        return {
          slotKey: slot.key,
          resolvedConfigHash: hashResolvedConfig({ slotKey: slot.key, profile }),
          resolvedReportHash: hashResolvedConfig(report),
        }
      }),
    },
  }
}

const metricFixtureValue = (metricKey: string): unknown => {
  if (metricKey === 'dPrimeByN') return { '1': 1.25, '2': 0.75 }
  if (metricKey === 'accuracyByRuleFamily') return { relation: 0.8, pattern: 0.6 }
  if (metricKey === 'medianRtMs' || metricKey === 'medianCorrectRtMs') return 0
  if (metricKey === 'delayedRetention' || metricKey === 'delayedAccuracy') return null
  return 1
}

const makeModuleResults = (
  snapshot: FrozenReportPackageSnapshot,
  options: FixtureOptions = {},
): FrozenCognitiveModuleResult[] =>
  snapshot.analysisProtocolSnapshot.protocolDefinition.cognitiveSlots.map((slot) => {
    const entry = getCognitiveRegistryEntry(slot.testType, slot.engineVersion, slot.scoringVersion)
    if (!entry) throw new Error(`missing task fixture ${slot.testType}`)
    const mappings = listCognitiveEvidenceMappingsForTask(
      slot.testType,
      slot.engineVersion,
      slot.scoringVersion,
    )
    const metrics: Record<string, unknown> = {}
    const metricInterpretations: Record<string, CognitiveMetricInterpretation> = {}
    for (const mapping of mappings) {
      const key = `${slot.key}/${mapping.metricKey}`
      const hasOverride = options.values !== undefined && Object.prototype.hasOwnProperty.call(options.values, key)
      metrics[mapping.metricKey] = hasOverride
        ? options.values?.[key]
        : metricFixtureValue(mapping.metricKey)
      const direction = options.directionByMetric?.[key] ?? options.directionBySlot?.[slot.key]
      if (direction) {
        metricInterpretations[mapping.metricKey] = direction === 'unknown'
          ? { interpretation: 'descriptive', directionClass: 'unknown' }
          : {
            interpretation: 'criterion',
            directionClass: direction,
            provenance: {
              basisId: 'fixture-criterion',
              basisVersion: 'fixture-criterion-v1',
            },
          }
      }
    }
    const failed = options.failedSlots?.includes(slot.key) === true
    const profile = snapshot.profile
    const frozenReport = makeFrozenReport(slot, profile)
    const failedFlag = Object.keys(entry.qualityDefinitions).find((key) => key !== 'interpretable')
    return {
      slotKey: slot.key,
      sourceResultId: options.sourceResultIds?.[slot.key] ?? `result-${slot.key}`,
      assignmentId: `assignment-${slot.key}`,
      profile,
      testType: slot.testType,
      configVersion: slot.configVersion,
      engineVersion: slot.engineVersion,
      scoringVersion: slot.scoringVersion,
      metrics,
      qualityFlags: failed
        ? { interpretable: false, ...(failedFlag ? { [failedFlag]: true } : {}) }
        : { interpretable: true },
      frozenReport,
      metricInterpretations,
      provenance: { resultVersion: 'fixture-result-v1' },
    }
  })

const analyse = (
  packageKey: (typeof PACKAGE_KEYS)[number],
  options: FixtureOptions = {},
) => {
  const packageSnapshot = makePackageSnapshot(packageKey)
  return buildPackageCognitiveAnalysis({
    packageSnapshot,
    moduleResults: makeModuleResults(packageSnapshot, options),
  })
}

const replaceFrozenReport = (
  snapshot: FrozenReportPackageSnapshot,
  moduleResults: FrozenCognitiveModuleResult[],
  slotKey: string,
  transform: (report: FrozenReportSnapshot) => FrozenReportSnapshot,
): void => {
  const moduleResult = moduleResults.find((item) => item.slotKey === slotKey)
  const measurement = snapshot.analysisProtocolSnapshot.cognitiveMeasurements
    .find((item) => item.slotKey === slotKey)
  if (!moduleResult || !measurement) throw new Error(`missing frozen report fixture ${slotKey}`)
  moduleResult.frozenReport = transform(moduleResult.frozenReport)
  measurement.resolvedReportHash = hashResolvedConfig(moduleResult.frozenReport)
}

const expectInputError = (callback: () => unknown, pattern?: RegExp): void => {
  try {
    callback()
    throw new Error('expected CognitivePackageAnalysisInputError')
  } catch (error) {
    expect(error).toBeInstanceOf(CognitivePackageAnalysisInputError)
    expect(error).not.toBeInstanceOf(TypeError)
    if (pattern) expect((error as Error).message).toMatch(pattern)
  }
}

describe('PR7 package-scoped cognitive evidence and domain engine', () => {
  it('builds a complete descriptive-only result for all six built-in packages', () => {
    const expectedEvidenceCounts: Record<(typeof PACKAGE_KEYS)[number], number> = {
      attention_stability_v1: 9,
      inhibitory_control_v1: 10,
      working_memory_v1: 10,
      executive_control_v1: 14,
      learning_reasoning_v1: 11,
      k12_core_profile_v1: 31,
    }
    const coveredDomains = new Set<string>()
    for (const packageKey of PACKAGE_KEYS) {
      const result = analyse(packageKey)
      expect(result.packageKey).toBe(packageKey)
      expect(result.analysisVersion).toBe('cognitive-evidence-domain-v1.0.0')
      expect(result.reportSchemaVersion).toBe('cognitive-package-analysis-v1')
      expect(result.evidence).toHaveLength(expectedEvidenceCounts[packageKey])
      expect(new Set(result.evidence.map((item) => item.id)).size).toBe(result.evidence.length)
      expect(result.evidence[0].provenance).toMatchObject({
        packageKey,
        packageVersion: '1.0.0',
        packageSnapshotVersion: '1',
        packageReportDefinitionVersion: 'report-package-v1',
        resolvedConfigHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        resolvedReportHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        analysisProtocolKey: result.analysisProtocolKey,
        analysisProtocolVersion: result.analysisProtocolVersion,
        analysisProtocolSnapshotVersion: '1',
        domainDefinitionVersion: '1.0.0',
        evidenceMappingVersion: '1.0.0',
        recommendationRuleVersion: '1.0.0',
        analysisVersion: 'cognitive-evidence-domain-v1.0.0',
        reportSchemaVersion: 'cognitive-package-analysis-v1',
        assignmentId: expect.any(String),
      })
      expect(result.cognitiveDomains.every((domain) => domain.status === 'descriptive_only')).toBe(true)
      expect(result.cognitiveDomains.every((domain) => domain.consistency === 'not_applicable')).toBe(true)
      expect(result.crossSourceFindings).toEqual([])
      expect(result.recommendations).toEqual([])
      expect(result).not.toHaveProperty('overallScore')
      result.cognitiveDomains.forEach((domain) => coveredDomains.add(domain.domain))
    }
    expect(coveredDomains.size).toBe(10)
  })

  it('retains quality-failed evidence while excluding it from the domain conclusion', () => {
    for (const packageKey of PACKAGE_KEYS) {
      const packageSnapshot = makePackageSnapshot(packageKey)
      const failedSlot = packageSnapshot.analysisProtocolSnapshot.protocolDefinition.cognitiveSlots[0].key
      const result = buildPackageCognitiveAnalysis({
        packageSnapshot,
        moduleResults: makeModuleResults(packageSnapshot, { failedSlots: [failedSlot] }),
      })
      const failedEvidence = result.evidence.filter((item) => item.provenance.slotKey === failedSlot)
      expect(failedEvidence.length, packageKey).toBeGreaterThan(0)
      expect(failedEvidence.every((item) => item.interpretable === false), packageKey).toBe(true)
      expect(result.qualitySummary.excludedModules, packageKey).toContain(failedSlot)
    }

    const result = analyse('learning_reasoning_v1', { failedSlots: ['matrix'] })
    const failedEvidence = result.evidence.filter((item) => item.provenance.slotKey === 'matrix')
    expect(failedEvidence.length).toBeGreaterThan(0)
    expect(failedEvidence.every((item) => item.interpretable === false)).toBe(true)
    expect(failedEvidence.every((item) => item.qualityFlags.length > 0)).toBe(true)
    expect(result.qualitySummary.excludedModules).toEqual(['matrix'])
    expect(result.cognitiveDomains.find((domain) => domain.domain === 'fluid_reasoning')).toMatchObject({
      status: 'insufficient_quality',
      consistency: 'not_applicable',
    })
  })

  it('keeps maps, arrays, zero, and null without coercion or averaging', () => {
    const packageSnapshot = makePackageSnapshot('k12_core_profile_v1')
    const moduleResults = makeModuleResults(packageSnapshot, {
      values: {
        'nback/dPrimeByN': { '1': 0, '2': null },
        'matrix/accuracyByRuleFamily': [0, 1, null],
        'matrix/accuracy': 0,
        'matrix/medianRtMs': null,
      },
    })
    const matrix = moduleResults.find((item) => item.slotKey === 'matrix')
    if (!matrix) throw new Error('missing matrix fixture')
    matrix.frozenReport = {
      ...matrix.frozenReport,
      metricDefinitions: {
        ...matrix.frozenReport.metricDefinitions,
        accuracyByRuleFamily: {
          ...matrix.frozenReport.metricDefinitions.accuracyByRuleFamily,
          valueType: 'array',
        },
      },
    }
    const matrixMeasurement = packageSnapshot.analysisProtocolSnapshot.cognitiveMeasurements
      .find((measurement) => measurement.slotKey === 'matrix')
    if (!matrixMeasurement) throw new Error('missing matrix measurement fixture')
    matrixMeasurement.resolvedReportHash = hashResolvedConfig(matrix.frozenReport)
    const result = buildPackageCognitiveAnalysis(packageSnapshot, moduleResults)
    expect(result.evidence.find((item) => item.provenance.slotKey === 'nback' && item.metricKey === 'dPrimeByN')?.value)
      .toEqual({ '1': 0, '2': null })
    expect(result.evidence.find((item) => item.provenance.slotKey === 'matrix' && item.metricKey === 'accuracyByRuleFamily')?.value)
      .toEqual([0, 1, null])
    expect(result.evidence.find((item) => item.provenance.slotKey === 'matrix' && item.metricKey === 'accuracy')).toMatchObject({
      value: 0,
      interpretable: true,
    })
    expect(result.evidence.find((item) => item.provenance.slotKey === 'matrix' && item.metricKey === 'medianRtMs')).toMatchObject({
      value: null,
      interpretable: false,
    })
  })

  it('uses independent sourceResultId values for consistency and counts one task once', () => {
    const consistent = analyse('attention_stability_v1', {
      directionBySlot: { reaction: 'more_strength', patterncompare: 'more_strength' },
    })
    expect(consistent.cognitiveDomains.find((domain) => domain.domain === 'processing_speed')).toMatchObject({
      status: 'interpretable',
      consistency: 'consistent',
    })

    const mixed = analyse('attention_stability_v1', {
      directionBySlot: { reaction: 'more_strength', patterncompare: 'more_strength' },
      directionByMetric: { 'patterncompare/medianCorrectRtMs': 'unknown' },
    })
    expect(mixed.cognitiveDomains.find((domain) => domain.domain === 'processing_speed')?.consistency).toBe('mixed')

    const neutral = analyse('attention_stability_v1', {
      directionBySlot: { reaction: 'more_strength', patterncompare: 'more_strength' },
      directionByMetric: { 'patterncompare/medianCorrectRtMs': 'neutral' },
    })
    const neutralDomain = neutral.cognitiveDomains.find((domain) => domain.domain === 'processing_speed')
    expect(neutralDomain?.consistency).toBe('mixed')
    expect(neutralDomain?.caveats).toContain(
      '存在 unknown/neutral 方向的指标，仅作描述，不用于跨任务方向性判断。',
    )
    expect(neutral.qualitySummary.warnings).toContain(
      '存在 unknown/neutral 方向的 Evidence，该部分不参与可比较的方向性结论。',
    )

    const divergent = analyse('attention_stability_v1', {
      directionBySlot: { reaction: 'more_strength', patterncompare: 'more_difficulty' },
    })
    expect(divergent.cognitiveDomains.find((domain) => domain.domain === 'processing_speed')?.consistency).toBe('divergent')

    const oneTask = analyse('learning_reasoning_v1', {
      directionBySlot: { matrix: 'more_strength' },
    })
    expect(oneTask.cognitiveDomains.find((domain) => domain.domain === 'fluid_reasoning')).toMatchObject({
      status: 'interpretable',
      consistency: 'not_applicable',
    })
  })

  it('rejects collection-only, bare protocol, experience, custom, and mismatched frozen inputs', () => {
    const packageSnapshot = makePackageSnapshot('attention_stability_v1')
    const moduleResults = makeModuleResults(packageSnapshot)
    expect(() => buildPackageCognitiveAnalysis({} as never)).toThrow()
    expect(() => buildPackageCognitiveAnalysis(
      packageSnapshot.analysisProtocolSnapshot as never,
      moduleResults,
    )).toThrow()

    const experienceSnapshot = {
      ...packageSnapshot,
      profile: 'experience',
      analysisProtocolSnapshot: { ...packageSnapshot.analysisProtocolSnapshot, profile: 'experience' },
    } as never
    expect(() => buildPackageCognitiveAnalysis(experienceSnapshot, moduleResults)).toThrow(/experience/)

    expect(() => buildPackageCognitiveAnalysis(
      { ...packageSnapshot, packageKey: 'custom_package_v1' } as never,
      moduleResults,
    )).toThrow()

    expect(() => buildPackageCognitiveAnalysis(
      {
        ...packageSnapshot,
        analysisProtocolSnapshot: {
          ...packageSnapshot.analysisProtocolSnapshot,
          protocolVersion: '9.9.9',
        },
      } as never,
      moduleResults,
    )).toThrow(/key\/version/)

    expect(() => buildPackageCognitiveAnalysis(
      {
        ...packageSnapshot,
        packageDefinition: {
          ...packageSnapshot.packageDefinition,
          slots: [
            ...packageSnapshot.packageDefinition.slots,
            { key: 'scale', label: '量表', position: 99, required: true, mappingKey: 'scale', mappingVersion: '1.0.0' },
          ],
        },
      } as never,
      moduleResults,
    )).toThrow()

    const wrongSlotVersion = moduleResults.map((result, index) => index === 0
      ? { ...result, configVersion: '9.9.9' }
      : result)
    expect(() => buildPackageCognitiveAnalysis(packageSnapshot, wrongSlotVersion)).toThrow(/版本不匹配/)

    const wrongReportVersion = moduleResults.map((result, index) => index === 0
      ? { ...result, frozenReport: { ...result.frozenReport, reportDefinitionVersion: '9.9.9' } }
      : result)
    expect(() => buildPackageCognitiveAnalysis(packageSnapshot, wrongReportVersion)).toThrow(/版本不匹配/)

    const wrongProfile = moduleResults.map((result, index) => index === 0
      ? { ...result, profile: 'research' as const }
      : result)
    expect(() => buildPackageCognitiveAnalysis(packageSnapshot, wrongProfile)).toThrow(/Profile/)

    const selfReport = moduleResults.map((result, index) => index === 0
      ? {
        ...result,
        metricInterpretations: {
          ...result.metricInterpretations,
          medianRtMs: { interpretation: 'self_report', directionClass: 'unknown' },
        },
      }
      : result)
    expect(() => buildPackageCognitiveAnalysis(packageSnapshot, selfReport)).toThrow(/self_report/)
  })

  it('keeps evidence ids deterministic and package-scoped without deriving direction from metric definitions', () => {
    const attentionSnapshot = makePackageSnapshot('attention_stability_v1')
    const attentionModules = makeModuleResults(attentionSnapshot)
    const first = buildPackageCognitiveAnalysis(attentionSnapshot, attentionModules)
    const second = buildPackageCognitiveAnalysis(attentionSnapshot, attentionModules)
    expect(second.evidence.map((item) => item.id)).toEqual(first.evidence.map((item) => item.id))
    expect(first.evidence.every((item) => item.directionClass === 'unknown')).toBe(true)
    expect(first.evidence.every((item) => item.interpretation === 'descriptive')).toBe(true)

    const workingSnapshot = makePackageSnapshot('working_memory_v1')
    const workingModules = makeModuleResults(workingSnapshot, {
      sourceResultIds: { nback: 'shared-nback-result' },
    })
    const executiveSnapshot = makePackageSnapshot('executive_control_v1')
    const executiveModules = makeModuleResults(executiveSnapshot, {
      sourceResultIds: { nback: 'shared-nback-result' },
    })
    const workingId = buildPackageCognitiveAnalysis(workingSnapshot, workingModules).evidence
      .find((item) => item.sourceResultId === 'shared-nback-result' && item.metricKey === 'dPrimeByN')?.id
    const executiveId = buildPackageCognitiveAnalysis(executiveSnapshot, executiveModules).evidence
      .find((item) => item.sourceResultId === 'shared-nback-result' && item.metricKey === 'dPrimeByN')?.id
    expect(workingId).toBeTruthy()
    expect(executiveId).toBeTruthy()
    expect(workingId).not.toBe(executiveId)
    expect(first).not.toHaveProperty('overallScore')
    expect(first).not.toHaveProperty('averageScore')
    expect(first.cognitiveDomains.every((domain) =>
      !Object.prototype.hasOwnProperty.call(domain, 'score') &&
      !Object.prototype.hasOwnProperty.call(domain, 'domainScore'))).toBe(true)
    expect(first.evidence.some((item) => item.metricKey === 'productIndex')).toBe(false)
  })

  it('handles all four domain statuses without promoting unusable evidence', () => {
    const allFailedSnapshot = makePackageSnapshot('attention_stability_v1')
    const allFailedSlots = allFailedSnapshot.analysisProtocolSnapshot.protocolDefinition.cognitiveSlots
      .map((slot) => slot.key)
    const allFailed = buildPackageCognitiveAnalysis(
      allFailedSnapshot,
      makeModuleResults(allFailedSnapshot, { failedSlots: allFailedSlots }),
    )
    expect(allFailed.cognitiveDomains.every((domain) => domain.status === 'insufficient_quality')).toBe(true)
    expect(allFailed.cognitiveDomains.every((domain) => domain.consistency === 'not_applicable')).toBe(true)
    expect(allFailed.evidence.every((item) => item.interpretable === false)).toBe(true)

    const unmeasuredSnapshot = makePackageSnapshot('attention_stability_v1')
    const unmeasuredModules = makeModuleResults(unmeasuredSnapshot)
    for (const moduleResult of unmeasuredModules) {
      replaceFrozenReport(unmeasuredSnapshot, unmeasuredModules, moduleResult.slotKey, (report) => ({
        ...report,
        metricDefinitions: Object.fromEntries(
          Object.entries(report.metricDefinitions).map(([key, definition]) => [key, {
            ...definition,
            availableProfiles: ['research'],
          }]),
        ),
      }))
    }
    const unmeasured = buildPackageCognitiveAnalysis(unmeasuredSnapshot, unmeasuredModules)
    expect(unmeasured.cognitiveDomains.every((domain) => domain.status === 'not_measured')).toBe(true)
    expect(unmeasured.evidence).toEqual([])

    expect(analyse('attention_stability_v1').cognitiveDomains
      .every((domain) => domain.status === 'descriptive_only')).toBe(true)
    expect(analyse('attention_stability_v1', {
      directionBySlot: { reaction: 'more_strength' },
    }).cognitiveDomains.find((domain) => domain.domain === 'processing_speed')?.status).toBe('interpretable')
  })

  it('counts distinct sourceResultId values once and classifies internal conflict as mixed', () => {
    const sameSource = analyse('attention_stability_v1', {
      directionBySlot: { reaction: 'more_strength', patterncompare: 'more_strength' },
      sourceResultIds: { reaction: 'same-source', patterncompare: 'same-source' },
    })
    expect(sameSource.cognitiveDomains.find((domain) => domain.domain === 'processing_speed')?.consistency)
      .toBe('not_applicable')

    const withinTaskConflict = analyse('attention_stability_v1', {
      directionBySlot: { reaction: 'more_strength', patterncompare: 'more_strength' },
      directionByMetric: { 'patterncompare/medianCorrectRtMs': 'more_difficulty' },
    })
    expect(withinTaskConflict.cognitiveDomains
      .find((domain) => domain.domain === 'processing_speed')?.consistency).toBe('mixed')
  })

  it('uses frozen package/protocol contracts after mutable live registry presentation changes', () => {
    const snapshot = makePackageSnapshot('attention_stability_v1')
    snapshot.packageDefinition = {
      ...snapshot.packageDefinition,
      status: 'RETIRED',
      name: '历史冻结包名称',
      description: '历史冻结描述',
      disabledReason: '历史冻结状态不依赖 live Registry',
    }
    snapshot.analysisProtocolSnapshot.protocolDefinition = {
      ...snapshot.analysisProtocolSnapshot.protocolDefinition,
      status: 'RETIRED',
      name: '历史冻结协议名称',
      description: '历史冻结协议描述',
      disabledReason: '历史冻结协议状态',
    }
    const result = buildPackageCognitiveAnalysis(snapshot, makeModuleResults(snapshot))
    expect(result.packageKey).toBe('attention_stability_v1')
    expect(result.cognitiveDomains.every((domain) => domain.status === 'descriptive_only')).toBe(true)
  })

  it('rejects hash, metric, quality, and provenance corruption with domain input errors', () => {
    const snapshot = makePackageSnapshot('attention_stability_v1')
    const modules = makeModuleResults(snapshot)

    const badConfigHash = structuredClone(snapshot)
    badConfigHash.analysisProtocolSnapshot.cognitiveMeasurements[0].resolvedConfigHash = 'not-a-hash'
    expectInputError(() => buildPackageCognitiveAnalysis(badConfigHash, modules), /config hash/)

    const badReportHash = structuredClone(snapshot)
    badReportHash.analysisProtocolSnapshot.cognitiveMeasurements[0].resolvedReportHash = 'a'.repeat(64)
    expectInputError(() => buildPackageCognitiveAnalysis(badReportHash, modules), /报告 hash/)

    const missingMetric = structuredClone(modules)
    delete missingMetric[0].metrics.medianRtMs
    expectInputError(() => buildPackageCognitiveAnalysis(snapshot, missingMetric), /缺少映射指标/)

    const wrongValueType = structuredClone(modules)
    wrongValueType[0].metrics.medianRtMs = { malformed: true }
    expectInputError(() => buildPackageCognitiveAnalysis(snapshot, wrongValueType), /valueType/)

    const wrongMetricDefinitionSnapshot = structuredClone(snapshot)
    const wrongMetricDefinition = structuredClone(modules)
    replaceFrozenReport(
      wrongMetricDefinitionSnapshot,
      wrongMetricDefinition,
      'reaction',
      (report) => ({
        ...report,
        metricDefinitions: {
          ...report.metricDefinitions,
          medianRtMs: { ...report.metricDefinitions.medianRtMs, key: 'forgedMetricKey' },
        },
      }),
    )
    expectInputError(
      () => buildPackageCognitiveAnalysis(wrongMetricDefinitionSnapshot, wrongMetricDefinition),
      /指标 Profile 定义无效/,
    )

    const missingQuality = structuredClone(modules)
    delete missingQuality[0].qualityFlags.interpretable
    expectInputError(() => buildPackageCognitiveAnalysis(snapshot, missingQuality), /interpretable quality flag/)

    const unknownQuality = structuredClone(modules)
    unknownQuality[0].qualityFlags.unknownFlag = true
    expectInputError(() => buildPackageCognitiveAnalysis(snapshot, unknownQuality), /未知 quality flag/)

    const reservedProvenance = structuredClone(modules)
    reservedProvenance[0].provenance = { packageKey: 'forged' }
    expectInputError(() => buildPackageCognitiveAnalysis(snapshot, reservedProvenance), /不得覆盖系统字段/)

    const missingBasis = structuredClone(modules) as unknown as Array<Record<string, unknown>>
    const first = missingBasis[0] as unknown as FrozenCognitiveModuleResult
    first.metricInterpretations = {
      medianRtMs: {
        interpretation: 'criterion',
        directionClass: 'more_strength',
        provenance: {} as never,
      },
    }
    expectInputError(
      () => buildPackageCognitiveAnalysis(snapshot, missingBasis as unknown as FrozenCognitiveModuleResult[]),
      /basisId/,
    )

    const malformedInterpretation = structuredClone(modules)
    malformedInterpretation[0].metricInterpretations = { medianRtMs: null as never }
    expectInputError(
      () => buildPackageCognitiveAnalysis(snapshot, malformedInterpretation),
      /interpretation 格式无效/,
    )
  })

  it('rejects malformed package, protocol, slot, and report structures without native TypeError', () => {
    const snapshot = makePackageSnapshot('attention_stability_v1')
    const modules = makeModuleResults(snapshot)

    expectInputError(() => buildPackageCognitiveAnalysis({
      ...snapshot,
      packageDefinition: {
        ...snapshot.packageDefinition,
        reportDefinitionVersion: '9.9.9',
      },
    }, modules), /protocol\/report definition/)

    expectInputError(() => buildPackageCognitiveAnalysis({
      ...snapshot,
      analysisProtocolSnapshot: {
        ...snapshot.analysisProtocolSnapshot,
        protocolDefinition: {
          ...snapshot.analysisProtocolSnapshot.protocolDefinition,
          evidenceMappingVersion: '9.9.9',
        },
      },
    }, modules), /Evidence mapping/)

    expectInputError(() => buildPackageCognitiveAnalysis({
      ...snapshot,
      packageDefinition: {
        ...snapshot.packageDefinition,
        slots: [null] as never,
      },
    }, modules), /scale slot/)

    const malformedReport = structuredClone(modules)
    malformedReport[0].frozenReport = { metricDefinitions: null } as never
    expectInputError(() => buildPackageCognitiveAnalysis(snapshot, malformedReport), /Profile|冻结报告/)

    const wrongEngine = structuredClone(modules)
    wrongEngine[0].engineVersion = '9.9.9'
    expectInputError(() => buildPackageCognitiveAnalysis(snapshot, wrongEngine), /任务版本/)

    const wrongScoring = structuredClone(modules)
    wrongScoring[0].scoringVersion = '9.9.9'
    expectInputError(() => buildPackageCognitiveAnalysis(snapshot, wrongScoring), /任务版本/)
  })
})
