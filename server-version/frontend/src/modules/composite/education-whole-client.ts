import type { ApiResponse } from '../../types'
import type {
  CompositeAttemptState,
  WholeQuestionnaireBinding,
  WholeQuestionnaireDefinition,
  WholeQuestionnaireTemplate,
} from './types'
import {
  assembleInlineWholePayload,
  getKnownWholeTemplateHashes,
  resolveWholeDefinitionPayload,
  wholeDefinitionWithInlineFallback,
  type InlineWholeDefinitionIdentity,
} from './whole-definition-source'

export type EducationInlineWholePayload = {
  freshlyCreated?: boolean
  wholeDefinition?: WholeQuestionnaireDefinition
  wholeBinding?: WholeQuestionnaireBinding
}

/** Append known template hashes as query parameter so SchoolApi and
 * EducationReportApi keep their exact (path, method, payload, options) signature. */
export const withKnownWholeTemplateQuery = (path: string): string => {
  const hashes = getKnownWholeTemplateHashes()
  if (hashes.length === 0) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}knownTemplateHash=${encodeURIComponent(hashes.join(','))}`
}

/** Extract and cache an inline whole definition/binding attached by START. */
export const captureEducationInlineWhole = (
  payload: EducationInlineWholePayload | null | undefined,
): WholeQuestionnaireDefinition | null => assembleInlineWholePayload(payload)

/** Extract authoritative server identity from a verified attempt state. */
export const educationAttemptIdentity = (
  state: CompositeAttemptState,
): InlineWholeDefinitionIdentity => ({
  attemptId: state.id,
  ...(state.attemptEpoch !== undefined ? { attemptEpoch: state.attemptEpoch } : {}),
  ...(state.contextSnapshotHash !== undefined ? { contextSnapshotHash: state.contextSnapshotHash } : {}),
})

/** Prefer a one-shot START inline whole payload matching the verified attempt
 * identity, then fall back to template-hash negotiation on /whole + /whole/template. */
export const fetchEducationWholeDefinition = (input: {
  attemptId: string
  attemptBasePath: string
  consumeInline: (attemptId: string) => {
    inline: WholeQuestionnaireDefinition | null
    identity: InlineWholeDefinitionIdentity | null
  }
  get: <T>(path: string) => Promise<T>
}): Promise<ApiResponse<WholeQuestionnaireDefinition>> => {
  const { inline, identity } = input.consumeInline(input.attemptId)
  const verified = Boolean(identity && identity.attemptId === input.attemptId)
  return wholeDefinitionWithInlineFallback(
    verified ? inline : null,
    identity ?? { attemptId: '' },
    async () => {
      const wholePath = `${input.attemptBasePath}/whole`
      const payload = await input.get<WholeQuestionnaireDefinition | { wholeBinding: WholeQuestionnaireBinding }>(
        withKnownWholeTemplateQuery(wholePath),
      )
      return resolveWholeDefinitionPayload(
        payload,
        async (templateHash) => ({
          code: 0,
          message: '成功',
          data: await input.get<WholeQuestionnaireTemplate>(
            `${input.attemptBasePath}/whole/template/${encodeURIComponent(templateHash)}`,
          ),
        }),
        async () => ({
          code: 0,
          message: '成功',
          data: await input.get<WholeQuestionnaireDefinition>(wholePath),
        }),
      )
    },
  )
}
