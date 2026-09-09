import { describe, expect, it } from 'vitest'
import {
  buildSituationalBundleBridge,
  createCanonicalUnitResultEnvelope,
  projectSituationCanonicalUnitResult,
} from '../../modules/assessment-runtime/unit-result'
import { compileSituationRuntime } from '../../modules/assessment-runtime/compiler'
import { projectSituationalEvidenceItems } from '../../modules/assessment-bundle/report-facts'
import { projectBundleSituationalSourceFromCanonicalBridge } from '../../modules/assessment-bundle/sources'
import { scoreSituational } from '../../modules/situational/situation-scoring'
import { validateSituationPackage } from '../../modules/situational/situation-package.registry'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const buildEnvelope = () => {
  const situationPackage = SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE
  const validation = validateSituationPackage(situationPackage)
  if (!validation.valid) throw new Error('fixture package must be valid')
  const runtime = compileSituationRuntime({
    instrumentKey: situationPackage.key,
    instrumentVersion: situationPackage.instrumentVersion,
    definition: situationPackage.definition,
    sourceDefinitionHash: validation.definitionHash,
  })
  const result = scoreSituational(situationPackage.definition, [
    { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' },
    { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'B' },
  ])
  const core = projectSituationCanonicalUnitResult({ result, runtime, contextHash: null })
  return createCanonicalUnitResultEnvelope({
    core,
    completedAt: '2026-09-09T00:00:00.000Z',
    persistenceProvenance: {
      sourceType: 'SITUATIONAL_ATTEMPT',
      sourceAttemptId: 'situational-attempt-1',
      sourceSubmissionId: 'situational-submission-1',
    },
    bundleBridge: buildSituationalBundleBridge(result),
  })
}

describe('Situational Bundle integration contract', () => {
  it('projects only canonical Construct × Channel metrics into Bundle evidence', () => {
    const envelope = buildEnvelope()
    const source = projectBundleSituationalSourceFromCanonicalBridge({
      slotKey: 'situational:item-1',
      expectedInstrumentKey: 'sjt-assertiveness-golden',
      expectedInstrumentVersion: '1.0.0',
      envelope,
    })
    const [evidence] = projectSituationalEvidenceItems({
      source,
      metricKeys: ['bfi2.assertiveness.behavior'],
    })

    expect(evidence).toMatchObject({
      constructKey: 'sjt_assertiveness_golden.bfi2.assertiveness.behavior',
      source: {
        kind: 'SITUATIONAL_METRIC',
        slotKey: 'situational:item-1',
        metricKey: 'bfi2.assertiveness.behavior',
      },
      value: { state: 'present' },
      quality: 'interpretable',
    })
    expect(JSON.stringify(evidence)).not.toMatch(/sceneKey|optionKey|responseTime|choiceScores|percentile/i)
  })

  it('fails closed on a mismatched frozen instrument identity', () => {
    const envelope = buildEnvelope()
    expect(() => projectBundleSituationalSourceFromCanonicalBridge({
      slotKey: 'situational:item-1',
      expectedInstrumentKey: 'sjt-other',
      expectedInstrumentVersion: '1.0.0',
      envelope,
    })).toThrow(/identity/)
  })
})
