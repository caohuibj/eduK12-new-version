import { randomUUID } from 'node:crypto'

/** Distinct client-generated identity pair for one anonymous SINGLE_UNLINKED
 * START call: the 43-char base64url operation key (replay identity) and the
 * attempt bearer. Every invocation returns a FRESH pair so multi-participant
 * flows keep independent identities; a test that wants to exercise replay
 * captures the returned pair and reuses it deliberately. */
export const surveyStartKeys = (label = 'survey-start') => {
  const raw = Buffer.from(randomUUID() + randomUUID() + label).toString('base64url')
  return { operationKey: ('k' + raw).slice(0, 43), accessCredential: ('c' + raw).slice(0, 43) }
}
