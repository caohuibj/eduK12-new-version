import {
  assertSjtReleaseReady,
  compileSjtTemplate,
  type SjtAuthorTemplate,
} from '../../modules/situational/authoring/template'
import { deriveSituationalAssignment } from '../../modules/situational/situation-assignment'
import {
  situationalResponseHistoryIdentities,
  validateSituationalResearchCapture,
} from '../../modules/situational/situation-research-capture'
import type { SituationalResearchCapture } from '../../modules/situational/situation-scientific-contract'
import type { SituationalResponse } from '../../modules/situational/situation-scoring'
import { deriveAuthoritativeSituationalTrajectory } from '../../modules/situational/situation-trajectory'
import type { SituationalFinalSubmitInput } from '../../modules/situational/situational-final-submit.schema'

type CoreChoice = 'A' | 'B' | 'U'
type ProbeChoice = 'CHECK' | 'ASK'

const goldenCase = (
  name: string,
  firstChoice: CoreChoice,
  secondChoice: CoreChoice,
  expected: number | null,
  probes?: [ProbeChoice, ProbeChoice],
): SjtAuthorTemplate['cases'][number] => ({
  name,
  responses: [
    { nodeKey: 'PLAN', questionKey: 'PLAN_CHOICE', responseValue: firstChoice },
    ...(probes
      ? [{ nodeKey: 'PLAN', questionKey: 'PLAN_PROBE', responseValue: probes[0] }]
      : []),
    { nodeKey: 'REVIEW', questionKey: 'REVIEW_CHOICE', responseValue: secondChoice },
    ...(probes
      ? [{ nodeKey: 'REVIEW', questionKey: 'REVIEW_PROBE', responseValue: probes[1] }]
      : []),
  ],
  expected: { coordination: expected },
})

/**
 * Freshly authored synthetic content for tests only, not a validated instrument.
 * No text, scoring keys or licensing assertions are copied from catalog packages.
 * The independent oracle is PLAN A=2/B=0 plus REVIEW A=3/B=1; either U means
 * the metric is not calculable, never zero. Probe responses do not contribute.
 */
