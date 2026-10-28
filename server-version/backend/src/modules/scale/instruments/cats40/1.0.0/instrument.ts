import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text © Centre for Emotional Health, Macquarie University; transcribed from the officially posted child-report form, license unverified.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "cats40",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Children’s Automatic Thoughts Scale, child self-report (40 items)",
      "abbreviation": "CATS",
      "instrumentFamily": "Children’s Automatic Thoughts Scale"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [
        "BEHAVIORAL_DIFFICULTIES"
      ],
      "constructDefinition": "儿童青少年自评过去一周消极自动思维（身体威胁、社交威胁、个人失败、敌意倾向）出现的频率。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:cbt",
        "construct:cbt_cats_negative_automatic_thoughts",
        "automatic_thoughts",
        "child_adolescent_self_report",
        "population:k12",
        "response:student_self",
        "use:reflection",
        "use:research",
        "language_validation:english_original",
        "license:license_unverified"
      ]
    },
    "population": {
      "populationNotes": "原版验证为7–16岁儿童青少年临床与社区样本（Schniering & Rapee, 2002），适用于K12年龄段；ATQ为成人版，两版不得混用。麦考瑞官网另有简体中文版表单，但据第三方核对文件中可见繁体字形，中文路径未交付，中文施测前须核对语种并立新版本。",
      "respondentTypes": [
        "SELF"
      ],
      "minAge": 7,
      "maxAge": 16,
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 40,
      "estimatedMinutes": 10,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "过去一周",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原40题顺序与0–4五档频率选项。",
        "表头句式“Over the past week I thought…”按原文保留。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版在焦虑/抑郁青少年样本中验证，对治疗变化敏感。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "频率反馈不构成诊断；第30题（Life is not worth living）等条目若持续高分应由专业人员跟进。"
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
        "evidenceId": "schniering-rapee-cats-2002",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Australian children and adolescents aged 7–16 (clinical and community samples)",
        "locale": "en",
        "territory": "AU",
        "studyDesign": "Scale development with four-factor structure and treatment sensitivity in anxious youth.",
        "rating": "SUFFICIENT",
        "citation": "Schniering CA, Rapee RM. (2002). Development and validation of a measure of children’s automatic thoughts: The Children’s Automatic Thoughts Scale. Behaviour Research and Therapy, 40(4), 471–487.",
        "url": "https://www.mq.edu.au/__data/assets/pdf_file/0007/520099/CATS_ChildReport_copyright_2015.pdf",
        "notes": "四因子题项归属与总分范围取自版权方随表分发的官方计分说明；官方临床界值仅记录、不用于产品反馈。无本地常模。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "cats40-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "cats40-en-v1",
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
    "text": "Listed below are some thoughts that children and adolescents have said pop into their heads. Please read each thought carefully and decide how often, if at all, each thought popped into your head over the past week. Circle your answer in the following way:",
    "language": "en",
    "version": "1.0.0",
    "source": "版权方题本第1页 Instructions 段逐字转录（© Centre for Emotional Health, Macquarie University）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Children’s Automatic Thoughts Scale (CATS), child report",
        "citation": "Schniering CA, Rapee RM. (2002). Development and validation of a measure of children’s automatic thoughts: The Children’s Automatic Thoughts Scale. Behaviour Research and Therapy, 40(4), 471–487.",
        "url": "https://www.mq.edu.au/__data/assets/pdf_file/0007/520099/CATS_ChildReport_copyright_2015.pdf",
        "publicationYear": 2002
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题本及官方计分说明 © Centre for Emotional Health, Macquarie University，经官网资源页公开提供（copyright 2015/2016 文件）；页面未列明再分发、翻译或商业条款。未取得授权声明；正式发布或商业使用前须与版权方确认。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "cats_frequency_0_4",
          "options": [
            {
              "value": "0",
              "label": "Not at all",
              "score": 0
            },
            {
              "value": "1",
              "label": "Sometimes",
              "score": 1
            },
            {
              "value": "2",
              "label": "Fairly often",
              "score": 2
            },
            {
              "value": "3",
              "label": "Often",
              "score": 3
            },
            {
              "value": "4",
              "label": "All the time",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "CATS-01",
          "content": "Kids will think I’m stupid",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-02",
          "content": "I have the right to take revenge on people if they deserve it",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-03",
          "content": "I can’t do anything right",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-04",
          "content": "I’m going to have an accident",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-05",
          "content": "Other kids are stupid",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-06",
          "content": "I’m worried that I’m going to get teased",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-07",
          "content": "I’m going crazy",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-08",
          "content": "Kids are going to laugh at me",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-09",
          "content": "I’m going to die",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-10",
          "content": "Most people are against me",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-11",
          "content": "I am worthless",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-12",
          "content": "My mum or dad are going to get hurt",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-13",
          "content": "Nothing ever works out for me anymore",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-14",
          "content": "I’m going to look silly",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-15",
          "content": "I won’t let anyone get away with picking on me",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-16",
          "content": "I’m scared of losing control",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-17",
          "content": "It’s my fault that things have gone wrong",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-18",
          "content": "People are thinking bad things about me",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-19",
          "content": "If someone hurts me, I have the right to hurt them back",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-20",
          "content": "I’m going to get hurt",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-21",
          "content": "I’m afraid of what other kids will think of me",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-22",
          "content": "Some people deserve what they get",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-23",
          "content": "I’ve made such a mess of my life",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-24",
          "content": "Something awful is going to happen",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-25",
          "content": "I look like an idiot",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-26",
          "content": "I’ll never be as good as other people are",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-27",
          "content": "I always get blamed for things that are not my fault",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-28",
          "content": "I am a failure",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-29",
          "content": "Other kids are making fun of me",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-30",
          "content": "Life is not worth living",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-31",
          "content": "Everyone is staring at me",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-32",
          "content": "I’m afraid I will make a fool of myself",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-33",
          "content": "I’m scared that somebody might die",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-34",
          "content": "I will never overcome my problems",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-35",
          "content": "People always try to get me into trouble",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-36",
          "content": "There is something very wrong with me",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-37",
          "content": "Some people are bad",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-38",
          "content": "I hate myself",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-39",
          "content": "Something will happen to someone I care about",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-40",
          "content": "Bad people deserve to get punished",
          "type": "single",
          "required": true,
          "sortOrder": 39,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "CATS-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-30",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-31",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-32",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-34",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-35",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-36",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-37",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-38",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-39",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CATS-40",
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
            "key": "physical_threat",
            "type": "dimension",
            "label": "身体威胁",
            "description": "相关题作答直接求和（无反向题，0–4频率）；必须完整作答。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "CATS-04",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-07",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-09",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-12",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-16",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-20",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-24",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-33",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-36",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-39",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "social_threat",
            "type": "dimension",
            "label": "社交威胁",
            "description": "相关题作答直接求和（无反向题，0–4频率）；必须完整作答。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "CATS-01",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-06",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-08",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-14",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-18",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-21",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-25",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-29",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-31",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-32",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "personal_failure",
            "type": "dimension",
            "label": "个人失败",
            "description": "相关题作答直接求和（无反向题，0–4频率）；必须完整作答。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "CATS-03",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-11",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-13",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-17",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-23",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-26",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-28",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-30",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-34",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-38",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "hostile_intent",
            "type": "dimension",
            "label": "敌意倾向",
            "description": "相关题作答直接求和（无反向题，0–4频率）；必须完整作答。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "CATS-02",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-05",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-10",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-15",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-19",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-22",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-27",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-35",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-37",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-40",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "total",
            "type": "total",
            "label": "全部40题总和",
            "description": "相关题作答直接求和（无反向题，0–4频率）；必须完整作答。",
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
                  "itemCode": "CATS-01",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-02",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-03",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-04",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-05",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-06",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-07",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-08",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-09",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-10",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-11",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-12",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-13",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-14",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-15",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-16",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-17",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-18",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-19",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-20",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-21",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-22",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-23",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-24",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-25",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-26",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-27",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-28",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-29",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-30",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-31",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-32",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-33",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-34",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-35",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-36",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-37",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-38",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-39",
                  "weight": 1
                },
                {
                  "itemCode": "CATS-40",
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
          "social_threat",
          "physical_threat",
          "personal_failure",
          "hostile_intent"
        ],
        "scoreOrder": [
          "physical_threat",
          "social_threat",
          "personal_failure",
          "hostile_intent",
          "total"
        ],
        "interpretations": [
          {
            "scoreKey": "social_threat",
            "headline": "“别人会怎么看我”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题统计与同学眼光有关的念头出现的频率——怕被嘲笑、怕出丑、觉得大家在盯着自己。这类念头在成长期很常见；频率高不代表别人真的这么想你。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "过去一周，哪个具体场景让这类念头出现得最多？当时实际发生了什么？"
              },
              {
                "category": "strategy",
                "text": "下次念头出现时，试着把“他们会笑我”改写成一句可以验证的话，然后观察真实发生的版本。"
              }
            ]
          },
          {
            "scoreKey": "physical_threat",
            "headline": "“会出事”的担心",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题统计关于受伤、生病、出意外的念头。担心安全是大脑的保护机制；但反复出现的“要出事了”并不等于预言。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "这些担心里，有没有一条已经在过去一周被证明“没有发生”？"
              },
              {
                "category": "strategy",
                "text": "把担心写成两栏：“我担心的事”和“实际发生的事”，一周后回看对照。"
              }
            ]
          },
          {
            "scoreKey": "personal_failure",
            "headline": "对自己的否定",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题统计“我不行、我是失败、我讨厌自己”一类对自我的否定念头。念头是想法，不是事实；它们的音量可以随练习变小。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "如果同样的事发生在好朋友身上，你会对他说这些话吗？"
              },
              {
                "category": "strategy",
                "text": "把“我做不到”换成“我还没做到”，并写下一个具体的下一步。"
              }
            ]
          },
          {
            "scoreKey": "hostile_intent",
            "headline": "“要讨回来”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题统计与报复、惩罚他人有关的念头。愤怒是正常情绪，让它主导行为才是要留意的部分；被欺负时求助比报复更有效。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "这些念头出现时，你通常刚经历了什么？"
              },
              {
                "category": "strategy",
                "text": "下次被激怒时先离开现场十分钟；如果有人持续欺负你，告诉一位可信任的大人。"
              }
            ]
          },
          {
            "scoreKey": "total",
            "headline": "这周的念头记录",
            "source": {
              "type": "score_only"
            },
            "summary": "总分汇总40个念头出现的频率，用于观察一周内的整体水平；它不是“想得好不好”的评分，更不能定义一个人。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "这一周里，哪几天的念头更吵？那些天发生了什么？"
              },
              {
                "category": "strategy",
                "text": "选一个维度的一条念头做一周记录：念头→证据→更完整的版本。"
              }
            ]
          }
        ],
        "limitations": [
          "分数反映念头出现的频率，不代表念头为真，也不定义一个人。",
          "官方计分表印有临床界值；产品不使用界值、等级或标签，仅供研究参考。",
          "原验证为澳大利亚7–16岁样本；不构成中文人群常模。",
          "各分数必须完整作答是产品保守约定；缺答不会算零。",
          "题本转录自版权方官网公开文件，权利状态未确认；中文路径未交付。"
        ],
        "disclaimer": "仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。若出现“活着没意思”等念头持续加重，请立即告诉可信任的大人或联系专业支持。"
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
            "itemCode": "CATS-01",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-02",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-03",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-04",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-05",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-06",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-07",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-08",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-09",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-10",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-11",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-12",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-13",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-14",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-15",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-16",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-17",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-18",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-19",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-20",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-21",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-22",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-23",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-24",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-25",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-26",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-27",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-28",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-29",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-30",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-31",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-32",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-33",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-34",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-35",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-36",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-37",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-38",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-39",
            "responseValue": "0"
          },
          {
            "itemCode": "CATS-40",
            "responseValue": "0"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "physical_threat": 0,
            "social_threat": 0,
            "personal_failure": 0,
            "hostile_intent": 0,
            "total": 0
          },
          "totalScoreKeys": [
            "physical_threat",
            "social_threat",
            "personal_failure",
            "hostile_intent",
            "total"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "CATS-01",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-02",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-03",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-04",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-05",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-06",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-07",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-08",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-09",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-10",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-11",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-12",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-14",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-15",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-16",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-17",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-18",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-19",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-20",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-21",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-22",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-23",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-24",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-25",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-26",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-27",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-28",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-29",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-30",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-31",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-32",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-33",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-34",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-35",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-36",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-37",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-38",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-39",
            "responseValue": "4"
          },
          {
            "itemCode": "CATS-40",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "physical_threat": 40,
            "social_threat": 40,
            "personal_failure": 40,
            "hostile_intent": 40,
            "total": 160
          },
          "totalScoreKeys": [
            "physical_threat",
            "social_threat",
            "personal_failure",
            "hostile_intent",
            "total"
          ]
        }
      },
      {
        "name": "sample-social2-rest1",
        "answers": [
          {
            "itemCode": "CATS-01",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-02",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-03",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-04",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-05",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-06",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-07",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-08",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-10",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-11",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-12",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-13",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-14",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-15",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-16",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-17",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-18",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-19",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-20",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-21",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-22",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-23",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-24",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-25",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-26",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-27",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-28",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-29",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-30",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-31",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-32",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-33",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-34",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-35",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-36",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-37",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-38",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-39",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-40",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "physical_threat": 10,
            "social_threat": 20,
            "personal_failure": 10,
            "hostile_intent": 10,
            "total": 50
          },
          "totalScoreKeys": [
            "physical_threat",
            "social_threat",
            "personal_failure",
            "hostile_intent",
            "total"
          ]
        }
      },
      {
        "name": "missing-social",
        "answers": [
          {
            "itemCode": "CATS-02",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-03",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-04",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-05",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-06",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-07",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-08",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-10",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-11",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-12",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-13",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-14",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-15",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-16",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-17",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-18",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-19",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-20",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-21",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-22",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-23",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-24",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-25",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-26",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-27",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-28",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-29",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-30",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-31",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-32",
            "responseValue": "2"
          },
          {
            "itemCode": "CATS-33",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-34",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-35",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-36",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-37",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-38",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-39",
            "responseValue": "1"
          },
          {
            "itemCode": "CATS-40",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "physical_threat": 10,
            "social_threat": null,
            "personal_failure": 10,
            "hostile_intent": 10,
            "total": null
          },
          "totalScoreKeys": [
            "physical_threat",
            "social_threat",
            "personal_failure",
            "hostile_intent",
            "total"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
