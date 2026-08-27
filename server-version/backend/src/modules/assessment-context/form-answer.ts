import { decryptField, encryptField, isEncrypted } from '../../utils/encryption'

type ContextFormAnswerPayload = { value: string }

const isBoundContextKey = (contextKey: string | null | undefined): boolean => Boolean(contextKey)

/** Store only context-bound form values as encrypted payloads. */
export const writeContextFormAnswer = (
  contextKey: string | null | undefined,
  value: string,
): string => isBoundContextKey(contextKey) ? encryptField<ContextFormAnswerPayload>({ value }) : value

/** Read a context-bound form value and fail closed if it is not ciphertext. */
export const readContextFormAnswer = (
  contextKey: string | null | undefined,
  storedValue: string,
): string => {
  if (!isBoundContextKey(contextKey)) return storedValue
  if (!isEncrypted(storedValue)) throw new Error('context form answer ciphertext is invalid')
  const payload = decryptField<ContextFormAnswerPayload>(storedValue)
  if (!payload || typeof payload.value !== 'string') throw new Error('context form answer payload is invalid')
  return payload.value
}

type StoredFormAnswer = {
  value: string
  formItemId?: string
  itemId?: string
}

/** Return form answers in the server/API representation without exposing ciphertext. */
export const readContextFormAnswers = <T extends StoredFormAnswer>(
  items: Array<{ id: string; contextKey?: string | null }>,
  answers: T[],
): T[] => {
  const contextKeyByItemId = new Map(items.map((item) => [item.id, item.contextKey ?? null]))
  return answers.map((answer) => {
    const itemId = answer.formItemId ?? answer.itemId
    const contextKey = itemId ? contextKeyByItemId.get(itemId) : null
    if (!contextKey) return answer
    return { ...answer, value: readContextFormAnswer(contextKey, answer.value) }
  })
}
