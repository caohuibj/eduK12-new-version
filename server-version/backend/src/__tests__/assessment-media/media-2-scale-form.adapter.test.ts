import { describe, expect, it } from 'vitest'
import { assessmentImagePresentationListSchema } from '../../modules/assessment-media/assessment-image-presentation'
import {
  compositeFormSectionImageReferences,
  questionnaireFormSectionImageReferences,
} from '../../modules/assessment-runtime/form-image.adapter'
import {
  createCustomScaleDefinition,
  hashScaleDefinition,
  scaleDefinitionSchema,
  type ScaleDefinitionV2,
} from '../../modules/scale/scale-definition'
import { scaleAssessmentImageReferences } from '../../modules/scale/scale-image.adapter'
import { validateQuestionnaireFormAnswer } from '../../services/questionnaireFormAnswerValidation'

const image = (assetId: string, order = 0) => ({
  asset: {
    assetId,
    contentHash: 'a'.repeat(64),
    mimeType: 'image/png' as const,
  },
  altText: `alt ${assetId}`,
  caption: `caption ${assetId}`,
  order,
})

const definition = (): ScaleDefinitionV2 => {
  const value = createCustomScaleDefinition()
  value.items = [{
    itemCode: 'q1',
    content: 'Question 1',
    type: 'single',
    required: true,
    sortOrder: 0,
    responseSetKey: 'default',
    randomizeOptions: false,
  }]
  value.scoring.itemRules = [{ itemCode: 'q1', transform: { type: 'identity' } }]
  value.scoring.scores = [{
    key: 'total',
    type: 'total',
    label: 'Total',
    direction: 'higher_is_more',
    canonical: true,
    displayPrecision: 1,
    source: { type: 'items', items: [{ itemCode: 'q1', weight: 1 }], aggregation: 'sum' },
  }]
  value.report.primaryScoreKeys = ['total']
  value.report.scoreOrder = ['total']
  value.report.interpretations = [{
    scoreKey: 'total',
    headline: 'Total',
    source: { type: 'score_only' },
    summary: 'Summary',
    bands: [],
    guidance: [],
  }]
  return value
}

describe('MEDIA-2 Scale + Form image adapters', () => {
  it('keeps no-image Scale definitions backward-compatible without injecting an empty slot', () => {
    const before = definition()
    const beforeHash = hashScaleDefinition(before)
    const parsed = scaleDefinitionSchema.parse(JSON.parse(JSON.stringify(before)))
    expect('images' in parsed.items[0]!).toBe(false)
    expect(hashScaleDefinition(parsed)).toBe(beforeHash)
  })

  it('freezes presentation media in the Scale definition hash without changing scoringVersion', () => {
    const before = definition()
    const withMedia = structuredClone(before)
    withMedia.items[0]!.images = [image('asset-scale-1')]
    expect(hashScaleDefinition(withMedia)).not.toBe(hashScaleDefinition(before))
    expect(withMedia.scoring.scoringVersion).toBe(before.scoring.scoringVersion)
    expect(scaleAssessmentImageReferences(withMedia)).toEqual([image('asset-scale-1').asset])
  })

  it('validates image order and static image MIME', () => {
    expect(assessmentImagePresentationListSchema.safeParse([image('a', 0), image('b', 1)]).success).toBe(true)
    expect(assessmentImagePresentationListSchema.safeParse([image('a', 0), image('b', 0)]).success).toBe(false)
    expect(assessmentImagePresentationListSchema.safeParse([{ ...image('a'), asset: { ...image('a').asset, mimeType: 'video/mp4' } }]).success).toBe(false)
  })

  it('extracts Questionnaire and Composite option images from their existing option JSON', () => {
    const questionnaire = {
      items: [{ options: [{ value: 'yes', label: 'Yes', images: [image('q-option')] }] }],
    }
    const composite = {
      items: [{ formOptions: [{ value: 'yes', label: 'Yes', images: [image('c-option')] }] }],
    }
    expect(questionnaireFormSectionImageReferences(questionnaire).map((ref) => ref.assetId)).toEqual(['q-option'])
    expect(compositeFormSectionImageReferences(composite).map((ref) => ref.assetId)).toEqual(['c-option'])
  })

  it('keeps Form response validation independent from option image presentation', () => {
    const message = validateQuestionnaireFormAnswer({
      id: 'form-1',
      type: 'single_choice',
      label: 'Choice',
      required: true,
      options: [{ value: 'yes', label: 'Yes', images: [image('q-option')] }],
      contextKey: null,
    }, 'yes')
    expect(message).toBeNull()
  })
})