export const sjtNativeStagedTemplate: SjtAuthorTemplate = {
  templateVersion: 'sjt-upload-v1',
  instrumentKey: 'synthetic-student-native-staged',
  instrumentVersion: '1.0.0',
  title: 'Synthetic student teamwork staged fixture',
  respondentType: 'student_self_report',
  entryNodeKey: 'PLAN',
  author: 'Repository test fixture authors',
  sourceNote: 'Newly self-authored synthetic test material. Redistribution is allowed. No third-party assessment content or participant data is included.',
  disclaimer: 'For software contract testing only. These arbitrary example scores do not measure ability and must not inform educational or personnel decisions.',
  licenseStatus: 'self_authored',
  redistribution: 'allowed',
  nodes: [
    {
      nodeKey: 'PLAN',
      motherSceneKey: 'TEAM_PROJECT',
      title: 'Plan a classroom display',
      stimulus: 'Your fictional student team has two blank display panels and has not yet divided the work. What would you do first?',
    },
    {
      nodeKey: 'REVIEW',
      motherSceneKey: 'TEAM_PROJECT',
      title: 'Review the shared display',
      stimulus: 'The fictional team now has a draft for each panel. One title appears on both drafts. What would you do next?',
    },
  ],
  questions: [
    { nodeKey: 'PLAN', questionKey: 'PLAN_CHOICE', prompt: 'Choose your first action.', kind: 'CORE', purpose: 'BEHAVIOR_TENDENCY', required: true, order: 0 },
    { nodeKey: 'PLAN', questionKey: 'PLAN_PROBE', prompt: 'After confirming that action, which information would you look for?', kind: 'NOMINAL', purpose: 'APPRAISAL', required: false, order: 1 },
    { nodeKey: 'REVIEW', questionKey: 'REVIEW_CHOICE', prompt: 'Choose your next action.', kind: 'CORE', purpose: 'BEHAVIOR_TENDENCY', required: true, order: 0 },
    { nodeKey: 'REVIEW', questionKey: 'REVIEW_PROBE', prompt: 'After confirming that action, how would you check the next step?', kind: 'NOMINAL', purpose: 'APPRAISAL', required: false, order: 1 },
  ],
  options: [
    { questionKey: 'PLAN_CHOICE', optionKey: 'A', label: 'Ask the team to agree on a task for each panel.' },
    { questionKey: 'PLAN_CHOICE', optionKey: 'B', label: 'Start drawing one panel without discussing the division.' },
    { questionKey: 'PLAN_CHOICE', optionKey: 'U', label: 'I cannot judge this fictional situation.', nonanswerReason: 'UNABLE_TO_JUDGE' },
    { questionKey: 'PLAN_PROBE', optionKey: 'CHECK', label: 'Check the written display instructions.' },
    { questionKey: 'PLAN_PROBE', optionKey: 'ASK', label: 'Ask a teammate what information they have.' },
    { questionKey: 'REVIEW_CHOICE', optionKey: 'A', label: 'Compare both drafts with the team and agree on distinct titles.' },
    { questionKey: 'REVIEW_CHOICE', optionKey: 'B', label: 'Change your own title without checking the other draft.' },
    { questionKey: 'REVIEW_CHOICE', optionKey: 'U', label: 'I cannot judge this fictional situation.', nonanswerReason: 'UNABLE_TO_JUDGE' },
    { questionKey: 'REVIEW_PROBE', optionKey: 'CHECK', label: 'Read the revised drafts side by side.' },
    { questionKey: 'REVIEW_PROBE', optionKey: 'ASK', label: 'Ask each teammate to describe the agreed next step.' },
  ],
  // A shared neutral bridge deliberately makes all first choices converge.
  // REVIEW histories must still differ when the upstream choice differs.
  transitions: [
    { nodeKey: 'PLAN', optionKey: 'A', nextNodeKey: 'REVIEW', bridgeText: 'Later, the team meets to review the two drafts.' },
    { nodeKey: 'PLAN', optionKey: 'B', nextNodeKey: 'REVIEW', bridgeText: 'Later, the team meets to review the two drafts.' },
    { nodeKey: 'PLAN', optionKey: 'U', nextNodeKey: 'REVIEW', bridgeText: 'Later, the team meets to review the two drafts.' },
    { nodeKey: 'REVIEW', optionKey: 'A', nextNodeKey: 'END', bridgeText: '' },
    { nodeKey: 'REVIEW', optionKey: 'B', nextNodeKey: 'END', bridgeText: '' },
    { nodeKey: 'REVIEW', optionKey: 'U', nextNodeKey: 'END', bridgeText: '' },
  ],
  metrics: [
    { metricKey: 'coordination', label: 'Synthetic coordination total', construct: 'synthetic_coordination', role: 'primary' },
  ],
  opportunities: [
    { nodeKey: 'PLAN', metricKey: 'coordination', applicability: 'OPPORTUNITY' },
    { nodeKey: 'REVIEW', metricKey: 'coordination', applicability: 'OPPORTUNITY' },
  ],
  scores: [
    { nodeKey: 'PLAN', optionKey: 'A', metricKey: 'coordination', contribution: 2 },
    { nodeKey: 'PLAN', optionKey: 'B', metricKey: 'coordination', contribution: 0 },
    { nodeKey: 'REVIEW', optionKey: 'A', metricKey: 'coordination', contribution: 3 },
    { nodeKey: 'REVIEW', optionKey: 'B', metricKey: 'coordination', contribution: 1 },
  ],
  feedback: [
    { questionKey: 'PLAN_CHOICE', optionKey: 'A', kind: 'ACTION', text: 'You chose to discuss the division of work before starting.' },
    { questionKey: 'PLAN_CHOICE', optionKey: 'B', kind: 'ACTION', text: 'You chose to begin drawing before discussing the division of work.' },
    { questionKey: 'PLAN_CHOICE', optionKey: 'U', kind: 'ACTION', text: 'You did not provide an action judgment for the planning situation.' },
    { questionKey: 'PLAN_PROBE', optionKey: 'CHECK', kind: 'PROBE', text: 'You identified the written instructions as a possible information source.' },
    { questionKey: 'PLAN_PROBE', optionKey: 'ASK', kind: 'PROBE', text: 'You identified a teammate as a possible information source.' },
    { questionKey: 'REVIEW_CHOICE', optionKey: 'A', kind: 'ACTION', text: 'You chose to compare the drafts and agree on titles together.' },
    { questionKey: 'REVIEW_CHOICE', optionKey: 'B', kind: 'ACTION', text: 'You chose to revise your own title without comparing the drafts.' },
    { questionKey: 'REVIEW_CHOICE', optionKey: 'U', kind: 'ACTION', text: 'You did not provide an action judgment for the review situation.' },
    { questionKey: 'REVIEW_PROBE', optionKey: 'CHECK', kind: 'PROBE', text: 'You chose to check the revised drafts directly.' },
    { questionKey: 'REVIEW_PROBE', optionKey: 'ASK', kind: 'PROBE', text: 'You chose to ask teammates to describe the next step.' },
  ],
  comparisons: [],
  cases: [
    // Literal expected values are hand-calculated, not derived from the scorer.
    // These nine cases cover every possible two-node core decision sequence.
    goldenCase('path-A-A', 'A', 'A', 5, ['CHECK', 'ASK']),
    goldenCase('path-A-B', 'A', 'B', 3, ['ASK', 'CHECK']),
    goldenCase('path-B-A', 'B', 'A', 3, ['CHECK', 'CHECK']),
    goldenCase('path-B-B', 'B', 'B', 1, ['ASK', 'ASK']),
    goldenCase('path-A-U', 'A', 'U', null, ['CHECK', 'ASK']),
    goldenCase('path-B-U', 'B', 'U', null, ['ASK', 'CHECK']),
    goldenCase('path-U-A', 'U', 'A', null, ['CHECK', 'CHECK']),
    goldenCase('path-U-B', 'U', 'B', null, ['ASK', 'ASK']),
    goldenCase('path-U-U', 'U', 'U', null, ['CHECK', 'ASK']),
    goldenCase('optional-probes-skipped', 'A', 'A', 5),
  ],
}

