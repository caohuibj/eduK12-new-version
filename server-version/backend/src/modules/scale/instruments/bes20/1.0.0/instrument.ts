import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text: IDB 2022, p.29, © IDB, CC BY-NC-ND 3.0 IGO; original BES by Jolliffe & Farrington (2006).
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "bes20",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Basic Empathy Scale, original 20-item version",
      "abbreviation": "BES-20",
      "instrumentFamily": "Basic Empathy Scale"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [],
      "constructDefinition": "自评对他人情绪的情感共鸣与认知理解两个方面。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": ["license:noncommercial", "domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:k12", "response:student_self", "use:reflection", "use:research", "language_validation:english_original", "construct:sel_bes20_affective_empathy", "construct:sel_bes20_cognitive_empathy", 
        "empathy",
        "affective_empathy",
        "cognitive_empathy",
        "adolescent_self_report"
      ]
    },
    "population": {
      "populationNotes": "原版英文验证为英格兰约15岁的Year 10青少年；不将中文修订版证据套用原版。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 20,
      "estimatedMinutes": 5,
      "administrationModes": [
        "PAPER"
      ],
      "timeFrame": "一般自我描述，无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "英文原文引自IDB报告第29页；原报告只标出1、3、5的文字，2和4显示数字。",
        "第6题属于认知而非情感；预计时长为产品估计。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版英文在英格兰青少年样本研究。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "自评结果不定义人格或道德价值。"
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
        "evidenceId": "jolliffe-farrington-bes-2006",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "English Year 10 adolescents around age 15, independent samples of 363 and 357",
        "locale": "en",
        "territory": "GB",
        "studyDesign": "Scale development and two-factor confirmatory analysis in a separate school cohort.",
        "rating": "SUFFICIENT",
        "citation": "Jolliffe D, Farrington DP. (2006). Development and validation of the Basic Empathy Scale. Journal of Adolescence, 29(4), 589–611. https://doi.org/10.1016/j.adolescence.2005.08.010",
        "doi": "10.1016/j.adolescence.2005.08.010",
        "url": "https://pubmed.ncbi.nlm.nih.gov/16198409/",
        "notes": "该证据对应英文青少年样本，不构成本地常模。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "bes20-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "bes20-en-v1",
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
        "title": "Basic Empathy Scale (BES)",
        "citation": "Jolliffe D, Farrington DP. (2006). Development and validation of the Basic Empathy Scale. Journal of Adolescence, 29(4), 589–611. https://doi.org/10.1016/j.adolescence.2005.08.010",
        "url": "https://publications.iadb.org/publications/english/document/Skills-for-life-A-review-of-life-skills-and-their-measurability-malleability-and-meaningfulness.pdf",
        "publicationYear": 2006
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文引自 McGrath & Adler (2022) IDB报告第29页，©2022 Inter-American Development Bank，CC BY-NC-ND 3.0 IGO（https://creativecommons.org/licenses/by-nc-nd/3.0/igo/legalcode），署名、非商业、不得分发改编；独立BES题本权利范围未确认，不声称商业或翻译授权。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "bes_agreement_1_5",
          "options": [
            {
              "value": "1",
              "label": "Strongly disagree",
              "score": 1
            },
            {
              "value": "2",
              "label": "2",
              "score": 2
            },
            {
              "value": "3",
              "label": "Neutral",
              "score": 3
            },
            {
              "value": "4",
              "label": "4",
              "score": 4
            },
            {
              "value": "5",
              "label": "Strongly agree",
              "score": 5
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "BES-01",
          "content": "My friend’s emotions don’t affect me much.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-02",
          "content": "After being with a friend who is sad about something, I usually feel sad.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-03",
          "content": "I can understand my friend’s happiness when she/he does well at something.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-04",
          "content": "I get frightened when I watch characters in a good scary movie.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-05",
          "content": "I get caught up in other people’s feelings easily.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-06",
          "content": "I find it hard to know when my friends are frightened.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-07",
          "content": "I don’t become sad when I see other people crying.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-08",
          "content": "Other people’s feelings don’t bother me at all.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-09",
          "content": "When someone is feeling ‘down’ I can usually understand how they feel.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-10",
          "content": "I can usually work out when my friends are scared.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-11",
          "content": "I often become sad when watching sad things on TV or in films.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-12",
          "content": "I can often understand how people are feeling even before they tell me.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-13",
          "content": "Seeing a person who has been angered has no effect on my feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-14",
          "content": "I can usually work out when people are cheerful.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-15",
          "content": "I tend to feel scared when I am with friends who are afraid.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-16",
          "content": "I can usually realize quickly when a friend is angry.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-17",
          "content": "I often get swept up in my friend’s feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-18",
          "content": "My friend’s unhappiness doesn’t make me feel anything.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-19",
          "content": "I am not usually aware of my friend’s feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BES-20",
          "content": "I have trouble figuring out when my friends are happy.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "bes_agreement_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "BES-01",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "BES-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-06",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "BES-07",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "BES-08",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "BES-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-13",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "BES-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BES-18",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "BES-19",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "BES-20",
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
            "key": "affective_empathy",
            "type": "dimension",
            "label": "情感共情",
            "description": "相关题按反向键统一方向后求和；必须完整作答。",
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
                  "itemCode": "BES-01",
                  "weight": 1
                },
                {
                  "itemCode": "BES-02",
                  "weight": 1
                },
                {
                  "itemCode": "BES-04",
                  "weight": 1
                },
                {
                  "itemCode": "BES-05",
                  "weight": 1
                },
                {
                  "itemCode": "BES-07",
                  "weight": 1
                },
                {
                  "itemCode": "BES-08",
                  "weight": 1
                },
                {
                  "itemCode": "BES-11",
                  "weight": 1
                },
                {
                  "itemCode": "BES-13",
                  "weight": 1
                },
                {
                  "itemCode": "BES-15",
                  "weight": 1
                },
                {
                  "itemCode": "BES-17",
                  "weight": 1
                },
                {
                  "itemCode": "BES-18",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "cognitive_empathy",
            "type": "dimension",
            "label": "认知共情",
            "description": "相关题按反向键统一方向后求和；必须完整作答。",
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
                  "itemCode": "BES-03",
                  "weight": 1
                },
                {
                  "itemCode": "BES-06",
                  "weight": 1
                },
                {
                  "itemCode": "BES-09",
                  "weight": 1
                },
                {
                  "itemCode": "BES-10",
                  "weight": 1
                },
                {
                  "itemCode": "BES-12",
                  "weight": 1
                },
                {
                  "itemCode": "BES-14",
                  "weight": 1
                },
                {
                  "itemCode": "BES-16",
                  "weight": 1
                },
                {
                  "itemCode": "BES-19",
                  "weight": 1
                },
                {
                  "itemCode": "BES-20",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "total",
            "type": "total",
            "label": "全部20题总和",
            "description": "相关题按反向键统一方向后求和；必须完整作答。",
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
                  "itemCode": "BES-01",
                  "weight": 1
                },
                {
                  "itemCode": "BES-02",
                  "weight": 1
                },
                {
                  "itemCode": "BES-03",
                  "weight": 1
                },
                {
                  "itemCode": "BES-04",
                  "weight": 1
                },
                {
                  "itemCode": "BES-05",
                  "weight": 1
                },
                {
                  "itemCode": "BES-06",
                  "weight": 1
                },
                {
                  "itemCode": "BES-07",
                  "weight": 1
                },
                {
                  "itemCode": "BES-08",
                  "weight": 1
                },
                {
                  "itemCode": "BES-09",
                  "weight": 1
                },
                {
                  "itemCode": "BES-10",
                  "weight": 1
                },
                {
                  "itemCode": "BES-11",
                  "weight": 1
                },
                {
                  "itemCode": "BES-12",
                  "weight": 1
                },
                {
                  "itemCode": "BES-13",
                  "weight": 1
                },
                {
                  "itemCode": "BES-14",
                  "weight": 1
                },
                {
                  "itemCode": "BES-15",
                  "weight": 1
                },
                {
                  "itemCode": "BES-16",
                  "weight": 1
                },
                {
                  "itemCode": "BES-17",
                  "weight": 1
                },
                {
                  "itemCode": "BES-18",
                  "weight": 1
                },
                {
                  "itemCode": "BES-19",
                  "weight": 1
                },
                {
                  "itemCode": "BES-20",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "affective_empathy",
          "cognitive_empathy"
        ],
        "scoreOrder": [
          "affective_empathy",
          "cognitive_empathy",
          "total"
        ],
        "interpretations": [
          {
            "scoreKey": "affective_empathy",
            "headline": "感受的回声",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注他人的情绪是否会影响你的感受。感受到别人的难过，不代表你必须承担或解决所有事情；照顾自己的感受也很重要。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "当朋友难过时，你身体或心里会有什么变化？什么能让你保持一点自己的空间？"
              },
              {
                "category": "strategy",
                "text": "下次陪伴朋友时，辨认“这是对方的感受，这是我的感受”，必要时找信任的人支持。"
              }
            ]
          },
          {
            "scoreKey": "cognitive_empathy",
            "headline": "理解对方",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注你对他人心情的理解。即使很熟悉，也不一定总能准确猜到对方的感受；多问一句可以帮助彼此理解。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "有没有一次，你发现朋友真正的感受和自己猜的不一样？"
              },
              {
                "category": "strategy",
                "text": "试着说：“我猜你可能有点失落，我理解得对吗？”让对方决定怎么回答。"
              }
            ]
          },
          {
            "scoreKey": "total",
            "headline": "这次回答的整体记录",
            "source": {
              "type": "score_only"
            },
            "summary": "总均值汇总两类题目的回答，不能说明一个人在所有情境中的关心方式，也不能定义善良与否。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回顾两方面的具体经历，哪些情境让你更容易理解或感受到别人的心情？"
              },
              {
                "category": "strategy",
                "text": "选择一个舒服的方式练习倾听，尊重对方和自己的边界。"
              }
            ]
          }
        ],
        "limitations": [
          "英文自评受情境、心情与表达方式影响，不能代表所有关系。",
          "原验证为英格兰约15岁的学生，不构成中文人群常模。",
          "各分数必须完整作答是产品约定；缺答不会算零。",
          "没有常模、百分位或诊断阈值。"
        ],
        "disclaimer": "仅供认识与反思，不用于诊断、人格评判或高风险决策。"
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
            "itemCode": "BES-01",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-02",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-03",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-04",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-05",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-06",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-07",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-08",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-09",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-10",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-11",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-12",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-13",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-14",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-15",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-16",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-17",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-18",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-19",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-20",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "affective_empathy": 11,
            "cognitive_empathy": 9,
            "total": 20
          },
          "totalScoreKeys": [
            "affective_empathy",
            "cognitive_empathy",
            "total"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "BES-01",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-02",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-03",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-04",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-05",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-06",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-07",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-08",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-09",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-10",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-11",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-12",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-13",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-14",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-15",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-16",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-17",
            "responseValue": "5"
          },
          {
            "itemCode": "BES-18",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-19",
            "responseValue": "1"
          },
          {
            "itemCode": "BES-20",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "affective_empathy": 55,
            "cognitive_empathy": 45,
            "total": 100
          },
          "totalScoreKeys": [
            "affective_empathy",
            "cognitive_empathy",
            "total"
          ]
        }
      },
      {
        "name": "sample-44-27",
        "answers": [
          {
            "itemCode": "BES-01",
            "responseValue": "2"
          },
          {
            "itemCode": "BES-02",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-03",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-04",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-05",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-06",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-07",
            "responseValue": "2"
          },
          {
            "itemCode": "BES-08",
            "responseValue": "2"
          },
          {
            "itemCode": "BES-09",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-10",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-11",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-12",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-13",
            "responseValue": "2"
          },
          {
            "itemCode": "BES-14",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-15",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-16",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-17",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-18",
            "responseValue": "2"
          },
          {
            "itemCode": "BES-19",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-20",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "affective_empathy": 44,
            "cognitive_empathy": 27,
            "total": 71
          },
          "totalScoreKeys": [
            "affective_empathy",
            "cognitive_empathy",
            "total"
          ]
        }
      },
      {
        "name": "missing-affective",
        "answers": [
          {
            "itemCode": "BES-02",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-03",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-04",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-05",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-06",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-07",
            "responseValue": "2"
          },
          {
            "itemCode": "BES-08",
            "responseValue": "2"
          },
          {
            "itemCode": "BES-09",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-10",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-11",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-12",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-13",
            "responseValue": "2"
          },
          {
            "itemCode": "BES-14",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-15",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-16",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-17",
            "responseValue": "4"
          },
          {
            "itemCode": "BES-18",
            "responseValue": "2"
          },
          {
            "itemCode": "BES-19",
            "responseValue": "3"
          },
          {
            "itemCode": "BES-20",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "affective_empathy": null,
            "cognitive_empathy": 27,
            "total": null
          },
          "totalScoreKeys": [
            "affective_empathy",
            "cognitive_empathy",
            "total"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
