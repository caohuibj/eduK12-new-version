import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text © PSM ZI Mannheim 06/2007, distributed via UW BRTC for noncommercial research/clinical/educational use.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "bsl23",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Borderline Symptom List-23",
      "abbreviation": "BSL-23",
      "instrumentFamily": "Borderline Symptom List"
    },
    "construct": {
      "primaryDomain": "BEHAVIORAL_DIFFICULTIES",
      "secondaryDomains": [],
      "constructDefinition": "自评上一周边缘型人格相关困扰的强度，用作临床症状变化的结局指标。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:dbt",
        "construct:dbt_bsl23_borderline_symptoms",
        "clinical_symptom_outcome",
        "adult_clinical_population",
        "self_report",
        "use:research",
        "language_validation:english_original",
        "license:rights_restricted_noncommercial"
      ]
    },
    "population": {
      "populationNotes": "原版为德国成人临床样本（边缘型人格障碍及对照），英语版经 UW BRTC 分发；未建立儿童青少年常模。本工具面向临床研究情境，不得用于普通学生筛查或个体分级；含自伤相关条目，施测须配套专业支持流程。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 23,
      "estimatedMinutes": 8,
      "administrationModes": [
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "过去一周",
      "requiredTraining": true,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原23题顺序与0–4五档强度选项。",
        "表内附带的0–100%总体状态自评与BSL补充行为条目不属于BSL-23计分，未实现。",
        "建议在专业指导下施测；数字模式不含独立施测入口。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版用于边缘型人格症状变化的量化追踪。"
        }
      ],
      "forbiddenUses": [
        "DIAGNOSIS",
        "HIGH_STAKES_SELECTION",
        "SCHOOL_RANKING",
        "TEACHER_ACCOUNTABILITY",
        "UNSUPPORTED_GROUP_COMPARISON",
        "INDIVIDUAL_REFLECTION"
      ]
    },
    "evidence": [
      {
        "evidenceId": "bohus-bsl-2007",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "German adult clinical samples (BPD and comparisons)",
        "locale": "de",
        "territory": "DE",
        "studyDesign": "Scale development and psychometric evaluation of the BSL and brief 23-item form.",
        "rating": "SUFFICIENT",
        "citation": "Bohus M, Limberger MF, Frank U, Chapman AL, Kühler T, Stieglitz R-D. (2007). Psychometric properties of the Borderline Symptom List (BSL). BMC Psychiatry, 7, 70.",
        "doi": "10.1186/1471-244X-7-70",
        "url": "https://doi.org/10.1186/1471-244X-7-70",
        "notes": "英语题本与官方计分说明经 UW BRTC 分发；计分信为23题求和（0–92）与均值（官方允许缺2题，产品未采用该宽限）。无临床界值；不用于诊断。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "bsl23-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "bsl23-en-v1",
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
  "instruction": {
    "schemaVersion": 1,
    "text": "In the following table you will find a set of difficulties and problems which possibly describe you. Please work through the questionnaire and decide how much you suffered from each problem in the course of the last week. In case you have no feelings at all at the present moment, please answer according to how you think you might have felt. Please answer honestly. All questions refer to the last week. If you felt different ways at different times in the week, give a rating for how things were for you on average. Please be sure to answer each question.",
    "language": "en",
    "version": "1.0.0",
    "source": "UW BRTC 分发英语题本第1页前导语（©PSM ZI Mannheim 06/2007），逐字转录。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Borderline Symptom List 23 (BSL-23)",
        "citation": "Bohus M, Limberger MF, Frank U, Chapman AL, Kühler T, Stieglitz R-D. (2007). Psychometric properties of the Borderline Symptom List (BSL). BMC Psychiatry, 7, 70.",
        "url": "https://depts.washington.edu/uwbrtc/wp-content/uploads/Borderline-Symptom-List-BLS-23.pdf",
        "publicationYear": 2007
      },
      "license": {
        "status": "restricted",
        "redistribution": "restricted",
        "note": "英语题本 ©PSM ZI Mannheim 06/2007，经华盛顿大学 BRTC 评估工具页公开分发；BRTC 声明其工具仅限研究、临床及教育用途，不得商业使用。本登记仅用于非商业研究草稿；正式发布、翻译或商业部署前须联系权利方（计分说明页留有作者联系方式 Martin.Bohus@zi-mannheim.de）。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "bsl_intensity_0_4",
          "options": [
            {
              "value": "0",
              "label": "not at all",
              "score": 0
            },
            {
              "value": "1",
              "label": "a little",
              "score": 1
            },
            {
              "value": "2",
              "label": "rather",
              "score": 2
            },
            {
              "value": "3",
              "label": "much",
              "score": 3
            },
            {
              "value": "4",
              "label": "very strong",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "BSL-01",
          "content": "It was hard for me to concentrate",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-02",
          "content": "I felt helpless",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-03",
          "content": "I was absent-minded and unable to remember what I was actually doing",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-04",
          "content": "I felt disgust",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-05",
          "content": "I thought of hurting myself",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-06",
          "content": "I didn’t trust other people",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-07",
          "content": "I didn’t believe in my right to live",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-08",
          "content": "I was lonely",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-09",
          "content": "I experienced stressful inner tension",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-10",
          "content": "I had images that I was very much afraid of",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-11",
          "content": "I hated myself",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-12",
          "content": "I wanted to punish myself",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-13",
          "content": "I suffered from shame",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-14",
          "content": "My mood rapidly cycled in terms of anxiety, anger, and depression",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-15",
          "content": "I suffered from voices and noises from inside or outside my head",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-16",
          "content": "Criticism had a devastating effect on me",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-17",
          "content": "I felt vulnerable",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-18",
          "content": "The idea of death had a certain fascination for me",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-19",
          "content": "Everything seemed senseless to me",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-20",
          "content": "I was afraid of losing control",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-21",
          "content": "I felt disgusted by myself",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-22",
          "content": "I felt as if I was far away from myself",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "BSL-23",
          "content": "I felt worthless",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "bsl_intensity_0_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "BSL-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BSL-23",
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
            "key": "total",
            "type": "total",
            "label": "全部23题总和",
            "description": "23题作答直接求和（无反向题）；必须完整作答。范围0–92，分数越高代表上一周这类困扰平均越重。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "BSL-01",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-02",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-03",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-04",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-05",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-06",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-07",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-08",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-09",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-10",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-11",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-12",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-13",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-14",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-15",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-16",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-17",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-18",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-19",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-20",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-21",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-22",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-23",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "mean",
            "type": "total",
            "label": "全部23题均值",
            "description": "23题作答求均值（无反向题）；必须完整作答。范围0–4，便于不同时点比较。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "BSL-01",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-02",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-03",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-04",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-05",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-06",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-07",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-08",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-09",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-10",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-11",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-12",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-13",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-14",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-15",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-16",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-17",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-18",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-19",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-20",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-21",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-22",
                  "weight": 1
                },
                {
                  "itemCode": "BSL-23",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "total",
          "mean"
        ],
        "scoreOrder": [
          "total",
          "mean"
        ],
        "interpretations": [
          {
            "scoreKey": "total",
            "headline": "这一周的困扰记录",
            "source": {
              "type": "score_only"
            },
            "summary": "这份记录汇总了上一周23类困扰出现的强度，是研究情境下的症状变化指标，不是诊断，也不定义你这个人。数字高只说明这一周更难熬，不代表以后一直如此。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "这一周里，哪一天感觉最不一样？当时发生了什么或谁在场？"
              },
              {
                "category": "strategy",
                "text": "把这份记录带给你的医生或心理专业人员，一起看趋势比单次数字更有用。"
              }
            ]
          },
          {
            "scoreKey": "mean",
            "headline": "平均强度",
            "source": {
              "type": "score_only"
            },
            "summary": "均值把总和换算回0–4的范围，方便与之前或之后的记录比较。它不能与他人直接比较，也不用于划定“严重程度等级”。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "与上次记录相比，哪些方面变化最大？"
              },
              {
                "category": "strategy",
                "text": "如果出现伤害自己的念头，请立即联系你的治疗团队或当地危机干预/心理援助热线；等待时先让自己待在安全的环境。"
              }
            ]
          }
        ],
        "limitations": [
          "本工具是临床研究情境下的症状变化指标，不是诊断，也不能用于普通学生筛查或个体分级。",
          "原版样本为德国成人临床人群；不构成儿童青少年常模。",
          "没有常模、百分位或临床界值；单次分数不构成严重程度判定。",
          "官方计分允许缺2题计算均值；产品采用更严格的完整作答约定，缺答不补零。",
          "含自伤相关条目；施测与结果反馈须配套专业支持流程。"
        ],
        "disclaimer": "仅供研究情境使用；若出现伤害自己的念头，请立即联系治疗团队或当地危机干预/心理援助热线。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-keyed-min",
        "answers": [
          {
            "itemCode": "BSL-01",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-02",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-03",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-04",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-05",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-06",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-07",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-08",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-09",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-10",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-11",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-12",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-13",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-14",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-15",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-16",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-17",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-18",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-19",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-20",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-21",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-22",
            "responseValue": "0"
          },
          {
            "itemCode": "BSL-23",
            "responseValue": "0"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 0,
            "mean": 0.0
          },
          "totalScoreKeys": [
            "total",
            "mean"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "BSL-01",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-02",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-03",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-04",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-05",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-06",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-07",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-08",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-09",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-10",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-11",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-12",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-13",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-14",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-15",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-16",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-17",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-18",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-19",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-20",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-21",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-22",
            "responseValue": "4"
          },
          {
            "itemCode": "BSL-23",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 92,
            "mean": 4.0
          },
          "totalScoreKeys": [
            "total",
            "mean"
          ]
        }
      },
      {
        "name": "sample-odd1-even2",
        "answers": [
          {
            "itemCode": "BSL-01",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-02",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-03",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-04",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-05",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-06",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-07",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-08",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-09",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-10",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-11",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-12",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-13",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-14",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-15",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-16",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-17",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-18",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-19",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-20",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-21",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-22",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-23",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 34,
            "mean": 1.48
          },
          "totalScoreKeys": [
            "total",
            "mean"
          ]
        }
      },
      {
        "name": "missing-total",
        "answers": [
          {
            "itemCode": "BSL-01",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-02",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-03",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-04",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-06",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-07",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-08",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-09",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-10",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-11",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-12",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-13",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-14",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-15",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-16",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-17",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-18",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-19",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-20",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-21",
            "responseValue": "1"
          },
          {
            "itemCode": "BSL-22",
            "responseValue": "2"
          },
          {
            "itemCode": "BSL-23",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "total": null,
            "mean": null
          },
          "totalScoreKeys": [
            "total",
            "mean"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
