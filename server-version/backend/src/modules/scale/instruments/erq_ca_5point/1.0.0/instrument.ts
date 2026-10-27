// ERQ-CA native DRAFT: verbatim 10-item form and scoring note distributed by the authors.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "erq_ca_5point",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Emotion Regulation Questionnaire for Children and Adolescents",
      "abbreviation": "ERQ-CA",
      "instrumentFamily": "Emotion Regulation Questionnaire"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [
        "SOCIAL_EMOTIONAL"
      ],
      "constructDefinition": "儿童青少年自陈使用认知重评和表达抑制两种情绪调节策略的倾向。",
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
        "construct:sel_erq_ca_cognitive_reappraisal",
        "construct:sel_erq_ca_expressive_suppression",
        "emotion_regulation",
        "cognitive_reappraisal",
        "expressive_suppression",
        "child_adolescent_self_report",
        "self_report"
      ]
    },
    "population": {
      "minAge": 10,
      "maxAge": 18,
      "populationNotes": "原始心理测量研究样本 10–18 岁；本轮交付作者公开英文原题的可执行草稿，中文五点译题未包含。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 10,
      "estimatedMinutes": 3,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "通常的自我描述；无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "使用儿童青少年版五点同意度选项；不混同成人 ERQ 七点格式。",
        "认知重评 6 题，表达抑制 4 题；不提供两策略合并总分。"
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
          "notes": "非学术反馈为产品设计，不能解释为诊断或能力等级。"
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
        "evidenceId": "gullone-taffe-2012",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Australian children and adolescents",
        "ageRange": "10–18 years",
        "locale": "en",
        "territory": "AU",
        "sampleSize": 827,
        "studyDesign": "Psychometric evaluation of two-factor structure and validity with longitudinal follow-up.",
        "rating": "SUFFICIENT",
        "citation": "Gullone E, Taffe J. The Emotion Regulation Questionnaire for Children and Adolescents: a psychometric evaluation. Psychological Assessment. 2012;24(2):409–417.",
        "doi": "10.1037/a0025777",
        "url": "https://doi.org/10.1037/a0025777",
        "notes": "原论文 2011 在线发表，2012 年正式刊载。作者题本 5 点；不得用成人版七点评分。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "erq-ca-5point-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "erq-ca-5point-v1",
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
    "text": "Below are a number of statements. Please read each statement, and then circle the choice that seems most true for you. Some of the statements may seem the same but they are different in important ways, so be sure to read carefully.",
    "language": "en",
    "version": "1.0.0",
    "source": "作者题本前导语（erq-ca.pdf，Gullone 作者站公开下载）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Emotion Regulation Questionnaire for Children and Adolescents (ERQ-CA)",
        "citation": "Gullone E, Taffe J. Psychological Assessment. 2012;24(2):409–417; author-distributed 10-item form and scoring note.",
        "url": "https://eleonoragullone.wordpress.com/wp-content/uploads/2018/09/erq-ca.pdf",
        "publicationYear": 2012
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题本与计分说明由作者网站公开提供下载；页面未列出再发布或翻译许可条款。公开提供不应被当成禁止使用，也不应被当成不限用途授权；正式发布或商业使用前须向作者确认。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "erq_ca_agreement_1_5",
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
          "itemCode": "ERQCA-01",
          "content": "When I want to feel happier, I think about something different.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "erq_ca_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERQCA-02",
          "content": "I keep my feelings to myself",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "erq_ca_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERQCA-03",
          "content": "When I want to feel less bad (e.g., sad, angry or worried), I think about something different.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "erq_ca_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERQCA-04",
          "content": "When I am feeling happy, I am careful not to show it.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "erq_ca_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERQCA-05",
          "content": "When I’m worried about something, I make myself think about it in a way that helps me feel better.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "erq_ca_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERQCA-06",
          "content": "I control my feelings by not showing them",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "erq_ca_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERQCA-07",
          "content": "When I want to feel happier about something, I change the way I’m thinking about it.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "erq_ca_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERQCA-08",
          "content": "I control my feelings about things by changing the way I think about them.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "erq_ca_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERQCA-09",
          "content": "When I’m feeling bad (e.g., sad, angry, or worried), I’m careful not to show it.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "erq_ca_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERQCA-10",
          "content": "When I want to feel less bad (e.g., sad, angry, or worried) about something, I change the way I’m thinking about it.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "erq_ca_agreement_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "ERQCA-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERQCA-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERQCA-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERQCA-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERQCA-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERQCA-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERQCA-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERQCA-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERQCA-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERQCA-10",
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
            "key": "cognitive_reappraisal",
            "type": "dimension",
            "label": "认知重评",
            "description": "这组题目回答的平均分；不提供两种策略的合并总分。",
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
                  "itemCode": "ERQCA-01",
                  "weight": 1
                },
                {
                  "itemCode": "ERQCA-03",
                  "weight": 1
                },
                {
                  "itemCode": "ERQCA-05",
                  "weight": 1
                },
                {
                  "itemCode": "ERQCA-07",
                  "weight": 1
                },
                {
                  "itemCode": "ERQCA-08",
                  "weight": 1
                },
                {
                  "itemCode": "ERQCA-10",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "expressive_suppression",
            "type": "dimension",
            "label": "表达抑制",
            "description": "这组题目回答的平均分；不提供两种策略的合并总分。",
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
                  "itemCode": "ERQCA-02",
                  "weight": 1
                },
                {
                  "itemCode": "ERQCA-04",
                  "weight": 1
                },
                {
                  "itemCode": "ERQCA-06",
                  "weight": 1
                },
                {
                  "itemCode": "ERQCA-09",
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
          "cognitive_reappraisal",
          "expressive_suppression"
        ],
        "scoreOrder": [
          "cognitive_reappraisal",
          "expressive_suppression"
        ],
        "interpretations": [
          {
            "scoreKey": "cognitive_reappraisal",
            "headline": "换个想法，换种感受",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目问的是：想让心情好一点时，你会不会想点别的、或换个角度想。分数是这组回答的平均；越高表示你越多使用这种办法。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "下次心情不好时，试着想一件别的、让你舒服一点的事，看看有没有用。"
              }
            ]
          },
          {
            "scoreKey": "expressive_suppression",
            "headline": "把感受收起来",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目看的是：有情绪时你会不会把它藏起来、不给别人看到。分数越高表示你越多这样做。藏住感受有时有用，一直藏也会累。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "找一个你信任的人，试着说说一次你藏在心里的感受。"
              }
            ]
          }
        ],
        "limitations": [
          "这是儿童青少年自评，反映一次作答，不构成情绪能力或心理健康的结论。",
          "两种策略没有好坏之分；抑制用得过多可能与感受交流减少有关，解读时结合具体情境。",
          "题文为作者公开英文原题；本版本未包含中文译题，中文施测前须先完成翻译与验证。",
          "没有适用于你的常模或诊断阈值。"
        ],
        "disclaimer": "这份报告用于认识自己的策略和反思，不用于诊断或给人排名。"
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
            "itemCode": "ERQCA-01",
            "responseValue": "1"
          },
          {
            "itemCode": "ERQCA-02",
            "responseValue": "1"
          },
          {
            "itemCode": "ERQCA-03",
            "responseValue": "1"
          },
          {
            "itemCode": "ERQCA-04",
            "responseValue": "1"
          },
          {
            "itemCode": "ERQCA-05",
            "responseValue": "1"
          },
          {
            "itemCode": "ERQCA-06",
            "responseValue": "1"
          },
          {
            "itemCode": "ERQCA-07",
            "responseValue": "1"
          },
          {
            "itemCode": "ERQCA-08",
            "responseValue": "1"
          },
          {
            "itemCode": "ERQCA-09",
            "responseValue": "1"
          },
          {
            "itemCode": "ERQCA-10",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "cognitive_reappraisal": 1,
            "expressive_suppression": 1
          },
          "totalScoreKeys": [
            "cognitive_reappraisal",
            "expressive_suppression"
          ]
        }
      },
      {
        "name": "maximum-keyed",
        "answers": [
          {
            "itemCode": "ERQCA-01",
            "responseValue": "5"
          },
          {
            "itemCode": "ERQCA-02",
            "responseValue": "5"
          },
          {
            "itemCode": "ERQCA-03",
            "responseValue": "5"
          },
          {
            "itemCode": "ERQCA-04",
            "responseValue": "5"
          },
          {
            "itemCode": "ERQCA-05",
            "responseValue": "5"
          },
          {
            "itemCode": "ERQCA-06",
            "responseValue": "5"
          },
          {
            "itemCode": "ERQCA-07",
            "responseValue": "5"
          },
          {
            "itemCode": "ERQCA-08",
            "responseValue": "5"
          },
          {
            "itemCode": "ERQCA-09",
            "responseValue": "5"
          },
          {
            "itemCode": "ERQCA-10",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "cognitive_reappraisal": 5,
            "expressive_suppression": 5
          },
          "totalScoreKeys": [
            "cognitive_reappraisal",
            "expressive_suppression"
          ]
        }
      },
      {
        "name": "sample-mixed",
        "answers": [
          {
            "itemCode": "ERQCA-01",
            "responseValue": "4"
          },
          {
            "itemCode": "ERQCA-02",
            "responseValue": "3"
          },
          {
            "itemCode": "ERQCA-03",
            "responseValue": "4"
          },
          {
            "itemCode": "ERQCA-04",
            "responseValue": "3"
          },
          {
            "itemCode": "ERQCA-05",
            "responseValue": "4"
          },
          {
            "itemCode": "ERQCA-06",
            "responseValue": "3"
          },
          {
            "itemCode": "ERQCA-07",
            "responseValue": "4"
          },
          {
            "itemCode": "ERQCA-08",
            "responseValue": "4"
          },
          {
            "itemCode": "ERQCA-09",
            "responseValue": "3"
          },
          {
            "itemCode": "ERQCA-10",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "cognitive_reappraisal": 4,
            "expressive_suppression": 3
          },
          "totalScoreKeys": [
            "cognitive_reappraisal",
            "expressive_suppression"
          ]
        }
      },
      {
        "name": "missing-subscale-item",
        "answers": [
          {
            "itemCode": "ERQCA-01",
            "responseValue": "4"
          },
          {
            "itemCode": "ERQCA-02",
            "responseValue": "3"
          },
          {
            "itemCode": "ERQCA-03",
            "responseValue": "4"
          },
          {
            "itemCode": "ERQCA-04",
            "responseValue": "3"
          },
          {
            "itemCode": "ERQCA-06",
            "responseValue": "3"
          },
          {
            "itemCode": "ERQCA-07",
            "responseValue": "4"
          },
          {
            "itemCode": "ERQCA-08",
            "responseValue": "4"
          },
          {
            "itemCode": "ERQCA-09",
            "responseValue": "3"
          },
          {
            "itemCode": "ERQCA-10",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "cognitive_reappraisal": null,
            "expressive_suppression": 3
          },
          "totalScoreKeys": [
            "cognitive_reappraisal",
            "expressive_suppression"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
