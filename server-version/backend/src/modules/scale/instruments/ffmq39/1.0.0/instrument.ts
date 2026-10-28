import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text and subscale scoring key transcribed verbatim from the FFMQ PDF hosted on the
// author's academic page (Ruth A. Baer, University of Kentucky, https://www.ruthbaer.com/academics/).
// Original scale: Baer, Smith, Hopkins, Krietemeyer, & Toney (2006), Assessment, 13(1), 27-45.
// The hosting page carries no explicit redistribution license statement (recorded as unknown).
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "ffmq39",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Five Facet Mindfulness Questionnaire, original 39-item version",
      "abbreviation": "FFMQ-39",
      "instrumentFamily": "Five Facet Mindfulness Questionnaire"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "一般日常经验中观察、描述、觉知行动、不评判内在经验及不立即反应五个侧面的自报倾向；不是正念能力考试、症状筛查或干预疗效判定。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "ffmq39",
        "domain:mindfulness",
        "domain:self_regulation",
        "construct:mindfulness_facets",
        "construct:observing",
        "construct:describing",
        "construct:acting_with_awareness",
        "construct:nonjudging",
        "construct:nonreactivity",
        "construct:mindfulness_ffmq39_observe",
        "construct:mindfulness_ffmq39_describe",
        "construct:mindfulness_ffmq39_act_aware",
        "construct:mindfulness_ffmq39_nonjudge",
        "construct:mindfulness_ffmq39_nonreact",
        "orientation:mindfulness_processes",
        "population:adult_18_plus",
        "population:self_report",
        "population:not_k12_validated",
        "response:39_items",
        "response:five_point_truth",
        "response:nineteen_reverse_items",
        "use:research",
        "use:individual_reflection",
        "use:not_diagnostic",
        "use:not_high_stakes_selection",
        "use:not_school_ranking",
        "use:no_validated_cutoff",
        "license:author_hosted_pdf",
        "license:redistribution_review_pending",
        "language_validation:original_en",
        "正念五个侧面",
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
      "populationNotes": "原版验证以美国大学生成人样本为主（Baer et al., 2006）；本条目按 18 岁以上成人自评使用，英文原版无中文人群验证，不将任何中文修订版或短版证据（含 ffmq15 中文工作稿）套用于此。"
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
        "题干与选项逐字取自作者官方 PDF（https://www.ruthbaer.com/academics/ 托管），保留原文标点：第16题原文无句末句号，第29题 images 后无逗号，第35题为 depending what（无 on），第24题排版间距与相邻题不同。",
        "官方计分表只有五个分量表（Observing/Describing/Acting with awareness/Nonjudging/Nonreactivity，8/8/8/8/7），没有总分行，本条目不设总分。",
        "反向题19道按 6−原分（1↔5、2↔4、3不变）统一方向后求和。",
        "任一题缺答该维度不计算（null），不把缺答当零分；complete_required 是产品保守约定，不是原作者规则。",
        "预计时长为产品估计，不是原作者实测。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版英文在成人样本中开发并验证五因子结构。"
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
        "evidenceId": "baer-2006-ffmq-facet-structure",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US undergraduate adult samples (original FFMQ development studies)",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development of the original 39-item FFMQ with exploratory and confirmatory factor analyses supporting the five-facet structure.",
        "rating": "SUFFICIENT",
        "citation": "Baer, R. A., Smith, G. T., Hopkins, J., Krietemeyer, J., & Toney, L. (2006). Using self-report assessment methods to explore facets of mindfulness. Assessment, 13(1), 27–45. https://doi.org/10.1177/1073191105283504",
        "doi": "10.1177/1073191105283504",
        "url": "https://doi.org/10.1177/1073191105283504",
        "notes": "该证据对应英文成人样本，不构成本地常模，也不支持任何界值或百分位。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "ffmq39-en-v1",
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
    "policyVersion": "ffmq39-en-v1",
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
        "title": "Five Facet Mindfulness Questionnaire (FFMQ), original 39-item version",
        "citation": "Baer, R. A., Smith, G. T., Hopkins, J., Krietemeyer, J., & Toney, L. (2006). Using self-report assessment methods to explore facets of mindfulness. Assessment, 13(1), 27–45. https://doi.org/10.1177/1073191105283504",
        "url": "https://www.ruthbaer.com/academics/",
        "publicationYear": 2006
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文与官方计分键引自作者 Ruth Baer 学术页（https://www.ruthbaer.com/academics/）公开托管的原版 PDF（University of Kentucky 署名）；该页面未附明确再分发许可声明，本条目仅记录公开托管事实，不声称获得商业、翻译或再分发授权。原版研究引文：Baer, Smith, Hopkins, Krietemeyer, & Toney (2006), Assessment, 13(1), 27–45（PDF 本身未印期刊引文页脚）。工作副本 SHA-256 校验与全文提取见 docs/mindfulness-content-20261028/ffmq39/source.md 及 _prdata/pdfs/ffmq39_extract.txt。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "ffmq39_1_5",
          "options": [
            {
              "value": "1",
              "label": "never or very rarely true",
              "score": 1
            },
            {
              "value": "2",
              "label": "rarely true",
              "score": 2
            },
            {
              "value": "3",
              "label": "sometimes true",
              "score": 3
            },
            {
              "value": "4",
              "label": "often true",
              "score": 4
            },
            {
              "value": "5",
              "label": "very often or always true",
              "score": 5
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "FFMQ39_01",
          "content": "When I’m walking, I deliberately notice the sensations of my body moving.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_02",
          "content": "I’m good at finding words to describe my feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_03",
          "content": "I criticize myself for having irrational or inappropriate emotions.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_04",
          "content": "I perceive my feelings and emotions without having to react to them.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_05",
          "content": "When I do things, my mind wanders off and I’m easily distracted.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_06",
          "content": "When I take a shower or bath, I stay alert to the sensations of water on my body.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_07",
          "content": "I can easily put my beliefs, opinions, and expectations into words.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_08",
          "content": "I don’t pay attention to what I’m doing because I’m daydreaming, worrying, or otherwise distracted.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_09",
          "content": "I watch my feelings without getting lost in them.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_10",
          "content": "I tell myself I shouldn’t be feeling the way I’m feeling.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_11",
          "content": "I notice how foods and drinks affect my thoughts, bodily sensations, and emotions.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_12",
          "content": "It’s hard for me to find the words to describe what I’m thinking.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_13",
          "content": "I am easily distracted.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_14",
          "content": "I believe some of my thoughts are abnormal or bad and I shouldn’t think that way.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_15",
          "content": "I pay attention to sensations, such as the wind in my hair or sun on my face.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_16",
          "content": "I have trouble thinking of the right words to express how I feel about things",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_17",
          "content": "I make judgments about whether my thoughts are good or bad.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_18",
          "content": "I find it difficult to stay focused on what’s happening in the present.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_19",
          "content": "When I have distressing thoughts or images, I “step back” and am aware of the thought or image without getting taken over by it.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_20",
          "content": "I pay attention to sounds, such as clocks ticking, birds chirping, or cars passing.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_21",
          "content": "In difficult situations, I can pause without immediately reacting.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_22",
          "content": "When I have a sensation in my body, it’s difficult for me to describe it because I can’t find the right words.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_23",
          "content": "It seems I am “running on automatic” without much awareness of what I’m doing.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_24",
          "content": "When I have distressing thoughts or images, I feel calm soon after.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_25",
          "content": "I tell myself that I shouldn’t be thinking the way I’m thinking.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_26",
          "content": "I notice the smells and aromas of things.",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_27",
          "content": "Even when I’m feeling terribly upset, I can find a way to put it into words.",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_28",
          "content": "I rush through activities without being really attentive to them.",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_29",
          "content": "When I have distressing thoughts or images I am able just to notice them without reacting.",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_30",
          "content": "I think some of my emotions are bad or inappropriate and I shouldn’t feel them.",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_31",
          "content": "I notice visual elements in art or nature, such as colors, shapes, textures, or patterns of light and shadow.",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_32",
          "content": "My natural tendency is to put my experiences into words.",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_33",
          "content": "When I have distressing thoughts or images, I just notice them and let them go.",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_34",
          "content": "I do jobs or tasks automatically without being aware of what I’m doing.",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_35",
          "content": "When I have distressing thoughts or images, I judge myself as good or bad, depending what the thought/image is about.",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_36",
          "content": "I pay attention to how my emotions affect my thoughts and behavior.",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_37",
          "content": "I can usually describe how I feel at the moment in considerable detail.",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_38",
          "content": "I find myself doing things without paying attention.",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "FFMQ39_39",
          "content": "I disapprove of myself when I have irrational ideas.",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "ffmq39_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "FFMQ39_01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_03",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_05",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_08",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_10",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_12",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_13",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_14",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_16",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_17",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_18",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_22",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_23",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_25",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_28",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_30",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_31",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_32",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_34",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_35",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_36",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_37",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "FFMQ39_38",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "FFMQ39_39",
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
                  "itemCode": "FFMQ39_01",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_06",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_11",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_15",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_20",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_26",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_31",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_36",
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
                  "itemCode": "FFMQ39_02",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_07",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_12",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_16",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_22",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_27",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_32",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_37",
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
                  "itemCode": "FFMQ39_05",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_08",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_13",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_18",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_23",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_28",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_34",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_38",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "nonjudge",
            "type": "dimension",
            "label": "不评判",
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
                  "itemCode": "FFMQ39_03",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_10",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_14",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_17",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_25",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_30",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_35",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_39",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "nonreact",
            "type": "dimension",
            "label": "不反应",
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
                  "itemCode": "FFMQ39_04",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_09",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_19",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_21",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_24",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_29",
                  "weight": 1
                },
                {
                  "itemCode": "FFMQ39_33",
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
          "nonjudge",
          "nonreact"
        ],
        "scoreOrder": [
          "observe",
          "describe",
          "act_aware",
          "nonjudge",
          "nonreact"
        ],
        "interpretations": [
          {
            "scoreKey": "observe",
            "headline": "观察留意",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注你会不会留意身体感觉、声音、气味这些平常容易忽略的东西。对内感受敏感不是毛病，也不是本事大；同样的留意，在放松时和紧张时的感受可能完全不同。如果发现过度留意身体让自己更不安，把注意力放回手头的事情上，也是完全合理的选择。",
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
            "summary": "这组题关注你能不能把感受和想法放进词语。找词不容易：情绪常常混在一起，也不总有一个准确的词。这部分不考表达水平，说不出的时候不必责怪自己；先用一个大致的词，再补一句身体哪里有感觉，就已经是在描述了。",
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
            "summary": "这组题关注做事时你是否知道自己在做什么。人人都会走神、都会“自动运行”；分心不等于不认真，更不能用来评判一个人的价值。发现走神的那一刻，其实就是觉察发生的时刻。",
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
            "headline": "不评判",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注你会不会急着给自己的念头和情绪贴“好/坏、该/不该”的标签。允许一个感受存在，不代表认同它带来的每个冲动；看见“我现在有这样的感受”，和决定下一步怎么做，是可以分开的。出现不喜欢的念头，不等于你这个人不好。",
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
          },
          {
            "scoreKey": "nonreact",
            "headline": "不反应",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注苦恼的念头出现时，你能不能先停一停，看着它来、看着它走，而不是马上被带走。给想法留一点空间，不是要把它们赶走，也不是假装没事；可以把念头当成暂时经过的消息：先看见，再决定要不要回应。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近哪个念头一冒出来，你就立刻跟着它行动了？"
              },
              {
                "category": "strategy",
                "text": "下次那个念头出现时，先给自己一次深呼吸的时间再决定是否回应；持续困扰时，找信任的人聊聊。"
              }
            ]
          }
        ],
        "limitations": [
          "英文自评受情境、心情与理解方式影响，只能作为回顾参考，不能代表所有情境。",
          "原版验证为美国大学生成人样本，不构成中国或任何本地人群常模。",
          "任一题缺答该维度不计算，缺答不会算零；完整作答要求是产品约定，不是原作者规则。",
          "没有常模、百分位或诊断阈值；分数不用于排名、选拔或高风险决策。",
          "原版计分表只有五个分量表、没有总分行，本条目不计算总分。",
          "与 15 题短版（含 ffmq15 中文工作稿）不互换分数或证据。"
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
            "itemCode": "FFMQ39_01",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_02",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_03",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_04",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_05",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_06",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_07",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_08",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_09",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_10",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_11",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_12",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_13",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_14",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_15",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_16",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_17",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_18",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_19",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_20",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_21",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_22",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_23",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_24",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_25",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_26",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_27",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_28",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_29",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_30",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_31",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_32",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_33",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_34",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_35",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_36",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_37",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_38",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_39",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "observe": 8,
            "describe": 20,
            "act_aware": 40,
            "nonjudge": 40,
            "nonreact": 7
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge",
            "nonreact"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "FFMQ39_01",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_02",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_03",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_04",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_05",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_06",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_07",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_08",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_09",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_10",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_11",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_12",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_13",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_14",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_15",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_16",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_17",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_18",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_19",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_20",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_21",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_22",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_23",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_24",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_25",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_26",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_27",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_28",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_29",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_30",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_31",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_32",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_33",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_34",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_35",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_36",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_37",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_38",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_39",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "observe": 40,
            "describe": 28,
            "act_aware": 8,
            "nonjudge": 8,
            "nonreact": 35
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge",
            "nonreact"
          ]
        }
      },
      {
        "name": "mixed-middle-with-reverse",
        "answers": [
          {
            "itemCode": "FFMQ39_01",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_02",
            "responseValue": "2"
          },
          {
            "itemCode": "FFMQ39_03",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_04",
            "responseValue": "4"
          },
          {
            "itemCode": "FFMQ39_05",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_06",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_07",
            "responseValue": "2"
          },
          {
            "itemCode": "FFMQ39_08",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_09",
            "responseValue": "4"
          },
          {
            "itemCode": "FFMQ39_10",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_11",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_12",
            "responseValue": "2"
          },
          {
            "itemCode": "FFMQ39_13",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_14",
            "responseValue": "4"
          },
          {
            "itemCode": "FFMQ39_15",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_16",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_17",
            "responseValue": "2"
          },
          {
            "itemCode": "FFMQ39_18",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_19",
            "responseValue": "4"
          },
          {
            "itemCode": "FFMQ39_20",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_21",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_22",
            "responseValue": "2"
          },
          {
            "itemCode": "FFMQ39_23",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_24",
            "responseValue": "4"
          },
          {
            "itemCode": "FFMQ39_25",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_26",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_27",
            "responseValue": "2"
          },
          {
            "itemCode": "FFMQ39_28",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_29",
            "responseValue": "4"
          },
          {
            "itemCode": "FFMQ39_30",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_31",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_32",
            "responseValue": "2"
          },
          {
            "itemCode": "FFMQ39_33",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_34",
            "responseValue": "4"
          },
          {
            "itemCode": "FFMQ39_35",
            "responseValue": "5"
          },
          {
            "itemCode": "FFMQ39_36",
            "responseValue": "1"
          },
          {
            "itemCode": "FFMQ39_37",
            "responseValue": "2"
          },
          {
            "itemCode": "FFMQ39_38",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_39",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "observe": 16,
            "describe": 23,
            "act_aware": 21,
            "nonjudge": 15,
            "nonreact": 24
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge",
            "nonreact"
          ]
        }
      },
      {
        "name": "missing-observe-item20",
        "answers": [
          {
            "itemCode": "FFMQ39_01",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_02",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_03",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_04",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_05",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_06",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_07",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_08",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_09",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_10",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_11",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_12",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_13",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_14",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_15",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_16",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_17",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_18",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_19",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_21",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_22",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_23",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_24",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_25",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_26",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_27",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_28",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_29",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_30",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_31",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_32",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_33",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_34",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_35",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_36",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_37",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_38",
            "responseValue": "3"
          },
          {
            "itemCode": "FFMQ39_39",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "observe": null,
            "describe": 24,
            "act_aware": 24,
            "nonjudge": 24,
            "nonreact": 21
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge",
            "nonreact"
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
            "nonjudge": null,
            "nonreact": null
          },
          "totalScoreKeys": [
            "observe",
            "describe",
            "act_aware",
            "nonjudge",
            "nonreact"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
