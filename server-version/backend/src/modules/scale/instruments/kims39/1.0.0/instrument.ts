import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text and subscale scoring key transcribed verbatim from the KIMS PDF hosted on the
// author's academic page (Ruth A. Baer, University of Kentucky, https://www.ruthbaer.com/academics/).
// Original scale: Baer, Smith, & Allen (2004), Assessment, 11(3), 191-206; the PDF prints this citation
// on its scoring page. The hosting page carries no explicit redistribution license statement.
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
      "canonicalName": "Kentucky Inventory of Mindfulness Skills, original 39-item version",
      "abbreviation": "KIMS-39",
      "instrumentFamily": "Kentucky Inventory of Mindfulness Skills"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "一般日常经验中观察、描述、觉知行动与不评判地接纳内在体验四个技能的自报倾向；不是正念能力考试、症状筛查或干预疗效判定。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "kims39",
        "domain:mindfulness",
        "domain:self_regulation",
        "construct:mindfulness_skills",
        "construct:observing",
        "construct:describing",
        "construct:acting_with_awareness",
        "construct:nonjudging",
        "construct:mindfulness_kims39_observe",
        "construct:mindfulness_kims39_describe",
        "construct:mindfulness_kims39_act_aware",
        "construct:mindfulness_kims39_nonjudge",
        "orientation:mindfulness_processes",
        "population:adult_18_plus",
        "population:self_report",
        "population:not_k12_validated",
        "response:39_items",
        "response:five_point_truth",
        "response:eighteen_reverse_items",
        "use:research",
        "use:individual_reflection",
        "use:not_diagnostic",
        "use:not_high_stakes_selection",
        "use:not_school_ranking",
        "use:no_validated_cutoff",
        "license:author_hosted_pdf",
        "license:redistribution_review_pending",
        "language_validation:original_en",
        "正念四技能",
        "成人自评",
        "个人反思",
        "非诊断"
      ]
    },
    "population": {
      "minAge": 18,
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL",
      "populationNotes": "原版验证以美国大学生成人样本为主（Baer et al., 2004）；本条目按 18 岁以上成人自评使用，英文原版无中文人群验证，不将任何中文修订版或其他语言版本的证据套用于此，也不与 FFMQ 家族条目互换分数或证据。"
    },
    "administration": {
      "itemCount": 39,
      "estimatedMinutes": 10,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "PAPER"
      ],
      "timeFrame": "一般自我描述，无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "题干与选项逐字取自作者官方 PDF（https://www.ruthbaer.com/academics/ 托管），保留原文弯撇号（U+2019）与弯引号（U+201C/U+201D）；第 36 题题号后原文为双空格，第 16 题在 layout 提取中呈现词间距伪影（stream 提取为正常单空格），两种模式逐词一致、无缺字。",
        "官方计分表只有四个分量表（Observe 12 题 / Describe 8 题 / Act with awareness 10 题 / Accept without judgment 9 题），没有总分行，本条目不设总分。",
        "反向题 18 道按 6−原分（1↔5、2↔4、3 不变）统一方向后求和：Describe 14/18/22，Act with awareness 3/11/23/27/31/35，Accept without judgment 全部 9 题，Observe 无反向。",
        "任一题缺答该维度不计算（null），不把缺答当零分；complete_required 是产品保守约定，不是原作者规则。",
        "预计时长为产品估计，不是原作者实测。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版英文在美国成人样本中开发并验证四技能结构。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "用于回顾个人体验与可行小行动，不贴能力、人格或疾病标签。"
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
        "evidenceId": "baer-2004-kims-four-skills",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US undergraduate adult samples (original KIMS development studies)",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development of the original 39-item KIMS with exploratory and confirmatory factor analyses supporting four mindfulness skills (Observe, Describe, Act with awareness, Accept without judgment).",
        "rating": "SUFFICIENT",
        "citation": "Baer, R. A., Smith, G. T., & Allen, K. B. (2004). Assessment of mindfulness by self-report: The Kentucky Inventory of Mindfulness Skills. Assessment, 11(3), 191–206. https://doi.org/10.1177/1073191104268029",
        "doi": "10.1177/1073191104268029",
        "url": "https://doi.org/10.1177/1073191104268029",
        "notes": "该证据对应英文成人样本，不构成本地常模，也不支持任何界值或百分位。"
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
    "requiredContextKeys": [],
    "subject": {
      "ageMonths": {
        "minInclusive": 216
      }
    }
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
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Kentucky Inventory of Mindfulness Skills (KIMS), original 39-item version",
        "citation": "Baer, R. A., Smith, G. T., & Allen, K. B. (2004). Assessment of mindfulness by self-report: The Kentucky Inventory of Mindfulness Skills. Assessment, 11(3), 191–206. https://doi.org/10.1177/1073191104268029",
        "url": "https://www.ruthbaer.com/academics/",
        "publicationYear": 2004
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文与官方计分键引自作者 Ruth Baer 学术页（https://www.ruthbaer.com/academics/）公开托管的原版 PDF（Ruth A. Baer, Ph.D. / University of Kentucky 署名）；该页面未附明确再分发许可声明，本条目仅记录公开托管事实，不声称获得商业、翻译或再分发授权。PDF 第 3 页印有原版引文：Baer, R. A., Smith G. T., & Allen, K. B. (2004). Assessment of mindfulness by self-report: The Kentucky Inventory of Mindfulness Skills. Assessment, 11, 191-206（期刊卷期页码按标准出版记录登记为 11(3), 191–206）。工作副本 SHA-256：3dabd10edafbe324370d024fcced68ea244be82f2512dc023398f39298b60a07；全文提取与逐字核对见 docs/mindfulness-content-20261028/kims39/source.md 及 _prdata/pdfs/kims39_extract.txt。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "kims39_1_5",
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
          "itemCode": "KIMS39_01",
          "content": "I notice changes in my body, such as whether my breathing slows down or speeds up.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_02",
          "content": "I’m good at finding the words to describe my feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_03",
          "content": "When I do things, my mind wanders off and I’m easily distracted.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_04",
          "content": "I criticize myself for having irrational or inappropriate emotions.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_05",
          "content": "I pay attention to whether my muscles are tense or relaxed.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_06",
          "content": "I can easily put my beliefs, opinions, and expectations into words.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_07",
          "content": "When I’m doing something, I’m only focused on what I’m doing, nothing else.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_08",
          "content": "I tend to evaluate whether my perceptions are right or wrong.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_09",
          "content": "When I’m walking, I deliberately notice the sensations of my body moving.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_10",
          "content": "I’m good at thinking of words to express my perceptions, such as how things taste, smell, or sound.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_11",
          "content": "I drive on “automatic pilot” without paying attention to what I’m doing.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_12",
          "content": "I tell myself that I shouldn’t be feeling the way I’m feeling.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_13",
          "content": "When I take a shower or bath, I stay alert to the sensations of water on my body.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_14",
          "content": "It’s hard for me to find the words to describe what I’m thinking.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_15",
          "content": "When I’m reading, I focus all my attention on what I’m reading.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_16",
          "content": "I believe some of my thoughts are abnormal or bad and I shouldn’t think that way.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_17",
          "content": "I notice how foods and drinks affect my thoughts, bodily sensations, and emotions.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_18",
          "content": "I have trouble thinking of the right words to express how I feel about things.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_19",
          "content": "When I do things, I get totally wrapped up in them and don’t think about anything else.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_20",
          "content": "I make judgments about whether my thoughts are good or bad.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_21",
          "content": "I pay attention to sensations, such as the wind in my hair or sun on my face.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_22",
          "content": "When I have a sensation in my body, it’s difficult for me to describe it because I can’t find the right words.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_23",
          "content": "I don’t pay attention to what I’m doing because I’m daydreaming, worrying, or otherwise distracted.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_24",
          "content": "I tend to make judgments about how worthwhile or worthless my experiences are.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_25",
          "content": "I pay attention to sounds, such as clocks ticking, birds chirping, or cars passing.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_26",
          "content": "Even when I’m feeling terribly upset, I can find a way to put it into words.",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_27",
          "content": "When I’m doing chores, such as cleaning or laundry, I tend to daydream or think of other things.",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_28",
          "content": "I tell myself that I shouldn’t be thinking the way I’m thinking.",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_29",
          "content": "I notice the smells and aromas of things.",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_30",
          "content": "I intentionally stay aware of my feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_31",
          "content": "I tend to do several things at once rather than focusing on one thing at a time.",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_32",
          "content": "I think some of my emotions are bad or inappropriate and I shouldn’t feel them.",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_33",
          "content": "I notice visual elements in art or nature, such as colors, shapes, textures, or patterns of light and shadow.",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_34",
          "content": "My natural tendency is to put my experiences into words.",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_35",
          "content": "When I’m working on something, part of my mind is occupied with other topics, such as what I’ll be doing later, or things I’d rather be doing.",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_36",
          "content": "I disapprove of myself when I have irrational ideas.",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_37",
          "content": "I pay attention to how my emotions affect my thoughts and behavior.",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_38",
          "content": "I get completely absorbed in what I’m doing, so that all my attention is focused on it.",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "KIMS39_39",
          "content": "I notice when my moods begin to change.",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "kims39_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "KIMS39_01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_03",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_04",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_08",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_11",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_12",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_14",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_16",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_18",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_20",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_22",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_23",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_24",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_27",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_28",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_30",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_31",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_32",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_34",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_35",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_36",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "KIMS39_37",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_38",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "KIMS39_39",
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
            "label": "观察留意",
            "description": "相关题按官方反向键（6−原分）统一方向后等权求和；任一题缺答该维不计算。",
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
                  "itemCode": "KIMS39_01",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_05",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_09",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_13",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_17",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_21",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_25",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_29",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_30",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_33",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_37",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_39",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "describe",
            "type": "dimension",
            "label": "描述表达",
            "description": "相关题按官方反向键（6−原分）统一方向后等权求和；任一题缺答该维不计算。",
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
                  "itemCode": "KIMS39_02",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_06",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_10",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_14",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_18",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_22",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_26",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_34",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "act_aware",
            "type": "dimension",
            "label": "觉知行动",
            "description": "相关题按官方反向键（6−原分）统一方向后等权求和；任一题缺答该维不计算。",
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
                  "itemCode": "KIMS39_03",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_07",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_11",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_15",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_19",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_23",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_27",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_31",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_35",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_38",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "nonjudge",
            "type": "dimension",
            "label": "接纳不评判",
            "description": "相关题按官方反向键（6−原分）统一方向后等权求和；任一题缺答该维不计算。",
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
                  "itemCode": "KIMS39_04",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_08",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_12",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_16",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_20",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_24",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_28",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_32",
                  "weight": 1
                },
                {
                  "itemCode": "KIMS39_36",
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
          "act_aware",
          "nonjudge"
        ],
        "scoreOrder": [
          "observe",
          "describe",
          "act_aware",
          "nonjudge"
        ],
        "interpretations": [
          {
            "scoreKey": "observe",
            "headline": "观察留意",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题（原版名为 Observe）关注你会不会留意身体的感觉和周围的变化，比如呼吸的快慢、肌肉的松紧、风声或阳光照在脸上。对内感受敏感不是毛病，也不是本事大；同样的留意，在放松时和紧张时的感受可能完全不同。如果发现过度留意身体让自己更不安，把注意力放回手头的事情上，也是完全合理的选择。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "今天有没有一个本来不会注意、后来留意到的小感觉或小声音？它带来了什么？"
              },
              {
                "category": "strategy",
                "text": "选一个中性的瞬间（比如喝水、走路），短暂留意其中的感觉，然后继续做自己的事。"
              }
            ]
          },
          {
            "scoreKey": "describe",
            "headline": "描述表达",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题（原版名为 Describe）关注你能不能给自己的感受和知觉找到词语——不只是情绪，也包括东西尝起来、闻起来、听起来是什么样。找词不容易：体验常常混在一起，也不总有一个准确的词。这部分不考表达水平，说不出的时候不必责怪自己；先用一个大致的词，再补一句身体哪里有感觉，就已经是在描述了。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "如果只用一个词形容今天大部分时间的感受，那个词会是什么？"
              },
              {
                "category": "strategy",
                "text": "试着说“我现在有点……，因为它让我想……”，说得差不多就好。"
              }
            ]
          },
          {
            "scoreKey": "act_aware",
            "headline": "觉知行动",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题（原版名为 Act with awareness）关注做事时你是否知道自己正在做什么：是专心在眼前这一步，还是一边做一边想着别的事、像在自动运行。人人都会走神，这再正常不过；分心不等于不认真，更不能用来评判一个人的价值。发现走神的那一刻，其实就是觉察发生的时刻。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "哪件熟悉的小事，你经常做完才发现刚才在想别的？"
              },
              {
                "category": "strategy",
                "text": "做那件小事时只留意当前一步；发现走神，不用批评自己，温和地回到手头的事。"
              }
            ]
          },
          {
            "scoreKey": "nonjudge",
            "headline": "接纳不评判",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题（原版名为 Accept without judgment）关注你会不会给自己的念头和情绪贴“好/坏、该/不该”的标签，比如告诉自己“我不该有这种感觉”。允许一个感受存在，不代表认同它带来的每个冲动；看见“我现在有这样的感受”，和决定下一步怎么做，是可以分开的。出现不喜欢的念头，不等于你这个人不好。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "当你不喜欢的感受出现时，你习惯对自己说什么？换个说法会怎样？"
              },
              {
                "category": "strategy",
                "text": "把“我不该这样想”换成“我现在确实有这样的感受”，然后再选择一个合适的小行动。"
              }
            ]
          }
        ],
        "limitations": [
          "英文自评受情境、心情与理解方式影响，只能作为回顾参考，不能代表所有情境。",
          "原版验证为美国大学生成人样本，不构成中国或任何本地人群常模。",
          "任一题缺答该维度不计算，缺答不会算零；完整作答要求是产品约定，不是原作者规则。",
          "没有常模、百分位或诊断阈值；分数不用于排名、选拔或高风险决策。",
          "原版计分表只有四个分量表、没有总分行，本条目不计算总分。",
          "文献中有 Observe 分维在部分样本（尤其无正念练习经验者）内部一致性偏低的已知报告，此处仅陈述该情况，本条目不作裁定。",
          "与后续 Five Facet Mindfulness Questionnaire（FFMQ）家族条目（含 ffmq39、ffmq15）题本、结构与证据互不通用，分数不互换比较。"
        ],
        "disclaimer": "供 18 岁以上成人回顾个人体验与日常习惯，不是考试，也不能用于诊断、人格评判或高风险决策。题本为英文原版。"
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
            "itemCode": "KIMS39_01",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_02",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_03",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_04",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_05",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_06",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_07",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_08",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_09",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_10",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_11",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_12",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_13",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_14",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_15",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_16",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_17",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_18",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_19",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_20",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_21",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_22",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_23",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_24",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_25",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_26",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_27",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_28",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_29",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_30",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_31",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_32",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_33",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_34",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_35",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_36",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_37",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_38",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_39",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "observe": 12,
            "describe": 20,
            "act_aware": 34,
            "nonjudge": 45
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "KIMS39_01",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_02",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_03",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_04",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_05",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_06",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_07",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_08",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_09",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_10",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_11",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_12",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_13",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_14",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_15",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_16",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_17",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_18",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_19",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_20",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_21",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_22",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_23",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_24",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_25",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_26",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_27",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_28",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_29",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_30",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_31",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_32",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_33",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_34",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_35",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_36",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_37",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_38",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_39",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "observe": 60,
            "describe": 28,
            "act_aware": 26,
            "nonjudge": 9
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge"
          ]
        }
      },
      {
        "name": "all-midpoint",
        "answers": [
          {
            "itemCode": "KIMS39_01",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_02",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_03",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_04",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_05",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_06",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_07",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_08",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_09",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_10",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_11",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_12",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_13",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_14",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_15",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_16",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_17",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_18",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_19",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_20",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_21",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_22",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_23",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_24",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_25",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_26",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_27",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_28",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_29",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_30",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_31",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_32",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_33",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_34",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_35",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_36",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_37",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_38",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_39",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "observe": 36,
            "describe": 24,
            "act_aware": 30,
            "nonjudge": 27
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge"
          ]
        }
      },
      {
        "name": "mixed-middle-with-reverse",
        "answers": [
          {
            "itemCode": "KIMS39_01",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_02",
            "responseValue": "2"
          },
          {
            "itemCode": "KIMS39_03",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_04",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_05",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_06",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_07",
            "responseValue": "2"
          },
          {
            "itemCode": "KIMS39_08",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_09",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_10",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_11",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_12",
            "responseValue": "2"
          },
          {
            "itemCode": "KIMS39_13",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_14",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_15",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_16",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_17",
            "responseValue": "2"
          },
          {
            "itemCode": "KIMS39_18",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_19",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_20",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_21",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_22",
            "responseValue": "2"
          },
          {
            "itemCode": "KIMS39_23",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_24",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_25",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_26",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_27",
            "responseValue": "2"
          },
          {
            "itemCode": "KIMS39_28",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_29",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_30",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_31",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_32",
            "responseValue": "2"
          },
          {
            "itemCode": "KIMS39_33",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_34",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_35",
            "responseValue": "5"
          },
          {
            "itemCode": "KIMS39_36",
            "responseValue": "1"
          },
          {
            "itemCode": "KIMS39_37",
            "responseValue": "2"
          },
          {
            "itemCode": "KIMS39_38",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_39",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "observe": 39,
            "describe": 22,
            "act_aware": 35,
            "nonjudge": 29
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge"
          ]
        }
      },
      {
        "name": "missing-observe-item01",
        "answers": [
          {
            "itemCode": "KIMS39_02",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_03",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_04",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_05",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_06",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_07",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_08",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_09",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_10",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_11",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_12",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_13",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_14",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_15",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_16",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_17",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_18",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_19",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_20",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_21",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_22",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_23",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_24",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_25",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_26",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_27",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_28",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_29",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_30",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_31",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_32",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_33",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_34",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_35",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_36",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_37",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_38",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_39",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "observe": null,
            "describe": 24,
            "act_aware": 30,
            "nonjudge": 27
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge"
          ]
        }
      },
      {
        "name": "missing-describe-item02",
        "answers": [
          {
            "itemCode": "KIMS39_01",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_03",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_04",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_05",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_06",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_07",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_08",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_09",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_10",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_11",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_12",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_13",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_14",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_15",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_16",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_17",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_18",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_19",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_20",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_21",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_22",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_23",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_24",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_25",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_26",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_27",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_28",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_29",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_30",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_31",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_32",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_33",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_34",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_35",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_36",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_37",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_38",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_39",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "observe": 36,
            "describe": null,
            "act_aware": 30,
            "nonjudge": 27
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge"
          ]
        }
      },
      {
        "name": "missing-act_aware-item03",
        "answers": [
          {
            "itemCode": "KIMS39_01",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_02",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_04",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_05",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_06",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_07",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_08",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_09",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_10",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_11",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_12",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_13",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_14",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_15",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_16",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_17",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_18",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_19",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_20",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_21",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_22",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_23",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_24",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_25",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_26",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_27",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_28",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_29",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_30",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_31",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_32",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_33",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_34",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_35",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_36",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_37",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_38",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_39",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "observe": 36,
            "describe": 24,
            "act_aware": null,
            "nonjudge": 27
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge"
          ]
        }
      },
      {
        "name": "missing-nonjudge-item04",
        "answers": [
          {
            "itemCode": "KIMS39_01",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_02",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_03",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_05",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_06",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_07",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_08",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_09",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_10",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_11",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_12",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_13",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_14",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_15",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_16",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_17",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_18",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_19",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_20",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_21",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_22",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_23",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_24",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_25",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_26",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_27",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_28",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_29",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_30",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_31",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_32",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_33",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_34",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_35",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_36",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_37",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_38",
            "responseValue": "3"
          },
          {
            "itemCode": "KIMS39_39",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "observe": 36,
            "describe": 24,
            "act_aware": 30,
            "nonjudge": null
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge"
          ]
        }
      },
      {
        "name": "mixed-missing",
        "answers": [
          {
            "itemCode": "KIMS39_01",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_02",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_05",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_06",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_07",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_08",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_09",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_10",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_11",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_12",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_13",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_15",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_16",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_17",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_18",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_19",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_20",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_21",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_22",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_23",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_24",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_25",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_26",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_27",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_28",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_29",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_30",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_31",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_32",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_33",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_34",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_35",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_36",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_37",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_38",
            "responseValue": "4"
          },
          {
            "itemCode": "KIMS39_39",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "observe": 48,
            "describe": null,
            "act_aware": null,
            "nonjudge": null
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge"
          ]
        }
      },
      {
        "name": "all-missing",
        "answers": [],
        "expected": {
          "quality": "invalid",
          "scores": {
            "observe": null,
            "describe": null,
            "act_aware": null,
            "nonjudge": null
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
