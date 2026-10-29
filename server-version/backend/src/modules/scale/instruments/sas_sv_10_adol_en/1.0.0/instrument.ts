// SAS-SV native DRAFT: verbatim 10-item English form from the author-supplied
// Appendix S1 of Kwon et al. (2013), PLoS ONE (Creative Commons Attribution License).
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "sas_sv_10_adol_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Smartphone Addiction Scale — Short Version",
      "abbreviation": "SAS-SV",
      "instrumentFamily": "Smartphone Addiction Scale"
    },
    "construct": {
      "primaryDomain": "BEHAVIORAL_DIFFICULTIES",
      "secondaryDomains": [
        "SELF_REGULATION",
        "WELL_BEING"
      ],
      "constructDefinition": "青少年问题性智能手机使用：因手机使用导致的日常功能受损（学业/工作受扰）、戒断样不适、突显性（离线时仍惦记）、失控与冲突反馈。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:screen_use",
        "problematic_smartphone_use",
        "behavioral_addiction",
        "license:cc_by_plos_official",
        "population:k12",
        "population:adolescent",
        "response:student_self",
        "use:screening",
        "use:research",
        "language_validation:chinese_validation_published"
      ]
    },
    "population": {
      "minAge": 12,
      "maxAge": 19,
      "populationNotes": "官方验证为韩国初中生 N=540（平均 14.46±0.54 岁，男 343/女 197）；SAS-SV 专为青少年编制。中文青少年版有独立验证（Cheung et al., 2019；Luk et al., 2018 为香港成人），跨境适用年龄带以各验证为准。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 10,
      "estimatedMinutes": 4,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "目前一般情况；无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "官方 6 点同意度计分（1=Strongly disagree … 6=Strongly agree，含 Weakly 两档），不得改为 5 点或 4 点。",
        "官方计分为 10 题总和（10–60）；作者 ROC 切分点（男 31/女 33）记录于工具文档，报告不据此给个人等级。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "SCREENING",
          "evidenceStatus": "SUPPORTED",
          "notes": "作者以 ROC（男 31/女 33，AUC .963/.947）建议初筛切分点；切分点源自韩国初中样本，非本地常模。"
        },
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED"
        },
        {
          "use": "PROGRESS_MONITORING",
          "evidenceStatus": "EVIDENCE_UNKNOWN"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "非学术反馈为产品设计，不解释为成瘾等级或诊断。"
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
        "evidenceId": "sassv-kwon-2013",
        "evidenceType": "INTERNAL_CONSISTENCY",
        "population": "韩国初中生",
        "ageRange": "mean 14.46±0.54 years",
        "locale": "en",
        "territory": "KR",
        "sampleSize": 540,
        "studyDesign": "Item selection by content validity; reliability (overall alpha .911), concurrent validity with SAS/SAPS/KS-scale, ROC analysis suggesting gender-specific cut-offs (boys 31, girls 33)",
        "rating": "SUFFICIENT",
        "citation": "Kwon M, Kim DJ, Cho H, Yang S. (2013). The Smartphone Addiction Scale: Development and Validation of a Short Version for Adolescents. PLoS ONE, 8(12), e83558.",
        "doi": "10.1371/journal.pone.0083558",
        "url": "https://doi.org/10.1371/journal.pone.0083558",
        "notes": "SAS-SV 全文与官方题本附录以 CC BY 分发（原文许可声明已核对）；Scale mean 25.26, SD 10.78。",
      },
      {
        "evidenceId": "sassv-cheung-2019",
        "evidenceType": "CROSS_CULTURAL_VALIDITY",
        "population": "中国香港青少年",
        "locale": "zh",
        "territory": "HK",
        "studyDesign": "Psychometric properties and demographic correlates of the Chinese SAS-SV among Chinese adolescents",
        "rating": "SUFFICIENT",
        "citation": "Cheung LM, Wong WSL, Shek CCL, et al. (2019). Psychometric Properties and Demographic Correlates of the Smartphone Addiction Scale-Short Version among Chinese Adolescents in Hong Kong. Journal of Pediatric Nursing.",
        "notes": "中文青少年版验证存在；中文施测路径另立版本并完成翻译验证。",
      },
      {
        "evidenceId": "sassv-luk-2018",
        "evidenceType": "CROSS_CULTURAL_VALIDITY",
        "population": "中国香港成人",
        "locale": "zh",
        "territory": "HK",
        "studyDesign": "Validation of the Chinese SAS-SV in Hong Kong adults",
        "rating": "SUFFICIENT",
        "citation": "Luk TT, Wang MP, Shen C, et al. (2018). Short version of the Smartphone Addiction Scale in Chinese adults: Psychometric properties, discriminant validity and invariance. Addictive Behaviors.",
        "doi": "10.1016/j.addbeh.2017.12.006",
        "notes": "成人版证据；不自动外推到 K-12 年龄带下界以下。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "sas-sv-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "sas-sv-v1",
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
    "text": "请根据你在过去一年里的真实情况作答。每题从『完全不同意』到『完全同意』共 6 个选项，选择最符合你的一项。答案没有对错，请如实作答。",
    "language": "zh-CN",
    "version": "1.0.0",
    "source": "作者附录未含中文指导语；本指导语为工作译文（对应原文自评作答要求），中文验证以 Cheung et al. (2019) 版本为准另行核对。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Smartphone Addiction Scale — Short Version (SAS-SV)",
        "citation": "Kwon M, Kim DJ, Cho H, Yang S. (2013). PLoS ONE, 8(12), e83558; items verbatim from author-supplied Appendix S1 (English version of SAS-SV).",
        "url": "https://doi.org/10.1371/journal.pone.0083558",
        "publicationYear": 2013
      },
      "license": {
        "status": "verified",
        "redistribution": "allowed",
        "note": "文章许可声明（原文）：『This is an open-access article distributed under the terms of the Creative Commons Attribution License, which permits unrestricted use, distribution, and reproduction in any medium, provided the original author and source are credited.』——CC BY 允许在署名前提下自由使用与再分发；本包引用原文并保留作者署名。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "sas_sv_agreement_1_6",
          "options": [
            { "value": "1", "label": "Strongly disagree", "score": 1 },
            { "value": "2", "label": "Disagree", "score": 2 },
            { "value": "3", "label": "Weakly disagree", "score": 3 },
            { "value": "4", "label": "Weakly agree", "score": 4 },
            { "value": "5", "label": "Agree", "score": 5 },
            { "value": "6", "label": "Strongly agree", "score": 6 }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "SASSV-01",
          "content": "Missing planned work due to smartphone use",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "sas_sv_agreement_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SASSV-02",
          "content": "Having a hard time concentrating in class, while doing assignments, or while working due to smartphone use",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "sas_sv_agreement_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SASSV-03",
          "content": "Feeling pain in the wrists or at the back of the neck while using a smartphone",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "sas_sv_agreement_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SASSV-04",
          "content": "Won’t be able to stand not having a smartphone",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "sas_sv_agreement_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SASSV-05",
          "content": "Feeling impatient and fretful when I am not holding my smartphone",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "sas_sv_agreement_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SASSV-06",
          "content": "Having my smartphone in my mind even when I am not using it",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "sas_sv_agreement_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SASSV-07",
          "content": "I will never give up using my smartphone even when my daily life is already greatly affected by it.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "sas_sv_agreement_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SASSV-08",
          "content": "Constantly checking my smartphone so as not to miss conversations between other people on Twitter or Facebook",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "sas_sv_agreement_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SASSV-09",
          "content": "Using my smartphone longer than I had intended",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "sas_sv_agreement_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SASSV-10",
          "content": "The people around me tell me that I use my smartphone too much.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "sas_sv_agreement_1_6",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          { "itemCode": "SASSV-01", "transform": { "type": "identity" } },
          { "itemCode": "SASSV-02", "transform": { "type": "identity" } },
          { "itemCode": "SASSV-03", "transform": { "type": "identity" } },
          { "itemCode": "SASSV-04", "transform": { "type": "identity" } },
          { "itemCode": "SASSV-05", "transform": { "type": "identity" } },
          { "itemCode": "SASSV-06", "transform": { "type": "identity" } },
          { "itemCode": "SASSV-07", "transform": { "type": "identity" } },
          { "itemCode": "SASSV-08", "transform": { "type": "identity" } },
          { "itemCode": "SASSV-09", "transform": { "type": "identity" } },
          { "itemCode": "SASSV-10", "transform": { "type": "identity" } }
        ],
        "defaultMissingPolicy": {
          "type": "complete_required"
        },
        "scores": [
          {
            "key": "smartphone_addiction_risk",
            "type": "total",
            "label": "问题性手机使用",
            "description": "官方计分：10 题回答的总和（10–60），无反向题。作者 ROC 切分点（男 31/女 33）仅为韩国初中样本的初筛参考，报告不据此给个人等级。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                { "itemCode": "SASSV-01", "weight": 1 },
                { "itemCode": "SASSV-02", "weight": 1 },
                { "itemCode": "SASSV-03", "weight": 1 },
                { "itemCode": "SASSV-04", "weight": 1 },
                { "itemCode": "SASSV-05", "weight": 1 },
                { "itemCode": "SASSV-06", "weight": 1 },
                { "itemCode": "SASSV-07", "weight": 1 },
                { "itemCode": "SASSV-08", "weight": 1 },
                { "itemCode": "SASSV-09", "weight": 1 },
                { "itemCode": "SASSV-10", "weight": 1 }
              ],
              "aggregation": "sum"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "smartphone_addiction_risk"
        ],
        "scoreOrder": [
          "smartphone_addiction_risk"
        ],
        "interpretations": [
          {
            "scoreKey": "smartphone_addiction_risk",
            "headline": "手机在你生活里的位置",
            "source": {
              "type": "score_only"
            },
            "summary": "这 10 题看的是：手机有没有开始打扰你的日常——比如因为玩手机耽误了计划好的事、上课写作业难专心、手机不在手边就烦躁、或者身边的人提醒你玩得太多。分数是 10 题的总和（10–60），越高表示手机使用对生活的影响越明显。它描述的是习惯的影响，不是给你贴标签。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回想最近一周：手机最常在什么时候『抢走』你的注意力？是写作业时、睡前、还是和朋友聊天时？把它记下来。"
              },
              {
                "category": "strategy",
                "text": "给手机安排『休息位』：写作业时放到另一个房间或视线之外；睡前半小时把手机放在床以外的地方。"
              },
              {
                "category": "support",
                "text": "如果总分持续偏高，并已经影响学习、睡眠或和朋友家人的相处，可以和学校心理老师聊聊——使用习惯是可以一步步调回来的。"
              }
            ]
          }
        ],
        "limitations": [
          "这是青少年自评的问题性手机使用筛查，反映一次作答，不构成『手机成瘾』的诊断或能力判断。",
          "作者 ROC 切分点（男 31/女 33）来自韩国初中生样本（N=540），未建立中文常模；报告不据此给出个人风险等级。",
          "『成瘾』一词为原工具命名习惯；分数高反映使用对日常功能的影响，不等同于临床障碍。",
          "没有适用于你的诊断阈值；本报告不用于诊断或高风险决策。"
        ],
        "disclaimer": "这份报告用于认识手机使用对生活的影响和反思，不用于诊断、排名或高风险决策。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "minimum-keyed",
        "answers": [
          { "itemCode": "SASSV-01", "responseValue": "1" },
          { "itemCode": "SASSV-02", "responseValue": "1" },
          { "itemCode": "SASSV-03", "responseValue": "1" },
          { "itemCode": "SASSV-04", "responseValue": "1" },
          { "itemCode": "SASSV-05", "responseValue": "1" },
          { "itemCode": "SASSV-06", "responseValue": "1" },
          { "itemCode": "SASSV-07", "responseValue": "1" },
          { "itemCode": "SASSV-08", "responseValue": "1" },
          { "itemCode": "SASSV-09", "responseValue": "1" },
          { "itemCode": "SASSV-10", "responseValue": "1" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": { "smartphone_addiction_risk": 10 },
          "totalScoreKeys": ["smartphone_addiction_risk"]
        }
      },
      {
        "name": "maximum-keyed",
        "answers": [
          { "itemCode": "SASSV-01", "responseValue": "6" },
          { "itemCode": "SASSV-02", "responseValue": "6" },
          { "itemCode": "SASSV-03", "responseValue": "6" },
          { "itemCode": "SASSV-04", "responseValue": "6" },
          { "itemCode": "SASSV-05", "responseValue": "6" },
          { "itemCode": "SASSV-06", "responseValue": "6" },
          { "itemCode": "SASSV-07", "responseValue": "6" },
          { "itemCode": "SASSV-08", "responseValue": "6" },
          { "itemCode": "SASSV-09", "responseValue": "6" },
          { "itemCode": "SASSV-10", "responseValue": "6" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": { "smartphone_addiction_risk": 60 },
          "totalScoreKeys": ["smartphone_addiction_risk"]
        }
      },
      {
        "name": "sample-mixed",
        "answers": [
          { "itemCode": "SASSV-01", "responseValue": "4" },
          { "itemCode": "SASSV-02", "responseValue": "4" },
          { "itemCode": "SASSV-03", "responseValue": "2" },
          { "itemCode": "SASSV-04", "responseValue": "3" },
          { "itemCode": "SASSV-05", "responseValue": "3" },
          { "itemCode": "SASSV-06", "responseValue": "5" },
          { "itemCode": "SASSV-07", "responseValue": "2" },
          { "itemCode": "SASSV-08", "responseValue": "4" },
          { "itemCode": "SASSV-09", "responseValue": "5" },
          { "itemCode": "SASSV-10", "responseValue": "4" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": { "smartphone_addiction_risk": 36 },
          "totalScoreKeys": ["smartphone_addiction_risk"]
        }
      },
      {
        "name": "missing-item",
        "answers": [
          { "itemCode": "SASSV-01", "responseValue": "4" },
          { "itemCode": "SASSV-02", "responseValue": "4" },
          { "itemCode": "SASSV-03", "responseValue": "2" },
          { "itemCode": "SASSV-04", "responseValue": "3" },
          { "itemCode": "SASSV-05", "responseValue": "3" },
          { "itemCode": "SASSV-06", "responseValue": "5" },
          { "itemCode": "SASSV-07", "responseValue": "2" },
          { "itemCode": "SASSV-08", "responseValue": "4" },
          { "itemCode": "SASSV-09", "responseValue": "5" }
        ],
        "expected": {
          "quality": "invalid",
          "scores": { "smartphone_addiction_risk": null },
          "totalScoreKeys": ["smartphone_addiction_risk"]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
