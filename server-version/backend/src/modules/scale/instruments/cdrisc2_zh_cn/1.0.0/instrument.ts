import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: {
    instrumentKey: 'cdrisc2_zh_cn',
    instrumentVersion: '1.0.0',
  },
  catalog: {
    schemaVersion: 1,
    catalogManifestVersion: 1,
    catalogStatus: 'REVIEWED',
    scientificMaturity: 'PILOT',
    identity: {
      canonicalName: 'Connor-Davidson Resilience Scale 2-item — Chinese Standard',
      abbreviation: 'CD-RISC2',
      instrumentFamily: 'Connor-Davidson Resilience Scale',
    },
    construct: {
      primaryDomain: 'RESILIENCE',
      secondaryDomains: ['SELF_REGULATION'],
      constructDefinition: '以适应变化和经历困难后恢复两个核心项目描述近期心理韧性相关倾向。',
      constructLevel: 'SPECIFIC_CONSTRUCT',
      constructOverlapTags: [
        'resilience',
        'adaptation',
        'bounce_back',
        'past_month',
        'self_report',
      ],
    },
    population: {
      populationNotes: 'CD-RISC2 为原 CD-RISC 的 2 题短版。本 package 恢复标准过去一个月时段、0–4 五级反应格式和 0–8 总分，不沿用项目历史问卷的 1–5 同意度均分。',
      respondentTypes: ['SELF'],
      developmentalEvidence: 'PARTIAL',
    },
    administration: {
      itemCount: 2,
      estimatedMinutes: 2,
      administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
      timeFrame: '过去一个月',
      requiredTraining: false,
      itemOrderLocked: true,
      responseFormatLocked: true,
      layoutConstraints: [
        '保持 0–4 五级频率/符合程度反应格式：完全不符合、很少符合、有时符合、经常符合、几乎总是符合。',
        '两题均正向计分并求和，标准总分范围 0–8。',
      ],
    },
    intendedUse: {
      intendedUses: [
        {
          use: 'RESEARCH',
          evidenceStatus: 'SUPPORTED',
        },
        {
          use: 'INDIVIDUAL_REFLECTION',
          evidenceStatus: 'EVIDENCE_UNKNOWN',
          notes: '仅提供描述性韧性相关反馈，不启用常模或阈值。',
        },
      ],
      forbiddenUses: [
        'DIAGNOSIS',
        'HIGH_STAKES_SELECTION',
        'SCHOOL_RANKING',
        'TEACHER_ACCOUNTABILITY',
        'UNSUPPORTED_GROUP_COMPARISON',
      ],
    },
    evidence: [
      {
        evidenceId: 'cdrisc2-vaishnavi-2007',
        evidenceType: 'STRUCTURAL_VALIDITY',
        population: 'Clinical and non-clinical adult samples used in abbreviated-form development',
        locale: 'en',
        territory: 'US',
        studyDesign: 'Development and evaluation of the two-item abbreviated version selected from the parent CD-RISC.',
        rating: 'SUFFICIENT',
        citation: 'Vaishnavi S, Connor K, Davidson JRT. (2007). An abbreviated version of the Connor-Davidson Resilience Scale (CD-RISC), the CD-RISC2. Psychiatry Research, 152(2–3), 293–297.',
        doi: '10.1016/j.psychres.2007.01.006',
        url: 'https://doi.org/10.1016/j.psychres.2007.01.006',
      },
      {
        evidenceId: 'cdrisc2-hk-ni-2015',
        evidenceType: 'CROSS_CULTURAL_VALIDITY',
        population: 'Hong Kong general population',
        locale: 'zh-HK',
        territory: 'CN',
        sampleSize: 10997,
        studyDesign: 'Large general-population psychometric and normative evaluation of CD-RISC and CD-RISC2.',
        rating: 'SUFFICIENT',
        citation: 'Ni MY et al. (2015). Normative data and psychometric properties of the Connor-Davidson Resilience Scale (CD-RISC) and the abbreviated version (CD-RISC2) among the general population in Hong Kong.',
        notes: 'Hong Kong evidence is informative for Chinese-language use but is not treated as a mainland-China norm for this package.',
      },
    ],
    referenceApplicability: [],
  },
  localization: {
    schemaVersion: 1,
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    localizationVersion: '1.0.0',
    translationSource: 'Authorized Chinese item wording previously used in the learning-motivation study; canonical CD-RISC2 order, past-month timeframe, and 0–4 response format restored.',
    adaptationMethod: 'DIRECT_TRANSLATION',
    expertReviewStatus: 'PENDING',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
    reviewStatus: 'PENDING',
    notes: '题干沿用项目已授权中文措辞；产品版本恢复标准 CD-RISC2 的时段、反应格式与求和计分。',
  },
  applicability: {
    schemaVersion: 1,
    policyVersion: 'cdrisc2-zh-cn-standard-v1',
    respondentTypes: ['SELF'],
    requiredContextKeys: [],
  },
  disclosure: {
    schemaVersion: 1,
    policyVersion: 'cdrisc2-zh-cn-standard-v1',
    audiences: {
      respondent: {
        numericScores: true,
        references: false,
        individualInterpretations: true,
        scoreDerivedLabels: false,
        resultQualityDetails: true,
        rawAnswers: false,
        itemScores: false,
        methods: true,
        educationalContent: false,
      },
      subject: {
        numericScores: true,
        references: false,
        individualInterpretations: true,
        scoreDerivedLabels: false,
        resultQualityDetails: true,
        rawAnswers: false,
        itemScores: false,
        methods: true,
        educationalContent: false,
      },
      teacher: {
        numericScores: true,
        references: false,
        individualInterpretations: true,
        scoreDerivedLabels: false,
        resultQualityDetails: true,
        rawAnswers: false,
        itemScores: false,
        methods: true,
        educationalContent: false,
      },
      researcher: {
        numericScores: true,
        references: false,
        individualInterpretations: true,
        scoreDerivedLabels: false,
        resultQualityDetails: true,
        rawAnswers: false,
        itemScores: true,
        methods: true,
        educationalContent: false,
      },
    },
    unknownAudience: 'DENY',
  },
  usageRequirements: {
    schemaVersion: 1,
    policyVersion: 'cdrisc2-zh-cn-standard-v1',
    requiredRightsActions: ['electronicAdministration', 'scoring', 'display'],
    allowedCommercialNatures: ['NON_COMMERCIAL', 'COMMERCIAL'],
    notes: [
      '项目方确认 CD-RISC2 及中文版本已取得计划部署所需授权。',
      '授权范围由 InstrumentAuthorization 记录；本 source 不重新推断许可条件。',
    ],
  },
  executable: {
    releaseStatus: 'PUBLISHED',
    contentLocale: 'zh-CN',
    references: [],
    definition: {
      schemaVersion: 2,
      respondentType: 'participant_self_report',
      source: {
        title: 'Connor-Davidson Resilience Scale 2-item (CD-RISC2)',
        citation: 'Vaishnavi S, Connor K, Davidson JRT. (2007). An abbreviated version of the Connor-Davidson Resilience Scale (CD-RISC), the CD-RISC2.',
        url: 'https://www.cd-risc.com/',
        publicationYear: 2007,
      },
      license: {
        status: 'authorized',
        redistribution: 'restricted',
        note: '项目方确认已取得计划部署所需授权；实际部署仍受 authorization/governance scope 约束。',
      },
      display: {
        randomizeItems: false,
      },
      responseSets: [
        {
          key: 'cdrisc2_0_4_zh_cn',
          options: [
            { value: '0', label: '完全不符合', score: 0 },
            { value: '1', label: '很少符合', score: 1 },
            { value: '2', label: '有时符合', score: 2 },
            { value: '3', label: '经常符合', score: 3 },
            { value: '4', label: '几乎总是符合', score: 4 },
          ],
        },
      ],
      items: [
        {
          itemCode: 'CDRISC2-01',
          content: '我能适应变化。',
          type: 'single',
          required: true,
          sortOrder: 0,
          responseSetKey: 'cdrisc2_0_4_zh_cn',
          randomizeOptions: false,
        },
        {
          itemCode: 'CDRISC2-02',
          content: '经历艰难或挫折后，我往往会很快恢复。',
          type: 'single',
          required: true,
          sortOrder: 1,
          responseSetKey: 'cdrisc2_0_4_zh_cn',
          randomizeOptions: false,
        },
      ],
      scoring: {
        scoringVersion: '1.0.0',
        itemRules: [
          { itemCode: 'CDRISC2-01', transform: { type: 'identity' } },
          { itemCode: 'CDRISC2-02', transform: { type: 'identity' } },
        ],
        defaultMissingPolicy: {
          type: 'complete_required',
        },
        scores: [
          {
            key: 'resilience',
            type: 'total',
            label: '韧性总分',
            description: 'CD-RISC2 两个项目的标准求和分，范围 0–8。',
            direction: 'higher_is_more',
            canonical: true,
            displayPrecision: 0,
            missingPolicy: { type: 'complete_required' },
            source: {
              type: 'items',
              items: [
                { itemCode: 'CDRISC2-01', weight: 1 },
                { itemCode: 'CDRISC2-02', weight: 1 },
              ],
              aggregation: 'sum',
            },
          },
        ],
      },
      report: {
        reportVersion: '1.0.0',
        primaryScoreKeys: ['resilience'],
        scoreOrder: ['resilience'],
        interpretations: [
          {
            scoreKey: 'resilience',
            headline: '近期韧性相关倾向',
            source: { type: 'score_only' },
            summary: '该分数综合描述过去一个月中你对“适应变化”和“经历困难后恢复”这两个核心韧性表现的自我评价。分数较高表示本次自评中更常感到自己能够适应变化并从困难中恢复；分数较低需要结合近期压力、支持资源和具体经历理解。',
            bands: [],
            guidance: [],
          },
        ],
        limitations: [
          'CD-RISC2 只有 2 个项目，适合快速描述核心韧性倾向，但不能覆盖韧性的全部心理和社会过程。',
          '本 PILOT package 不启用任何常模、百分位、cut-off 或“低韧性/高韧性”分类。',
          '香港或其他地区公开样本的分布不直接作为中国大陆 K12 个体的规范参照。',
          '结果反映过去一个月的自我报告，可能随近期事件、压力和支持环境变化。',
        ],
        disclaimer: '本报告仅用于研究和描述性自我了解，不用于心理诊断、风险筛查、治疗决策、能力鉴定或高风险选拔。',
      },
      referencePolicy: {
        type: 'none',
      },
    },
    goldenCases: [
      {
        name: 'all-lowest',
        answers: [
          { itemCode: 'CDRISC2-01', responseValue: '0' },
          { itemCode: 'CDRISC2-02', responseValue: '0' },
        ],
        expected: {
          quality: 'interpretable',
          scores: {
            resilience: 0,
          },
          totalScoreKeys: ['resilience'],
        },
      },
      {
        name: 'midpoint',
        answers: [
          { itemCode: 'CDRISC2-01', responseValue: '2' },
          { itemCode: 'CDRISC2-02', responseValue: '2' },
        ],
        expected: {
          quality: 'interpretable',
          scores: {
            resilience: 4,
          },
          totalScoreKeys: ['resilience'],
        },
      },
      {
        name: 'all-highest',
        answers: [
          { itemCode: 'CDRISC2-01', responseValue: '4' },
          { itemCode: 'CDRISC2-02', responseValue: '4' },
        ],
        expected: {
          quality: 'interpretable',
          scores: {
            resilience: 8,
          },
          totalScoreKeys: ['resilience'],
        },
      },
    ],
  },
} satisfies ScaleInstrumentSourceV1
