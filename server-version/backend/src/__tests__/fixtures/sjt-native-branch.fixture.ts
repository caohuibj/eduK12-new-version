import {
  assertSjtReleaseReady,
  compileSjtTemplate,
  type SjtAuthorTemplate,
} from '../../modules/situational/authoring/template'
import { deriveAuthoritativeSituationalTrajectory } from '../../modules/situational/situation-trajectory'
import {
  createSjtNativeStagedFinalFixture,
  sjtNativeStagedTemplate,
} from './sjt-native-staged.fixture'

type BranchChoice = 'A' | 'B' | 'U'
type FollowUpNode = 'REVIEW' | 'SOLO_REVIEW'
type ProbeChoice = 'CHECK' | 'ASK'

const branchGolden = (
  name: string,
  choice: BranchChoice,
  followUp: { nodeKey: FollowUpNode; choice: 'A' | 'B' } | null,
  expected: number | null,
  probes?: [ProbeChoice, ProbeChoice],
): SjtAuthorTemplate['cases'][number] => ({
  name,
  responses: [
    { nodeKey: 'PLAN', questionKey: 'PLAN_CHOICE', responseValue: choice },
    ...(probes ? [{ nodeKey: 'PLAN', questionKey: 'PLAN_PROBE', responseValue: probes[0] }] : []),
    ...(followUp ? [
      { nodeKey: followUp.nodeKey, questionKey: `${followUp.nodeKey}_CHOICE`, responseValue: followUp.choice },
      ...(probes ? [{ nodeKey: followUp.nodeKey, questionKey: `${followUp.nodeKey}_PROBE`, responseValue: probes[1] }] : []),
    ] : []),
  ],
  expected: { coordination: expected },
})

/** Independent logical-path oracle, not reconstructed from the compiled graph. */
export const sjtNativeBranchExpectedPaths: Record<string, string[]> = {
  'path-A-A': ['PLAN', 'REVIEW', 'END'],
  'path-A-B': ['PLAN', 'REVIEW', 'END'],
  'path-B-A': ['PLAN', 'SOLO_REVIEW', 'END'],
  'path-B-B': ['PLAN', 'SOLO_REVIEW', 'END'],
  'path-U': ['PLAN', 'END'],
  'optional-probes-skipped': ['PLAN', 'SOLO_REVIEW', 'END'],
}

/**
 * Test-only extension of our newly authored, redistribution-allowed fixture.
 * PLAN A and B lead to different administered scenes; U is an explicitly
 * authored refusal leading directly to END. Only reachable contributions count:
 * PLAN A=2/B=0, REVIEW A=3/B=1, SOLO_REVIEW A=4/B=2. U means null, not zero.
 * These arbitrary values are software oracles, not validated ability measures.
 */
