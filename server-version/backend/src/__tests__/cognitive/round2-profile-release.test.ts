import { describe, expect, it } from 'vitest'
import release from '../../../releases/cognitive-round2-pilot-2026-09-22.json'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { freezeAssignmentProfile, mergeProfileConfig, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { resolveParticipantPresentation } from '../../modules/cognitive/participant-presentation'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { flankerSequence } from '../../modules/cognitive/randomization'

const profiles = ['experience', 'standard', 'research'] as const
const doseKeys: Record<string, string> = {
  patterncompare: 'durationSec', flanker: 'totalTrials', cardsort: 'totalTrials',
  digitbackward: 'maxSpan', picturesequence: 'itemCount', pairedassociate: 'pairCount',
  matrix: 'itemCount', mentalrotation: 'totalTrials', tower: 'problemCount',
  trailmaking: 'partAItemCount', reversallearning: 'totalTrials', bart: 'balloonCount',
  wordlist: 'listLength', lexicaldecision: 'totalTrials', emotionrecognition: 'totalTrials',
}

describe('Round 2 release profile and participant report acceptance', () => {
  for (const identity of release.configs) {
    it(`${identity.testType}: resolves three doses and freezes honest, readable PILOT reports`, () => {
      const entry = requireCognitiveRegistryEntry(identity.testType, identity.engineVersion, identity.scoringVersion)
      const seed = COGNITIVE_SEEDS.find(s => s.testType === identity.testType && s.configVersion === identity.configVersion)!
      expect(seed).toBeDefined()
      const presentation = resolveParticipantPresentation(entry)!
      const doses = profiles.map((profile, index) => {
        const resolved = mergeProfileConfig(entry, seed.config, profile) as Record<string, unknown>
        const frozen = readFrozenReport(freezeAssignmentProfile({ entry, baseConfig: seed.config, profile }).resolvedReportSnapshotEncrypted)!
        expect(frozen.profileLabel).toBe(['体验版', '正式版', '研究版'][index])
        expect(frozen.protocolTier).toBe('PILOT')
        const display = presentation.protocols[profile]!
        expect(display.reportCaveats.join(' ')).toContain(String(resolved[doseKeys[identity.testType]]))
        expect(display.participantConclusion).not.toMatch(/Research Ready|RESEARCH_GRADE|年龄常模分数/)
        const report = buildCognitiveSingleTaskReport({ ...identity, profile, frozenReport: frozen, score: 50, metrics: {}, qualityFlags: { interpretable: false }, reference: null })!
        expect(report.profileLabel).toBe(frozen.profileLabel)
        expect(report.headline).toBeNull()
        expect(report.productIndex).toBeNull()
        return Number(resolved[doseKeys[identity.testType]])
      })
      expect(doses[0]).toBeLessThanOrEqual(doses[1])
      expect(doses[1]).toBeLessThan(doses[2])
      for (const metric of Object.values(presentation.metrics)) {
        expect(metric.explanation?.length).toBeGreaterThan(5)
        expect(metric.singleExplanation?.length).toBeGreaterThan(5)
      }
    })
  }
  it('balances both target directions and congruency even in the shortest Flanker profile', () => {
    for (const total of [24, 80, 160]) {
      for (let seed = 0; seed < 32; seed++) {
        const trials = flankerSequence(`release-dose-${seed}`, total)
        for (const direction of ['left', 'right']) for (const flank of ['left', 'right']) {
          expect(trials.filter(t => t.targetDirection === direction && t.flankerDirection === flank)).toHaveLength(total / 4)
        }
      }
    }
  })
})
