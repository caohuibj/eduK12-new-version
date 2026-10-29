// Westside Test Anxiety Scale native DRAFT: verbatim 10-item form, 5-point truth scale and
// sum/10 scoring from the author's validation report (ERIC ED495968, Appendix A).
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "westside_10_driscoll_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Westside Test Anxiety Scale",
      "abbreviation": "Westside",
      "instrumentFamily": "Westside Test Anxiety Scale"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [],
      "constructDefinition": "学生在重要考试情境中自我感知的焦虑损害：侵入性担忧、畏惧与考试期间的表现损害（难以专注、记忆提取受阻），不包含生理过度唤醒成分。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:exam_anxiety",
        "test_anxiety",
        "worry",
        "performance_impairment",
        "screening",
        "license:permission_granted_personal_institutional_nonresale",
        "population:k12",
        "response:student_self",
        "use:screening",
        "use:research",
        "language_validation:english_original"
      ]
    },
    "population": {
      "minAge": 10,
      "maxAge": 22,
      "populationNotes": "官方验证覆盖五年级学生（约10–11岁，n=34 提供焦虑变化分数）与美国大学生（含学业警告学生，n=25）；作者定位为学校初筛工具。上界延伸到大学低年级，K-12 之外的适用性不作声明。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 10,
      "estimatedMinutes": 5,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "对重要考试情境的一般化自评；无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保持官方 5 点『真实程度』计分方向：5=extremely or always true，1=not at all or never true；不得改写成同意度格式。",
        "官方计分为 10 题总和除以 10（均分 1.0–5.0）；验证报告附录未给出 6 项损害与 4 项担忧的逐题因子键，不得自行拆分分量表。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "SCREENING",
          "evidenceStatus": "SUPPORTED",
          "notes": "作者以焦虑变化分数与考试成绩变化的相关（r=.44）作为效度准则，定位为学校干预初筛。"
        },
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "非学术反馈为产品设计，不解释为焦虑等级或诊断。"
        }
      ],
      "forbiddenUses": [
        "DIAGNOSIS",
        "HIGH_STAKES_SELECTION",
        "SCHOOL_RANKING",
        "TEACHER_ACCOUNTABILITY",
        "UNSUPPORTED_GROUP_COMPARISON"
      ]
    },
    "evidence": [
      {
        "evidenceId": "westside-driscoll-2007",
        "evidenceType": "CRITERION",
        "population": "美国大学生（含学业警告）与五年级学生",
        "ageRange": "college; grade 5",
        "locale": "en",
        "territory": "US",
        "sampleSize": 59,
        "studyDesign": "Two intervention studies correlating scale change scores to objective test-gain change scores (r=.49 college, r=.40 grade 5; weighted r=.44)",
        "rating": "MIXED",
        "citation": "Driscoll, R. (2007). Westside Test Anxiety Scale Validation. ERIC Document ED495968. American Test Anxiety Association.",
        "url": "https://eric.ed.gov/?id=ED495968",
        "notes": "效度准则设计新颖但样本小且为 ERIC 技术报告而非期刊论文；量表公开免费供学校使用。作者原版附六档描述区间（1.0–1.9 comfortably low … 4.0–5.0 extremely high）。"
      },
      {
        "evidenceId": "westside-barbu-2025",
        "evidenceType": "TEST_RETEST",
        "population": "罗马尼亚中学生样本（初步验证）",
        "locale": "ro",
        "territory": "RO",
        "studyDesign": "Preliminary validation: test-retest reliability and linguistic equivalence check of the translated scale",
        "rating": "MIXED",
        "citation": "Barbu, A. et al. (2025). A Preliminary Validation of the Westside Test Anxiety Scale. Proceedings of the International Conference on Business Excellence.",
        "doi": "10.2478/picbe-2025-0158",
        "url": "https://sciendo.com/pdf/10.2478/picbe-2025-0158",
        "notes": "近年仍有国际使用与重测证据；初判性质，不改变主证据等级。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "westside-10-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "westside-10-v1",
    "audiences": {
      "respondent": {
        "numericScores": true,
        "references": false,
        "individualInterpretations": true,
        "scoreDerivedLabels": false,
        "resultQualityDetails": true,
        "rawAnswers": false,
        "itemScores": false,
        "methods": true,
        "educationalContent": false
      }
    },
    "unknownAudience": "DENY"
  },
  "usageRequirements": {
    "schemaVersion": 1,
    "policyVersion": "westside-10-v1",
    "requiredRightsActions": [],
    "allowedDeploymentModes": [],
    "allowedCommercialNatures": [
      "NON_COMMERCIAL"
    ],
    "notes": [
      "官方量表页脚授权声明（逐字）：『© 2004 by Richard Driscoll, Ph.D. You have permission to copy this scale for personal use and for institutional uses (but not for resale).』——明确允许个人与机构用途复制，禁止转售。",
      "验证报告摘要同时声明量表『public access and free of charge to schools』。本登记按非商业用途处理；任何转售或商业化部署前须另行取得作者许可。"
    ]
  },
  "instruction": {
    "schemaVersion": 1,
    "text": "Rate how true each of the following is of you, from extremely or always true, to not at all or never true. Use the following 5 point scale.",
    "language": "en",
    "version": "1.0.0",
    "source": "Driscoll (2007) ERIC ED495968 Appendix A 官方指导语，逐字。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Westside Test Anxiety Scale (10-item)",
        "citation": "Driscoll, R. (2007). Westside Test Anxiety Scale Validation (ERIC ED495968). American Test Anxiety Association; scale sheet and scoring in Appendix A.",
        "url": "https://files.eric.ed.gov/fulltext/ED495968.pdf",
        "publicationYear": 2007
      },
      "license": {
        "status": "authorized",
        "redistribution": "allowed",
        "note": "作者在官方量表页脚以书面声明授权：可为本报告所依据的原样复制量表用于个人与机构用途（不得转售）。授权范围为原样复制；改写题文、翻译或商业化不在该声明范围内，翻译施测前须另行确认。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "westside_truth_5_1",
          "options": [
            {
              "value": "5",
              "label": "extremely or always true",
              "score": 5
            },
            {
              "value": "4",
              "label": "highly or usually true",
              "score": 4
            },
            {
              "value": "3",
              "label": "moderately or sometimes true",
              "score": 3
            },
            {
              "value": "2",
              "label": "slightly or seldom true",
              "score": 2
            },
            {
              "value": "1",
              "label": "not at all or never true",
              "score": 1
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "WTS-01",
          "content": "The closer I am to a major exam, the harder it is for me to concentrate on the material.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "westside_truth_5_1",
          "randomizeOptions": false
        },
        {
          "itemCode": "WTS-02",
          "content": "When I study, I worry that I will not remember the material on the exam.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "westside_truth_5_1",
          "randomizeOptions": false
        },
        {
          "itemCode": "WTS-03",
          "content": "During important exams, I think that I am doing awful or that I may fail.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "westside_truth_5_1",
          "randomizeOptions": false
        },
        {
          "itemCode": "WTS-04",
          "content": "I lose focus on important exams, and I cannot remember material that I knew before the exam.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "westside_truth_5_1",
          "randomizeOptions": false
        },
        {
          "itemCode": "WTS-05",
          "content": "I finally remember the answer to exam questions after the exam is already over.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "westside_truth_5_1",
          "randomizeOptions": false
        },
        {
          "itemCode": "WTS-06",
          "content": "I worry so much before a major exam that I am too worn out to do my best on the exam.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "westside_truth_5_1",
          "randomizeOptions": false
        },
        {
          "itemCode": "WTS-07",
          "content": "I feel out of sorts or not really myself when I take important exams.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "westside_truth_5_1",
          "randomizeOptions": false
        },
        {
          "itemCode": "WTS-08",
          "content": "I find that my mind sometimes wanders when I am taking important exams.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "westside_truth_5_1",
          "randomizeOptions": false
        },
        {
          "itemCode": "WTS-09",
          "content": "After an exam, I worry about whether I did well enough.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "westside_truth_5_1",
          "randomizeOptions": false
        },
        {
          "itemCode": "WTS-10",
          "content": "I struggle with writing assignments, or avoid them as long as I can. I feel that whatever I do will not be good enough.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "westside_truth_5_1",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          { "itemCode": "WTS-01", "transform": { "type": "identity" } },
          { "itemCode": "WTS-02", "transform": { "type": "identity" } },
          { "itemCode": "WTS-03", "transform": { "type": "identity" } },
          { "itemCode": "WTS-04", "transform": { "type": "identity" } },
          { "itemCode": "WTS-05", "transform": { "type": "identity" } },
          { "itemCode": "WTS-06", "transform": { "type": "identity" } },
          { "itemCode": "WTS-07", "transform": { "type": "identity" } },
          { "itemCode": "WTS-08", "transform": { "type": "identity" } },
          { "itemCode": "WTS-09", "transform": { "type": "identity" } },
          { "itemCode": "WTS-10", "transform": { "type": "identity" } }
        ],
        "defaultMissingPolicy": {
          "type": "complete_required"
        },
        "scores": [
          {
            "key": "test_anxiety_impairment",
            "type": "total",
            "label": "考试焦虑损害",
            "description": "官方计分：10 题回答的总和除以 10（即均分，1.0–5.0）。验证报告附录未提供 6 项损害与 4 项担忧的逐题因子键，因此不做担忧/损害分量表拆分。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                { "itemCode": "WTS-01", "weight": 1 },
                { "itemCode": "WTS-02", "weight": 1 },
                { "itemCode": "WTS-03", "weight": 1 },
                { "itemCode": "WTS-04", "weight": 1 },
                { "itemCode": "WTS-05", "weight": 1 },
                { "itemCode": "WTS-06", "weight": 1 },
                { "itemCode": "WTS-07", "weight": 1 },
                { "itemCode": "WTS-08", "weight": 1 },
                { "itemCode": "WTS-09", "weight": 1 },
                { "itemCode": "WTS-10", "weight": 1 }
              ],
              "aggregation": "mean"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "test_anxiety_impairment"
        ],
        "scoreOrder": [
          "test_anxiety_impairment"
        ],
        "interpretations": [
          {
            "scoreKey": "test_anxiety_impairment",
            "headline": "考试会“偷走”你的专注吗",
            "source": {
              "type": "score_only"
            },
            "summary": "这 10 题问的是：临近重要考试和考试当下，担忧和走神有多常打扰你。分数是 10 题的平均（1.0–5.0）；越高表示考试焦虑对状态的影响越明显。这不是在评价你这个人，也不预测你的成绩。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回忆最近一次重要考试：担忧通常在哪个阶段最强（复习中、进考场前、还是作答时）？把它写下来，是理解自己的第一步。"
              },
              {
                "category": "strategy",
                "text": "考前做几分钟慢呼吸，把复习内容分成小块逐个过；作答时先做会做的题，回头的路留到后面。"
              },
              {
                "category": "support",
                "text": "如果分数持续偏高、并且已经影响到复习和考试，可以找学校心理老师或信任的成年人聊聊，焦虑是可以练着降下来的。"
              }
            ]
          }
        ],
        "limitations": [
          "这是学生自评的考试焦虑筛查，反映一次作答，不构成焦虑障碍或学业能力的结论。",
          "作者原版量表页提供六档描述区间（1.0–1.9 comfortably low 至 4.0–5.0 extremely high），来源于美国大学生与五年级样本；本版本未引入中文常模或本地界值，报告不以这些区间给出个人等级。",
          "官方验证为两项干预研究的变化分数相关（r=.44），样本量小且为 ERIC 技术报告；信度系数以官方记录为准，本登记未补充未公开的内部一致性数据。",
          "验证报告附录未提供逐题因子键，因此只计官方总分，不拆担忧/损害分量表。",
          "没有适用于你的诊断阈值；本报告不用于诊断或高风险决策。"
        ],
        "disclaimer": "这份报告用于认识考试焦虑对你的影响和反思，不用于诊断、排名或高风险决策。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "maximum-keyed",
        "answers": [
          { "itemCode": "WTS-01", "responseValue": "5" },
          { "itemCode": "WTS-02", "responseValue": "5" },
          { "itemCode": "WTS-03", "responseValue": "5" },
          { "itemCode": "WTS-04", "responseValue": "5" },
          { "itemCode": "WTS-05", "responseValue": "5" },
          { "itemCode": "WTS-06", "responseValue": "5" },
          { "itemCode": "WTS-07", "responseValue": "5" },
          { "itemCode": "WTS-08", "responseValue": "5" },
          { "itemCode": "WTS-09", "responseValue": "5" },
          { "itemCode": "WTS-10", "responseValue": "5" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": { "test_anxiety_impairment": 5 },
          "totalScoreKeys": ["test_anxiety_impairment"]
        }
      },
      {
        "name": "minimum-keyed",
        "answers": [
          { "itemCode": "WTS-01", "responseValue": "1" },
          { "itemCode": "WTS-02", "responseValue": "1" },
          { "itemCode": "WTS-03", "responseValue": "1" },
          { "itemCode": "WTS-04", "responseValue": "1" },
          { "itemCode": "WTS-05", "responseValue": "1" },
          { "itemCode": "WTS-06", "responseValue": "1" },
          { "itemCode": "WTS-07", "responseValue": "1" },
          { "itemCode": "WTS-08", "responseValue": "1" },
          { "itemCode": "WTS-09", "responseValue": "1" },
          { "itemCode": "WTS-10", "responseValue": "1" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": { "test_anxiety_impairment": 1 },
          "totalScoreKeys": ["test_anxiety_impairment"]
        }
      },
      {
        "name": "sample-graded",
        "answers": [
          { "itemCode": "WTS-01", "responseValue": "5" },
          { "itemCode": "WTS-02", "responseValue": "4" },
          { "itemCode": "WTS-03", "responseValue": "3" },
          { "itemCode": "WTS-04", "responseValue": "2" },
          { "itemCode": "WTS-05", "responseValue": "1" },
          { "itemCode": "WTS-06", "responseValue": "5" },
          { "itemCode": "WTS-07", "responseValue": "4" },
          { "itemCode": "WTS-08", "responseValue": "3" },
          { "itemCode": "WTS-09", "responseValue": "2" },
          { "itemCode": "WTS-10", "responseValue": "1" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": { "test_anxiety_impairment": 3 },
          "totalScoreKeys": ["test_anxiety_impairment"]
        }
      },
      {
        "name": "missing-item",
        "answers": [
          { "itemCode": "WTS-01", "responseValue": "4" },
          { "itemCode": "WTS-02", "responseValue": "3" },
          { "itemCode": "WTS-03", "responseValue": "2" },
          { "itemCode": "WTS-04", "responseValue": "2" },
          { "itemCode": "WTS-05", "responseValue": "1" },
          { "itemCode": "WTS-06", "responseValue": "5" },
          { "itemCode": "WTS-07", "responseValue": "4" },
          { "itemCode": "WTS-08", "responseValue": "3" },
          { "itemCode": "WTS-09", "responseValue": "2" }
        ],
        "expected": {
          "quality": "invalid",
          "scores": { "test_anxiety_impairment": null },
          "totalScoreKeys": ["test_anxiety_impairment"]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
