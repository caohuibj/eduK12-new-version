import type { ScaleAnswer } from './scale-scoring'
import type { ScaleResponseValue } from './scale-definition'

export interface ScaleAnswerCheckpointInput {
  itemCode: string
  responseValue: ScaleResponseValue
  responseTimeMs?: number
  expectedRevision?: number
}

export type ScaleAnswerMergeResult =
  | { kind: 'saved'; answers: ScaleAnswer[]; changedCount: number }
  | { kind: 'stale'; itemCode: string }

const sameResponse = (left: ScaleAnswer, right: ScaleAnswerCheckpointInput): boolean => (
  Object.is(left.responseValue, right.responseValue)
  && left.responseTimeMs === right.responseTimeMs
)

const revisionOf = (answer: ScaleAnswer | undefined): number => (
  Number.isInteger(answer?.revision) && (answer?.revision ?? 0) >= 0
    ? answer!.revision!
    : 0
)

/**
 * Merge a batch while preserving per-item optimistic concurrency semantics.
 * Different items can merge even when another item changed on another device;
 * a changed target item is rejected unless the payload is an identical replay.
 */
export const mergeScaleAnswersWithRevision = (
  storedAnswers: ScaleAnswer[],
  inputs: ScaleAnswerCheckpointInput[],
): ScaleAnswerMergeResult => {
  const answers = [...storedAnswers]
  let changedCount = 0

  for (const input of inputs) {
    const existingIndex = answers.findIndex((answer) => answer.itemCode === input.itemCode)
    const previous = existingIndex >= 0 ? answers[existingIndex] : undefined
    const currentRevision = revisionOf(previous)
    const isReplay = Boolean(previous && sameResponse(previous, input))

    if (
      input.expectedRevision !== undefined
      && input.expectedRevision !== currentRevision
      && !(
        input.expectedRevision < currentRevision
        && isReplay
      )
    ) {
      return { kind: 'stale', itemCode: input.itemCode }
    }

    if (isReplay) continue

    const nextAnswer: ScaleAnswer = {
      itemCode: input.itemCode,
      responseValue: input.responseValue,
      ...(input.responseTimeMs === undefined ? {} : { responseTimeMs: input.responseTimeMs }),
      answeredAt: new Date().toISOString(),
      changeCount: (previous?.changeCount ?? -1) + 1,
      revision: currentRevision + 1,
    }
    if (existingIndex >= 0) answers[existingIndex] = nextAnswer
    else answers.push(nextAnswer)
    changedCount += 1
  }

  return { kind: 'saved', answers, changedCount }
}
