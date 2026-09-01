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
    ${mutation.value},
    ${mutation.status}::"QuestionnaireFormAnswerStatus",
    ${mutation.revision}
  )`)

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "questionnaire_form_answers" (
      "id",
      "questionnaire_assessment_id",
      "form_item_id",
      "value",
      "status",
      "revision"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("questionnaire_assessment_id", "form_item_id")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "status" = EXCLUDED."status",
      "revision" = EXCLUDED."revision"
  `)
}
