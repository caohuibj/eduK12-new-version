/** Synthetic source: demonstrates structure only; no psychometric claims. */
export const SCALE_BATCH_TEMPLATE = {
  schemaVersion: 1,
  sources: [{
    schemaVersion: 1,
    identity: { instrumentKey: 'synthetic_import_example', instrumentVersion: '1.0.0' },
    catalog: {
      schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
      identity: { canonicalName: '合成导入示例（无测量效度）' },
      construct: { primaryDomain: 'SELF_REGULATION', secondaryDomains: [], constructDefinition: '仅演示导入格式，不用于真实测量。', constructLevel: 'SPECIFIC_CONSTRUCT', constructOverlapTags: ['synthetic'] },
      population: { minAge: 18, respondentTypes: ['SELF'], developmentalEvidence: 'UNKNOWN' },
      administration: { itemCount: 1, estimatedMinutes: 1, administrationModes: ['DIGITAL_SELF_ADMINISTERED'], timeFrame: '本次示例', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: [] },
      intendedUse: { intendedUses: [{ use: 'RESEARCH', evidenceStatus: 'EVIDENCE_UNKNOWN' }], forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION'] },
      evidence: [], referenceApplicability: [],
    },
    applicability: { schemaVersion: 1, policyVersion: '1.0.0', respondentTypes: ['SELF'], subject: { ageMonths: { minInclusive: 216 } }, requiredContextKeys: [] },
    disclosure: { schemaVersion: 1, policyVersion: '1.0.0', audiences: {}, unknownAudience: 'DENY' },
    instruction: { schemaVersion: 1, text: '请选择一项，仅用于合成示例。', language: 'zh-CN', version: '1.0.0', source: '合成工程示例' },
    executable: {
      releaseStatus: 'DRAFT', contentLocale: 'zh-CN',
      definition: {
        schemaVersion: 2, respondentType: 'participant_self_report',
        source: { title: '合成工程示例', citation: '无真实量表或个人数据' },
        license: { status: 'self_authored', redistribution: 'allowed', note: '仅合成示例内容' },
        display: { randomizeItems: false },
        responseSets: [{ key: 'choice', options: [{ value: 0, label: '示例选项零', score: 0 }, { value: 1, label: '示例选项一', score: 1 }] }],
        items: [{ itemCode: 'Q1', content: '这是一道合成示例题。', type: 'single', required: true, sortOrder: 0, responseSetKey: 'choice', randomizeOptions: false }],
        scoring: {
          scoringVersion: '1.0.0', itemRules: [{ itemCode: 'Q1', transform: { type: 'identity' } }], defaultMissingPolicy: { type: 'complete_required' },
          scores: [{ key: 'total', type: 'total', label: '示例总分', direction: 'descriptive', canonical: true, displayPrecision: 0, missingPolicy: { type: 'complete_required' }, source: { type: 'items', items: [{ itemCode: 'Q1', weight: 1 }], aggregation: 'sum' } }],
        },
        report: { reportVersion: '1.0.0', primaryScoreKeys: ['total'], scoreOrder: ['total'], interpretations: [{ scoreKey: 'total', headline: '示例分数', source: { type: 'score_only' }, summary: '只显示合成分数，不作解释。', bands: [], guidance: [] }], limitations: ['无测量效度，仅为工程示例。'], disclaimer: '不得用于真实测量或决策。' },
        referencePolicy: { type: 'none' },
      },
      references: [],
      goldenCases: [{ name: '示例满分', answers: [{ itemCode: 'Q1', responseValue: 1 }], expected: { quality: 'interpretable', scores: { total: 1 }, totalScoreKeys: ['total'] } }],
    },
  }],
} as const
