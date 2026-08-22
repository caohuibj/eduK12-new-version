import { FORBIDDEN } from './cognitive.errors'

export const isCompositeWrapper = (assignment: { listedStandalone?: boolean | null }) =>
  assignment.listedStandalone === false

/** Session / public token / cognitive export. Do not use on student GET-by-id. */
export const rejectWrapperForStandaloneUse = (
  assignment: { listedStandalone?: boolean | null },
  message = '此认知任务仅用于综合测评，不能单独作答或公开分发',
) => {
  if (isCompositeWrapper(assignment)) throw FORBIDDEN(message)
}
