import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const ordered = (source: string, ...needles: string[]) => {
  let cursor = -1
  for (const needle of needles) {
    const next = source.indexOf(needle, cursor + 1)
    expect(next, `missing or out-of-order source marker: ${needle}`).toBeGreaterThan(cursor)
    cursor = next
  }
}

describe('MEDIA-2 frozen image retention lifecycle', () => {
  it('retains authenticated Questionnaire Scale images before the start transaction returns', () => {
    const source = readSource('../../controllers/questionnaireController.ts')
    const start = source.indexOf('const qa = await prisma.$transaction(async (tx) => {')
    const end = source.indexOf('return created', start)
    const transaction = source.slice(start, end)

    ordered(
      transaction,
      'await tx.assessment.createMany({',
      'await retainQuestionnaireScaleAssessmentImages({',
      'questionnaireAssessmentId: created.id',
      'db: tx',
      'const frozenActiveSlotSet = freezeQuestionnaireActiveSlotSet({',
    )
  })

  it('retains public Questionnaire Scale images before the token/start transaction returns', () => {
    const source = readSource('../../controllers/publicQuestionnaireController.ts')
    const start = source.indexOf("const created = await measureRequestPhase('transaction', () => prisma.$transaction(async (tx) => {")
    const end = source.indexOf('return { assessment, resumeToken: issuedResumeToken }', start)
    const transaction = source.slice(start, end)

    ordered(
      transaction,
      'await tx.assessment.createMany({',
      'await retainQuestionnaireScaleAssessmentImages({',
      'questionnaireAssessmentId: assessment.id',
      'db: tx',
      'const frozenActiveSlotSet = freezeQuestionnaireActiveSlotSet({',
    )
  })

  it('retains Questionnaire restart Scale images in the same replacement transaction', () => {
    const source = readSource('../../services/questionnaire-form-section.service.ts')
    const start = source.indexOf('export const restartQuestionnaireAssessment = async (')
    const end = source.indexOf('return { id: next.id, sessionId: newSessionId, resumeToken }', start)
    const transaction = source.slice(start, end)

    ordered(
      transaction,
      'await tx.assessment.createMany({',
      'await retainQuestionnaireScaleAssessmentImages({',
      'questionnaireAssessmentId: next.id',
      'db: tx',
    )
  })

  it('retains Composite Scale images immediately after each frozen child is created', () => {
    const source = readSource('../../modules/composite/composite.service.ts')
    const start = source.indexOf('const createChildRecords = async')
    const end = source.indexOf('const createAttempt = async', start)
    const createChildren = source.slice(start, end)

    ordered(
      createChildren,
      'const child = await db.assessment.create({',
      'await retainFrozenScaleAssessmentImages({ assessmentId: child.id, snapshot: frozenScale, db })',
      'runtime.scales.push({',
    )
  })

  it('keeps frozen image delivery read-only with retention owned by create/freeze paths', () => {
    const questionnaireDelivery = readSource('../../controllers/questionnaireImageController.ts')
    const compositeDelivery = readSource('../../modules/composite/composite-image.controller.ts')
    const scaleDelivery = readSource('../../controllers/scaleImageController.ts')

    expect(questionnaireDelivery).not.toContain('retainFrozenScaleAssessmentImages')
    expect(compositeDelivery).not.toContain('retainFrozenScaleAssessmentImages')
    expect(scaleDelivery).not.toContain('retainFrozenScaleAssessmentImages')
  })
})
