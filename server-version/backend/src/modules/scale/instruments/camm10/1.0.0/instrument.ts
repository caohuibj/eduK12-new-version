import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text and official scoring instructions transcribed verbatim from the CAMM PDF hosted on
// the author's academic page (Ruth A. Baer, https://www.ruthbaer.com/academics/).
// Original scale: Greco, L. A., Baer, R. A., & Smith, G. T. (2011), Psychological Assessment, 23(3), 606-614;
// the PDF prints this citation (without issue number and middle initial of the first author) on its scoring page.
// The hosting page carries no explicit redistribution license statement.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "camm10",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Child and Adolescent Mindfulness Measure, 10-item version",
      "abbreviation": "CAMM-10",
      "instrumentFamily": "Child and Adolescent Mindfulness Measure"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "儿童青少年自报的当下觉察，以及对想法与感受的不评判、不回避倾向（单维总分，0–40）；不是正念能力考试、症状筛查或干预疗效判定。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "camm10",
        "domain:mindfulness",
        "domain:self_regulation",
        "construct:mindfulness_camm10_total",
        "construct:mindfulness_camm10_single_dimension",
        "orientation:mindfulness_processes",
        "population:child_adolescent",
        "population:k12",
        "population:self_report",
        "response:10_items",
        "response:ten_reverse_items",
        "response:four_point_frequency_0_4",
        "use:research",
        "use:individual_reflection",
        "use:not_diagnostic",
        "use:not_high_stakes_selection",
        "use:not_school_ranking",
        "use:no_validated_cutoff",
        "license:author_hosted_pdf",
        "license:redistribution_review_pending",
        "language_validation:original_en",
        "adolescent_self_report",
        "儿童青少年自评",
        "正念觉察",
        "个人反思",
        "非诊断"
      ]
    },
    "population": {
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL",
      "populationNotes": "原版验证为美国社区学校儿童青少年样本（Greco, Baer, & Smith, 2011）；PDF 与作者页面均未印年龄下限或适用年龄段说明（'9 岁以上'等说法不见于本 PDF，本条目不据此设门槛），成人样本使用亦见诸已发表文献，本条目按儿童青少年自评工具登记，catalog 层不设硬性年龄门槛，接入时按产品人群策略另行约束。英文原版无中文人群验证，不将任何中文修订版或其他语言版本的证据套用于此，也不与 KIMS/FFMQ 家族条目互换分数或证据。"
    },
    "administration": {
      "itemCount": 10,
      "estimatedMinutes": 5,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "PAPER"
      ],
      "timeFrame": "一般情形的自我描述（'how often each sentence is true for you'），无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "题干与选项逐字取自作者官方 PDF（https://www.ruthbaer.com/academics/ 托管），保留原文弯撇号（U+2019）；选项表头第 3 列原文即印为 “Some-times True”（Sometimes 的排版断词连字符），照录不做修复。",
        "官方计分说明为单维：全部 10 题按 “First reverse all scores by changing 0 to 4, 1 to 3, 3 to 1, and 4 to 0 (2 stays unchanged)” 反向（等价于 4−原分）后求和，“Higher scores correspond to higher levels of mindfulness”，总分范围 0–40；本条目以单维度 mindful_awareness 承载该总分，不另设独立 total，也不发明子维度。",
        "PDF 中第 2、5、6 题的选项行在 plain 提取中断为两行（“0 1 2 3” 与 “4” 分行），layout 模式确认每题均与其它题相同、有完整五档 0–4；第 8、9 题题干跨行，拼接处仅还原为单个空格。",
        "任一题缺答总分不计算（null），不把缺答当零分；complete_required 是产品保守约定，不是原作者规则。",
        "PDF 未印年龄下限或适用年龄段说明；预计时长为产品估计，不是原作者实测。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版英文在美国社区学校儿童青少年样本中开发并验证单维结构。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "用于儿童青少年及其支持者回顾个人体验与可行小行动，不贴能力、人格或疾病标签，结果不定义孩子好坏。"
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
        "evidenceId": "greco-2011-camm",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US community school-based samples of children and adolescents (original CAMM development studies; per-sample Ns and grade ranges are not printed in the author PDF)",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development and validation of the unidimensional 10-item CAMM for children and adolescents; official scoring reverses all items (4 minus raw response) and sums to a 0-40 total where higher scores correspond to higher levels of mindfulness.",
        "rating": "SUFFICIENT",
        "citation": "Greco, L. A., Baer, R. A., & Smith, G. T. (2011). Assessing mindfulness in children and adolescents: Development and validation of the Child and Adolescent Mindfulness Measure (CAMM). Psychological Assessment, 23(3), 606–614. https://doi.org/10.1037/a0022877",
        "doi": "10.1037/a0022877",
        "url": "https://doi.org/10.1037/a0022877",
        "notes": "该证据对应英文儿童青少年样本，不构成本地常模，也不支持任何界值或百分位。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "camm10-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "camm10-en-v1",
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
        "title": "Child and Adolescent Mindfulness Measure (CAMM), original 10-item version",
        "citation": "Greco, L. A., Baer, R. A., & Smith, G. T. (2011). Assessing mindfulness in children and adolescents: Development and validation of the Child and Adolescent Mindfulness Measure (CAMM). Psychological Assessment, 23(3), 606–614. https://doi.org/10.1037/a0022877",
        "url": "https://www.ruthbaer.com/academics/",
        "publicationYear": 2011
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文与官方计分说明引自作者 Ruth Baer 学术页（https://www.ruthbaer.com/academics/）公开托管的原版 PDF（题本署名 Child and Adolescent Mindfulness Measure (CAMM)）；该页面未附明确再分发许可声明，本条目仅记录公开托管事实，不声称获得商业、翻译或再分发授权。PDF 第 2 页印有引文：Greco, L., Baer, R. A., & Smith, G. T. (2011). Assessing mindfulness in children and adolescents: Development and validation of the child and adolescent mindfulness measure (CAMM). Psychological Assessment, 23, 606-614（原文无期号、第一作者无中间名缩写；标准出版记录登记为 23(3), 606–614，DOI: 10.1037/a0022877，PDF 本身未印 DOI）。工作副本 SHA-256：27fd12ca3f3100ee1cee05251fbf20a8c0f3a50373d2b8f817cd2b76fe1c0b85；全文提取与逐字核对见 docs/mindfulness-content-20261028/camm10/source.md 及 _prdata/pdfs/camm10_extract.txt。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "camm10_0_4",
          "options": [
            {
              "value": "0",
              "label": "Never True",
              "score": 0
            },
            {
              "value": "1",
              "label": "Rarely True",
              "score": 1
            },
            {
              "value": "2",
              "label": "Some-times True",
              "score": 2
            },
            {
              "value": "3",
              "label": "Often True",
              "score": 3
            },
            {
              "value": "4",
              "label": "Always True",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "CAMM10_01",
          "content": "I get upset with myself for having feelings that don’t make sense.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "camm10_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMM10_02",
          "content": "At school, I walk from class to class without noticing what I’m doing.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "camm10_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMM10_03",
          "content": "I keep myself busy so I don’t notice my thoughts or feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "camm10_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMM10_04",
          "content": "I tell myself that I shouldn’t feel the way I’m feeling.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "camm10_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMM10_05",
          "content": "I push away thoughts that I don’t like.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "camm10_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMM10_06",
          "content": "It’s hard for me to pay attention to only one thing at a time.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "camm10_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMM10_07",
          "content": "I get upset with myself for having certain thoughts.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "camm10_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMM10_08",
          "content": "I think about things that have happened in the past instead of thinking about things that are happening right now.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "camm10_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMM10_09",
          "content": "I think that some of my feelings are bad and that I shouldn’t have them.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "camm10_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "CAMM10_10",
          "content": "I stop myself from having feelings that I don’t like.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "camm10_0_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "CAMM10_01",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMM10_02",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMM10_03",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMM10_04",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMM10_05",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMM10_06",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMM10_07",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMM10_08",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMM10_09",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CAMM10_10",
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
            "key": "mindful_awareness",
            "type": "dimension",
            "label": "正念觉察（单维总分）",
            "description": "全部 10 题按官方规则（4−原分，0↔4、1↔3、2 不变）反向后等权求和，范围 0–40，分数更高表示自报的当下觉察与不评判、不回避倾向更多；任一题缺答不计算。",
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
                  "itemCode": "CAMM10_01",
                  "weight": 1
                },
                {
                  "itemCode": "CAMM10_02",
                  "weight": 1
                },
                {
                  "itemCode": "CAMM10_03",
                  "weight": 1
                },
                {
                  "itemCode": "CAMM10_04",
                  "weight": 1
                },
                {
                  "itemCode": "CAMM10_05",
                  "weight": 1
                },
                {
                  "itemCode": "CAMM10_06",
                  "weight": 1
                },
                {
                  "itemCode": "CAMM10_07",
                  "weight": 1
                },
                {
                  "itemCode": "CAMM10_08",
                  "weight": 1
                },
                {
                  "itemCode": "CAMM10_09",
                  "weight": 1
                },
                {
                  "itemCode": "CAMM10_10",
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
          "mindful_awareness"
        ],
        "scoreOrder": [
          "mindful_awareness"
        ],
        "interpretations": [
          {
            "scoreKey": "mindful_awareness",
            "headline": "正念觉察（单维总分）",
            "source": {
              "type": "score_only"
            },
            "summary": "这份问卷的 10 道题，问的是你会不会留意此刻正在做的事，会不会急着责怪自己的想法和感受，或者把不喜欢的感受推开。按官方规则，全部题目先反向再相加，得到 0–40 的一个总分；分数更高，表示这份自报描述里出现更多“留意当下、不急着推开感受”的情形。人人都会走神、都会有不想要的念头，这再正常不过；分数高一点低一点，都不说明一个孩子“好”或“不好”。发现自己在走神或自责的那一刻，其实已经是觉察发生的时刻。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "今天有没有一个瞬间，你本来在忙别的，后来注意到自己当时的心情？那是什么感觉？"
              },
              {
                "category": "strategy",
                "text": "挑一件每天都会做的小事（走路、喝水、收拾书包），试一次只留意它这一步；发现走神了，不用批评自己，温和地回来就好。"
              }
            ]
          }
        ],
        "limitations": [
          "这是儿童青少年自评工具：结果整理的是作答者此刻对自身体验的描述，不定义孩子好坏，不能用于人格、能力或道德评价。",
          "英文自评受情境、心情与理解方式影响，只能作为回顾参考，不能代表所有情境；年龄更小或更大的个体使用时需另行评估适切性。",
          "原版验证为美国社区学校儿童青少年样本（Greco et al., 2011），不构成中国或任何本地人群常模。",
          "任一题缺答总分不计算，缺答不会算零；完整作答要求是产品约定，不是原作者规则。",
          "没有常模、百分位或诊断阈值；分数不用于排名、选拔或高风险决策。",
          "与同家族 KIMS（kims39）、FFMQ（ffmq39/ffmq15）条目的题本、结构与证据互不通用，分数不互换比较。"
        ],
        "disclaimer": "供儿童青少年及其支持者回顾个人体验与日常习惯，不是考试，也不能用于诊断、人格评判、排名或高风险决策；结果不定义孩子好坏。题本为英文原版。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-raw-zero-is-total-max",
        "answers": [
          {
            "itemCode": "CAMM10_01",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_02",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_03",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_04",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_05",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_06",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_07",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_08",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_09",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_10",
            "responseValue": "0"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "mindful_awareness": 40
          },
          "totalScoreKeys": [
            "mindful_awareness"
          ]
        }
      },
      {
        "name": "all-raw-four-is-total-min",
        "answers": [
          {
            "itemCode": "CAMM10_01",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_02",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_03",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_04",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_05",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_06",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_07",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_08",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_09",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_10",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "mindful_awareness": 0
          },
          "totalScoreKeys": [
            "mindful_awareness"
          ]
        }
      },
      {
        "name": "all-raw-midpoint",
        "answers": [
          {
            "itemCode": "CAMM10_01",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_02",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_03",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_04",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_05",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_06",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_07",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_08",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_09",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_10",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "mindful_awareness": 20
          },
          "totalScoreKeys": [
            "mindful_awareness"
          ]
        }
      },
      {
        "name": "mixed-raw",
        "answers": [
          {
            "itemCode": "CAMM10_01",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_02",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_03",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_04",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_05",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_06",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_07",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_08",
            "responseValue": "4"
          },
          {
            "itemCode": "CAMM10_09",
            "responseValue": "0"
          },
          {
            "itemCode": "CAMM10_10",
            "responseValue": "0"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "mindful_awareness": 24
          },
          "totalScoreKeys": [
            "mindful_awareness"
          ]
        }
      },
      {
        "name": "missing-item07",
        "answers": [
          {
            "itemCode": "CAMM10_01",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_02",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_03",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_04",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_05",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_06",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_08",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_09",
            "responseValue": "2"
          },
          {
            "itemCode": "CAMM10_10",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "mindful_awareness": null
          },
          "totalScoreKeys": [
            "mindful_awareness"
          ]
        }
      },
      {
        "name": "all-missing",
        "answers": [],
        "expected": {
          "quality": "invalid",
          "scores": {
            "mindful_awareness": null
          },
          "totalScoreKeys": [
            "mindful_awareness"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
