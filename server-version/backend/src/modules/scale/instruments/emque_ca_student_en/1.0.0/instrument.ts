// Native DRAFT: verbatim items from the cited open publications.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "emque_ca_student_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Empathy Questionnaire for Children and Adolescents (EmQue-CA)",
      "abbreviation": "EmQue-CA",
      "instrumentFamily": "EmQue"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [],
      "constructDefinition": "学生自评对他人情绪的共情反应，包括情感共情、认知共情和安慰意向三个方面。",
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
        "construct:sel_emque_ca_affective_empathy",
        "construct:sel_emque_ca_cognitive_empathy",
        "construct:sel_emque_ca_intention_to_comfort",
        "empathy",
        "affective_empathy",
        "cognitive_empathy",
        "intention_to_comfort",
        "self_report"
      ]
    },
    "population": {
      "minAge": 10,
      "maxAge": 15,
      "populationNotes": "原验证研究覆盖 10–15 岁学生（N=1250，荷兰）；本轮交付论文公开英文题文的可执行草稿，未包含中文译题。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 14,
      "estimatedMinutes": 4,
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
        "保留论文 Table 4 的 14 题及三分量归属；三点作答（not true / somewhat true / true）。",
        "各维取均值，无反向题；不提供总分。"
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
        "evidenceId": "overgaauw-emque-ca-2017",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Dutch students aged 10–15",
        "ageRange": "10–15 years",
        "locale": "en",
        "territory": "NL",
        "sampleSize": 1250,
        "studyDesign": "Construction and validation of the EmQue-CA with PCA/CFA and validity links (IRI, EAQ, friendship quality, bullying).",
        "rating": "SUFFICIENT",
        "citation": "Overgaauw S, Rieffe C, Broekhof E, Crone EA, Güroğlu B. Assessing Empathy across Childhood and Adolescence: Validation of the Empathy Questionnaire for Children and Adolescents (EmQue-CA). Frontiers in Psychology. 2017;8:870.",
        "doi": "10.3389/fpsyg.2017.00870",
        "url": "https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.00870/full",
        "notes": "论文为 CC BY 4.0 开放获取，Table 4 完整列出 14 题及因子归属；论文另报告女生三维度均值高于男生，不用于个体判断。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "emque-ca-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "emque-ca-v1",
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
    "text": "Below are a number of descriptions. Please read each one carefully, and rate to what extent it is true for you. There are no right or wrong answers.",
    "language": "en",
    "version": "1.0.0",
    "source": "依据论文方法部分整理的施测指导语（Participants were asked to rate to what extent the description was true for them on a 3-point scale），非官方原版前导语。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Assessing Empathy across Childhood and Adolescence: Validation of the EmQue-CA",
        "citation": "Overgaauw S, Rieffe C, Broekhof E, Crone EA, Güroğlu B. Frontiers in Psychology. 2017;8:870, Table 4.",
        "url": "https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.00870/full",
        "publicationYear": 2017
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "论文为 CC BY 4.0 开放获取，题文取自论文 Table 4 并附作者、来源与许可信息（https://creativecommons.org/licenses/by/4.0/）；量表整体及后续译文的权利状态未独立核验。作者团队经 focusonemotions.nl 提供研究用材料。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "emque_true_1_3",
          "options": [
            {
              "value": "1",
              "label": "Not true",
              "score": 1
            },
            {
              "value": "2",
              "label": "Somewhat true",
              "score": 2
            },
            {
              "value": "3",
              "label": "True",
              "score": 3
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "EMQUE-01",
          "content": "If my mother is happy, I also feel happy",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-02",
          "content": "I often feel sad when I watch a sad movie",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-03",
          "content": "When a friend is upset, I feel upset too",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-04",
          "content": "When a friend cries, I cry myself",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-05",
          "content": "If someone in my family is sad, I feel really bad",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-06",
          "content": "I feel awful when two people quarrel",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-07",
          "content": "When a friend is angry, I tend to know why",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-08",
          "content": "If a friend is sad, I understand mostly why",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-09",
          "content": "If a friend cries, I often understand what has happened",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-10",
          "content": "If a friend is sad, I like to comfort him",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-11",
          "content": "I would like to help when a friend gets angry",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-12",
          "content": "If a friend has an argument, I try to help",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-13",
          "content": "I want everyone to feel good",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-14",
          "content": "If a friend is sad, I want to do something to make it better",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "emque_true_1_3",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "EMQUE-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-14",
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
            "key": "affective_empathy",
            "type": "dimension",
            "label": "情感共情",
            "description": "该分量表题目回答的平均分（1–3）；越高表示该共情方面越常出现。",
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
                  "itemCode": "EMQUE-01",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-02",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-03",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-04",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-05",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-06",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "cognitive_empathy",
            "type": "dimension",
            "label": "认知共情",
            "description": "该分量表题目回答的平均分（1–3）；越高表示该共情方面越常出现。",
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
                  "itemCode": "EMQUE-07",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-08",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-09",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "intention_to_comfort",
            "type": "dimension",
            "label": "安慰意向",
            "description": "该分量表题目回答的平均分（1–3）；越高表示该共情方面越常出现。",
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
                  "itemCode": "EMQUE-10",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-11",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-12",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-13",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-14",
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
          "affective_empathy",
          "cognitive_empathy",
          "intention_to_comfort"
        ],
        "scoreOrder": [
          "affective_empathy",
          "cognitive_empathy",
          "intention_to_comfort"
        ],
        "interpretations": [
          {
            "scoreKey": "affective_empathy",
            "headline": "别人的情绪也会传给你",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目看的是：身边人高兴或难过时，你的情绪会不会跟着变。分数是这组回答的平均；越高表示你越常有这种跟着一起感受的体验。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "今天留意一次自己的情绪被身边人带动的时刻，把它记下来。"
              }
            ]
          },
          {
            "scoreKey": "cognitive_empathy",
            "headline": "猜得中别人为什么这样",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目问的是：朋友生气、难过或哭的时候，你能不能大致明白发生了什么。分数越高表示你越常能想明白。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "下次看到同学情绪不对，先别急着下结论，试着问一句：发生什么事了？"
              }
            ]
          },
          {
            "scoreKey": "intention_to_comfort",
            "headline": "想为难过的人做点什么",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目看的是：别人难过或生气时，你会不会想安慰、帮忙，让事情变好一点。分数越高表示你越常有这个念头。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "找一个你愿意帮忙的时刻，从一句“你还好吗”开始。"
              }
            ]
          }
        ],
        "limitations": [
          "这是学生自评，反映一次作答，不构成共情能力或品行的结论。",
          "论文报告三维度均值存在性别差异，不用于对个体按性别评价。",
          "题文为 CC BY 4.0 论文公开英文原题；本版本未包含中文译题，中文施测前须先完成翻译与验证。",
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
            "itemCode": "EMQUE-01",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-02",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-03",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-04",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-05",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-06",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-07",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-08",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-09",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-10",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-11",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-12",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-13",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-14",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "affective_empathy": 1,
            "cognitive_empathy": 1,
            "intention_to_comfort": 1
          },
          "totalScoreKeys": [
            "affective_empathy",
            "cognitive_empathy",
            "intention_to_comfort"
          ]
        }
      },
      {
        "name": "maximum-keyed",
        "answers": [
          {
            "itemCode": "EMQUE-01",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-02",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-03",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-04",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-05",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-06",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-07",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-08",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-09",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-10",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-11",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-12",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-13",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-14",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "affective_empathy": 3,
            "cognitive_empathy": 3,
            "intention_to_comfort": 3
          },
          "totalScoreKeys": [
            "affective_empathy",
            "cognitive_empathy",
            "intention_to_comfort"
          ]
        }
      },
      {
        "name": "sample-mixed",
        "answers": [
          {
            "itemCode": "EMQUE-01",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-02",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-03",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-04",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-05",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-06",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-07",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-08",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-09",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-10",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-11",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-12",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-13",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-14",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "affective_empathy": 2.5,
            "cognitive_empathy": 2,
            "intention_to_comfort": 2.6
          },
          "totalScoreKeys": [
            "affective_empathy",
            "cognitive_empathy",
            "intention_to_comfort"
          ]
        }
      },
      {
        "name": "missing-subscale-item",
        "answers": [
          {
            "itemCode": "EMQUE-01",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-02",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-03",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-04",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-05",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-06",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-07",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-09",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-10",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-11",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-12",
            "responseValue": "3"
          },
          {
            "itemCode": "EMQUE-13",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-14",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "affective_empathy": 2.5,
            "cognitive_empathy": null,
            "intention_to_comfort": 2.6
          },
          "totalScoreKeys": [
            "affective_empathy",
            "cognitive_empathy",
            "intention_to_comfort"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
