import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text, reverse key and scoring instruction transcribed verbatim from the
// 12-item CAMS-R form PDF hosted by the UC Berkeley Greater Good Science Center
// (https://ggsc.berkeley.edu/images/uploads/The_Cognitive_and_Affective_Mindfulness_Scale_Revised.pdf).
// Original scale: Feldman, G., Hayes, A., Kumar, S. M., Greeson, J. M., & Laurenceau, J.-P. (2007),
// Journal of Psychopathology and Behavioral Assessment, 29(3), 177-190 (citation printed on the PDF,
// start page only; verified via Crossref). The GGSC form does not print the option anchor text; the
// 4-point anchors (1=rarely/not at all, 2=sometimes, 3=often, 4=almost always) are corroborated
// verbatim from peer-reviewed open-access descriptions of the CAMS-R (Europe PMC PMC13059079;
// consistent with PMC13370295 and PMC10779681). See docs/mindfulness-content-20261028/cams_r12/source.md.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "cams_r12",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Cognitive and Affective Mindfulness Scale-Revised, 12-item version",
      "abbreviation": "CAMS-R",
      "instrumentFamily": "Cognitive and Affective Mindfulness Scale-Revised"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "成人自报的日常正念品质（专注、当下、觉察与接纳的宽泛概念化，单维总分 12–48）；不是正念能力考试、症状筛查或干预疗效判定。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "cams_r12",
        "domain:mindfulness",
        "domain:self_regulation",
        "construct:mindfulness_cams_r12_total",
        "construct:mindfulness_cams_r12_single_dimension",
        "orientation:mindfulness_processes",
        "population:adult_18_plus",
        "population:self_report",
        "response:12_items",
        "response:three_reverse_items",
        "response:four_point_frequency_1_4",
        "use:research",
        "use:individual_reflection",
        "use:not_diagnostic",
        "use:not_high_stakes_selection",
        "use:not_school_ranking",
        "use:no_validated_cutoff",
        "license:source_hosted_pdf",
        "license:redistribution_review_pending",
        "language_validation:original_en",
        "成人自评",
        "正念觉察",
        "个人反思",
        "非诊断"
      ]
    },
    "population": {
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL",
      "populationNotes": "原版开发与验证基于北美成人样本（Feldman et al., 2007）；本条目按 18 岁以上成人自评登记（18 岁下限为产品边界）。英文原版无中文人群验证，不将任何中文修订版或其他语言版本的证据套用于此，也不与本分支 FFMQ/KIMS/MAAS/TMS/CAMM 条目互换分数或证据。"
    },
    "administration": {
      "itemCount": 12,
      "estimatedMinutes": 4,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "PAPER"
      ],
      "timeFrame": "一般情形的自我描述（“rate how much each of these ways applies to you”），无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "题干、反向键与计分说明逐字取自 GGSC 托管的官方题本 PDF；题号与 PDF 一致。",
        "选项锚点：GGSC 表未印锚点文字；本条目采用 4 点锚点 1=rarely/not at all、2=sometimes、3=often、4=almost always，逐字出处为同行评审 OA 文献对 CAMS-R 的描述（Europe PMC PMC13059079，另 PMC13370295、PMC10779681 一致）；取得作者原件后以原件为准。",
        "官方计分说明：“Items 2, 6, and 7 are reverse-scored. After appropriate reversals, sum values for items 1 - 12. Higher values reflect greater mindful qualities.”反向公式按 1–4 量表镜像翻转为 5−response。",
        "任一题缺答总分不计算（null），不把缺答当零分；complete_required 是产品保守约定，不是原作者规则。",
        "PDF 未印许可条款；预计时长为产品估计，不是原作者实测。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版英文在北美成人样本中开发并验证单维结构。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "用于成人回顾日常留意当下与接纳体验的习惯，不贴能力、人格或疾病标签。"
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
        "evidenceId": "feldman-2007-camsr",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "North American adult samples (original CAMS-R development studies; per-sample details are not printed in the hosted form PDF)",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development and validation of the 12-item CAMS-R as a single total score; official scoring reverses items 2, 6 and 7 (5 minus raw response on a 1-4 scale) and sums items 1-12 (range 12-48), where higher scores reflect greater mindful qualities.",
        "rating": "SUFFICIENT",
        "citation": "Feldman, G., Hayes, A., Kumar, S. M., Greeson, J. M., & Laurenceau, J.-P. (2007). Mindfulness and Emotion Regulation: The Development and Initial Validation of the Cognitive and Affective Mindfulness Scale-Revised (CAMS-R). Journal of Psychopathology and Behavioral Assessment, 29(3), 177–190. https://doi.org/10.1007/s10862-006-9035-8",
        "doi": "10.1007/s10862-006-9035-8",
        "url": "https://doi.org/10.1007/s10862-006-9035-8",
        "notes": "该证据对应英文成人样本，不构成本地常模，也不支持任何界值或百分位。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "cams_r12-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "cams_r12-en-v1",
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
      },
      "subject": {
        "numericScores": true,
        "references": false,
        "individualInterpretations": true,
        "scoreDerivedLabels": false,
        "resultQualityDetails": true,
        "rawAnswers": false,
        "itemScores": false,
        "methods": true,
        "educationalContent": false
      },
      "teacher": {
        "numericScores": true,
        "references": false,
        "individualInterpretations": true,
        "scoreDerivedLabels": false,
        "resultQualityDetails": true,
        "rawAnswers": false,
        "itemScores": false,
        "methods": true,
        "educationalContent": false
      },
      "researcher": {
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
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Cognitive and Affective Mindfulness Scale-Revised (CAMS-R), 12-item version",
        "citation": "Feldman, G., Hayes, A., Kumar, S. M., Greeson, J. M., & Laurenceau, J.-P. (2007). Mindfulness and Emotion Regulation: The Development and Initial Validation of the Cognitive and Affective Mindfulness Scale-Revised (CAMS-R). Journal of Psychopathology and Behavioral Assessment, 29(3), 177–190. https://doi.org/10.1007/s10862-006-9035-8",
        "url": "https://ggsc.berkeley.edu/who_we_serve/researchers/scientific_scales_and_measures",
        "publicationYear": 2007
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文、反向键与计分说明引自 UC Berkeley Greater Good Science Center 量表页公开托管的原版题本 PDF；该页面未附明确许可声明，本条目仅记录公开托管事实，不声称获得商业、翻译或再分发授权。选项锚点文字在托管表上缺失，本条目按同行评审 OA 文献佐证的 4 点锚点实现并如实记录差异（见 docs/mindfulness-content-20261028/cams_r12/source.md）。工作副本 SHA-256：b9f7a26e8747cd2ef50ea9d53fa041884e0e481a2a49ae567ed857d90c70a53d；全文提取见 _prdata/pdfs/cams_r_extract.txt。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "cams_r12_1_4",
          "options": [
            {
              "value": "1",
              "label": "rarely/not at all",
              "score": 1
            },
            {
              "value": "2",
              "label": "sometimes",
              "score": 2
            },
            {
              "value": "3",
              "label": "often",
              "score": 3
            },
            {
              "value": "4",
              "label": "almost always",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "CAMSR12_01",
          "content": "It is easy for me to concentrate on what I am doing.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_02",
          "content": "I am preoccupied by the future.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_03",
          "content": "I can tolerate emotional pain.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_04",
          "content": "I can accept things I cannot change.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_05",
          "content": "I can usually describe how I feel at the moment in considerable detail.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_06",
          "content": "I am easily distracted.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_07",
          "content": "I am preoccupied by the past.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_08",
          "content": "It’s easy for me to keep track of my thoughts and feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_09",
          "content": "I try to notice my thoughts without judging them.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_10",
          "content": "I am able to accept the thoughts and feelings I have.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_11",
          "content": "I am able to focus on the present moment.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMSR12_12",
          "content": "I am able to pay close attention to one thing for a long period of time.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "cams_r12_1_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "CAMSR12_01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CAMSR12_02",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMSR12_03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CAMSR12_04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CAMSR12_05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CAMSR12_06",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMSR12_07",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMSR12_08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CAMSR12_09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CAMSR12_10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CAMSR12_11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CAMSR12_12",
            "transform": {
              "type": "identity"
            }
          }
        ],
        "defaultMissingPolicy": {
          "type": "complete_required"
        },
        "scores": [
          {
            "key": "mindful_qualities",
            "type": "total",
            "label": "日常正念品质（单维总分）",
            "description": "官方计分：第 2、6、7 题反向（5−原始分，1–4 量表镜像）后与全部题目求和，范围 12–48，分数更高表示自报的专注、当下、觉察与接纳更频繁；任一题缺答不计算。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                { "itemCode": "CAMSR12_01", "weight": 1 },
                { "itemCode": "CAMSR12_02", "weight": 1 },
                { "itemCode": "CAMSR12_03", "weight": 1 },
                { "itemCode": "CAMSR12_04", "weight": 1 },
                { "itemCode": "CAMSR12_05", "weight": 1 },
                { "itemCode": "CAMSR12_06", "weight": 1 },
                { "itemCode": "CAMSR12_07", "weight": 1 },
                { "itemCode": "CAMSR12_08", "weight": 1 },
                { "itemCode": "CAMSR12_09", "weight": 1 },
                { "itemCode": "CAMSR12_10", "weight": 1 },
                { "itemCode": "CAMSR12_11", "weight": 1 },
                { "itemCode": "CAMSR12_12", "weight": 1 }
              ],
              "aggregation": "sum"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "mindful_qualities"
        ],
        "scoreOrder": [
          "mindful_qualities"
        ],
        "interpretations": [
          {
            "scoreKey": "mindful_qualities",
            "headline": "日常正念品质（单维总分）",
            "source": {
              "type": "score_only"
            },
            "summary": "这份问卷的 12 道题描述专注、活在当下、觉察与接纳这些日常体验。按官方规则，第 2、6、7 题反向后与全部题目求和：分数更高，表示这份自报里出现更多“留意当下、不评判地看念头”的情形。人人都会分心、都会有不想要的念头，这再正常不过；能“发现自己分心了”，恰恰已经是觉察在发生。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一次你明明在做事、脑子却跑到别处，是什么把注意力带走的？你是什么时候发现的？"
              },
              {
                "category": "strategy",
                "text": "挑一件日常小事（走路、洗碗、听人说话），试一次只留意它；发现走神了，不批评自己，轻轻回来就好。下次不舒服的感受冒出来时，先在心里给它起个名字，再决定下一步。"
              }
            ]
          }
        ],
        "limitations": [
          "这是成人自评工具：结果整理的是作答者此刻对自身体验的描述，不定义一个人是否成熟或努力，不能用于人格、能力或道德评价。",
          "英文自评受情境、心情与理解方式影响，只能作为回顾参考，不能代表所有情境。",
          "原版验证为北美成人样本（Feldman et al., 2007），不构成中国或任何本地人群常模。",
          "任一题缺答总分不计算，缺答不会算零；完整作答要求是产品约定，不是原作者规则。",
          "选项锚点文字来自同行评审文献佐证（GGSC 托管表未印锚点），已如实记录；取得作者原件后需复核。",
          "没有常模、百分位或诊断阈值；分数不用于排名、选拔或高风险决策。与本分支其他正念工具的分数不互换比较。"
        ],
        "disclaimer": "供成人回顾个人体验与日常习惯，不是考试，也不能用于诊断、人格评判、排名或高风险决策。题本为英文版。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-raw-one",
        "answers": [
          { "itemCode": "CAMSR12_01", "responseValue": "1" },
          { "itemCode": "CAMSR12_02", "responseValue": "1" },
          { "itemCode": "CAMSR12_03", "responseValue": "1" },
          { "itemCode": "CAMSR12_04", "responseValue": "1" },
          { "itemCode": "CAMSR12_05", "responseValue": "1" },
          { "itemCode": "CAMSR12_06", "responseValue": "1" },
          { "itemCode": "CAMSR12_07", "responseValue": "1" },
          { "itemCode": "CAMSR12_08", "responseValue": "1" },
          { "itemCode": "CAMSR12_09", "responseValue": "1" },
          { "itemCode": "CAMSR12_10", "responseValue": "1" },
          { "itemCode": "CAMSR12_11", "responseValue": "1" },
          { "itemCode": "CAMSR12_12", "responseValue": "1" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "mindful_qualities": 21
          },
          "totalScoreKeys": [
            "mindful_qualities"
          ]
        }
      },
      {
        "name": "all-raw-four",
        "answers": [
          { "itemCode": "CAMSR12_01", "responseValue": "4" },
          { "itemCode": "CAMSR12_02", "responseValue": "4" },
          { "itemCode": "CAMSR12_03", "responseValue": "4" },
          { "itemCode": "CAMSR12_04", "responseValue": "4" },
          { "itemCode": "CAMSR12_05", "responseValue": "4" },
          { "itemCode": "CAMSR12_06", "responseValue": "4" },
          { "itemCode": "CAMSR12_07", "responseValue": "4" },
          { "itemCode": "CAMSR12_08", "responseValue": "4" },
          { "itemCode": "CAMSR12_09", "responseValue": "4" },
          { "itemCode": "CAMSR12_10", "responseValue": "4" },
          { "itemCode": "CAMSR12_11", "responseValue": "4" },
          { "itemCode": "CAMSR12_12", "responseValue": "4" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "mindful_qualities": 39
          },
          "totalScoreKeys": [
            "mindful_qualities"
          ]
        }
      },
      {
        "name": "sum-min-12",
        "answers": [
          { "itemCode": "CAMSR12_01", "responseValue": "1" },
          { "itemCode": "CAMSR12_02", "responseValue": "4" },
          { "itemCode": "CAMSR12_03", "responseValue": "1" },
          { "itemCode": "CAMSR12_04", "responseValue": "1" },
          { "itemCode": "CAMSR12_05", "responseValue": "1" },
          { "itemCode": "CAMSR12_06", "responseValue": "4" },
          { "itemCode": "CAMSR12_07", "responseValue": "4" },
          { "itemCode": "CAMSR12_08", "responseValue": "1" },
          { "itemCode": "CAMSR12_09", "responseValue": "1" },
          { "itemCode": "CAMSR12_10", "responseValue": "1" },
          { "itemCode": "CAMSR12_11", "responseValue": "1" },
          { "itemCode": "CAMSR12_12", "responseValue": "1" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "mindful_qualities": 12
          },
          "totalScoreKeys": [
            "mindful_qualities"
          ]
        }
      },
      {
        "name": "sum-max-48",
        "answers": [
          { "itemCode": "CAMSR12_01", "responseValue": "4" },
          { "itemCode": "CAMSR12_02", "responseValue": "1" },
          { "itemCode": "CAMSR12_03", "responseValue": "4" },
          { "itemCode": "CAMSR12_04", "responseValue": "4" },
          { "itemCode": "CAMSR12_05", "responseValue": "4" },
          { "itemCode": "CAMSR12_06", "responseValue": "1" },
          { "itemCode": "CAMSR12_07", "responseValue": "1" },
          { "itemCode": "CAMSR12_08", "responseValue": "4" },
          { "itemCode": "CAMSR12_09", "responseValue": "4" },
          { "itemCode": "CAMSR12_10", "responseValue": "4" },
          { "itemCode": "CAMSR12_11", "responseValue": "4" },
          { "itemCode": "CAMSR12_12", "responseValue": "4" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "mindful_qualities": 48
          },
          "totalScoreKeys": [
            "mindful_qualities"
          ]
        }
      },
      {
        "name": "missing-item07",
        "answers": [
          { "itemCode": "CAMSR12_01", "responseValue": "3" },
          { "itemCode": "CAMSR12_02", "responseValue": "3" },
          { "itemCode": "CAMSR12_03", "responseValue": "3" },
          { "itemCode": "CAMSR12_04", "responseValue": "3" },
          { "itemCode": "CAMSR12_05", "responseValue": "3" },
          { "itemCode": "CAMSR12_06", "responseValue": "3" },
          { "itemCode": "CAMSR12_08", "responseValue": "3" },
          { "itemCode": "CAMSR12_09", "responseValue": "3" },
          { "itemCode": "CAMSR12_10", "responseValue": "3" },
          { "itemCode": "CAMSR12_11", "responseValue": "3" },
          { "itemCode": "CAMSR12_12", "responseValue": "3" }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "mindful_qualities": null
          },
          "totalScoreKeys": [
            "mindful_qualities"
          ]
        }
      },
      {
        "name": "all-missing",
        "answers": [],
        "expected": {
          "quality": "invalid",
          "scores": {
            "mindful_qualities": null
          },
          "totalScoreKeys": [
            "mindful_qualities"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
