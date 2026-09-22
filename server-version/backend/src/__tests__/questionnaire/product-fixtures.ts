import type { ScaleDefinitionV2 } from '../../modules/scale/scale-definition'
export const MIXED_SCALE_DEFINITION: ScaleDefinitionV2 = {
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: 'Situational Bundle mixed fixture', citation: 'situational-bundle.postgres.integration.test' },
  license: { status: 'self_authored', redistribution: 'allowed' },
  display: { randomizeItems: false },
  responseSets: [{
    key: 'default',
    options: [
      { value: 'no', label: '否', score: 0 },
      { value: 'yes', label: '是', score: 1 },
    ],
  }],
  items: [{
    itemCode: 'mixed-scale-item-1',
    content: 'Situational Bundle mixed fixture item',
    type: 'single',
    required: true,
    sortOrder: 0,
    responseSetKey: 'default',
    randomizeOptions: false,
  }],
  scoring: {
    scoringVersion: '2.0.0',
    itemRules: [{ itemCode: 'mixed-scale-item-1', transform: { type: 'identity' } }],
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [{
      key: 'total',
      type: 'total',
      label: '总分',
      direction: 'descriptive',
      canonical: true,
      displayPrecision: 2,
      source: { type: 'items', items: [{ itemCode: 'mixed-scale-item-1', weight: 1 }], aggregation: 'sum' },
    }],
  },
  report: {
    reportVersion: '2.0.0',
    primaryScoreKeys: ['total'],
    scoreOrder: ['total'],
    interpretations: [{
      scoreKey: 'total',
      headline: '总分',
      source: { type: 'score_only' },
      summary: 'Situational Bundle mixed fixture result',
      bands: [],
      guidance: [],
    }],
    limitations: [],
    disclaimer: 'Situational Bundle mixed fixture only.',
  },
  referencePolicy: { type: 'none' },
}
