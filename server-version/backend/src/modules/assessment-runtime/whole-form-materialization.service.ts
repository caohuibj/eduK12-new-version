import { createHash } from 'node:crypto'
import type { CompositeReportJob } from '@prisma/client'
import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import {
  activateStoredOrCatalogCompositeFormAdmission,
  ensureCompositeSectionAttempt,
  loadCompositeFormDefinition,
  readStoredFormAdmission,
} from './form-admission.service'
import { formSectionIdentityHash } from './attempt-runtime'
import { mapCompositeSection, type CompositeSection } from './form-section-definition'
import { normalizeCompositeSectionAnswers, type SectionSubmitInput } from '../composite/final-submit.service'
import { submitUnifiedCompositeFormSectionFinal } from './unified-form-section-final-submit.service'
import type { TypedFormValue } from './typed-form'
import type { WholeReceiptExecution } from '../composite/whole-questionnaire.service'

export type WholeFormAnswerSection = {
  sectionId: string
  definitionHash: string
  answers: Array<{ formItemId: string; value: unknown; otherText?: string }>
}

const formSectionFailure = (message: string, status = 409) => new InstrumentFinalSubmitError('STALE_ATTEMPT', message, status)

/** Same derivation family as the scale child ids: deterministic from the
 * accepted whole receipt, so a worker replay re-derives identical section
 * identities and hits the committed-replay guard instead of rewriting. */
export const wholeFormSubmissionId = (wholeSubmissionId: string, sectionId: string) =>
  'whole-form-' + createHash('sha256').update(wholeSubmissionId + '/' + sectionId).digest('hex')

const asTypedFormAnswers = (section: WholeFormAnswerSection) =>
  section.answers.map(answer => ({
    formItemId: answer.formItemId,
    value: answer.value as TypedFormValue,
    ...(answer.otherText !== undefined ? { otherText: answer.otherText } : {}),
  })) as SectionSubmitInput['answers']

/** Receipt-time deterministic Form validation (X-04A contract: no answer class
 * may be ACKed that the worker would later fail to materialize). Reuses the
 * authoritative normalization of the stepped path — item types/options,
 * required-when-shown, displayIf visibility, V3 policy and otherText rules —
 * against the frozen stored admission, or the catalog definition when this
 * section has not activated an admission yet. Read-only by contract: receipt
 * validation never persists an admission and never writes context, so mixed
 * stepped/whole context ordering stays owned by the worker. */
export const verifyWholeFormSectionsAtReceipt = async (
  attemptId: string,
  sections: WholeFormAnswerSection[],
) => {
  for (const section of sections) {
    const stored = await prisma.compositeFormSectionAttempt.findUnique({
      where: { attemptId_sectionId: { attemptId, sectionId: section.sectionId } },
      select: { frozenAdmissionSnapshotEncrypted: true, frozenAdmissionSnapshotHash: true },
    })
    let definition: CompositeSection | undefined
    let identityHash: string | undefined
    const admission = stored ? readStoredFormAdmission(stored) : null
    if (admission?.formSection && admission.formSection.kind === 'composite' && admission.formSection.id === section.sectionId) {
      identityHash = admission.formSection.identityHash
      definition = loadCompositeFormDefinition(admission)
    } else {
      const row = await prisma.compositeFormSection.findUnique({
        where: { id: section.sectionId },
        include: { items: { orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }] } },
      })
      if (!row) throw formSectionFailure('表单区段不存在', 404)
      definition = mapCompositeSection(row)
      identityHash = formSectionIdentityHash(definition)
    }
    if (identityHash !== section.definitionHash) throw formSectionFailure('表单冻结版本不匹配')
    normalizeCompositeSectionAnswers(definition, asTypedFormAnswers(section))
  }
}

const isContextSectionRow = (row: { contextSection: boolean; items: Array<{ contextKey: string | null }> }) =>
  Boolean(row.contextSection) || row.items.some(item => Boolean(item.contextKey))

/** Worker-side materialization (X-04A): persist each whole-envelope Form
 * section through the same authoritative chain as the stepped path — frozen
 * admission activation, full normalization, encrypted COLLECTION_FACTS and the
 * completed FORM_SECTION snapshot. The whole receipt rides along so the
 * snapshot enqueue stays a read-only receipt lease fence and can never mutate
 * the running job. Context sections materialize first so the stepped
 * requiresContext ordering holds inside one envelope. Replays are idempotent:
 * the derived per-section submissionId and payload hash return the committed
 * state without rewriting snapshots. */
export const materializeWholeFormSections = async (
  job: Pick<CompositeReportJob, 'attemptId' | 'attemptEpoch' | 'contextHash'>,
  sections: WholeFormAnswerSection[],
  execution: WholeReceiptExecution,
  principal: { userId?: string | null; recoveryTokenHash?: string },
) => {
  if (sections.length === 0) return []
  const rows = await prisma.compositeFormSection.findMany({
    where: { id: { in: sections.map(section => section.sectionId) } },
    select: { id: true, contextSection: true, items: { select: { contextKey: true } } },
  })
  const contextFirst = new Set(rows.filter(isContextSectionRow).map(row => row.id))
  const ordered = [...sections].sort((left, right) =>
    Number(contextFirst.has(right.sectionId)) - Number(contextFirst.has(left.sectionId)))
  const materialized: Array<Awaited<ReturnType<typeof submitUnifiedCompositeFormSectionFinal>>> = []
  for (const section of ordered) {
    const child = await ensureCompositeSectionAttempt(job.attemptId, section.sectionId, job.attemptEpoch)
    const admission = await activateStoredOrCatalogCompositeFormAdmission({
      parentId: job.attemptId, sectionId: section.sectionId, child,
    })
    if (!admission.formSection || admission.formSection.kind !== 'composite' || admission.formSection.id !== section.sectionId) {
      throw formSectionFailure('表单区段准入快照身份不匹配')
    }
    if (admission.formSection.identityHash !== section.definitionHash) throw formSectionFailure('表单冻结版本不匹配')
    materialized.push(await submitUnifiedCompositeFormSectionFinal({
      attemptId: job.attemptId,
      sectionId: section.sectionId,
      submissionId: wholeFormSubmissionId(execution.submissionId, section.sectionId),
      attemptEpoch: job.attemptEpoch,
      definitionHash: section.definitionHash,
      // The receipt already bound the envelope to the parent context state at
      // acceptance; the frozen admission owns the section's context binding,
      // so the frozen-admission check re-asserts against that frozen value.
      contextSnapshotHash: admission.contextSnapshotHash,
      answers: asTypedFormAnswers(section),
      userId: principal.userId ?? null,
      recoveryTokenHash: principal.recoveryTokenHash,
    }, undefined, undefined, execution))
  }
  return materialized
}
