import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text © 2005 Jeffrey S. Simons and Raluca M. Gaher; transcribed from a publicly posted copy, license unverified.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "dts15",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Distress Tolerance Scale, 15-item",
      "abbreviation": "DTS",
      "instrumentFamily": "Distress Tolerance Scale"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "自评对负性情绪状态的主观耐受能力与评价。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:dbt",
        "construct:dbt_dts_distress_tolerance",
        "distress_tolerance",
        "adult_self_report",
        "self_report",
        "use:reflection",
        "use:research",
        "language_validation:english_original",
        "license:license_unverified",
        "subscale_structure_pending_verification"
      ]
    },
    "population": {
      "populationNotes": "原版验证样本为美国大学生；未建立儿童青少年常模。青少年施测前须评估年龄适配性。原论文四因子（Tolerance/Absorption/Appraisal/Regulation）的题项归属未能在公开来源核实，本版本只实现总分。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 15,
      "estimatedMinutes": 6,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "一般性评价（“想到自己难受/不安的时候”），无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原15题顺序与五点同意度选项（1=非常同意 … 5=非常不同意）。",
        "全部题目按官方方向统一反向计分。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版在大学生样本验证了总分与四因子结构。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "耐受评价的反馈不构成临床判断。"
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
        "evidenceId": "simons-gaher-dts-2005",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US undergraduate samples",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development with four-factor structure, internal consistency and convergent/discriminant validity.",
        "rating": "SUFFICIENT",
        "citation": "Simons JS, Gaher RM. (2005). The Distress Tolerance Scale: Development and validation of a self-report measure. Motivation and Emotion, 29(2), 83–102.",
        "doi": "10.1007/s11031-005-7955-3",
        "url": "https://doi.org/10.1007/s11031-005-7955-3",
        "notes": "原文为订阅期刊，四因子题项归属未逐题核实；本版本仅实现统一反向后的总分均值。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "dts15-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "dts15-en-v1",
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
    "text": "Think of times that you feel distressed or upset. Select the item from the menu that best describes your beliefs about feeling distressed or upset.",
    "language": "en",
    "version": "1.0.0",
    "source": "题本PDF Directions 行，逐字转录。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Distress Tolerance Scale (DTS)",
        "citation": "Simons JS, Gaher RM. (2005). The Distress Tolerance Scale: Development and validation of a self-report measure. Motivation and Emotion, 29(2), 83–102.",
        "url": "https://healccc.com/wp-content/uploads/2022/10/EEC_00_Distress-Tolerance-Scale.pdf",
        "publicationYear": 2005
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题本页脚标注 © 2005 Jeffrey S. Simons and Raluca M. Gaher；转录自公开网络副本，未取得作者或出版方授权声明。不声称商业、翻译或再分发授权；正式发布前须确认权利。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "dts_agreement_1_5",
          "options": [
            {
              "value": "1",
              "label": "Strongly agree",
              "score": 1
            },
            {
              "value": "2",
              "label": "Mildly agree",
              "score": 2
            },
            {
              "value": "3",
              "label": "Agree and disagree equally",
              "score": 3
            },
            {
              "value": "4",
              "label": "Mildly disagree",
              "score": 4
            },
            {
              "value": "5",
              "label": "Strongly disagree",
              "score": 5
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "DTS-01",
          "content": "Feeling distressed or upset is unbearable to me.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-02",
          "content": "When I feel distressed or upset, all I can think about is how bad I feel.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-03",
          "content": "I can’t handle feeling distressed or upset.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-04",
          "content": "My feelings of distress are so intense that they completely take over.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-05",
          "content": "There’s nothing worse than feeling distressed or upset.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-06",
          "content": "I can tolerate being distressed or upset as well as most people.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-07",
          "content": "My feelings of distress or being upset are not acceptable.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-08",
          "content": "I’ll do anything to avoid feeling distressed or upset.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-09",
          "content": "Other people seem to be able to tolerate feeling distressed or upset better that I can.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-10",
          "content": "Being distressed or upset is always a major ordeal for me.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-11",
          "content": "I am ashamed of myself when I feel distressed or upset.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-12",
          "content": "My feelings of distress or being upset scare me.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-13",
          "content": "I’ll do anything to stop feeling distressed or upset.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-14",
          "content": "When I feel distressed or upset, I must do something about it immediately.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-15",
          "content": "When I feel distressed or upset, I cannot help but concentrate on how bad the distress actually feels.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "dts_agreement_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "DTS-01",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-02",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-03",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-04",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-05",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-06",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-07",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-08",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-09",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-10",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-11",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-12",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-13",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-14",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DTS-15",
            "transform": {
              "type": "reverse"
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
            "label": "全部15题均值（统一反向）",
            "description": "15题全部按 6−作答 统一反向后求均值；分数越高代表对负性情绪的耐受评价越好。必须完整作答。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "DTS-01",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-02",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-03",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-04",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-05",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-06",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-07",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-08",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-09",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-10",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-11",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-12",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-13",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-14",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-15",
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
          "total"
        ],
        "scoreOrder": [
          "total"
        ],
        "interpretations": [
          {
            "scoreKey": "total",
            "headline": "对“难受”的评价",
            "source": {
              "type": "score_only"
            },
            "summary": "这份记录反映你如何看待和承受难受的情绪——是觉得不可忍受，还是相信自己对难受有一定的容纳空间。这是对情绪的态度与评价，不是能力测验，更不是性格判决。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回想最近一次难受的经历：当时你对自己说了什么？这些话让难受更容易承受，还是更难？"
              },
              {
                "category": "strategy",
                "text": "下一次难受时，试着先不做任何“马上摆脱它”的动作，给自己90秒只是感受它——然后再决定怎么做。"
              }
            ]
          }
        ],
        "limitations": [
          "本版本只实现统一反向后的总分均值；原论文四因子的题项归属未经核实，未提供分量表分。",
          "原验证样本为美国大学生；不构成儿童青少年常模。",
          "没有常模、百分位或临床界值；分数是“对难受的评价”，不是能力测验。",
          "各分数必须完整作答是产品保守约定；缺答不会算零。",
          "题本转录自公开网络副本，权利状态未确认。"
        ],
        "disclaimer": "仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。"
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
            "itemCode": "DTS-01",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-02",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-03",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-04",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-05",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-06",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-07",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-08",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-10",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-11",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-12",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-13",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-14",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-15",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 5.0
          },
          "totalScoreKeys": [
            "total"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "DTS-01",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-02",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-03",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-04",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-05",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-06",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-07",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-08",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-09",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-10",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-11",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-12",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-13",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-14",
            "responseValue": "5"
          },
          {
            "itemCode": "DTS-15",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 1.0
          },
          "totalScoreKeys": [
            "total"
          ]
        }
      },
      {
        "name": "sample-234-bands",
        "answers": [
          {
            "itemCode": "DTS-01",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-02",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-03",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-04",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-05",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-06",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-07",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-08",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-09",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-10",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-11",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-12",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-14",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-15",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 3.0
          },
          "totalScoreKeys": [
            "total"
          ]
        }
      },
      {
        "name": "missing-total",
        "answers": [
          {
            "itemCode": "DTS-01",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-02",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-03",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-04",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-05",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-06",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-07",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-08",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-10",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-11",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-12",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-14",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-15",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "total": null
          },
          "totalScoreKeys": [
            "total"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
