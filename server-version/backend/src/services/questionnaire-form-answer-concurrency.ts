export type FormAnswerStatus = 'PENDING' | 'ANSWERED' | 'SKIPPED'

export interface FormAnswerRevisionInput {
  formItemId: string
  value: string | null
  status: 'ANSWERED' | 'SKIPPED'
  expectedRevision?: number
}

export interface FormAnswerRevisionSnapshot {
  formItemId: string
  value: string | null
  status: FormAnswerStatus
  revision?: number
}

export interface PreparedFormAnswerChange {
  input: FormAnswerRevisionInput
  previous?: FormAnswerRevisionSnapshot
  next: FormAnswerRevisionSnapshot
  replay: boolean
}

export type FormAnswerRevisionResult =
  | { kind: 'saved'; changes: PreparedFormAnswerChange[] }
  | { kind: 'stale'; formItemId: string }

const revisionOf = (answer: FormAnswerRevisionSnapshot | undefined): number => (
  Number.isInteger(answer?.revision) && (answer?.revision ?? 0) >= 0
    ? answer!.revision!
    : 0
)

const sameAnswer = (
  answer: FormAnswerRevisionSnapshot | undefined,
  input: FormAnswerRevisionInput,
): boolean => Boolean(
  answer
  && answer.value === input.value
  && answer.status === input.status,
)

/**
 * Prepare form mutations before any database write. This makes a stale
 * checkpoint fail atomically even when a batch contains several form items.
 */
export const prepareFormAnswerChanges = (
  storedAnswers: FormAnswerRevisionSnapshot[],
  inputs: FormAnswerRevisionInput[],
): FormAnswerRevisionResult => {
  const current = new Map(storedAnswers.map((answer) => [answer.formItemId, answer]))
  const changes: PreparedFormAnswerChange[] = []

  for (const input of inputs) {
    const previous = current.get(input.formItemId)
    const currentRevision = revisionOf(previous)
    const replay = sameAnswer(previous, input)

    if (
      input.expectedRevision !== undefined
      && input.expectedRevision !== currentRevision
      && !(input.expectedRevision < currentRevision && replay)
    ) {
      return { kind: 'stale', formItemId: input.formItemId }
    }

    const next = replay
      ? (previous as FormAnswerRevisionSnapshot)
      : {
          formItemId: input.formItemId,
          value: input.value,
          status: input.status,
          revision: currentRevision + 1,
        }
    changes.push({ input, previous, next, replay })
    current.set(input.formItemId, next)
  }

  return { kind: 'saved', changes }
}
