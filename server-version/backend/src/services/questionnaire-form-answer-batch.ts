import { Prisma } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'

/**
 * The only form-item fields needed while validating and persisting an answer.
 * Keep this projection shared by authenticated and public batch paths so a
 * batch never loads presentation-only or timestamp columns into its write
 * transaction.
 */
export const questionnaireFormItemAnswerSelect = {
  id: true,
  type: true,
  label: true,
  required: true,
  options: true,
  contextKey: true,
} as const

export type BulkFormAnswerMutation = {
  formItemId: string
  formSectionAttemptId?: string | null
  value: string | null
  status: 'ANSWERED' | 'SKIPPED'
  revision: number
}

/**
 * Persist all changed form answers with one parameterised SQL mutation.
 *
 * Questionnaire starts normally pre-create one PENDING row per form item, but
 * the upsert keeps this path compatible with assessments created before that
 * invariant was introduced. The caller must perform OCC validation while
 * holding the assessment row lock before invoking this helper.
 */
export const persistFormAnswerBatch = async (
  db: Prisma.TransactionClient,
  questionnaireAssessmentId: string,
  mutations: BulkFormAnswerMutation[],
): Promise<void> => {
  if (mutations.length === 0) return

  const values = mutations.map((mutation) => Prisma.sql`(
    ${uuidv4()},
    ${questionnaireAssessmentId},
    ${mutation.formItemId},
    ${mutation.formSectionAttemptId ?? null},
    ${mutation.value},
    ${mutation.status}::"QuestionnaireFormAnswerStatus",
    ${mutation.revision}
  )`)

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "questionnaire_form_answers" (
      "id",
      "questionnaire_assessment_id",
      "form_item_id",
      "form_section_attempt_id",
      "value",
      "status",
      "revision"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("questionnaire_assessment_id", "form_item_id")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "status" = EXCLUDED."status",
      "revision" = EXCLUDED."revision",
      "form_section_attempt_id" = EXCLUDED."form_section_attempt_id"
  `)
}

/**
 * Strict update path for UNIFIED_V1 FINAL submissions.
 *
 * Questionnaire start pre-creates one PENDING row per form item, so the FINAL
 * write must not re-run INSERT/conflict semantics: it updates the existing
 * rows directly and returns the affected-row count. The caller must fail
 * closed when the count does not equal the mutation count — a missing
 * pre-created row means the attempt invariant is broken, and silently
 * recreating it would mask that defect.
 */
export const persistExistingFormAnswerBatch = async (
  db: Prisma.TransactionClient,
  questionnaireAssessmentId: string,
  mutations: BulkFormAnswerMutation[],
): Promise<number> => {
  if (mutations.length === 0) return 0

  const values = mutations.map((mutation) => Prisma.sql`(
    ${mutation.formItemId}::text,
    ${mutation.formSectionAttemptId ?? null}::text,
    ${mutation.value}::text,
    ${mutation.status}::"QuestionnaireFormAnswerStatus",
    ${mutation.revision}::int
  )`)

  return db.$executeRaw(Prisma.sql`
    UPDATE "questionnaire_form_answers" AS a
    SET
      "value" = v."value",
      "status" = v."status",
      "revision" = v."revision",
      "form_section_attempt_id" = v."form_section_attempt_id"
    FROM (VALUES ${Prisma.join(values)}) AS v(form_item_id, form_section_attempt_id, value, status, revision)
    WHERE
      a."questionnaire_assessment_id" = ${questionnaireAssessmentId}::text
      AND a."form_item_id" = v."form_item_id"
  `)
}
