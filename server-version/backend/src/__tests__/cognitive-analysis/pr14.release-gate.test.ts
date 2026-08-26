import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)

import { getCognitiveRegistryEntry, listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import { freezeAssignmentProfile, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import {
  buildFrozenReportPackageSnapshot,
  getAnalysisProtocolDefinition,
  getReportPackageDefinition,
  listAnalysisProtocolDefinitions,
  listReportPackageDefinitions,
  validateFrozenReportPackageSnapshot,
  validateProtocolCompositeItems,
} from '../../modules/cognitive-analysis'
import { projectCompositeCollectionReport } from '../../modules/composite/composite-report.projector'

const REPORT = { reportVersion: '1.0.0' as const, referenceMode: 'none' as const }
const GATE_MANIFEST = JSON.parse(readFileSync(resolve(__dirname, '../../../../e2e/cognitive-round2-gate-manifest.json'), 'utf8')) as {
  schemaVersion: string
  reviewBaseCommit: string
  stimulusSets: Array<{ id: string; version: string }>
  supportingArtifacts: Array<{ id: string; version: string }>
  multisourcePackages: Array<{ key: string; version: string; reviewedScaleCodes: string[] }>
  candidatePackages: Array<{ key: string; version: string; kind: string }>
}

/**
 * These are the published-config-shaped fixtures used by the existing task
 * golden tests. They deliberately stay in this gate so a Registry entry that
 * silently loses a strict schema or a Profile patch cannot pass by metadata
 * alone.
 */
const BASE_CONFIGS: Record<string, Record<string, unknown>> = {
  reaction: { totalTrials: 20, foreperiodMinMs: 700, foreperiodMaxMs: 1500, timeoutMs: 2000, readyDurationMs: 1000, report: REPORT },
  memory: { startLength: 3, maxLength: 9, trialsPerLevel: 2, digitDisplayMs: 800, digitIntervalMs: 200, readyDurationMs: 1000, inactivityGuardMs: 30000, report: REPORT },
  stroop: { totalTrials: 40, congruentRatio: 0.5, fixationMs: 500, stimulusDurationMs: 2000, isiMs: 500, validRtFloorMs: 200, report: REPORT },
  gonogo: { totalTrials: 120, nogoRatio: 0.25, stimulusMs: 800, isiMs: 500, validRtFloorMs: 100, report: REPORT },
  cpt: { totalTrials: 180, targetRatio: 0.2, blockCount: 3, stimulusMs: 500, isiMs: 1000, validRtFloorMs: 100, perseverationRtMs: 100, report: REPORT },
  nback: { nLevels: [1, 2], trialCountByN: [40, 60], blockCountByN: [1, 1], targetRatio: 0.3, stimulusMs: 500, isiMs: 2000, validRtFloorMs: 150, report: REPORT },
  corsi: { startSpan: 3, maxSpan: 8, trialsPerLevel: 2, boardSize: 9, highlightMs: 500, intervalMs: 250, readyDurationMs: 800, inactivityGuardMs: 30000, report: REPORT },
  sst: { totalTrials: 96, stopRatio: 0.25, ssdStartMs: 250, ssdMinMs: 50, ssdMaxMs: 800, ssdStepMs: 50, goTimeoutMs: 1000, isiMs: 500, validRtFloorMs: 100, report: REPORT },
  taskswitch: { totalTrials: 128, switchRatio: 0.5, blockCount: 4, includePureBlocks: false, cueMs: 400, stimulusMs: 2000, isiMs: 400, validRtFloorMs: 200, report: REPORT },
  patterncompare: { durationSec: 60, trialTimeoutMs: 2500, isiMs: 250, validRtFloorMs: 150, stimulusSetVersion: 'geometric-v1.0.0', report: REPORT },
  flanker: { totalTrials: 24, congruentRatio: 0.5, stimulusMs: 1800, isiMs: 400, validRtFloorMs: 150, stimulusSetVersion: 'arrows-v1.0.0', report: REPORT },
  cardsort: { totalTrials: 24, switchRatio: 0.33, blockCount: 2, cueMs: 500, stimulusMs: 2000, isiMs: 350, validRtFloorMs: 150, stimulusSetVersion: 'geometric-cards-v1.0.0', report: REPORT },
  digitbackward: { startSpan: 2, maxSpan: 4, trialsPerLevel: 2, digitDisplayMs: 800, digitIntervalMs: 200, readyDurationMs: 800, inactivityGuardMs: 30000, stimulusSetVersion: 'digits-v1.0.0', report: REPORT },
  picturesequence: { itemCount: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 0, studyMsPerItem: 900, inactivityGuardMs: 60000, stimulusSetVersion: 'daily-scenes-v1.0.0', report: REPORT },
  pairedassociate: { pairCount: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 0, studyDurationMs: 12000, inactivityGuardMs: 90000, stimulusSetVersion: 'nonverbal-pairs-v1.0.0', report: REPORT },
  matrix: { itemCount: 6, optionCount: 4, itemTimeoutMs: 30000, validRtFloorMs: 300, stimulusSetVersion: 'matrix-generator-v1.0.0', report: REPORT },
  mentalrotation: { totalTrials: 12, stimulusMs: 5000, isiMs: 400, validRtFloorMs: 200, stimulusSetVersion: 'rotation-objects-v1.0.0', report: REPORT },
  tower: { problemCount: 4, maxMovesFactor: 3, inactivityGuardMs: 90000, stimulusSetVersion: 'three-peg-tower-v1.0.0', report: REPORT },
  trailmaking: { form: 'AB', partAItemCount: 8, partBItemCount: 8, stepTimeoutMs: 15000, stimulusSetVersion: 'trailmaking-generated-v1.0.0', report: REPORT },
  reversallearning: { totalTrials: 40, acquisitionTrials: 20, reversalTrials: 20, criterionConsecutiveCorrect: 6, rewardProbability: 0.8, trialTimeoutMs: 3000, stimulusSetVersion: 'reversal-symbols-v1.0.0', report: REPORT },
  bart: { balloonCount: 10, maxPumps: 6, trialTimeoutMs: 3000, pumpAnimationMs: 100, stimulusSetVersion: 'bart-generated-v1.0.0', report: REPORT },
  wordlist: { listLength: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 60000, studyMsPerWord: 800, recallTimeoutMs: 60000, inactivityGuardMs: 120000, inputMode: 'typed-free-recall', normalizationVersion: 'wordlist-normalization-v1.0.0', stimulusSetVersion: 'chinese-wordlist-v1.0.0', report: REPORT },
  lexicaldecision: { totalTrials: 40, realWordRatio: 0.5, stimulusMs: 1200, trialTimeoutMs: 3000, isiMs: 300, validRtFloorMs: 150, stimulusSetVersion: 'zh-lexical-v1.0.0', pseudowordGeneratorVersion: 'zh-pseudoword-generator-v1.0.0', report: REPORT },
  emotionrecognition: { totalTrials: 24, stimulusMs: 3000, trialTimeoutMs: 5000, isiMs: 300, validRtFloorMs: 200, emotionCategoryVersion: 'basic-emotion-6-v1.0.0', stimulusSetVersion: 'emotion-faces-ai-zh-v1.0.0', report: REPORT },
}

const ROUND2_TASKS = [
  'patterncompare',
  'flanker',
  'cardsort',
  'digitbackward',
  'picturesequence',
  'pairedassociate',
  'matrix',
  'mentalrotation',
  'tower',
  'trailmaking',
  'reversallearning',
  'bart',
  'wordlist',
  'lexicaldecision',
  'emotionrecognition',
] as const
const CORE_PACKAGES = [
  'attention_stability_v1',
  'inhibitory_control_v1',
  'working_memory_v1',
  'executive_control_v1',
  'learning_reasoning_v1',
  'k12_core_profile_v1',
] as const
const MULTISOURCE_PACKAGE = 'inhibitory_control_multisource_v1' as const
const PR14_PACKAGE_KEYS = [...CORE_PACKAGES, MULTISOURCE_PACKAGE] as const
const DRAFT_ONLY_TASKS = [
  'trailmaking',
  'reversallearning',
  'bart',
  'wordlist',
  'lexicaldecision',
  'emotionrecognition',
] as const

const isPr14Package = (key: string): key is typeof PR14_PACKAGE_KEYS[number] =>
  (PR14_PACKAGE_KEYS as readonly string[]).includes(key)

const GATE_MODE = process.env.COGNITIVE_R2_GATE_MODE ?? 'pre-release'
const GATE_CANDIDATE_PACKAGE = process.env.COGNITIVE_R2_GATE_CANDIDATE_PACKAGE ?? ''
const expectedPackageStatus = (key: string) => (
  GATE_MODE === 'promotion-candidate' && GATE_CANDIDATE_PACKAGE === `${key}@1.0.0` ? 'PUBLISHED' : 'DRAFT'
)

const cognitiveItemsFor = (packageKey: string) => {
  const definition = getReportPackageDefinition(packageKey, '1.0.0')
  if (!definition) throw new Error(`missing package fixture ${packageKey}`)
  return definition.slots.map((slot) => {
    if (!('testType' in slot)) throw new Error(`unexpected scale slot in ${packageKey}`)
    const entry = getCognitiveRegistryEntry(slot.testType, slot.engineVersion, slot.scoringVersion)
    if (!entry) throw new Error(`missing registry fixture ${slot.testType}`)
    const freeze = freezeAssignmentProfile({
      entry,
      baseConfig: BASE_CONFIGS[slot.testType],
      profile: 'standard',
    })
    return {
      id: `item-${slot.key}`,
      type: 'COGNITIVE',
      position: slot.position,
      required: true,
      cognitiveAssignment: {
        id: `assignment-${slot.key}`,
        profile: 'standard' as const,
        profileDefinitionVersion: freeze.profileDefinitionVersion,
        resolvedConfigSnapshotEncrypted: freeze.resolvedConfigSnapshotEncrypted,
        resolvedConfigHash: freeze.resolvedConfigHash,
        resolvedReportSnapshotEncrypted: freeze.resolvedReportSnapshotEncrypted,
        config: {
          testType: slot.testType,
          configVersion: slot.configVersion,
          engineVersion: slot.engineVersion,
          scoringVersion: slot.scoringVersion,
          status: 'PUBLISHED',
        },
      },
    }
  })
}

const multisourceItems = () => {
  const packageDefinition = getReportPackageDefinition('inhibitory_control_multisource_v1', '1.0.0')
  const protocol = getAnalysisProtocolDefinition('inhibitory_control_multisource_v1', '1.0.0')
  const entry = getCognitiveRegistryEntry('gonogo', '1.0.0', '1.0.0')
  if (!packageDefinition || !protocol || !entry) throw new Error('missing multisource fixture')
  const freeze = freezeAssignmentProfile({
    entry,
    baseConfig: BASE_CONFIGS.gonogo ?? {},
    profile: 'standard',
  })
  return [
    {
      id: 'item-gonogo',
      type: 'COGNITIVE',
      position: 0,
      required: true,
      cognitiveAssignment: {
        profile: 'standard' as const,
        profileDefinitionVersion: freeze.profileDefinitionVersion,
        resolvedConfigSnapshotEncrypted: freeze.resolvedConfigSnapshotEncrypted,
        resolvedConfigHash: freeze.resolvedConfigHash,
        resolvedReportSnapshotEncrypted: freeze.resolvedReportSnapshotEncrypted,
        config: {
          testType: 'gonogo',
          configVersion: '1.0.0',
          engineVersion: '1.0.0',
          scoringVersion: '1.0.0',
          status: 'PUBLISHED',
        },
      },
    },
    {
      id: 'item-adexi',
      type: 'SCALE',
      position: 1,
      required: true,
      scaleId: 'scale-adexi',
      scale: {
        id: 'scale-adexi',
        code: 'adexi_v1',
        name: 'ADEXI',
        status: 'PUBLISHED',
        visibility: 'HIDDEN',
        config: { respondentType: 'participant_self_report' },
        estimatedTime: 5,
        instruction: 'self report fixture',
        tags: ['ADEXI'],
        dimensions: [{
          id: 'dimension-inhibition',
          code: 'inhibition',
          name: '抑制',
          scoringMethod: 'sum',
          weight: 1,
          minScore: 1,
          maxScore: 5,
          levelFeedback: null,
        }],
        items: [{
          id: 'scale-item-1',
          itemCode: 'ADEXI-01',
          content: 'fixture item',
          type: 'single',
          reverse: false,
          required: true,
          weight: 1,
          sortOrder: 0,
          options: [{ value: 1, label: '1' }],
          randomizeOptions: false,
          itemDimensions: [{ dimensionId: 'dimension-inhibition', weight: 1, reverse: false }],
        }],
      },
    },
  ]
}

describe('PR14 Round 2 release gate contracts', () => {
  it('keeps the evidence manifest aligned with the exact Round 2 task and package registry scope', () => {
    expect(GATE_MANIFEST.reviewBaseCommit).toBe('25098332a354e9d169f62da6edf2d88f43066dbd')
    expect(GATE_MANIFEST.stimulusSets).toEqual(ROUND2_TASKS.map((testType) => ({
      id: testType,
      version: BASE_CONFIGS[testType].stimulusSetVersion,
    })))
    expect(GATE_MANIFEST.supportingArtifacts).toEqual([
      { id: 'wordlist.normalization', version: 'wordlist-normalization-v1.0.0' },
      { id: 'lexicaldecision.pseudoword-generator', version: 'zh-pseudoword-generator-v1.0.0' },
      { id: 'emotionrecognition.category', version: 'basic-emotion-6-v1.0.0' },
    ])
    expect(GATE_MANIFEST.multisourcePackages).toEqual([{
      key: MULTISOURCE_PACKAGE,
      version: '1.0.0',
      reviewedScaleCodes: ['adexi_v1'],
    }])
    expect(GATE_MANIFEST.candidatePackages).toEqual([
      ...CORE_PACKAGES.map((key) => ({ key, version: '1.0.0', kind: 'cognitive-only' })),
      { key: MULTISOURCE_PACKAGE, version: '1.0.0', kind: 'multisource' },
    ])
  })

  it('covers every Round 2 task with an exact Registry key, strict schema, Profile merge and frozen provenance', () => {
    const registry = listCognitiveRegistryEntries()
    for (const testType of ROUND2_TASKS) {
      const entry = getCognitiveRegistryEntry(testType, '1.0.0', '1.0.0')
      expect(entry, testType).toBeDefined()
      expect(entry?.testType, testType).toBe(testType)
      expect(entry?.recommendedForCreate, testType).toBe(false)
      expect(entry?.randomizationAlgorithmVersion, testType).toBeTruthy()
      expect(entry?.configSchema.safeParse({ ...BASE_CONFIGS[testType], __pr14Unknown: true }).success, testType)
        .toBe(false)

      for (const profile of ['experience', 'standard', 'research'] as const) {
        const freeze = freezeAssignmentProfile({ entry: entry!, baseConfig: BASE_CONFIGS[testType], profile })
        expect(entry!.configSchema.safeParse(freeze.resolvedConfig).success, `${testType}/${profile}`).toBe(true)
        expect(readFrozenReport(freeze.resolvedReportSnapshotEncrypted), `${testType}/${profile}`)
          .toMatchObject({ profile, randomizationAlgorithmVersion: entry!.randomizationAlgorithmVersion })
      }
    }

    const registeredRound2 = registry.filter((entry) => ROUND2_TASKS.includes(entry.testType))
    expect(registeredRound2.map((entry) => entry.testType).sort()).toEqual([...ROUND2_TASKS].sort())
  })

  it('keeps the PR14 package contracts fixed, versioned, and limited to the selected release mode', () => {
    const protocols = listAnalysisProtocolDefinitions()
    const packages = listReportPackageDefinitions()
    const packageByKey = new Map(packages.map((definition) => [definition.key, definition]))

    for (const packageKey of CORE_PACKAGES) {
      const protocol = protocols.find((candidate) => candidate.key === packageKey && candidate.version === '1.0.0')
      const definition = packageByKey.get(packageKey)
      expect(protocol, packageKey).toBeDefined()
      expect(definition, packageKey).toBeDefined()
      const expectedStatus = expectedPackageStatus(packageKey)
      expect(protocol).toMatchObject({ status: expectedStatus })
      if (expectedStatus === 'DRAFT') expect(protocol?.recommendedForCreate).toBe(false)
      expect(definition).toMatchObject({
        status: expectedStatus,
        analysisProtocolKey: packageKey,
        analysisProtocolVersion: '1.0.0',
        profiles: ['standard', 'research'],
      })
      if (expectedStatus === 'DRAFT') expect(definition?.disabledReason).toBeTruthy()
      else expect(definition?.disabledReason).toBeUndefined()
      expect(definition?.slots.map((slot) => slot.position)).toEqual(
        definition?.slots.map((_, index) => index),
      )

      for (const slot of definition?.slots ?? []) {
        if (!('testType' in slot)) continue
        const entry = getCognitiveRegistryEntry(slot.testType, slot.engineVersion, slot.scoringVersion)
        expect(entry, `${packageKey}/${slot.key}`).toBeDefined()
        expect(slot).toMatchObject({
          profileDefinitionVersion: entry?.profileDefinitionVersion,
          metricDefinitionVersion: entry?.metricDefinitionVersion,
          qualityDefinitionVersion: entry?.qualityDefinitionVersion,
          reportDefinitionVersion: entry?.reportDefinitionVersion,
        })
      }
    }

    const multisource = packageByKey.get(MULTISOURCE_PACKAGE)
    expect(multisource).toMatchObject({
      key: MULTISOURCE_PACKAGE,
      version: '1.0.0',
      status: expectedPackageStatus(MULTISOURCE_PACKAGE),
    })
    if (expectedPackageStatus(MULTISOURCE_PACKAGE) === 'DRAFT') expect(multisource?.disabledReason).toEqual(expect.any(String))
    else expect(multisource?.disabledReason).toBeUndefined()
    expect(multisource?.slots.map((slot) => slot.position)).toEqual(
      multisource?.slots.map((_, index) => index),
    )

    for (const definition of packages.filter((candidate) => isPr14Package(candidate.key))) {
      expect(definition.status, definition.key).toBe(expectedPackageStatus(definition.key))
      expect(JSON.stringify(definition), definition.key).not.toMatch(/overallScore|averageScore|percentile|\bIQ\b|诊断/i)
    }
  })

  it('freezes package/profile/version/slot identity and rejects every mismatch class', () => {
    const definition = getReportPackageDefinition('attention_stability_v1', '1.0.0')!
    const protocol = getAnalysisProtocolDefinition('attention_stability_v1', '1.0.0')!
    const items = cognitiveItemsFor('attention_stability_v1')
    const snapshot = buildFrozenReportPackageSnapshot(definition, protocol, items)

    expect(() => validateFrozenReportPackageSnapshot(
      snapshot,
      { ...definition, version: '9.9.9' },
      protocol,
      items,
    )).toThrow(/报告包快照与当前包版本不匹配/)
    expect(() => validateFrozenReportPackageSnapshot(
      snapshot,
      definition,
      { ...protocol, version: '9.9.9' },
      items,
    )).toThrow()
    expect(() => validateFrozenReportPackageSnapshot(
      snapshot,
      definition,
      protocol,
      items.map((item, index) => index === 0
        ? { ...item, position: 1 }
        : index === 1 ? { ...item, position: 0 } : item),
    )).toThrow(/协议任务版本不匹配|协议槽位不匹配/)
    expect(() => validateFrozenReportPackageSnapshot(
      snapshot,
      definition,
      protocol,
      items.map((item, index) => index === 0
        ? { ...item, cognitiveAssignment: { ...item.cognitiveAssignment!, profile: 'research' } }
        : item),
    )).toThrow()
  })

  it('preserves scale mapping hash/version and validates both frozen direction classes', () => {
    const definition = getReportPackageDefinition('inhibitory_control_multisource_v1', '1.0.0')!
    const protocol = getAnalysisProtocolDefinition('inhibitory_control_multisource_v1', '1.0.0')!
    const items = multisourceItems()
    const snapshot = buildFrozenReportPackageSnapshot(definition, protocol, items)
    const measurement = snapshot.analysisProtocolSnapshot.scaleMeasurements?.[0]
    if (!measurement) throw new Error('missing frozen scale measurement')

    expect(measurement).toMatchObject({
      mappingKey: 'adexi_v1.inhibition.response_inhibition.v1',
      mappingVersion: '1.0.0',
      scaleDefinitionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      mappingDirectionClass: 'more_difficulty',
    })

    // A historical snapshot can legitimately retain a reverse-direction
    // mapping after a new registry definition is introduced. The snapshot
    // validator must preserve that frozen meaning instead of consulting live
    // scale text or silently changing the direction.
    const reverse = { ...measurement, mappingDirectionClass: 'more_strength' as const }
    const validated = validateProtocolCompositeItems(protocol, items, {
      profile: snapshot.profile,
      measurements: snapshot.analysisProtocolSnapshot.cognitiveMeasurements,
      scaleMeasurements: [reverse],
    })
    expect(validated.scaleMeasurements[0]).toMatchObject(reverse)

    const changedItems = items.map((item) => item.id === 'item-adexi'
      ? { ...item, scale: { ...item.scale!, items: [{ ...item.scale!.items![0], content: 'changed' }] } }
      : item)
    expect(() => validateFrozenReportPackageSnapshot(snapshot, definition, protocol, changedItems))
      .toThrow(/协议量表冻结内容不匹配/)
  })

  it('keeps collection-only output parallel and descriptive without package or aggregate fields', () => {
    const report = projectCompositeCollectionReport({
      id: 'collection-report',
      assessmentId: 'collection-assessment',
      name: '自由组合测评',
      completedAt: null,
      totalTime: 0,
      backgroundValues: [],
      unitReports: [{
        itemId: 'unit-gonogo',
        type: 'COGNITIVE',
        kind: 'cognitive',
        label: 'Go/No-Go',
        testType: 'gonogo',
        finishedAt: null,
        singleTaskReport: {
          testType: 'gonogo',
          profile: 'standard',
          profileLabel: '标准',
          title: 'Go/No-Go',
          interpretable: true,
          qualityState: 'interpretable',
          qualityFlags: [],
          headline: null,
          primaryMetrics: [],
          secondaryMetrics: [],
          caveats: ['描述性反馈'],
          practicalTips: [],
          method: { testType: 'gonogo', profile: 'standard' },
          disclaimer: '非诊断性描述',
        },
      }],
    }, 'participant')

    expect(report).not.toHaveProperty('packageReport')
    expect(Object.keys(report)).not.toContain('modules')
    expect(report.unitReports).toHaveLength(1)
    expect(report).not.toHaveProperty('overallScore')
    expect(report).not.toHaveProperty('averageScore')
    expect(JSON.stringify(report)).not.toMatch(/overallScore|averageScore|percentile|\bIQ\b|诊断建议/i)
  })

  it('keeps PR12/PR13 tasks and limits package publication to the selected candidate', () => {
    for (const testType of DRAFT_ONLY_TASKS) {
      const entry = getCognitiveRegistryEntry(testType, '1.0.0', '1.0.0')!
      expect(entry.recommendedForCreate, testType).toBe(false)
    }
    for (const packageKey of PR14_PACKAGE_KEYS) {
      const definition = listReportPackageDefinitions().find((candidate) => candidate.key === packageKey)
      expect(definition?.status, packageKey).toBe(expectedPackageStatus(packageKey))
    }
  })

  it('does not let a future published package expand the PR14-specific assertions', () => {
    const futurePackage = {
      key: 'future_package_v1',
      version: '1.0.0',
      status: 'PUBLISHED',
      recommendedForCreate: true,
    }
    const scopedPackages = [...listReportPackageDefinitions(), futurePackage].filter((definition) => isPr14Package(definition.key))

    expect(isPr14Package(futurePackage.key)).toBe(false)
    expect(scopedPackages.some((definition) => definition.key === futurePackage.key)).toBe(false)
    expect(scopedPackages.map((definition) => definition.key).sort()).toEqual([...PR14_PACKAGE_KEYS].sort())
  })
})
