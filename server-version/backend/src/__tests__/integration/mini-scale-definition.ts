import type {ScaleDefinitionV2} from '../../modules/scale/scale-definition'
export const scaleDefinitionFor = (size: number, prefix: string): ScaleDefinitionV2 => {
  const itemCodes = Array.from({ length: size }, (_, index) => `${prefix}-${index + 1}`)
  return {
    schemaVersion: 2,
    respondentType: 'participant_self_report',
    source: { title: 'Final submit integration fixture', citation: 'instrument-final-submit.postgres.integration.test' },
    license: { status: 'self_authored', redistribution: 'allowed' },
    display: { randomizeItems: false },
    responseSets: [{
      key: 'default',
      options: [
        { value: 'no', label: '否', score: 0 },
        { value: 'yes', label: '是', score: 1 },
      ],
    }],
    items: itemCodes.map((itemCode, sortOrder) => ({
      itemCode,
      content: `Integration item ${sortOrder + 1}`,
      type: 'single',
      required: true,
      sortOrder,
      responseSetKey: 'default',
      randomizeOptions: false,
    })),
    scoring: {
      scoringVersion: '2.0.0',
      itemRules: itemCodes.map((itemCode) => ({ itemCode, transform: { type: 'identity' as const } })),
      defaultMissingPolicy: { type: 'complete_required' },
      scores: [{
        key: 'total',
        type: 'total',
        label: '总分',
        direction: 'descriptive',
        canonical: true,
        displayPrecision: 2,
        source: { type: 'items', items: itemCodes.map((itemCode) => ({ itemCode, weight: 1 })), aggregation: 'sum' },
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
        summary: '这是一个真实 PostgreSQL 集成测试结果。',
        bands: [],
        guidance: [],
      }],
      limitations: [],
      disclaimer: 'Integration fixture only.',
    },
    referencePolicy: { type: 'none' },
  }
}
