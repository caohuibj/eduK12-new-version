import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text and official scoring key transcribed from the author-distributed KIMS form (ruthbaer.com); license unverified.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "kims39",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Kentucky Inventory of Mindfulness Skills",
      "abbreviation": "KIMS",
      "instrumentFamily": "Kentucky Inventory of Mindfulness Skills"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "自评四类正念技能：观察、描述、有觉知地行动、不评判地接纳。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:dbt",
        "construct:dbt_kims_mindfulness_skills",
        "mindfulness",
        "observe_describe_act_accept",
        "adult_self_report",
        "self_report",
        "use:reflection",
        "use:research",
        "language_validation:english_original",
        "license:license_unverified"
      ]
    },
    "population": {
      "populationNotes": "原版验证样本为美国大学生及社区成人；未建立儿童青少年常模。青少年正念测评须使用适龄工具（如库内 CAMM-10），不得直接套用本工具。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 39,
      "estimatedMinutes": 12,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "一般性描述（“对你而言通常是否属实”），无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原39题顺序与五点“真实性”选项。",
        "18个反向题按官方计分键统一方向后计分。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版四因子结构在大学生样本验证。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "技能频率反馈不构成疗效评估或临床判断。"
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
        "evidenceId": "baer-kims-2004",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US undergraduate and community adult samples",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development with four-factor structure, internal consistency and convergent validity.",
        "rating": "SUFFICIENT",
        "citation": "Baer RA, Smith GT, Allen KB. (2004). Assessment of mindfulness by self-report: The Kentucky Inventory of Mindfulness Skills. Assessment, 11(3), 191–206.",
        "url": "https://www.ruthbaer.com/academics/KIMS.pdf",
        "notes": "官方计分只汇总四个分量表，不定义总分；观察维在无正念经验样本中与其他维相关较低。计分键誊自作者官网随表计分页。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "kims39-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "kims39-en-v1",
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
    "text": "Please rate each of the following statements using the scale provided. Write the number in the blank that best describes your own opinion of what is generally true for you.",
    "language": "en",
    "version": "1.0.0",
    "source": "作者官网题本第1页前导语（ruthbaer.com）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Kentucky Inventory of Mindfulness Skills (KIMS)",
        "citation": "Baer RA, Smith GT, Allen KB. (2004). Assessment of mindfulness by self-report: The Kentucky Inventory of Mindfulness Skills. Assessment, 11(3), 191–206.",
        "url": "https://www.ruthbaer.com/academics/KIMS.pdf",
        "publicationYear": 2004
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题本及官方计分说明自开发者 Ruth Baer 官网公开下载；页面未列明确再分发或翻译条款。公开提供不等同于不限用途授权；正式发布或商业使用前须向作者确认。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "kims_truth_1_5",
          "options": [
            {
              "value": "1",
              "label": "Never or very rarely true",
              "score": 1
            },
            {
              "value": "2",
              "label": "Rarely true",
              "score": 2
            },
            {
              "value": "3",
              "label": "Sometimes true",
              "score": 3
            },
            {
              "value": "4",
              "label": "Often true",
              "score": 4
            },
            {
              "value": "5",
              "label": "Very often or always true",
              "score": 5
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "KIMS-01",
          "content": "I notice changes in my body, such as whether my breathing slows down or speeds up.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-02",
          "content": "I’m good at finding the words to describe my feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-03",
          "content": "When I do things, my mind wanders off and I’m easily distracted.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-04",
          "content": "I criticize myself for having irrational or inappropriate emotions.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-05",
          "content": "I pay attention to whether my muscles are tense or relaxed.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-06",
          "content": "I can easily put my beliefs, opinions, and expectations into words.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-07",
          "content": "When I’m doing something, I’m only focused on what I’m doing, nothing else.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-08",
          "content": "I tend to evaluate whether my perceptions are right or wrong.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-09",
          "content": "When I’m walking, I deliberately notice the sensations of my body moving.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-10",
          "content": "I’m good at thinking of words to express my perceptions, such as how things taste, smell, or sound.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-11",
          "content": "I drive on “automatic pilot” without paying attention to what I’m doing.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-12",
          "content": "I tell myself that I shouldn’t be feeling the way I’m feeling.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-13",
          "content": "When I take a shower or bath, I stay alert to the sensations of water on my body.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-14",
          "content": "It’s hard for me to find the words to describe what I’m thinking.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-15",
          "content": "When I’m reading, I focus all my attention on what I’m reading.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-16",
          "content": "I believe some of my thoughts are abnormal or bad and I shouldn’t think that way.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-17",
          "content": "I notice how foods and drinks affect my thoughts, bodily sensations, and emotions.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-18",
          "content": "I have trouble thinking of the right words to express how I feel about things.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-19",
          "content": "When I do things, I get totally wrapped up in them and don’t think about anything else.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-20",
          "content": "I make judgments about whether my thoughts are good or bad.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-21",
          "content": "I pay attention to sensations, such as the wind in my hair or sun on my face.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-22",
          "content": "When I have a sensation in my body, it’s difficult for me to describe it because I can’t find the right words.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-23",
          "content": "I don’t pay attention to what I’m doing because I’m daydreaming, worrying, or otherwise distracted.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-24",
          "content": "I tend to make judgments about how worthwhile or worthless my experiences are.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-25",
          "content": "I pay attention to sounds, such as clocks ticking, birds chirping, or cars passing.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-26",
          "content": "Even when I’m feeling terribly upset, I can find a way to put it into words.",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-27",
          "content": "When I’m doing chores, such as cleaning or laundry, I tend to daydream or think of other things.",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-28",
          "content": "I tell myself that I shouldn’t be thinking the way I’m thinking.",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-29",
          "content": "I notice the smells and aromas of things.",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-30",
          "content": "I intentionally stay aware of my feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-31",
          "content": "I tend to do several things at once rather than focusing on one thing at a time.",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-32",
          "content": "I think some of my emotions are bad or inappropriate and I shouldn’t feel them.",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-33",
          "content": "I notice visual elements in art or nature, such as colors, shapes, textures, or patterns of light and shadow.",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-34",
          "content": "My natural tendency is to put my experiences into words.",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-35",
          "content": "When I’m working on something, part of my mind is occupied with other topics, such as what I’ll be doing later, or things I’d rather be doing.",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-36",
          "content": "I disapprove of myself when I have irrational ideas.",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-37",
          "content": "I pay attention to how my emotions affect my thoughts and behavior.",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-38",
          "content": "I get completely absorbed in what I’m doing, so that all my attention is focused on it.",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS-39",
          "content": "I notice when my moods begin to change.",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "kims_truth_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "KIMS-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-03",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-04",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-08",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-11",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-12",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-14",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-16",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-18",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-20",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-22",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-23",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-24",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-27",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-28",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-30",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-31",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-32",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-34",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-35",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-36",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS-37",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-38",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS-39",
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
            "key": "observe",
            "type": "dimension",
            "label": "观察",
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
                  "itemCode": "KIMS-01",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-05",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-09",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-13",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-17",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-21",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-25",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-29",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-30",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-33",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-37",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-39",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "describe",
            "type": "dimension",
            "label": "描述",
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
                  "itemCode": "KIMS-02",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-06",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-10",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-14",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-18",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-22",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-26",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-34",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "act_awareness",
            "type": "dimension",
            "label": "有觉知地行动",
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
                  "itemCode": "KIMS-03",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-07",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-11",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-15",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-19",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-23",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-27",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-31",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-35",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-38",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "accept_without_judgment",
            "type": "dimension",
            "label": "不评判地接纳",
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
                  "itemCode": "KIMS-04",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-08",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-12",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-16",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-20",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-24",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-28",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-32",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS-36",
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
          "observe",
          "describe",
          "act_awareness",
          "accept_without_judgment"
        ],
        "scoreOrder": [
          "observe",
          "describe",
          "act_awareness",
          "accept_without_judgment"
        ],
        "interpretations": [
          {
            "scoreKey": "observe",
            "headline": "留心到的细节",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注你注意到身体感觉、声音、气味等内外体验的频率。观察本身没有好坏；在没有正念练习经验的人身上，这一项与其他技能的关系并不稳定，不必单独解读。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "今天你注意到了哪些平时忽略的感觉（风、光线、脚步）？"
              },
              {
                "category": "strategy",
                "text": "选一段熟悉的路，走的时候刻意找出三种以前没注意过的声音。"
              }
            ]
          },
          {
            "scoreKey": "describe",
            "headline": "把感受说出口",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注你能否为内心的感受和想法找到合适的词。能用语言标记情绪，往往让人更容易和它相处。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一次情绪波动时，你心里最先冒出的词是什么？"
              },
              {
                "category": "strategy",
                "text": "试着用“我注意到我正在感到……”开头，把此刻的感受写一句话。"
              }
            ]
          },
          {
            "scoreKey": "act_awareness",
            "headline": "专注在当下的事",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题（含反向题）关注你做事时是否专注于当下，而不是自动导航或走神。分心是大脑的默认模式，发现分心就是重新专注的开始。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "你最容易“自动导航”的场景是什么（刷手机、吃饭、洗澡）？"
              },
              {
                "category": "strategy",
                "text": "下一次发现自己走神时，停三秒，说出你正在做的事情的名字，再继续。"
              }
            ]
          },
          {
            "scoreKey": "accept_without_judgment",
            "headline": "不急着评判",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题（全部反向计分）关注你是否允许想法和情绪存在、而不马上给它们打上好坏标签。接纳不代表喜欢或放弃改变，而是先如实地看见。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "你会因为自己“不该有某种情绪”而批评自己吗？什么时候开始的？"
              },
              {
                "category": "strategy",
                "text": "下次情绪出现时，先在心里说“这个感受在这里”，再决定要不要行动。"
              }
            ]
          }
        ],
        "limitations": [
          "四个分量表各自独立，官方计分不定义总分；不同维度不可相加或互换解读。",
          "原版验证样本为美国大学生与社区成人；不构成儿童青少年常模。",
          "没有常模、百分位或技能等级；分数不能用于疗效判定。",
          "各分数必须完整作答是产品保守约定；缺答不会算零。",
          "题文与计分键誊自作者官网公开题本，权利状态未确认。"
        ],
        "disclaimer": "仅供认识与练习参考，不用于诊断、高风险决策或替代专业帮助。"
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
            "itemCode": "KIMS-01",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-02",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-03",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-04",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-05",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-06",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-07",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-08",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-10",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-11",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-12",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-13",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-14",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-15",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-16",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-17",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-18",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-19",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-20",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-21",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-22",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-23",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-24",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-25",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-26",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-27",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-28",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-29",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-30",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-31",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-32",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-33",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-34",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-35",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-36",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-37",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-38",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-39",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "observe": 12,
            "describe": 8,
            "act_awareness": 10,
            "accept_without_judgment": 9
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_awareness",
            "accept_without_judgment"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "KIMS-01",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-02",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-03",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-04",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-05",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-06",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-07",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-08",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-09",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-10",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-11",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-12",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-13",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-14",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-15",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-16",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-17",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-18",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-19",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-20",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-21",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-22",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-23",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-24",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-25",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-26",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-27",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-28",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-29",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-30",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-31",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-32",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-33",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-34",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-35",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-36",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS-37",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-38",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS-39",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "observe": 60,
            "describe": 40,
            "act_awareness": 50,
            "accept_without_judgment": 45
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_awareness",
            "accept_without_judgment"
          ]
        }
      },
      {
        "name": "sample-observe4-rest3",
        "answers": [
          {
            "itemCode": "KIMS-01",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-02",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-03",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-04",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-05",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-06",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-07",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-08",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-09",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-10",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-11",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-12",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-14",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-15",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-16",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-17",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-18",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-19",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-20",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-21",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-22",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-23",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-24",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-25",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-26",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-27",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-28",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-29",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-30",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-31",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-32",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-33",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-34",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-35",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-36",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-37",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-38",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-39",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "observe": 48,
            "describe": 24,
            "act_awareness": 30,
            "accept_without_judgment": 27
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_awareness",
            "accept_without_judgment"
          ]
        }
      },
      {
        "name": "missing-describe",
        "answers": [
          {
            "itemCode": "KIMS-01",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-03",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-04",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-05",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-06",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-07",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-08",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-09",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-10",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-11",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-12",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-14",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-15",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-16",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-17",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-18",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-19",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-20",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-21",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-22",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-23",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-24",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-25",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-26",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-27",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-28",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-29",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-30",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-31",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-32",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-33",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-34",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-35",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-36",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-37",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS-38",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS-39",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "observe": 48,
            "describe": null,
            "act_awareness": 30,
            "accept_without_judgment": 27
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_awareness",
            "accept_without_judgment"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