function buildBranchTemplate(): SjtAuthorTemplate {
  const template = structuredClone(sjtNativeStagedTemplate)
  template.instrumentKey = 'synthetic-student-native-branch'
  template.title = 'Synthetic student teamwork divergent branch fixture'
  template.sourceNote = 'Newly self-authored synthetic test material, extended only from the repository synthetic staged fixture. Redistribution is allowed. No third-party assessment content or participant data is included.'
  template.nodes.push({
    nodeKey: 'SOLO_REVIEW',
    motherSceneKey: 'TEAM_PROJECT',
    title: 'Check the panel you started',
    stimulus: 'Your fictional team has not compared its panels yet. On the panel you started, two drawings have no labels. What would you do next?',
  })
  template.questions.push(
    { nodeKey: 'SOLO_REVIEW', questionKey: 'SOLO_REVIEW_CHOICE', prompt: 'Choose how to check the missing labels.', kind: 'CORE', purpose: 'BEHAVIOR_TENDENCY', required: true, order: 0 },
    { nodeKey: 'SOLO_REVIEW', questionKey: 'SOLO_REVIEW_PROBE', prompt: 'After confirming that action, where would you check the label information?', kind: 'NOMINAL', purpose: 'APPRAISAL', required: false, order: 1 },
  )
  // The two downstream cores have only A/B. PLAN has its own explicit refusal.
  template.options = template.options.filter((option) => !(option.questionKey === 'REVIEW_CHOICE' && option.optionKey === 'U'))
  const refusal = template.options.find((option) => option.questionKey === 'PLAN_CHOICE' && option.optionKey === 'U')!
  refusal.label = 'I prefer not to answer this fictional situation.'
  refusal.nonanswerReason = 'DECLINED'
  template.options.push(
    { questionKey: 'SOLO_REVIEW_CHOICE', optionKey: 'A', label: 'Compare the drawings with the team and agree on labels.' },
    { questionKey: 'SOLO_REVIEW_CHOICE', optionKey: 'B', label: 'Choose labels yourself without comparing the other panel.' },
    { questionKey: 'SOLO_REVIEW_PROBE', optionKey: 'CHECK', label: 'Check the shared list of display topics.' },
    { questionKey: 'SOLO_REVIEW_PROBE', optionKey: 'ASK', label: 'Ask a teammate to explain the drawing labels.' },
  )
  template.transitions = [
    { nodeKey: 'PLAN', optionKey: 'A', nextNodeKey: 'REVIEW', bridgeText: 'The team meets to review both drafts together.' },
    { nodeKey: 'PLAN', optionKey: 'B', nextNodeKey: 'SOLO_REVIEW', bridgeText: 'You pause to look at the panel you started.' },
    { nodeKey: 'PLAN', optionKey: 'U', nextNodeKey: 'END', bridgeText: '' },
    { nodeKey: 'REVIEW', optionKey: 'A', nextNodeKey: 'END', bridgeText: '' },
    { nodeKey: 'REVIEW', optionKey: 'B', nextNodeKey: 'END', bridgeText: '' },
    { nodeKey: 'SOLO_REVIEW', optionKey: 'A', nextNodeKey: 'END', bridgeText: '' },
    { nodeKey: 'SOLO_REVIEW', optionKey: 'B', nextNodeKey: 'END', bridgeText: '' },
  ]
  template.opportunities.push({ nodeKey: 'SOLO_REVIEW', metricKey: 'coordination', applicability: 'OPPORTUNITY' })
  template.scores.push(
    { nodeKey: 'SOLO_REVIEW', optionKey: 'A', metricKey: 'coordination', contribution: 4 },
    { nodeKey: 'SOLO_REVIEW', optionKey: 'B', metricKey: 'coordination', contribution: 2 },
  )
  template.feedback = template.feedback.filter((fragment) => !(fragment.questionKey === 'REVIEW_CHOICE' && fragment.optionKey === 'U'))
  template.feedback.find((fragment) => fragment.questionKey === 'PLAN_CHOICE' && fragment.optionKey === 'U')!.text = 'You chose not to answer the planning situation; no follow-up situation was administered.'
  template.feedback.push(
    { questionKey: 'SOLO_REVIEW_CHOICE', optionKey: 'A', kind: 'ACTION', text: 'You chose to discuss the drawings and labels with the team.' },
    { questionKey: 'SOLO_REVIEW_CHOICE', optionKey: 'B', kind: 'ACTION', text: 'You chose labels without comparing the other panel.' },
    { questionKey: 'SOLO_REVIEW_PROBE', optionKey: 'CHECK', kind: 'PROBE', text: 'You identified the shared topic list as a source for checking labels.' },
    { questionKey: 'SOLO_REVIEW_PROBE', optionKey: 'ASK', kind: 'PROBE', text: 'You identified a teammate as a source for checking labels.' },
  )
  template.cases = [
    // Complete core-path coverage, with explicit independent arithmetic.
    branchGolden('path-A-A', 'A', { nodeKey: 'REVIEW', choice: 'A' }, 5, ['CHECK', 'ASK']),
    branchGolden('path-A-B', 'A', { nodeKey: 'REVIEW', choice: 'B' }, 3, ['ASK', 'CHECK']),
    branchGolden('path-B-A', 'B', { nodeKey: 'SOLO_REVIEW', choice: 'A' }, 4, ['CHECK', 'ASK']),
    branchGolden('path-B-B', 'B', { nodeKey: 'SOLO_REVIEW', choice: 'B' }, 2, ['ASK', 'CHECK']),
    branchGolden('path-U', 'U', null, null),
    branchGolden('optional-probes-skipped', 'B', { nodeKey: 'SOLO_REVIEW', choice: 'A' }, 4),
  ]
  return template
}

