// Native DRAFT: verbatim items from the cited open publications.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "emque_preschool_parent_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Empathy Questionnaire (EmQue) — Parent Report, original 20-item",
      "abbreviation": "EmQue-20",
      "instrumentFamily": "EmQue"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [],
      "constructDefinition": "家长评定 1–6 岁幼儿的共情行为，包括情绪感染、对他人情绪的关注和亲社会行动。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:sel",
        "license:author_contact_required",
        "license:redistribution_review_pending",
        "domain:social_emotional_competence",
        "population:preschool",
        "response:parent_report",
        "use:reflection",
        "use:research",
        "language_validation:english_original",
        "construct:sel_emque_emotional_contagion",
        "construct:sel_emque_attention_to_others_feelings",
        "construct:sel_emque_prosocial_actions",
        "empathy",
        "emotional_contagion",
        "attention_to_others_feelings",
        "prosocial_actions",
        "parent_report"
      ]
    },
    "population": {
      "minAge": 1,
      "maxAge": 6,
      "populationNotes": "原版针对 1–5 岁幼儿，日本验证样本 1–6 岁；由家长（原研究为母亲）评定。本轮交付论文公开英文题文的可执行草稿，未包含中文译题。",
      "respondentTypes": [
        "PARENT"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 20,
      "estimatedMinutes": 6,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "过去两个月孩子的行为",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原版题号与三维度归属；三点作答（0 = no，1 = sometimes，2 = often）。",
        "各维度取均值，无反向题；不提供总分。",
        "日本验证版改用五点计分，本记录维持原版三点计分，未采信五点常模。"
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
          "notes": "家长反思反馈不构成发展诊断。"
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
        "evidenceId": "rieffe-emque-2010",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Children aged 1–5 (original) / 1–6 (Japanese validation), parent report",
        "ageRange": "1–6 years",
        "locale": "en",
        "territory": "NL",
        "sampleSize": null,
        "studyDesign": "Construction and validation of the parent-report EmQue with three empathy dimensions; short-form and cross-cultural validations followed.",
        "rating": "SUFFICIENT",
        "citation": "Rieffe C, Ketelaar L, Wiefferink CH. Assessing empathy in young children: Construction and validation of an Empathy Questionnaire (EmQue). Personality and Individual Differences. 2010;49(5):362–367.",
        "doi": "10.1016/j.paid.2010.03.046",
        "url": "https://doi.org/10.1016/j.paid.2010.03.046",
        "notes": "原版为家长评定 20 题，三维度对应 Hoffman 共情发展前三阶段；日本验证研究中 13 题短版拟合更好，作者建议按用途选择版本。 题文经 Takamatsu, Tsou, Kusumi & Rieffe (2021, IJBD 45(5):453–462, doi:10.1177/01650254211022852) Table 1 公开列出。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "emque-preschool-v1",
    "respondentTypes": [
      "PARENT"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "emque-preschool-v1",
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
    "text": "The following statements describe things children may do. Please think about your child's behaviour over the previous two months, and indicate how often each statement applies: 0 = no, 1 = sometimes, 2 = often.",
    "language": "en",
    "version": "1.0.0",
    "source": "依据原版计分说明（Mothers rated their child's behaviors over the previous 2 months on a 3-point scale: 0 = no, 1 = sometimes, 2 = often）整理的施测指导语，非官方原版前导语。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "parent_report",
      "source": {
        "title": "Empathy Questionnaire (EmQue) — Parent Report, original 20-item",
        "citation": "Rieffe C, Ketelaar L, Wiefferink CH. Assessing empathy in young children: Construction and validation of an Empathy Questionnaire (EmQue). Personality and Individual Differences. 2010;49(5):362–367.",
        "url": "https://doi.org/10.1016/j.paid.2010.03.046",
        "publicationYear": 2010
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文取自 Takamatsu 等（2021）Table 1 的公开英文条目；原量表由作者团队（focusonemotions.nl）供研究使用，量表整体权利状态未独立核验。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "emque_freq_0_2",
          "options": [
            {
              "value": "0",
              "label": "No",
              "score": 0
            },
            {
              "value": "1",
              "label": "Sometimes",
              "score": 1
            },
            {
              "value": "2",
              "label": "Often",
              "score": 2
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "EMQUE-01",
          "content": "When another child cries, my child gets upset too.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-02",
          "content": "When I make clear that I want some peace and quiet, my child tries not to bother me.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-03",
          "content": "When my child sees other children laughing, he/she starts laughing too.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-04",
          "content": "My child also needs to be comforted when another child is in pain.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-05",
          "content": "When another child starts to cry, my child tries to comfort him/her.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-06",
          "content": "When an adult gets angry with another child, my child watches attentively.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-07",
          "content": "When another child makes a bad fall, shortly after my child pretends to fall too.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-08",
          "content": "When another child gets upset, my child tries to cheer him/her up.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-09",
          "content": "My child looks up when another child laughs.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-10",
          "content": "When another child is upset, my child needs to be comforted too.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-11",
          "content": "When I make clear that I want to do something by myself (e.g., read), my child leaves me alone for a while.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-12",
          "content": "When adults laugh, my child tries to get near them.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-13",
          "content": "When another child gets frightened, my child freezes or starts to cry.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-14",
          "content": "When two children are quarreling, my child tries to stop them.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-15",
          "content": "My child looks up when another child cries.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-16",
          "content": "When other children argue, my child gets upset.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-17",
          "content": "When another child gets frightened, my child tries to help him/her.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-18",
          "content": "When another child is angry, my child stops his own play to watch.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-19",
          "content": "When another child cries, my child looks away.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "emque_freq_0_2",
          "randomizeOptions": false
        },
        {
          "itemCode": "EMQUE-20",
          "content": "When other children quarrel, my child wants to see what is going on",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "emque_freq_0_2",
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
          },
          {
            "itemCode": "EMQUE-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EMQUE-20",
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
            "key": "emotional_contagion",
            "type": "dimension",
            "label": "情绪感染",
            "description": "该维度条目回答的平均分（0–2）；分数反映家长观察到的频率。",
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
                  "itemCode": "EMQUE-04",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-07",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-10",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-13",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-16",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-19",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "attention_to_others_feelings",
            "type": "dimension",
            "label": "对他人情绪的关注",
            "description": "该维度条目回答的平均分（0–2）；分数反映家长观察到的频率。",
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
                  "itemCode": "EMQUE-03",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-06",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-09",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-12",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-15",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-18",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-20",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "prosocial_actions",
            "type": "dimension",
            "label": "亲社会行动",
            "description": "该维度条目回答的平均分（0–2）；分数反映家长观察到的频率。",
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
                  "itemCode": "EMQUE-02",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-05",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-08",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-11",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-14",
                  "weight": 1
                },
                {
                  "itemCode": "EMQUE-17",
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
          "emotional_contagion",
          "attention_to_others_feelings",
          "prosocial_actions"
        ],
        "scoreOrder": [
          "emotional_contagion",
          "attention_to_others_feelings",
          "prosocial_actions"
        ],
        "interpretations": [
          {
            "scoreKey": "emotional_contagion",
            "headline": "情绪会传给孩子",
            "source": {
              "type": "score_only"
            },
            "summary": "这组条目描述的是：别的孩子哭、闹或受惊时，您的孩子自己的情绪也会跟着被带动。分数是这组条目的平均；分数反映家长观察到的频率。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "孩子被别人的情绪带动时，先帮孩子说出感受：“你看到他哭，心里也难受了，对吗？”"
              }
            ]
          },
          {
            "scoreKey": "attention_to_others_feelings",
            "headline": "会留意别人的情绪",
            "source": {
              "type": "score_only"
            },
            "summary": "这组条目看的是：孩子会不会停下来注视、关注别人的笑、哭、生气或争吵。分数越高表示孩子越常留意别人的情绪变化。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "亲子共读时问一句：“你猜他现在是什么心情？你怎么看出来的？”"
              }
            ]
          },
          {
            "scoreKey": "prosocial_actions",
            "headline": "会安慰和帮忙",
            "source": {
              "type": "score_only"
            },
            "summary": "这组条目看的是：别人难过、受惊或起冲突时，孩子会不会主动安慰、帮忙或劝和。分数越高表示孩子越常这样做。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "孩子主动安慰别人时，具体说出你看到了什么：“你刚才把小熊递给他，他很开心。”"
              }
            ]
          }
        ],
        "limitations": [
          "这是家长评定，反映家长在近期对孩子行为的观察，不是对孩子共情能力的测验。",
          "三个维度描述不同的共情发展阶段，分数不合并为总分，也不区分孩子好坏。",
          "题文为公开英文条目；本版本未包含中文译题，中文施测前须先完成翻译与验证。",
          "没有适用于你的常模或发展阈值。"
        ],
        "disclaimer": "这份报告帮助你观察和陪伴孩子的发展，不用于诊断或比较孩子。"
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
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-02",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-03",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-04",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-05",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-06",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-07",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-08",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-09",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-10",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-11",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-12",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-13",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-14",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-15",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-16",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-17",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-18",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-19",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-20",
            "responseValue": "0"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "emotional_contagion": 0,
            "attention_to_others_feelings": 0,
            "prosocial_actions": 0
          },
          "totalScoreKeys": [
            "emotional_contagion",
            "attention_to_others_feelings",
            "prosocial_actions"
          ]
        }
      },
      {
        "name": "maximum-keyed",
        "answers": [
          {
            "itemCode": "EMQUE-01",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-02",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-03",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-04",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-05",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-06",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-07",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-08",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-09",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-10",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-11",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-12",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-13",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-14",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-15",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-16",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-17",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-18",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-19",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-20",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "emotional_contagion": 2,
            "attention_to_others_feelings": 2,
            "prosocial_actions": 2
          },
          "totalScoreKeys": [
            "emotional_contagion",
            "attention_to_others_feelings",
            "prosocial_actions"
          ]
        }
      },
      {
        "name": "sample-mixed",
        "answers": [
          {
            "itemCode": "EMQUE-01",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-02",
            "responseValue": "0"
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
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-06",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-07",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-08",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-09",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-10",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-11",
            "responseValue": "0"
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
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-15",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-16",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-17",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-18",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-19",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-20",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "emotional_contagion": 0.7142857142857143,
            "attention_to_others_feelings": 1.2857142857142858,
            "prosocial_actions": 1.1666666666666667
          },
          "totalScoreKeys": [
            "emotional_contagion",
            "attention_to_others_feelings",
            "prosocial_actions"
          ]
        }
      },
      {
        "name": "missing-subscale-item",
        "answers": [
          {
            "itemCode": "EMQUE-01",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-02",
            "responseValue": "0"
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
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-06",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-07",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-08",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-10",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-11",
            "responseValue": "0"
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
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-15",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-16",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-17",
            "responseValue": "2"
          },
          {
            "itemCode": "EMQUE-18",
            "responseValue": "1"
          },
          {
            "itemCode": "EMQUE-19",
            "responseValue": "0"
          },
          {
            "itemCode": "EMQUE-20",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "emotional_contagion": 0.7142857142857143,
            "attention_to_others_feelings": null,
            "prosocial_actions": 1.1666666666666667
          },
          "totalScoreKeys": [
            "emotional_contagion",
            "attention_to_others_feelings",
            "prosocial_actions"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
