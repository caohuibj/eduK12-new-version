import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text, instructions, anchors and the official scoring key transcribed verbatim from the
// Appendix (administered form) of the original TMS paper, hosted as a full-text copy by the
// Rotman-Baycrest institutional repository
// (https://www.rotman-baycrest.on.ca/files/publicationmodule/@random45f5724eba2f8/pid3280.pdf).
// Original scale: Lau, M. A., Bishop, S. R., Segal, Z. V., Buis, T., Anderson, N. D., Carlson, L.,
// Shapiro, S., & Carmody, J. (2006). The Toronto Mindfulness Scale: Development and validation.
// Journal of Clinical Psychology, 62(12), 1445-1467; the paper prints this citation on its footer.
// The journal version is paywalled; the repository copy carries no redistribution license statement.
// Official scoring key: all items positively keyed (no reverse scoring); Curiosity = items 3, 5, 6,
// 10, 12, 13; Decentering = items 1, 2, 4, 7, 8, 9, 11; subscales are not combined into a total.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "tms13",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Toronto Mindfulness Scale, 13-item state version",
      "abbreviation": "TMS-13",
      "instrumentFamily": "Toronto Mindfulness Scale"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "刚结束的一次冥想/练习中的即时状态正念：对当下体验的好奇（Curiosity，0–24）与抽离地觉察（Decentering，0–28）两维分别求和，不合成总分；状态测量，不是特质正念，也不是正念能力考试、症状筛查或干预疗效判定。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "tms13",
        "domain:mindfulness",
        "domain:self_regulation",
        "construct:mindfulness_tms13_curiosity",
        "construct:mindfulness_tms13_decentering",
        "orientation:mindfulness_processes",
        "orientation:state_mindfulness",
        "population:adult_18_plus",
        "population:self_report",
        "response:13_items",
        "response:no_reverse_items",
        "response:four_point_intensity_0_4",
        "use:research",
        "use:individual_reflection",
        "use:not_diagnostic",
        "use:not_high_stakes_selection",
        "use:not_school_ranking",
        "use:no_validated_cutoff",
        "license:institutional_repository_copy",
        "license:redistribution_review_pending",
        "language_validation:original_en",
        "成人自评",
        "状态正念",
        "个人反思",
        "非诊断"
      ]
    },
    "population": {
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL",
      "populationNotes": "原版开发与验证基于北美成人样本（含无冥想经验与不同经验水平者，Lau et al., 2006）；本条目按 18 岁以上成人自评登记（18 岁下限为产品边界），施测前提是刚刚完成一段冥想或类似练习。英文原版无中文人群验证，不将任何中文修订版或其他语言版本的证据套用于此；TMS-T 特质版（Davis et al., 2009 等）为另一题本，不据此登记。"
    },
    "administration": {
      "itemCount": 13,
      "estimatedMinutes": 4,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "PAPER"
      ],
      "timeFrame": "刚刚结束的一次冥想/练习（“what you just experienced, just now”）",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "题干、指导语、锚点与官方计分键逐字取自论文 Appendix（正式 administered 版）；编号 1–13 为附录官方编号。",
        "正文 Table 1（EFA）按题池原始题号 06–42 呈现；池号→正式编号映射：36→1、33→2、32→3、35→4、26→5、06→6、37→7、34→8、42→9、39→10、40→11、17→12、41→13。题池 29、20 在 CFA 中被剔除，不在 13 题内。",
        "第 11 题正文 Table 1 印作 “without over-identifying them”，附录正式表印作 “without overidentifying with them”；以正式 administered 版为准，差异如实记录。",
        "官方计分键：“All items were written in the positively keyed direction, so no reverse scoring of items is required.”Curiosity 求和题 3,5,6,10,12,13（0–24）；Decentering 求和题 1,2,4,7,8,9,11（0–28）；论文未给出总分合成规则，两维不合成总分。",
        "任一题缺答该维度不计算（null），不把缺答当零分；complete_required 是产品保守约定，不是原作者规则。",
        "期刊论文为付费墙内容，本副本为机构仓库公开托管；预计时长为产品估计，不是原作者实测。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版英文在北美成人样本中开发并验证两因子结构。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "用于练习后回顾当次体验与可行小行动；状态有起伏，不贴能力标签，不用于给未练习者解释基线。"
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
        "evidenceId": "lau-2006-tms",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "North American adult samples (Study 1 n=390: meditation-naive and experienced meditators; per-sample details in the original article)",
        "locale": "en",
        "territory": "US/CA",
        "studyDesign": "Scale development and validation of the 13-item two-factor TMS (Curiosity, Decentering); official scoring sums each subscale (0-24, 0-28) with no reverse scoring; the paper does not define a total-score composition.",
        "rating": "SUFFICIENT",
        "citation": "Lau, M. A., Bishop, S. R., Segal, Z. V., Buis, T., Anderson, N. D., Carlson, L., Shapiro, S., & Carmody, J. (2006). The Toronto Mindfulness Scale: Development and validation. Journal of Clinical Psychology, 62(12), 1445–1467. https://doi.org/10.1002/jclp.20326",
        "doi": "10.1002/jclp.20326",
        "url": "https://doi.org/10.1002/jclp.20326",
        "notes": "该证据对应英文成人样本，不构成本地常模，也不支持任何界值或百分位。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "tms13-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "tms13-en-v1",
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
        "title": "Toronto Mindfulness Scale (TMS), 13-item state version (Appendix administered form)",
        "citation": "Lau, M. A., Bishop, S. R., Segal, Z. V., Buis, T., Anderson, N. D., Carlson, L., Shapiro, S., & Carmody, J. (2006). The Toronto Mindfulness Scale: Development and validation. Journal of Clinical Psychology, 62(12), 1445–1467. https://doi.org/10.1002/jclp.20326",
        "url": "https://www.rotman-baycrest.on.ca/files/publicationmodule/@random45f5724eba2f8/pid3280.pdf",
        "publicationYear": 2006
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文、指导语、锚点与官方计分键引自原始论文 Appendix（正式 administered 版）；论文全文为 Wiley 付费墙内容，本条目使用 Rotman-Baycrest 机构仓库公开托管的论文副本，未附明确再分发许可声明，仅记录公开托管事实，不声称获得商业、翻译或再分发授权。工作副本 SHA-256：871ed6c1706caddb1965b03b5bfdd4577fa589dee31fad94930d7831997de154；全文提取与逐字核对见 docs/mindfulness-content-20261028/tms13/source.md 及 _prdata/pdfs/tms_lau2006_extract.txt。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "tms13_0_4",
          "options": [
            {
              "value": "0",
              "label": "Not at all",
              "score": 0
            },
            {
              "value": "1",
              "label": "A little",
              "score": 1
            },
            {
              "value": "2",
              "label": "Moderately",
              "score": 2
            },
            {
              "value": "3",
              "label": "Quite a bit",
              "score": 3
            },
            {
              "value": "4",
              "label": "Very much",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "TMS13_01",
          "content": "I experienced myself as separate from my changing thoughts and feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_02",
          "content": "I was more concerned with being open to my experiences than controlling or changing them.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_03",
          "content": "I was curious about what I might learn about myself by taking notice of how I react to certain thoughts, feelings or sensations.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_04",
          "content": "I experienced my thoughts more as events in my mind than as a necessarily accurate reflection of the way things ‘really’ are.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_05",
          "content": "I was curious to see what my mind was up to from moment to moment.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_06",
          "content": "I was curious about each of the thoughts and feelings that I was having.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_07",
          "content": "I was receptive to observing unpleasant thoughts and feelings without interfering with them.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_08",
          "content": "I was more invested in just watching my experiences as they arose, than in figuring out what they could mean.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_09",
          "content": "I approached each experience by trying to accept it, no matter whether it was pleasant or unpleasant.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_10",
          "content": "I remained curious about the nature of each experience as it arose.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_11",
          "content": "I was aware of my thoughts and feelings without overidentifying with them.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_12",
          "content": "I was curious about my reactions to things.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TMS13_13",
          "content": "I was curious about what I might learn about myself by just taking notice of what my attention gets drawn to.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "tms13_0_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          { "itemCode": "TMS13_01", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_02", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_03", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_04", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_05", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_06", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_07", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_08", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_09", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_10", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_11", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_12", "transform": { "type": "identity" } },
          { "itemCode": "TMS13_13", "transform": { "type": "identity" } }
        ],
        "defaultMissingPolicy": {
          "type": "complete_required"
        },
        "scores": [
          {
            "key": "curiosity",
            "type": "dimension",
            "label": "Curiosity（好奇，0–24）",
            "description": "官方计分键：题 3、5、6、10、12、13 直接求和（全部题目正向，无反向），范围 0–24；分数更高表示刚才的练习中对自身体验的自报好奇更多；任一题缺答不计算。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                { "itemCode": "TMS13_03", "weight": 1 },
                { "itemCode": "TMS13_05", "weight": 1 },
                { "itemCode": "TMS13_06", "weight": 1 },
                { "itemCode": "TMS13_10", "weight": 1 },
                { "itemCode": "TMS13_12", "weight": 1 },
                { "itemCode": "TMS13_13", "weight": 1 }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "decentering",
            "type": "dimension",
            "label": "Decentering（抽离地觉察，0–28）",
            "description": "官方计分键：题 1、2、4、7、8、9、11 直接求和（全部题目正向，无反向），范围 0–28；分数更高表示刚才的练习中自报更能与念头情绪保持距离地觉察；任一题缺答不计算。两维不合成总分。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                { "itemCode": "TMS13_01", "weight": 1 },
                { "itemCode": "TMS13_02", "weight": 1 },
                { "itemCode": "TMS13_04", "weight": 1 },
                { "itemCode": "TMS13_07", "weight": 1 },
                { "itemCode": "TMS13_08", "weight": 1 },
                { "itemCode": "TMS13_09", "weight": 1 },
                { "itemCode": "TMS13_11", "weight": 1 }
              ],
              "aggregation": "sum"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "curiosity",
          "decentering"
        ],
        "scoreOrder": [
          "curiosity",
          "decentering"
        ],
        "interpretations": [
          {
            "scoreKey": "curiosity",
            "headline": "Curiosity（好奇，0–24）",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题问的是：刚才那段练习里，你对身体感觉、情绪和念头是不是带着“看看它会怎样”的兴趣。好奇不等于舒服——即使出现的是不舒服的感觉，能对它保持一点兴趣，也是这组题描述的状态。单次状态有起伏，这不是能力分，也没有及格线。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "刚才有没有某个瞬间，你发现自己在“观察”一个念头或感觉，而不是被它带走？"
              },
              {
                "category": "strategy",
                "text": "下次练习时，挑一个出现的体验（比如腿的酸胀），试着像第一次见到它那样看几秒：“哦，它在这里。”"
              }
            ]
          },
          {
            "scoreKey": "decentering",
            "headline": "Decentering（抽离地觉察，0–28）",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题问的是：刚才你能不能把念头当作“心里经过的事件”，而不是非接受不可的事实。能和念头隔开一点距离，不等于不理它，而是不被它直接拖着走。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "刚才有没有一个想法特别想把你拉走？你是怎么和它相处的？"
              },
              {
                "category": "strategy",
                "text": "下次一个评价性的念头冒出来时，试着在心里说“我注意到我有一个……的想法”，然后回到呼吸或手头的事。"
              }
            ]
          }
        ],
        "limitations": [
          "这是状态正念量表：题干全部指向“刚刚结束的那段练习”，结果只描述当次状态；状态会随练习、睡眠、心情起伏，单次结果不代表特质，不定义你会不会练习。",
          "不与特质正念工具（FFMQ、KIMS、MAAS、CAMS-R 等）的分数混合计分、比较或换算；TMS-T 特质版为另一题本。",
          "原版验证为北美成人样本（Lau et al., 2006），不构成中国或任何本地人群常模。",
          "任一题缺答该维度不计算，缺答不会算零；完整作答要求是产品约定，不是原作者规则。",
          "没有常模、百分位或诊断阈值；分数不用于排名、选拔或高风险决策。",
          "本量表的前提是刚完成一段冥想或类似练习；未练习时的作答不构成有效的状态基线解释。"
        ],
        "disclaimer": "供成人回顾一次练习中的即时体验，不是考试，也不能用于诊断、人格评判、排名或高风险决策。题本为英文原版。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-zero",
        "answers": [
          { "itemCode": "TMS13_01", "responseValue": "0" },
          { "itemCode": "TMS13_02", "responseValue": "0" },
          { "itemCode": "TMS13_03", "responseValue": "0" },
          { "itemCode": "TMS13_04", "responseValue": "0" },
          { "itemCode": "TMS13_05", "responseValue": "0" },
          { "itemCode": "TMS13_06", "responseValue": "0" },
          { "itemCode": "TMS13_07", "responseValue": "0" },
          { "itemCode": "TMS13_08", "responseValue": "0" },
          { "itemCode": "TMS13_09", "responseValue": "0" },
          { "itemCode": "TMS13_10", "responseValue": "0" },
          { "itemCode": "TMS13_11", "responseValue": "0" },
          { "itemCode": "TMS13_12", "responseValue": "0" },
          { "itemCode": "TMS13_13", "responseValue": "0" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "curiosity": 0,
            "decentering": 0
          },
          "totalScoreKeys": [
            "curiosity",
            "decentering"
          ]
        }
      },
      {
        "name": "all-four",
        "answers": [
          { "itemCode": "TMS13_01", "responseValue": "4" },
          { "itemCode": "TMS13_02", "responseValue": "4" },
          { "itemCode": "TMS13_03", "responseValue": "4" },
          { "itemCode": "TMS13_04", "responseValue": "4" },
          { "itemCode": "TMS13_05", "responseValue": "4" },
          { "itemCode": "TMS13_06", "responseValue": "4" },
          { "itemCode": "TMS13_07", "responseValue": "4" },
          { "itemCode": "TMS13_08", "responseValue": "4" },
          { "itemCode": "TMS13_09", "responseValue": "4" },
          { "itemCode": "TMS13_10", "responseValue": "4" },
          { "itemCode": "TMS13_11", "responseValue": "4" },
          { "itemCode": "TMS13_12", "responseValue": "4" },
          { "itemCode": "TMS13_13", "responseValue": "4" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "curiosity": 24,
            "decentering": 28
          },
          "totalScoreKeys": [
            "curiosity",
            "decentering"
          ]
        }
      },
      {
        "name": "curiosity-max-decentering-min",
        "answers": [
          { "itemCode": "TMS13_01", "responseValue": "0" },
          { "itemCode": "TMS13_02", "responseValue": "0" },
          { "itemCode": "TMS13_03", "responseValue": "4" },
          { "itemCode": "TMS13_04", "responseValue": "0" },
          { "itemCode": "TMS13_05", "responseValue": "4" },
          { "itemCode": "TMS13_06", "responseValue": "4" },
          { "itemCode": "TMS13_07", "responseValue": "0" },
          { "itemCode": "TMS13_08", "responseValue": "0" },
          { "itemCode": "TMS13_09", "responseValue": "0" },
          { "itemCode": "TMS13_10", "responseValue": "4" },
          { "itemCode": "TMS13_11", "responseValue": "0" },
          { "itemCode": "TMS13_12", "responseValue": "4" },
          { "itemCode": "TMS13_13", "responseValue": "4" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "curiosity": 24,
            "decentering": 0
          },
          "totalScoreKeys": [
            "curiosity",
            "decentering"
          ]
        }
      },
      {
        "name": "missing-item03",
        "answers": [
          { "itemCode": "TMS13_01", "responseValue": "2" },
          { "itemCode": "TMS13_02", "responseValue": "2" },
          { "itemCode": "TMS13_04", "responseValue": "2" },
          { "itemCode": "TMS13_05", "responseValue": "2" },
          { "itemCode": "TMS13_06", "responseValue": "2" },
          { "itemCode": "TMS13_07", "responseValue": "2" },
          { "itemCode": "TMS13_08", "responseValue": "2" },
          { "itemCode": "TMS13_09", "responseValue": "2" },
          { "itemCode": "TMS13_10", "responseValue": "2" },
          { "itemCode": "TMS13_11", "responseValue": "2" },
          { "itemCode": "TMS13_12", "responseValue": "2" },
          { "itemCode": "TMS13_13", "responseValue": "2" }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "curiosity": null,
            "decentering": 14
          },
          "totalScoreKeys": [
            "curiosity",
            "decentering"
          ]
        }
      },
      {
        "name": "missing-item09",
        "answers": [
          { "itemCode": "TMS13_01", "responseValue": "1" },
          { "itemCode": "TMS13_02", "responseValue": "1" },
          { "itemCode": "TMS13_03", "responseValue": "1" },
          { "itemCode": "TMS13_04", "responseValue": "1" },
          { "itemCode": "TMS13_05", "responseValue": "1" },
          { "itemCode": "TMS13_06", "responseValue": "1" },
          { "itemCode": "TMS13_07", "responseValue": "1" },
          { "itemCode": "TMS13_08", "responseValue": "1" },
          { "itemCode": "TMS13_10", "responseValue": "1" },
          { "itemCode": "TMS13_11", "responseValue": "1" },
          { "itemCode": "TMS13_12", "responseValue": "1" },
          { "itemCode": "TMS13_13", "responseValue": "1" }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "curiosity": 6,
            "decentering": null
          },
          "totalScoreKeys": [
            "curiosity",
            "decentering"
          ]
        }
      },
      {
        "name": "all-missing",
        "answers": [],
        "expected": {
          "quality": "invalid",
          "scores": {
            "curiosity": null,
            "decentering": null
          },
          "totalScoreKeys": [
            "curiosity",
            "decentering"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
