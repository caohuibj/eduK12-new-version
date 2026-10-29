import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Official simplified-Chinese CATS © Centre for Emotional Health, Macquarie University; Translated by © Dr Sun Ling, Beijing Normal University; license unverified.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "cats40_zh_cn",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "儿童自动思维量表（CATS）中文版，儿童自评40题",
      "abbreviation": "CATS 中文版",
      "instrumentFamily": "Children’s Automatic Thoughts Scale"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [
        "BEHAVIORAL_DIFFICULTIES"
      ],
      "constructDefinition": "儿童青少年自评过去一周消极自动思维（身体威胁、社交威胁、个人失败、敌意倾向）出现的频率；官方简体中文版。",
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
        "language_validation:official_translation_review_pending",
        "license:license_unverified"
      ]
    },
    "population": {
      "populationNotes": "英文原版验证为7–16岁儿童青少年（Schniering & Rapee, 2002）；本中文版为版权方官网公开的官方译本（译者署名：北京师范大学孙玲），未见独立中文心理测量学验证研究，故语言验证标记为待复核。译文含港式用语（“大部份”“频密”），指导语作“过去一个周”而表头作“过去一星期”，用语不一致处按原文保留；正式施测前建议完成译文复核。",
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
        "题序与英文版一一对应，四个分量表归属不变。",
        "表头句式「过去一星期里，我想过……」与指导语“过去一个周内”按原文保留，未统一。",
        "选项文字：完全没有0/很少1/有时2/经常3/总是4。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "构念证据来自英文原版；中文版为官方译本，未见独立中文验证。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "频率反馈不构成诊断；第30题（人生没有生存价值）等条目若持续高分应由专业人员跟进。"
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
        "population": "Australian children and adolescents aged 7–16 (clinical and community samples), English original",
        "locale": "en",
        "territory": "AU",
        "studyDesign": "Scale development with four-factor structure and treatment sensitivity in anxious youth.",
        "rating": "SUFFICIENT",
        "citation": "Schniering CA, Rapee RM. (2002). Development and validation of a measure of children’s automatic thoughts: The Children’s Automatic Thoughts Scale. Behaviour Research and Therapy, 40(4), 471–487. 中文版：© Centre for Emotional Health, Macquarie University；Translated by © Dr Sun Ling, Beijing Normal University.",
        "url": "https://www.mq.edu.au/__data/assets/pdf_file/0007/78865/CATS_Chinese_copyright_2015.pdf",
        "notes": "该证据对应英文原版；中文版的题项归属沿用官方计分说明（四个分量表与英文版一致）。官方临床界值仅登记、不用于产品反馈。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "cats40-zh-cn-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "cats40-zh-cn-v1",
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
    "text": "以下的句子是一些孩子或青少年的想法。请仔细阅读每一句，并在其右方合适的数字上，以表示该想法在你过去一个周内出现的频密程度。",
    "language": "zh-CN",
    "version": "1.0.0",
    "source": "版权方中文版题本第1页指导语，逐字转录（含“过去一个周”原文用语）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "zh-CN",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "儿童自动思维量表（CATS）中文版",
        "citation": "Schniering CA, Rapee RM. (2002). Development and validation of a measure of children’s automatic thoughts: The Children’s Automatic Thoughts Scale. Behaviour Research and Therapy, 40(4), 471–487. 中文版：© Centre for Emotional Health, Macquarie University；Translated by © Dr Sun Ling, Beijing Normal University.",
        "url": "https://www.mq.edu.au/__data/assets/pdf_file/0007/78865/CATS_Chinese_copyright_2015.pdf",
        "publicationYear": 2002
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "中文版题本 © Centre for Emotional Health, Macquarie University；Translated by © Dr Sun Ling, Beijing Normal University。经版权方官网资源页公开提供（copyright 2015 文件）；页面未列明再分发或商业条款。未取得授权声明；正式发布或商业使用前须与版权方确认。"
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
              "label": "完全没有",
              "score": 0
            },
            {
              "value": "1",
              "label": "很少",
              "score": 1
            },
            {
              "value": "2",
              "label": "有时",
              "score": 2
            },
            {
              "value": "3",
              "label": "经常",
              "score": 3
            },
            {
              "value": "4",
              "label": "总是",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "CATS-01",
          "content": "其他同学会认为我蠢",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-02",
          "content": "我有权向那些罪有应得的人报复",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-03",
          "content": "我做任何事都做得不对",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-04",
          "content": "我将会遭遇意外",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-05",
          "content": "其他同学都是蠢的",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-06",
          "content": "我担心将会被人嘲弄",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-07",
          "content": "我将要发疯了",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-08",
          "content": "其他同学会取笑我",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-09",
          "content": "我将会死亡",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-10",
          "content": "大部份人都针对我",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-11",
          "content": "我没有价值",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-12",
          "content": "我的父母将会受伤",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-13",
          "content": "再没有什么事情是顺意的",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-14",
          "content": "我会在别人面前表现得很蠢",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-15",
          "content": "我不会放过那些针对我的人",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-16",
          "content": "我害怕自己会失控",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-17",
          "content": "事情出错是因为我的过失",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-18",
          "content": "其他人都在想我差劲的一面",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-19",
          "content": "若有人伤害我，我有权去伤害他们",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-20",
          "content": "我将会受伤",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-21",
          "content": "我担心其他同学如何看我",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-22",
          "content": "有些人应该得到他们的报应",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-23",
          "content": "我把自己的生活弄得一团糟",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-24",
          "content": "有些可怕的事情将要发生",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-25",
          "content": "我看起来好像一个傻瓜",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-26",
          "content": "我永远不能像别人那样好",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-27",
          "content": "我经常因一些我没有做错的事被人责怪",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-28",
          "content": "我是一个失败者",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-29",
          "content": "其他同学爱拿我来开玩笑",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-30",
          "content": "人生没有生存价值",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-31",
          "content": "所有人都望着我",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-32",
          "content": "我害怕会令自己出丑",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-33",
          "content": "我害怕有人可能会死去",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-34",
          "content": "我永远不能克服我的问题",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-35",
          "content": "其他人总想给我找麻烦",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-36",
          "content": "我一定有些地方很有问题",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-37",
          "content": "有些人是很坏的",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-38",
          "content": "我憎恨自己",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-39",
          "content": "有些事情会发生在我所关心的人身上",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "cats_frequency_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CATS-40",
          "content": "坏人是应该受到惩罚的",
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
          "官方计分表印有临床界值；产品不使用界值、等级或标签。",
          "构念与计分证据来自英文原版；中文版为官方译本，未见独立中文验证研究，译文含港式用语且时段用语不一致（已按原文保留）。",
          "各分数必须完整作答是产品保守约定；缺答不会算零。",
          "题本转录自版权方官网公开文件，权利状态未确认。"
        ],
        "disclaimer": "仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。若出现“人生没有生存价值”等念头持续加重，请立即告诉可信任的大人或联系专业支持。"
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