/** Compile through the real formal-upload path; never promote or register it. */
export function compileSjtNativeStagedFixture() {
  const compiled = compileSjtTemplate(structuredClone(sjtNativeStagedTemplate))
  assertSjtReleaseReady(compiled)
  if (compiled.package.definition.schemaVersion !== 2) {
    throw new Error('Synthetic staged fixture must compile to definition V2')
  }
  return {
    ...compiled,
    package: { ...compiled.package, definition: compiled.package.definition },
  }
}

/** Each consumer receives an independent DRAFT package, without online metadata. */
export function createSjtNativeStagedPackage() {
  return compileSjtNativeStagedFixture().package
}

/**
 * Build native FINAL evidence for any golden path. Even without a randomized
 * researchAssignment, staged definitions require ordered capture events and
 * stage confirmations; stageConfirmed response flags alone are insufficient.
 */
export function createSjtNativeStagedFinalFixture(
  attemptId = 'synthetic-native-staged-attempt',
  caseName = 'path-A-A',
  compiled = compileSjtNativeStagedFixture(),
) {
  const { definition } = compiled.package
  const golden = compiled.package.goldenCases.find((candidate) => candidate.name === caseName)
  if (!golden) throw new Error(`Unknown synthetic staged golden case: ${caseName}`)
  const assignment = deriveSituationalAssignment(definition, attemptId, compiled.definitionHash)
  const trajectory = deriveAuthoritativeSituationalTrajectory(definition, golden.responses)
  const responses: SituationalResponse[] = []
  const events: SituationalResearchCapture['events'] = []
  const unansweredReasons: NonNullable<SituationalResearchCapture['unansweredReasons']> = []
  let relativeTimeMs = 0

  for (const nodeKey of trajectory.nodeKeys) {
    const node = definition.flow.nodes.find((candidate) => candidate.nodeKey === nodeKey)
    if (!node || node.nodeType === 'TERMINAL') continue
    const historyIdentity = situationalResponseHistoryIdentities(definition, responses).get(node.sceneKey)
    if (!historyIdentity || !node.responseStages) {
      throw new Error('Synthetic staged fixture lacks reachable history or stages')
    }
    events.push({ type: 'NODE_EXPOSED', nodeKey, historyIdentity, relativeTimeMs: relativeTimeMs++ })
    for (const stage of node.responseStages) {
      const stageIdentity = { nodeKey, stageKey: stage.stageKey, historyIdentity }
      if (stage.kind !== 'CHOICE') {
        events.push({ type: 'PROBE_EXPOSED', ...stageIdentity, relativeTimeMs: relativeTimeMs++ })
      }
      for (const channelKey of stage.channelKeys) {
        const answer = golden.responses.find((response) => response.sceneKey === node.sceneKey && response.channelKey === channelKey)
        if (!answer) {
          if (node.channelPolicies?.find((policy) => policy.channelKey === channelKey)?.required !== false) {
            throw new Error(`Synthetic golden case omits required response: ${channelKey}`)
          }
          unansweredReasons.push({ nodeKey, channelKey, reason: 'PARTICIPANT_SKIPPED' })
          continue
        }
        responses.push({ ...answer, historyIdentity, responseRevision: 1, stageConfirmed: true })
        events.push({
          type: 'RESPONSE_FIRST_COMMITTED',
          ...stageIdentity,
          channelKey,
          responseValue: answer.responseValue,
          responseRevision: 1,
          relativeTimeMs: relativeTimeMs++,
        })
      }
      events.push({ type: 'STAGE_CONFIRMED', ...stageIdentity, relativeTimeMs: relativeTimeMs++ })
    }
    events.push({ type: 'NODE_CONFIRMED', nodeKey, historyIdentity, relativeTimeMs: relativeTimeMs++ })
  }

  const researchCapture: SituationalResearchCapture = {
    captureVersion: 'situational-capture-v1',
    definitionHash: compiled.definitionHash,
    assignmentIdentity: assignment.assignmentIdentity,
    events,
    ...(unansweredReasons.length ? { unansweredReasons } : {}),
  }
  validateSituationalResearchCapture({
    definition,
    definitionHash: compiled.definitionHash,
    assignment,
    responses,
    capture: researchCapture,
  })
  const finalInput: SituationalFinalSubmitInput = {
    submissionId: 'synthetic-native-staged-final',
    attemptEpoch: 1,
    definitionHash: compiled.definitionHash,
    instrumentVersion: compiled.package.instrumentVersion,
    scoringVersion: definition.scoring.scoringVersion,
    responses,
    researchCapture,
  }
  return { compiled, definition, assignment, responses, researchCapture, finalInput, expected: structuredClone(golden.expected) }
}
