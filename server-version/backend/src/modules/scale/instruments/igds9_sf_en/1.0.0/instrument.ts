// IGDS9-SF native DRAFT: verbatim nine items and official instruction from the
// author-deposited accepted manuscript (Birkbeck eprints 43473) of
// Pontes & Griffiths (2015). Formal redistribution terms not archived;
// license recorded as unknown following the ERQ-CA/ERICA-16 convention.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "igds9_sf_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Internet Gaming Disorder Scale — Short Form",
      "abbreviation": "IGDS9-SF",
      "instrumentFamily": "Internet Gaming Disorder Scale"
    },
    "construct": {
      "primaryDomain": "BEHAVIORAL_DIFFICULTIES",
      "secondaryDomains": [
        "SELF_REGULATION"
      ],
      "constructDefinition": "对游戏活动的失调性控制：按 DSM-5 IGD 九条标准（沉溺、戒断、耐受、失控、失趣、明知故犯、欺瞒、逃避心境、失机）考察游戏行为对功能的损害。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:screen_use",
        "gaming",
        "internet_gaming_disorder",
        "behavioral_addiction",
        "license:author_distribution_terms_unarchived",
        "population:k12",
        "population:adolescent_validation_available",
        "response:student_self",
        "use:screening",
        "use:research",
        "language_validation:english_original"
      ]
    },
    "population": {
      "minAge": 12,
      "maxAge": 25,
      "populationNotes": "原始验证为成人游戏玩家样本（N=1,060，两批各 532/528）；青少年样本心理测量评估见 Schivinski et al. (2018, Addictive Behaviors Reports, 开放获取)。K-12 使用的年龄带按青少年验证证据记录，暂不声称更低年龄。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 9,
      "estimatedMinutes": 3,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "过去 12 个月（官方指导语指定）",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "官方 5 点频率计分（1=Never … 5=Very Often），总分 9–45；不得改为是/否作答。",
        "原工具面向『游戏行为』整体（电脑/主机/手机/平板，在线或离线），不区分具体游戏平台。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "SCREENING",
          "evidenceStatus": "SUPPORTED",
          "notes": "作者定位为 IGD 严重度评估工具；无作者建议切分点归档，报告不设界值。"
        },
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "非学术反馈为产品设计，不解释为游戏障碍等级或诊断。"
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
        "evidenceId": "igds9sf-pontes-2015",
        "evidenceType": "INTERNAL_CONSISTENCY",
        "population": "成人游戏玩家（两批社区样本）",
        "locale": "en",
        "territory": "GB",
        "sampleSize": 1060,
        "studyDesign": "Scale development with EFA (Sample 1, n=532) and CFA (Sample 2, n=528); overall alpha .87 (Sample 1 .88, Sample 2 .87); criterion validity with IGD-20 Test (r=.816) and weekly gameplay (r=.319); SEM 2.45",
        "rating": "SUFFICIENT",
        "citation": "Pontes HM, Griffiths MD. (2015). Measuring DSM-5 internet gaming disorder: Development and validation of a short psychometric scale. Computers in Human Behavior, 45, 137–143.",
        "doi": "10.1016/j.chb.2014.12.006",
        "url": "https://eprints.birkbeck.ac.uk/id/eprint/43473/",
        "notes": "题文与官方指导语取自 Birkbeck 机构库作者自存档接受稿（本环境可直接获取）；发表版与接受稿措辞差异须在集成时以出版版交叉核对。原文被引约 1,600。",
      },
      {
        "evidenceId": "igds9sf-schivinski-2018",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "青少年",
        "locale": "en",
        "territory": "PL",
        "studyDesign": "Psychometric assessment of the nine IGD criteria with the IGDS9-SF in an adolescent sample (open access, CC BY)",
        "rating": "SUFFICIENT",
        "citation": "Schivinski B, Pontes HM, Griffiths MD. (2018). Psychometric assessment of the Internet Gaming Disorder criteria: An exploratory study with adolescents. Addictive Behaviors Reports, 8, 176–184.",
        "doi": "10.1016/j.abrep.2018.06.001",
        "notes": "青少年样本证据支持 K-12 适用性；CC BY 开放获取。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "igds9-sf-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "igds9-sf-v1",
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
    "text": "These questions will ask you about your gaming activity during the past year (i.e., last 12 months). By gaming activity we understand any gaming-related activity that has been played either from a computer/laptop or from a gaming console or any other kind of device (e.g., mobile phone, tablet, etc.) both online and/or offline.",
    "language": "en",
    "version": "1.0.0",
    "source": "Pontes & Griffiths (2015) 官方指导语，逐字（作者自存档接受稿 Table 3 注 a）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Internet Gaming Disorder Scale — Short Form (IGDS9-SF)",
        "citation": "Pontes HM, Griffiths MD. (2015). Computers in Human Behavior, 45, 137–143; items verbatim from author-deposited accepted manuscript (Birkbeck eprints 43473).",
        "url": "https://eprints.birkbeck.ac.uk/id/eprint/43473/",
        "publicationYear": 2015
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文取自作者自存档接受稿；作者长期向研究者提供 IGDS9-SF（多语言版本流通），但正式再分发条款未归档确认。作者提供不应被当成禁止使用，也不应被当成不限用途授权；正式发布或商业使用前须向作者确认。发表版（CHB 2015）与接受稿的措辞差异集成时交叉核对。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "igds9sf_frequency_1_5",
          "options": [
            { "value": "1", "label": "Never", "score": 1 },
            { "value": "2", "label": "Rarely", "score": 2 },
            { "value": "3", "label": "Sometimes", "score": 3 },
            { "value": "4", "label": "Often", "score": 4 },
            { "value": "5", "label": "Very Often", "score": 5 }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "IGDS9-01",
          "content": "Do you feel preoccupied with your gaming behaviour? (Some examples: Do you think about previous gaming activity or anticipate the next gaming session? Do you think gaming has become the dominant activity in your daily life?)",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "igds9sf_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "IGDS9-02",
          "content": "Do you feel more irritability, anxiety or even sadness when you try to either reduce or stop your gaming activity?",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "igds9sf_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "IGDS9-03",
          "content": "Do you feel the need to spend increasing amount of time engaged gaming in order to achieve satisfaction or pleasure?",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "igds9sf_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "IGDS9-04",
          "content": "Do you systematically fail when trying to control or cease your gaming activity?",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "igds9sf_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "IGDS9-05",
          "content": "Have you lost interests in previous hobbies and other entertainment activities as a result of your engagement with the game?",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "igds9sf_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "IGDS9-06",
          "content": "Have you continued your gaming activity despite knowing it was causing problems between you and other people?",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "igds9sf_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "IGDS9-07",
          "content": "Have you deceived any of your family members, therapists or others because the amount of your gaming activity?",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "igds9sf_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "IGDS9-08",
          "content": "Do you play in order to temporarily escape or relieve a negative mood (e.g., helplessness, guilt, anxiety)?",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "igds9sf_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "IGDS9-09",
          "content": "Have you jeopardised or lost an important relationship, job or an educational or career opportunity because of your gaming activity?",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "igds9sf_frequency_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          { "itemCode": "IGDS9-01", "transform": { "type": "identity" } },
          { "itemCode": "IGDS9-02", "transform": { "type": "identity" } },
          { "itemCode": "IGDS9-03", "transform": { "type": "identity" } },
          { "itemCode": "IGDS9-04", "transform": { "type": "identity" } },
          { "itemCode": "IGDS9-05", "transform": { "type": "identity" } },
          { "itemCode": "IGDS9-06", "transform": { "type": "identity" } },
          { "itemCode": "IGDS9-07", "transform": { "type": "identity" } },
          { "itemCode": "IGDS9-08", "transform": { "type": "identity" } },
          { "itemCode": "IGDS9-09", "transform": { "type": "identity" } }
        ],
        "defaultMissingPolicy": {
          "type": "complete_required"
        },
        "scores": [
          {
            "key": "igd_disordered_gaming",
            "type": "total",
            "label": "游戏失调",
            "description": "官方计分：9 题回答的总和（9–45），无反向题；总分对应 DSM-5 IGD 九条标准的频率自评。作者未归档建议切分点，报告不设界值、不做诊断。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                { "itemCode": "IGDS9-01", "weight": 1 },
                { "itemCode": "IGDS9-02", "weight": 1 },
                { "itemCode": "IGDS9-03", "weight": 1 },
                { "itemCode": "IGDS9-04", "weight": 1 },
                { "itemCode": "IGDS9-05", "weight": 1 },
                { "itemCode": "IGDS9-06", "weight": 1 },
                { "itemCode": "IGDS9-07", "weight": 1 },
                { "itemCode": "IGDS9-08", "weight": 1 },
                { "itemCode": "IGDS9-09", "weight": 1 }
              ],
              "aggregation": "sum"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "igd_disordered_gaming"
        ],
        "scoreOrder": [
          "igd_disordered_gaming"
        ],
        "interpretations": [
          {
            "scoreKey": "igd_disordered_gaming",
            "headline": "游戏占了生活的多少位置",
            "source": {
              "type": "score_only"
            },
            "summary": "这 9 题问的是：过去一年里，游戏有没有让你失控或影响生活——比如满脑子都是游戏、停不下来、为游戏和家里人闹矛盾、或者用它躲开坏心情。分数是 9 题的总和（9–45），越高表示游戏对生活的影响越大。它描述的是现状，不是给你下结论。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "过去一年里，游戏有没有帮你躲过一些不想面对的事？如果有，那件事现在怎么样了？"
              },
              {
                "category": "strategy",
                "text": "给游戏定个『场次』：先决定玩多久再开始，用闹钟提醒；把它排在学习和其他活动之后而不是之前。"
              },
              {
                "category": "support",
                "text": "如果发现自己停不下来、或游戏已经明显影响了学习睡眠和人际关系，和学校心理老师或信任的成年人聊聊是有效的第一步。"
              }
            ]
          }
        ],
        "limitations": [
          "这是自评的游戏失调筛查，反映一次作答，不构成『游戏障碍』的诊断；DSM-5 IGD 为临床标准，诊断须由专业人员结合多源信息作出。",
          "原始验证为成人玩家样本，青少年证据见 Schivinski et al. (2018)；未建立中文常模，报告不设界值。",
          "题目覆盖所有游戏平台（电脑/主机/手机/平板，在线或离线），分数不区分具体平台。",
          "没有适用于你的诊断阈值；本报告不用于诊断或高风险决策。"
        ],
        "disclaimer": "这份报告用于认识游戏行为对生活的影响和反思，不用于诊断、排名或高风险决策。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "minimum-keyed",
        "answers": [
          { "itemCode": "IGDS9-01", "responseValue": "1" },
          { "itemCode": "IGDS9-02", "responseValue": "1" },
          { "itemCode": "IGDS9-03", "responseValue": "1" },
          { "itemCode": "IGDS9-04", "responseValue": "1" },
          { "itemCode": "IGDS9-05", "responseValue": "1" },
          { "itemCode": "IGDS9-06", "responseValue": "1" },
          { "itemCode": "IGDS9-07", "responseValue": "1" },
          { "itemCode": "IGDS9-08", "responseValue": "1" },
          { "itemCode": "IGDS9-09", "responseValue": "1" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": { "igd_disordered_gaming": 9 },
          "totalScoreKeys": ["igd_disordered_gaming"]
        }
      },
      {
        "name": "maximum-keyed",
        "answers": [
          { "itemCode": "IGDS9-01", "responseValue": "5" },
          { "itemCode": "IGDS9-02", "responseValue": "5" },
          { "itemCode": "IGDS9-03", "responseValue": "5" },
          { "itemCode": "IGDS9-04", "responseValue": "5" },
          { "itemCode": "IGDS9-05", "responseValue": "5" },
          { "itemCode": "IGDS9-06", "responseValue": "5" },
          { "itemCode": "IGDS9-07", "responseValue": "5" },
          { "itemCode": "IGDS9-08", "responseValue": "5" },
          { "itemCode": "IGDS9-09", "responseValue": "5" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": { "igd_disordered_gaming": 45 },
          "totalScoreKeys": ["igd_disordered_gaming"]
        }
      },
      {
        "name": "sample-mixed",
        "answers": [
          { "itemCode": "IGDS9-01", "responseValue": "4" },
          { "itemCode": "IGDS9-02", "responseValue": "3" },
          { "itemCode": "IGDS9-03", "responseValue": "4" },
          { "itemCode": "IGDS9-04", "responseValue": "2" },
          { "itemCode": "IGDS9-05", "responseValue": "2" },
          { "itemCode": "IGDS9-06", "responseValue": "3" },
          { "itemCode": "IGDS9-07", "responseValue": "1" },
          { "itemCode": "IGDS9-08", "responseValue": "4" },
          { "itemCode": "IGDS9-09", "responseValue": "2" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": { "igd_disordered_gaming": 25 },
          "totalScoreKeys": ["igd_disordered_gaming"]
        }
      },
      {
        "name": "missing-item",
        "answers": [
          { "itemCode": "IGDS9-01", "responseValue": "4" },
          { "itemCode": "IGDS9-02", "responseValue": "3" },
          { "itemCode": "IGDS9-03", "responseValue": "4" },
          { "itemCode": "IGDS9-04", "responseValue": "2" },
          { "itemCode": "IGDS9-05", "responseValue": "2" },
          { "itemCode": "IGDS9-06", "responseValue": "3" },
          { "itemCode": "IGDS9-07", "responseValue": "1" },
          { "itemCode": "IGDS9-08", "responseValue": "4" }
        ],
        "expected": {
          "quality": "invalid",
          "scores": { "igd_disordered_gaming": null },
          "totalScoreKeys": ["igd_disordered_gaming"]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
