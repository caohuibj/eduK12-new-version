import { GENERATED_SITUATIONAL_INSTRUMENT_SOURCES } from '../../../modules/situational/onboarding/instruments.generated'
import { instrumentSourceSchema, publicationContentDigest } from '../../../modules/situational/onboarding/schema'
import { SJT_BRANCHING_E2E_PACKAGE } from '../../../modules/situational/packages/sjt-branching-e2e-fixture'
export function unknownSource(version: 1 | 2 = 1) {
  const source = instrumentSourceSchema.parse(structuredClone(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES[0]))
  source.content.identity = { instrumentKey: `test-unknown-sjt-v${version}`, instrumentVersion: '1.0.0' }
  if (version === 2) { source.content.definition = structuredClone(SJT_BRANCHING_E2E_PACKAGE.definition); source.content.goldenCases = structuredClone(SJT_BRANCHING_E2E_PACKAGE.goldenCases)
    source.content.definition.scenes = source.content.definition.scenes.map(scene => ({ ...scene, stimulus: { type: 'TEXT_V1' as const, text: scene.stimulus.text! } }))
    const expected = (value: number | null) => ({ quality: value === null ? 'invalid' as const : 'interpretable' as const, metrics: { 'bfi2.assertiveness.behavior': value }, metricKeys: ['bfi2.assertiveness.behavior'] })
    const r = (sceneKey: string, responseValue: string) => ({ sceneKey, channelKey: 'behavior', responseValue })
    source.content.goldenCases.push(
      { name: 'early-terminal', responses: [r('BR-01', 'B')], expected: expected(null) },
      { name: 'nested-c-terminal', responses: [r('BR-01', 'C'), r('BR-03', 'C')], expected: expected(null) },
      { name: 'nested-d-terminal', responses: [r('BR-01', 'C'), r('BR-03', 'D')], expected: expected(null) },
      { name: 'nested-b-round2', responses: [r('BR-01', 'C'), r('BR-03', 'B'), r('BR-04', 'A')], expected: expected(1.5) },
      { name: 'entry-d-long', responses: [r('BR-01', 'D'), r('BR-02', 'A'), r('BR-03', 'A'), r('BR-04', 'A')], expected: expected(1.5) },
    )
  }
  source.publication = { releaseStatus: 'DRAFT' }
  return source
}
export const publish = (source: ReturnType<typeof unknownSource>) => {
  source.publication = { releaseStatus: 'PUBLISHED', review: { kind: 'github-review', reviewUrl: 'https://github.com/caohuibj/eduK12-new-version/pull/999#pullrequestreview-123', contentDigest: publicationContentDigest(source.content) } }
  return source
}

