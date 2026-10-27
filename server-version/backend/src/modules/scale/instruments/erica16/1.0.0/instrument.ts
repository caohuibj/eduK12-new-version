// ERICA-16 native DRAFT: verbatim items from the author-distributed scoring sheet.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "erica16",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Emotion Regulation Index for Children and Adolescents",
      "abbreviation": "ERICA",
      "instrumentFamily": "Emotion Regulation Index for Children and Adolescents"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [
        "SOCIAL_EMOTIONAL"
      ],
      "constructDefinition": "儿童青少年自评的情绪调节，包括情绪控制、情绪自我觉察和情境回应。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:sel",
        "license:author_contact_required",
        "license:redistribution_review_pending",
        "domain:social_emotional_competence",
        "population:k12",
        "response:student_self",
        "use:reflection",
        "use:research",
        "language_validation:english_original",
        "construct:sel_erica16_emotional_control",
        "construct:sel_erica16_emotional_self_awareness",
        "construct:sel_erica16_situational_responsiveness",
        "emotion_regulation",
        "emotional_control",
        "emotional_self_awareness",
        "situational_responsiveness",
        "child_adolescent_self_report",
        "self_report"
      ]
    },
    "population": {
      "minAge": 9,
      "maxAge": 16,
      "populationNotes": "原始心理测量研究为澳大利亚 9–16 岁学生；本轮交付作者公开英文原题的可执行草稿，未包含中文译题。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 16,
      "estimatedMinutes": 5,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "一般自我描述，无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留作者题本 16 题顺序与五点同意度选项。",
        "十个反向题按作者计分键统一方向后再计分。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "产品的自我反思反馈不构成临床判断。"
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
        "evidenceId": "macdermott-erica-2010",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Australian children and adolescents aged 9–16",
        "ageRange": "9–16 years",
        "locale": "en",
        "territory": "AU",
        "sampleSize": 1389,
        "studyDesign": "Scale development, factor analysis, internal consistency and four-week retest in a subset.",
        "rating": "MIXED",
        "citation": "MacDermott ST, Gullone E, Allen JS, King NJ, Tonge BJ. The Emotion Regulation Index for Children and Adolescents (ERICA): A Psychometric Investigation. Journal of Psychopathology and Behavioral Assessment. 2010;32:301–314.",
        "doi": "10.1007/s10862-009-9154-0",
        "url": "https://doi.org/10.1007/s10862-009-9154-0",
        "notes": "原研究自我觉察和情境回应分量表内部一致性分别为 .60 和 .64；对单人分数和后续译文须谨慎。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "erica16-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "erica16-v1",
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
  "instruction": {
    "schemaVersion": 1,
    "text": "Below are a number of statements. Please read each statement, and then circle the choice that seems most true for you. Do not spend too much time on any one item. Remember, this is not a test. There are no right or wrong answers. We really want to know what you think.",
    "language": "en",
    "version": "1.0.0",
    "source": "作者题本第 1–2 页前导语（erica_items_scoring.pdf，Gullone 作者站公开下载）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "The Emotion Regulation Index for Children and Adolescents (ERICA) — items and scoring",
        "citation": "MacDermott ST, Gullone E, Allen JS, King NJ, Tonge BJ. Journal of Psychopathology and Behavioral Assessment. 2010;32:301–314; items and scoring sheet distributed by the authors.",
        "url": "https://eleonoragullone.wordpress.com/wp-content/uploads/2018/09/erica_items_scoring.pdf",
        "publicationYear": 2010
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题本与计分说明由共同作者网站以 Psychological Measures for downloading 公开提供；页面未列出再发布或翻译许可条款。公开提供不应被当成禁止使用，也不应被当成不限用途授权；正式发布或商业使用前须向作者确认。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "erica_agreement_1_5",
          "options": [
            {
              "value": "1",
              "label": "Strongly Disagree",
              "score": 1
            },
            {
              "value": "2",
              "label": "Disagree",
              "score": 2
            },
            {
              "value": "3",
              "label": "Half and half",
              "score": 3
            },
            {
              "value": "4",
              "label": "Agree",
              "score": 4
            },
            {
              "value": "5",
              "label": "Strongly Agree",
              "score": 5
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "ERICA-01",
          "content": "I am a happy person.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-02",
          "content": "When adults are friendly to me, I am friendly to them.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-03",
          "content": "I handle it well when things change or I have to try something new.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-04",
          "content": "When I get upset, I can get over it quickly.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-05",
          "content": "When things don’t go my way I get upset easily.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-06",
          "content": "When other kids are friendly to me, I am friendly to them.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-07",
          "content": "I have angry outbursts.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-08",
          "content": "I enjoy seeing others get hurt or upset.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-09",
          "content": "I can be disruptive at the wrong times.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-10",
          "content": "I get angry when adults tell me what I can and cannot do.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-11",
          "content": "I am a sad person.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-12",
          "content": "I have trouble waiting for something I want.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-13",
          "content": "I am quiet and shy, and I don’t show my feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-14",
          "content": "I do things without thinking about them first.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-15",
          "content": "When others are upset I become sad or concerned for them.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERICA-16",
          "content": "I annoy others by not minding my own business.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "erica_agreement_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "ERICA-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERICA-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERICA-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERICA-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERICA-05",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERICA-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERICA-07",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERICA-08",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERICA-09",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERICA-10",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERICA-11",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERICA-12",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERICA-13",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERICA-14",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERICA-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERICA-16",
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
            "key": "emotional_control",
            "type": "dimension",
            "label": "情绪控制",
            "description": "统一方向后这组题目回答的平均分；越高表示作者定义的这个方向越明显。",
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
                  "itemCode": "ERICA-05",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-07",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-09",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-10",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-12",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-14",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-16",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "emotional_self_awareness",
            "type": "dimension",
            "label": "情绪自我觉察",
            "description": "统一方向后这组题目回答的平均分；越高表示作者定义的这个方向越明显。",
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
                  "itemCode": "ERICA-01",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-03",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-04",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-11",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-13",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "situational_responsiveness",
            "type": "dimension",
            "label": "情境回应",
            "description": "统一方向后这组题目回答的平均分；越高表示作者定义的这个方向越明显。",
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
                  "itemCode": "ERICA-02",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-06",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-08",
                  "weight": 1
                },
                {
                  "itemCode": "ERICA-15",
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
          "emotional_control",
          "emotional_self_awareness",
          "situational_responsiveness"
        ],
        "scoreOrder": [
          "emotional_control",
          "emotional_self_awareness",
          "situational_responsiveness"
        ],
        "interpretations": [
          {
            "scoreKey": "emotional_control",
            "headline": "稳住情绪冲动",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目问的是：想要的东西不能马上拿到、被人打断、或被大人约束时，你能不能稳住自己。分数是统一方向后的这组回答平均；越高表示你自评越能稳住。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "下次觉得快要发火时，先深呼吸一次再开口，把这件事记下来。"
              }
            ]
          },
          {
            "scoreKey": "emotional_self_awareness",
            "headline": "看清自己的心情",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目涉及知道自己快乐或难过、能否从情绪里恢复、面对变化和新事物时的状态。分数越高，表示你越认同这些关于自己的描述。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "今晚回想今天心情的一次起伏，试着用一个词把它写下来。"
              }
            ]
          },
          {
            "scoreKey": "situational_responsiveness",
            "headline": "回应别人的处境",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目看的是别人对你友善时你会怎样，以及看到别人受伤或难过时你会不会在意。分数越高表示你自评越会回应他人。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "今天留意一位同学的情绪，试着问一句：你还好吗？"
              }
            ]
          }
        ],
        "limitations": [
          "这是学生自评，反映一次作答，不构成能力或心理健康的结论。",
          "情绪自我觉察与情境回应两个分量表在原始研究中内部一致性较低（.60、.64），个体解读须谨慎。",
          "题文为作者公开英文原题；本版本未包含中文译题，中文施测前须先完成翻译与验证。",
          "没有适用于你的常模或诊断阈值。"
        ],
        "disclaimer": "这份报告用于自我反思，不用于诊断或给人排名。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "minimum-keyed",
        "answers": [
          {
            "itemCode": "ERICA-01",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-02",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-03",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-04",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-05",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-06",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-07",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-08",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-09",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-10",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-11",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-12",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-13",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-14",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-15",
            "responseValue": "1"
          },
          {
            "itemCode": "ERICA-16",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "emotional_control": 5,
            "emotional_self_awareness": 2.6,
            "situational_responsiveness": 2
          },
          "totalScoreKeys": [
            "emotional_control",
            "emotional_self_awareness",
            "situational_responsiveness"
          ]
        }
      },
      {
        "name": "maximum-keyed",
        "answers": [
          {
            "itemCode": "ERICA-01",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-02",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-03",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-04",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-05",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-06",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-07",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-08",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-09",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-10",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-11",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-12",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-13",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-14",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-15",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-16",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "emotional_control": 1,
            "emotional_self_awareness": 3.4,
            "situational_responsiveness": 4
          },
          "totalScoreKeys": [
            "emotional_control",
            "emotional_self_awareness",
            "situational_responsiveness"
          ]
        }
      },
      {
        "name": "sample-mixed",
        "answers": [
          {
            "itemCode": "ERICA-01",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-02",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-03",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-04",
            "responseValue": "4"
          },
          {
            "itemCode": "ERICA-05",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-06",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-07",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-08",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-09",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-10",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-11",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-12",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-13",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-14",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-15",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-16",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "emotional_control": 3,
            "emotional_self_awareness": 4,
            "situational_responsiveness": 4.5
          },
          "totalScoreKeys": [
            "emotional_control",
            "emotional_self_awareness",
            "situational_responsiveness"
          ]
        }
      },
      {
        "name": "missing-subscale-item",
        "answers": [
          {
            "itemCode": "ERICA-01",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-02",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-03",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-05",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-06",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-07",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-08",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-09",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-10",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-11",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-12",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-13",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-14",
            "responseValue": "3"
          },
          {
            "itemCode": "ERICA-15",
            "responseValue": "5"
          },
          {
            "itemCode": "ERICA-16",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "emotional_control": 3,
            "emotional_self_awareness": null,
            "situational_responsiveness": 4.5
          },
          "totalScoreKeys": [
            "emotional_control",
            "emotional_self_awareness",
            "situational_responsiveness"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