export const sjtNativeBranchTemplate = buildBranchTemplate()

export function createSjtNativeBranchTemplate(): SjtAuthorTemplate {
  return structuredClone(sjtNativeBranchTemplate)
}

/** Real formal-upload compilation and readiness gate; remains an unregistered DRAFT. */
export function compileSjtNativeBranchFixture() {
  const compiled = compileSjtTemplate(createSjtNativeBranchTemplate())
  assertSjtReleaseReady(compiled)
  if (compiled.package.definition.schemaVersion !== 2) {
    throw new Error('Synthetic branch fixture must compile to definition V2')
  }
  return { ...compiled, package: { ...compiled.package, definition: compiled.package.definition } }
}

export function createSjtNativeBranchPackage() {
  return compileSjtNativeBranchFixture().package
}

/** Reuse the existing trajectory/history/capture builder, not a parallel protocol. */
export function createSjtNativeBranchFinalFixture(
  attemptId = 'synthetic-native-branch-attempt',
  caseName = 'path-A-A',
  compiled = compileSjtNativeBranchFixture(),
) {
  const fixture = createSjtNativeStagedFinalFixture(attemptId, caseName, compiled)
  const expectedLogicalPath = sjtNativeBranchExpectedPaths[caseName]
  if (!expectedLogicalPath) throw new Error(`Unknown synthetic branch path oracle: ${caseName}`)
  return {
    ...fixture,
    trajectory: deriveAuthoritativeSituationalTrajectory(fixture.definition, fixture.responses),
    expectedLogicalPath: [...expectedLogicalPath],
    finalInput: { ...fixture.finalInput, submissionId: `synthetic-native-branch-final-${caseName}` },
  }
}

/** All five branch-choice paths plus optional-probe omission, compiled only once. */
export function createSjtNativeBranchFinalFixtures(
  attemptId = 'synthetic-native-branch-attempt',
  compiled = compileSjtNativeBranchFixture(),
) {
  return compiled.package.goldenCases.map((golden) => ({
    caseName: golden.name,
    ...createSjtNativeBranchFinalFixture(attemptId, golden.name, compiled),
  }))
}

/**
 * Deliberately invalid derivatives for rejection tests, never completed attempts.
 * The off-path answer is a real SOLO_REVIEW channel added to an A path without
 * history metadata, isolating unreachable-response rejection from stale history.
 * The second derivative omits exactly one required probe-exposure event.
 */
export function createSjtNativeBranchInvalidFinalFixtures(
  attemptId = 'synthetic-native-branch-attempt',
  compiled = compileSjtNativeBranchFixture(),
) {
  const valid = createSjtNativeBranchFinalFixture(attemptId, 'path-A-A', compiled)
  const otherPath = createSjtNativeBranchFinalFixture(attemptId, 'path-B-A', compiled)
  const otherAnswer = otherPath.responses.find((response) => response.channelKey === 'SOLO_REVIEW_CHOICE')
  const omittedEventIndex = valid.researchCapture.events.findIndex((event) => event.type === 'PROBE_EXPOSED')
  if (!otherAnswer || omittedEventIndex < 0) throw new Error('Synthetic branch negative fixture lacks its source evidence')
  const offPathAnswer = {
    sceneKey: otherAnswer.sceneKey,
    channelKey: otherAnswer.channelKey,
    responseValue: otherAnswer.responseValue,
  }
  return {
    valid,
    offPathAnswer,
    offPath: {
      ...structuredClone(valid.finalInput),
      responses: [...structuredClone(valid.responses), offPathAnswer],
    },
    omittedEvent: structuredClone(valid.researchCapture.events[omittedEventIndex]!),
    missingProbeExposure: {
      ...structuredClone(valid.finalInput),
      researchCapture: {
        ...structuredClone(valid.researchCapture),
        events: valid.researchCapture.events.filter((_event, index) => index !== omittedEventIndex).map((event) => ({ ...event })),
      },
    },
  }
}
