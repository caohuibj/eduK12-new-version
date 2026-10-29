import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text and the official scoring note transcribed verbatim from Table 1 of the
// original PHLMS paper, hosted as a full-text copy by the UC Berkeley Greater Good Science
// Center (https://greatergood.berkeley.edu/images/uploads/Cardaciotto-Mindfulness_on_Present_Moment_Awareness_and_Acceptance.pdf).
// Original scale: Cardaciotto, L., Herbert, J. D., Forman, E. M., Moitra, E., & Farrow, V. (2008).
// The assessment of present-moment awareness and acceptance: The Philadelphia Mindfulness Scale.
// Assessment, 15(2), 204-223 (DOI verified via Crossref; the PDF does not print the DOI).
// Official scoring note: odd items totaled (Awareness); even items reverse scored and totaled
// (Acceptance); no total-score composition is defined. Anchor conflict recorded: the same paper's
// Study 2 text describes a 0-4 administration while the Table 1 note specifies 1-5; the Table 1
// note is adopted here. See docs/mindfulness-content-20261028/phlms20/source.md.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "phlms20",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Philadelphia Mindfulness Scale, 20-item version",
      "abbreviation": "PHLMS",
      "instrumentFamily": "Philadelphia Mindfulness Scale"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "成人自报最近一周的当下觉察频次（Awareness，10–50）与对内在体验的接纳程度（Acceptance，10–50）两维；两维相关近零、不合成总分；不是正念能力考试、症状筛查或干预疗效判定。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "phlms20",
        "domain:mindfulness",
        "domain:self_regulation",
        "construct:mindfulness_phlms20_awareness",
        "construct:mindfulness_phlms20_acceptance",
        "orientation:mindfulness_processes",
        "population:adult_18_plus",
        "population:self_report",
        "response:20_items",
        "response:ten_reverse_items",
        "response:four_point_frequency_1_5",
        "use:research",
        "use:individual_reflection",
        "use:not_diagnostic",
        "use:not_high_stakes_selection",
        "use:not_school_ranking",
        "use:no_validated_cutoff",
        "license:source_hosted_pdf",
        "license:redistribution_review_pending",
        "language_validation:original_en",
        "成人自评",
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
      "populationNotes": "原版开发与验证基于北美成人样本（大学生与临床样本，Cardaciotto et al., 2008）；本条目按 18 岁以上成人自评登记（18 岁下限为产品边界）。英文原版无中文人群验证，不将任何中文修订版或其他语言版本的证据套用于此，也不与本分支 FFMQ/KIMS/MAAS/TMS/CAMS-R/CAMM 条目互换分数或证据。"
    },
    "administration": {
      "itemCount": 20,
      "estimatedMinutes": 5,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "PAPER"
      ],
      "timeFrame": "最近一周的体验频次（“the frequency each item was experienced over the past week”）",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "题干与官方计分注逐字取自论文 Table 1；题号与 Table 1 一致（奇数=觉察，偶数=接纳）。",
        "选项锚点按 Table 1 计分注：1 = never, 2 = rarely, 3 = sometimes, 4 = often, 5 = very often；同一论文 Study 2 正文写 0 = never … 4 = very often（0–4），两处不一致，本条目按表注官方计分方向（1–5）实现，冲突如实记录于 docs/mindfulness-content-20261028/phlms20/source.md。",
        "官方计分注：“To obtain the Awareness subscale score, all odd items are totaled … To obtain the Acceptance subscale score, all even items are reverse scored and totaled …”。反向公式按 1–5 量表镜像翻转为 6−response。",
        "两维不合成总分：原论文 CFA 中 Awareness 与 Acceptance 相关不显著（r = –.02），计分注未定义总分。",
        "任一题缺答该维度不计算（null），不把缺答当零分；complete_required 是产品保守约定，不是原作者规则。",
        "期刊为 SAGE 付费墙内容，本副本为 GGSC 公开托管；预计时长为产品估计，不是原作者实测。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版英文在北美成人样本中开发并验证两因子结构（两维相关近零）。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "用于成人回顾最近一周的觉察与接纳习惯，两维分开解读，不贴能力、人格或疾病标签。"
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
        "evidenceId": "cardaciotto-2008-phlms",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "North American adult samples (original PHLMS development studies, incl. undergraduate and clinical samples; per-sample details in the original article)",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development and validation of the 20-item two-factor PHLMS (Awareness, Acceptance); official scoring sums odd items (Awareness, 10-50) and sums even items after reversal (Acceptance, 10-50); the two factors correlate near zero and no total score is defined.",
        "rating": "SUFFICIENT",
        "citation": "Cardaciotto, L., Herbert, J. D., Forman, E. M., Moitra, E., & Farrow, V. (2008). The assessment of present-moment awareness and acceptance: The Philadelphia Mindfulness Scale. Assessment, 15(2), 204–223. https://doi.org/10.1177/1073191107311467",
        "doi": "10.1177/1073191107311467",
        "url": "https://doi.org/10.1177/1073191107311467",
        "notes": "该证据对应英文成人样本，不构成本地常模，也不支持任何界值或百分位。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "phlms20-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "phlms20-en-v1",
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
        "title": "Philadelphia Mindfulness Scale (PHLMS), 20-item version",
        "citation": "Cardaciotto, L., Herbert, J. D., Forman, E. M., Moitra, E., & Farrow, V. (2008). The assessment of present-moment awareness and acceptance: The Philadelphia Mindfulness Scale. Assessment, 15(2), 204–223. https://doi.org/10.1177/1073191107311467",
        "url": "https://greatergood.berkeley.edu/images/uploads/Cardaciotto-Mindfulness_on_Present_Moment_Awareness_and_Acceptance.pdf",
        "publicationYear": 2008
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文与官方计分注引自 UC Berkeley Greater Good Science Center 公开托管的原始论文全文 PDF；期刊为 SAGE 付费墙内容，PDF 页脚印 “Not for commercial use or unauthorized distribution”，未附明确再分发许可声明，本条目仅记录公开托管事实，不声称获得商业、翻译或再分发授权。锚点口径冲突（表注 1–5 vs Study 2 正文 0–4）按表注实现并如实记录。工作副本 SHA-256：ea0e7f1a2de266c593b9de4a5d54bca0acddd8337fcb5b10d747119fecedfc1c；全文提取与逐字核对见 docs/mindfulness-content-20261028/phlms20/source.md 及 _prdata/pdfs/phlms_extract.txt。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "phlms20_1_5",
          "options": [
            {
              "value": "1",
              "label": "never",
              "score": 1
            },
            {
              "value": "2",
              "label": "rarely",
              "score": 2
            },
            {
              "value": "3",
              "label": "sometimes",
              "score": 3
            },
            {
              "value": "4",
              "label": "often",
              "score": 4
            },
            {
              "value": "5",
              "label": "very often",
              "score": 5
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "PHLMS20_01",
          "content": "I am aware of what thoughts are passing through my mind.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_02",
          "content": "I try to distract myself when I feel unpleasant emotions.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_03",
          "content": "When talking with other people, I am aware of their facial and body expressions.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_04",
          "content": "There are aspects of myself I don’t want to think about.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_05",
          "content": "When I shower, I am aware of how the water is running over my body.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_06",
          "content": "I try to stay busy to keep thoughts or feelings from coming to mind.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_07",
          "content": "When I am startled, I notice what is going on inside my body.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_08",
          "content": "I wish I could control my emotions more easily.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_09",
          "content": "When I walk outside, I am aware of smells or how the air feels against my face.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_10",
          "content": "I tell myself that I shouldn’t have certain thoughts.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_11",
          "content": "When someone asks how I am feeling, I can identify my emotions easily.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_12",
          "content": "There are things I try not to think about.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_13",
          "content": "I am aware of thoughts I’m having when my mood changes.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_14",
          "content": "I tell myself that I shouldn’t feel sad.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_15",
          "content": "I notice changes inside my body, like my heart beating faster or my muscles getting tense.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_16",
          "content": "If there is something I don’t want to think about, I’ll try many things to get it out of my mind.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_17",
          "content": "Whenever my emotions change, I am conscious of them immediately.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_18",
          "content": "I try to put my problems out of mind.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_19",
          "content": "When talking with other people, I am aware of the emotions I am experiencing.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "PHLMS20_20",
          "content": "When I have a bad memory, I try to distract myself to make it go away.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "phlms20_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          { "itemCode": "PHLMS20_01", "transform": { "type": "identity" } },
          { "itemCode": "PHLMS20_02", "transform": { "type": "reverse" } },
          { "itemCode": "PHLMS20_03", "transform": { "type": "identity" } },
          { "itemCode": "PHLMS20_04", "transform": { "type": "reverse" } },
          { "itemCode": "PHLMS20_05", "transform": { "type": "identity" } },
          { "itemCode": "PHLMS20_06", "transform": { "type": "reverse" } },
          { "itemCode": "PHLMS20_07", "transform": { "type": "identity" } },
          { "itemCode": "PHLMS20_08", "transform": { "type": "reverse" } },
          { "itemCode": "PHLMS20_09", "transform": { "type": "identity" } },
          { "itemCode": "PHLMS20_10", "transform": { "type": "reverse" } },
          { "itemCode": "PHLMS20_11", "transform": { "type": "identity" } },
          { "itemCode": "PHLMS20_12", "transform": { "type": "reverse" } },
          { "itemCode": "PHLMS20_13", "transform": { "type": "identity" } },
          { "itemCode": "PHLMS20_14", "transform": { "type": "reverse" } },
          { "itemCode": "PHLMS20_15", "transform": { "type": "identity" } },
          { "itemCode": "PHLMS20_16", "transform": { "type": "reverse" } },
          { "itemCode": "PHLMS20_17", "transform": { "type": "identity" } },
          { "itemCode": "PHLMS20_18", "transform": { "type": "reverse" } },
          { "itemCode": "PHLMS20_19", "transform": { "type": "identity" } },
          { "itemCode": "PHLMS20_20", "transform": { "type": "reverse" } }
        ],
        "defaultMissingPolicy": {
          "type": "complete_required"
        },
        "scores": [
          {
            "key": "awareness",
            "type": "dimension",
            "label": "Awareness（觉察，10–50）",
            "description": "官方计分注：奇数题（1,3,5,7,9,11,13,15,17,19）直接求和，范围 10–50，分数更高表示最近一周自报的当下觉察更频繁；任一题缺答不计算。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                { "itemCode": "PHLMS20_01", "weight": 1 },
                { "itemCode": "PHLMS20_03", "weight": 1 },
                { "itemCode": "PHLMS20_05", "weight": 1 },
                { "itemCode": "PHLMS20_07", "weight": 1 },
                { "itemCode": "PHLMS20_09", "weight": 1 },
                { "itemCode": "PHLMS20_11", "weight": 1 },
                { "itemCode": "PHLMS20_13", "weight": 1 },
                { "itemCode": "PHLMS20_15", "weight": 1 },
                { "itemCode": "PHLMS20_17", "weight": 1 },
                { "itemCode": "PHLMS20_19", "weight": 1 }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "acceptance",
            "type": "dimension",
            "label": "Acceptance（接纳，10–50）",
            "description": "官方计分注：偶数题（2,4,6,8,10,12,14,16,18,20）全部反向（6−原始分）后求和，范围 10–50，分数更高表示自报更少与内在体验较劲、更允许其存在；任一题缺答不计算。两维不合成总分。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                { "itemCode": "PHLMS20_02", "weight": 1 },
                { "itemCode": "PHLMS20_04", "weight": 1 },
                { "itemCode": "PHLMS20_06", "weight": 1 },
                { "itemCode": "PHLMS20_08", "weight": 1 },
                { "itemCode": "PHLMS20_10", "weight": 1 },
                { "itemCode": "PHLMS20_12", "weight": 1 },
                { "itemCode": "PHLMS20_14", "weight": 1 },
                { "itemCode": "PHLMS20_16", "weight": 1 },
                { "itemCode": "PHLMS20_18", "weight": 1 },
                { "itemCode": "PHLMS20_20", "weight": 1 }
              ],
              "aggregation": "sum"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "awareness",
          "acceptance"
        ],
        "scoreOrder": [
          "awareness",
          "acceptance"
        ],
        "interpretations": [
          {
            "scoreKey": "awareness",
            "headline": "Awareness（觉察，10–50）",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题问的是你最近一周有多常“注意到”：念头掠过时你看见了、洗澡时感觉到水温、走路时闻到空气的味道、情绪变化的那一刻你意识到了。觉察不等于分析——它更像是“知道现在正在发生什么”。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一周，哪一个瞬间你清楚地“看见”了自己心里的活动？那时你在做什么？"
              },
              {
                "category": "strategy",
                "text": "挑一个每天都有的场景（洗澡、走路、喝第一口水），试一次只留意感觉本身，不给它起名字、也不评价。"
              }
            ]
          },
          {
            "scoreKey": "acceptance",
            "headline": "Acceptance（接纳，10–50）",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题的表述多是“不接纳”的样子：想把某些念头赶出脑子、告诉自己不该这样想、用忙碌把感受挡开。官方计分把这些题反向后求和——分数更高，表示你更少跟自己的体验较劲。接纳不是喜欢，也不是放弃改变，而是先允许“它在这里”。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "有没有一种情绪，你越想把它推走，它反而越明显？"
              },
              {
                "category": "strategy",
                "text": "下次不想要的念头冒出来时，先不赶它，心里说一句“我注意到它了”，然后做手头的事，看它自己停留多久。"
              }
            ]
          }
        ],
        "limitations": [
          "这是成人频次自评工具：结果整理的是作答者最近一周对自身体验的描述，不定义一个人是否清醒或成熟，不能用于人格、能力或道德评价。",
          "两维相互独立（原论文 CFA 相关近零），没有总分、没有“及格线”；不能把两维相加或相除得到综合分。",
          "原版验证为北美成人样本（Cardaciotto et al., 2008），不构成中国或任何本地人群常模。",
          "任一题缺答该维度不计算，缺答不会算零；完整作答要求是产品约定，不是原作者规则。",
          "锚点口径在原论文内存在 1–5 与 0–4 两处表述，本条目按 Table 1 官方计分注（1–5）实现，冲突已记录；取得作者原版施测表后复核。",
          "没有常模、百分位或诊断阈值；分数不用于排名、选拔或高风险决策。与本分支其他正念工具的分数不互换比较。"
        ],
        "disclaimer": "供成人回顾最近一周的个人体验与习惯，不是考试，也不能用于诊断、人格评判、排名或高风险决策。题本为英文原版。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-raw-one",
        "answers": [
          { "itemCode": "PHLMS20_01", "responseValue": "1" },
          { "itemCode": "PHLMS20_02", "responseValue": "1" },
          { "itemCode": "PHLMS20_03", "responseValue": "1" },
          { "itemCode": "PHLMS20_04", "responseValue": "1" },
          { "itemCode": "PHLMS20_05", "responseValue": "1" },
          { "itemCode": "PHLMS20_06", "responseValue": "1" },
          { "itemCode": "PHLMS20_07", "responseValue": "1" },
          { "itemCode": "PHLMS20_08", "responseValue": "1" },
          { "itemCode": "PHLMS20_09", "responseValue": "1" },
          { "itemCode": "PHLMS20_10", "responseValue": "1" },
          { "itemCode": "PHLMS20_11", "responseValue": "1" },
          { "itemCode": "PHLMS20_12", "responseValue": "1" },
          { "itemCode": "PHLMS20_13", "responseValue": "1" },
          { "itemCode": "PHLMS20_14", "responseValue": "1" },
          { "itemCode": "PHLMS20_15", "responseValue": "1" },
          { "itemCode": "PHLMS20_16", "responseValue": "1" },
          { "itemCode": "PHLMS20_17", "responseValue": "1" },
          { "itemCode": "PHLMS20_18", "responseValue": "1" },
          { "itemCode": "PHLMS20_19", "responseValue": "1" },
          { "itemCode": "PHLMS20_20", "responseValue": "1" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "awareness": 10,
            "acceptance": 50
          },
          "totalScoreKeys": [
            "awareness",
            "acceptance"
          ]
        }
      },
      {
        "name": "all-raw-five",
        "answers": [
          { "itemCode": "PHLMS20_01", "responseValue": "5" },
          { "itemCode": "PHLMS20_02", "responseValue": "5" },
          { "itemCode": "PHLMS20_03", "responseValue": "5" },
          { "itemCode": "PHLMS20_04", "responseValue": "5" },
          { "itemCode": "PHLMS20_05", "responseValue": "5" },
          { "itemCode": "PHLMS20_06", "responseValue": "5" },
          { "itemCode": "PHLMS20_07", "responseValue": "5" },
          { "itemCode": "PHLMS20_08", "responseValue": "5" },
          { "itemCode": "PHLMS20_09", "responseValue": "5" },
          { "itemCode": "PHLMS20_10", "responseValue": "5" },
          { "itemCode": "PHLMS20_11", "responseValue": "5" },
          { "itemCode": "PHLMS20_12", "responseValue": "5" },
          { "itemCode": "PHLMS20_13", "responseValue": "5" },
          { "itemCode": "PHLMS20_14", "responseValue": "5" },
          { "itemCode": "PHLMS20_15", "responseValue": "5" },
          { "itemCode": "PHLMS20_16", "responseValue": "5" },
          { "itemCode": "PHLMS20_17", "responseValue": "5" },
          { "itemCode": "PHLMS20_18", "responseValue": "5" },
          { "itemCode": "PHLMS20_19", "responseValue": "5" },
          { "itemCode": "PHLMS20_20", "responseValue": "5" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "awareness": 50,
            "acceptance": 10
          },
          "totalScoreKeys": [
            "awareness",
            "acceptance"
          ]
        }
      },
      {
        "name": "both-min",
        "answers": [
          { "itemCode": "PHLMS20_01", "responseValue": "1" },
          { "itemCode": "PHLMS20_02", "responseValue": "5" },
          { "itemCode": "PHLMS20_03", "responseValue": "1" },
          { "itemCode": "PHLMS20_04", "responseValue": "5" },
          { "itemCode": "PHLMS20_05", "responseValue": "1" },
          { "itemCode": "PHLMS20_06", "responseValue": "5" },
          { "itemCode": "PHLMS20_07", "responseValue": "1" },
          { "itemCode": "PHLMS20_08", "responseValue": "5" },
          { "itemCode": "PHLMS20_09", "responseValue": "1" },
          { "itemCode": "PHLMS20_10", "responseValue": "5" },
          { "itemCode": "PHLMS20_11", "responseValue": "1" },
          { "itemCode": "PHLMS20_12", "responseValue": "5" },
          { "itemCode": "PHLMS20_13", "responseValue": "1" },
          { "itemCode": "PHLMS20_14", "responseValue": "5" },
          { "itemCode": "PHLMS20_15", "responseValue": "1" },
          { "itemCode": "PHLMS20_16", "responseValue": "5" },
          { "itemCode": "PHLMS20_17", "responseValue": "1" },
          { "itemCode": "PHLMS20_18", "responseValue": "5" },
          { "itemCode": "PHLMS20_19", "responseValue": "1" },
          { "itemCode": "PHLMS20_20", "responseValue": "5" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "awareness": 10,
            "acceptance": 10
          },
          "totalScoreKeys": [
            "awareness",
            "acceptance"
          ]
        }
      },
      {
        "name": "both-max",
        "answers": [
          { "itemCode": "PHLMS20_01", "responseValue": "5" },
          { "itemCode": "PHLMS20_02", "responseValue": "1" },
          { "itemCode": "PHLMS20_03", "responseValue": "5" },
          { "itemCode": "PHLMS20_04", "responseValue": "1" },
          { "itemCode": "PHLMS20_05", "responseValue": "5" },
          { "itemCode": "PHLMS20_06", "responseValue": "1" },
          { "itemCode": "PHLMS20_07", "responseValue": "5" },
          { "itemCode": "PHLMS20_08", "responseValue": "1" },
          { "itemCode": "PHLMS20_09", "responseValue": "5" },
          { "itemCode": "PHLMS20_10", "responseValue": "1" },
          { "itemCode": "PHLMS20_11", "responseValue": "5" },
          { "itemCode": "PHLMS20_12", "responseValue": "1" },
          { "itemCode": "PHLMS20_13", "responseValue": "5" },
          { "itemCode": "PHLMS20_14", "responseValue": "1" },
          { "itemCode": "PHLMS20_15", "responseValue": "5" },
          { "itemCode": "PHLMS20_16", "responseValue": "1" },
          { "itemCode": "PHLMS20_17", "responseValue": "5" },
          { "itemCode": "PHLMS20_18", "responseValue": "1" },
          { "itemCode": "PHLMS20_19", "responseValue": "5" },
          { "itemCode": "PHLMS20_20", "responseValue": "1" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "awareness": 50,
            "acceptance": 50
          },
          "totalScoreKeys": [
            "awareness",
            "acceptance"
          ]
        }
      },
      {
        "name": "missing-item07",
        "answers": [
          { "itemCode": "PHLMS20_01", "responseValue": "4" },
          { "itemCode": "PHLMS20_02", "responseValue": "4" },
          { "itemCode": "PHLMS20_03", "responseValue": "4" },
          { "itemCode": "PHLMS20_04", "responseValue": "4" },
          { "itemCode": "PHLMS20_05", "responseValue": "4" },
          { "itemCode": "PHLMS20_06", "responseValue": "4" },
          { "itemCode": "PHLMS20_08", "responseValue": "4" },
          { "itemCode": "PHLMS20_09", "responseValue": "4" },
          { "itemCode": "PHLMS20_10", "responseValue": "4" },
          { "itemCode": "PHLMS20_11", "responseValue": "4" },
          { "itemCode": "PHLMS20_12", "responseValue": "4" },
          { "itemCode": "PHLMS20_13", "responseValue": "4" },
          { "itemCode": "PHLMS20_14", "responseValue": "4" },
          { "itemCode": "PHLMS20_15", "responseValue": "4" },
          { "itemCode": "PHLMS20_16", "responseValue": "4" },
          { "itemCode": "PHLMS20_17", "responseValue": "4" },
          { "itemCode": "PHLMS20_18", "responseValue": "4" },
          { "itemCode": "PHLMS20_19", "responseValue": "4" },
          { "itemCode": "PHLMS20_20", "responseValue": "4" }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "awareness": null,
            "acceptance": 20
          },
          "totalScoreKeys": [
            "awareness",
            "acceptance"
          ]
        }
      },
      {
        "name": "all-missing",
        "answers": [],
        "expected": {
          "quality": "invalid",
          "scores": {
            "awareness": null,
            "acceptance": null
          },
          "totalScoreKeys": [
            "awareness",
            "acceptance"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
