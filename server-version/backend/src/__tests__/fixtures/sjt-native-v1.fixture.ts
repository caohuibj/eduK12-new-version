import { scientificSchema } from '../../modules/situational/onboarding/scientific-schema'
import { validateSituationPackage, type SituationPackageV1 } from '../../modules/situational/situation-package'
import { situationDefinitionSchema } from '../../modules/situational/situation-definition'
import type { SituationalFinalSubmitInput } from '../../modules/situational/situational-final-submit.schema'
import { sjtNativeStagedTemplate } from './sjt-native-staged.fixture'

export const SJT_NATIVE_V1_FIXTURE_KEY = 'synthetic-student-native-v1-text'

/**
 * Original repository-authored synthetic material, not a licensed catalog copy.
 * Only the original staged fixture's author/source/license and classroom prose
 * are reused. This is independently defined V1 scalar content, NOT a V2 model
 * conversion or a claim of scientific equivalence. V1's existing scorer takes
 * the mean of two contributions: PLAN A=2/B=0 and REVIEW A=3/B=1.
 * Its new complete definition and literal golden cases use the shared validator.
 * DRAFT is deliberate: tests alone may mock this exact synthetic identity as
 * PUBLISHED. That is not an actual registry release or authorization proof.
 */
export function createSjtNativeV1Package(key = SJT_NATIVE_V1_FIXTURE_KEY): SituationPackageV1 {
  const original = structuredClone(sjtNativeStagedTemplate)
  const definition = situationDefinitionSchema.parse({
    schemaVersion: 1,
    respondentType: original.respondentType,
    source: { title: 'Original synthetic classroom display V1 scalar fixture',
      citation: `${original.author}；${original.sourceNote}` },
    license: { status: original.licenseStatus, redistribution: original.redistribution, note: original.sourceNote },
    sampling: { strategy: 'ALL' },
    scenes: original.nodes.map((node, sortOrder) => ({
      sceneKey: node.nodeKey,
      title: node.title,
      sortOrder,
      stimulus: { type: 'TEXT_V1', text: node.stimulus },
      primaryConstruct: 'synthetic_coordination',
      secondaryConstructs: [],
      situationFeatures: {},
      channels: [{ channelKey: 'ACTION', purpose: 'BEHAVIOR_TENDENCY', responseType: 'SINGLE_CHOICE',
        scoredConstruct: 'synthetic_coordination', prompt: 'Choose one fictional action.',
        options: original.options.filter(option => option.questionKey === `${node.nodeKey}_CHOICE`
          && (option.optionKey === 'A' || option.optionKey === 'B')).map(option => ({ optionKey: option.optionKey, label: option.label })) }],
    })),
    scoring: { scoringVersion: 'synthetic-v1-scalar-mean-1',
      choiceScores: [
        { sceneKey: 'PLAN', channelKey: 'ACTION', optionKey: 'A', contribution: 2 },
        { sceneKey: 'PLAN', channelKey: 'ACTION', optionKey: 'B', contribution: 0 },
        { sceneKey: 'REVIEW', channelKey: 'ACTION', optionKey: 'A', contribution: 3 },
        { sceneKey: 'REVIEW', channelKey: 'ACTION', optionKey: 'B', contribution: 1 },
      ],
      publishedMetrics: [{ key: 'coordination', label: 'Synthetic action mean', construct: 'synthetic_coordination',
        channelKey: 'ACTION', direction: 'descriptive', role: 'primary', displayPrecision: 1 }],
    },
    report: { reportVersion: 'synthetic-v1-report-1', primaryMetricKeys: ['coordination'], metricOrder: ['coordination'],
      interpretations: [{ metricKey: 'coordination', headline: 'Synthetic action mean',
        summary: 'The arithmetic mean of two arbitrary fixture contributions. This value describes only this software test and is not a measure of coordination ability.',
        bands: [], guidance: [] }],
      limitations: ['Synthetic arbitrary scalar values only; no validated construct, norms or diagnostic claim.'],
      disclaimer: original.disclaimer },
    referencePolicy: { type: 'none' },
  })
  const golden = (name: string, first: 'A' | 'B', second: 'A' | 'B' | null, expected: number | null): SituationPackageV1['goldenCases'][number] => ({
    name,
    responses: [{ sceneKey: 'PLAN', channelKey: 'ACTION', responseValue: first },
      ...(second === null ? [] : [{ sceneKey: 'REVIEW', channelKey: 'ACTION', responseValue: second }])],
    expected: { quality: expected === null ? 'invalid' : 'interpretable', metricKeys: ['coordination'], metrics: { coordination: expected } },
  })
  return {
    key,
    instrumentVersion: original.instrumentVersion,
    releaseStatus: 'DRAFT',
    definition,
    // Independent hand calculation, never derive expected values from a scorer.
    goldenCases: [golden('path-A-A', 'A', 'A', 2.5), golden('path-A-B', 'A', 'B', 1.5),
      golden('path-B-A', 'B', 'A', 1.5), golden('path-B-B', 'B', 'B', 0.5),
      golden('missing-review', 'A', null, null)],
  }
}

export function compileSjtNativeV1Fixture(key = SJT_NATIVE_V1_FIXTURE_KEY) {
  const pkg = createSjtNativeV1Package(key)
  const validation = validateSituationPackage(pkg)
  if (!validation.valid) {
    throw new Error('Synthetic V1 fixture contract failed: ' + JSON.stringify(validation.issues))
  }
  return { package: pkg, definitionHash: validation.definitionHash, validation }
}

/** An explicit test-only PILOT declaration, with no claimed scientific evidence. */
export function createSjtNativeV1ScientificDeclaration() {
  return scientificSchema.parse({
    schemaVersion: 1,
    scientificMaturity: 'PILOT',
    governanceRevision: 1,
    claimScope: {
      language: 'en',
      population: 'Synthetic test participants only',
      use: 'Software contract testing only',
      claim: 'Arbitrary hand-authored fixture scores, not a validated measurement',
    },
    evidence: [],
    knownLimitations: [
      'Synthetic registry mock only; no actual registry publication or distribution authorization is asserted.',
      'No scientific validation, norms, real participants or third-party assessment content.',
    ],
  })
}

/** V1 uses raw answers only. Never fabricate stage history or researchCapture. */
export function createSjtNativeV1FinalFixture(
  attemptId = 'synthetic-native-v1-attempt',
  caseName = 'path-A-A',
  compiled = compileSjtNativeV1Fixture(),
) {
  const golden = compiled.package.goldenCases.find(candidate => candidate.name === caseName)
  if (!golden) throw new Error(`Unknown synthetic V1 golden case: ${caseName}`)
  const responses = structuredClone(golden.responses)
  const finalInput: SituationalFinalSubmitInput = {
    submissionId: 'synthetic-native-v1-final',
    attemptEpoch: 1,
    definitionHash: compiled.definitionHash,
    instrumentVersion: compiled.package.instrumentVersion,
    scoringVersion: compiled.package.definition.scoring.scoringVersion,
    responses,
  }
  return { attemptId, compiled, definition: compiled.package.definition, responses, finalInput,
    expected: structuredClone(golden.expected) }
}
