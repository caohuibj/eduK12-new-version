import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

/** Rights-safe catalog-only intake; no executable item text or scoring registered. */
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "ctas12_zh_cn",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Children's Test Anxiety Scale — Chinese 12-item Short Form (2019)",
      "abbreviation": "CTAS-12",
      "instrumentFamily": "Children's Test Anxiety Scale (Wren & Benson, 2004)"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [
        "MOTIVATION"
      ],
      "constructDefinition": "小学生在考试及评价情境中的担忧思维、生理反应和任务外行为。12题简版不是原英文30题完整版，必须分别管理。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "test_anxiety",
        "school_exam",
        "self_report",
        "child_test_anxiety",
        "worry_thoughts",
        "autonomic_reactions",
        "off_task_behaviors"
      ]
    },
    "population": {
      "gradeRange": {
        "minGrade": 3,
        "maxGrade": 6
      },
      "populationNotes": "祁莉等（2019）在中国大陆563名小学3–6年级学生中修订12题；总α=0.82，三个分量表α=0.83/0.72/0.68，三周重测r=0.55；地域与长期稳定性仍受限。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 12,
      "estimatedMinutes": 4,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "考试与类似评价情境的一般体验（论文未声明固定回忆窗口）",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "源论文4级频率作答，端点1=从不会出现、4=总是会出现。不得据此臆造中间选项文字。",
        "原30题编号映射：担忧Q9/Q29/Q11/Q27；生理Q8/Q23/Q20/Q17；任务外Q3/Q18/Q7/Q14；原题号与12题新顺序不可混用。",
        "完整中文题文本见研究论文表1；本公开仓库只保存来源与映射，不复制未获再发布许可的题文。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "只可规划描述性反馈；实际题本许可与计分版本冻结前不得开放施测。"
        },
        {
          "use": "PROGRESS_MONITORING",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "没有适用中国K12长期追踪变化阈值。"
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
        "evidenceId": "ctas12-qi-2019-structure",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "中国大陆小学3–6年级学生",
        "locale": "zh-CN",
        "territory": "CN",
        "sampleSize": 563,
        "studyDesign": "短版修订；探索性与验证性因素分析；三因子12题",
        "rating": "SUFFICIENT",
        "citation": "祁莉、陈祉妍、王雅芯、张华（2019）。儿童考试焦虑量表简版的修订。教育科学研究，(10)，42–46。",
        "url": "https://ir.psych.ac.cn/bitstream/311026/32536/1/%E5%84%BF%E7%AB%A5%E8%80%83%E8%AF%95%E7%84%A6%E8%99%91%E9%87%8F%E8%A1%A8%E7%AE%80%E7%89%88%E7%9A%84%E4%BF%AE%E8%AE%A2.pdf",
        "notes": "Q9/29/11/27等12题原30题序号映射详见论文第3页；未取得数字再发布授权。"
      },
      {
        "evidenceId": "ctas12-qi-2019-retest",
        "evidenceType": "TEST_RETEST",
        "population": "中国大陆小学3–6年级重测学生",
        "locale": "zh-CN",
        "territory": "CN",
        "sampleSize": 122,
        "studyDesign": "三周间隔重测",
        "rating": "MIXED",
        "citation": "祁莉等（2019）。儿童考试焦虑量表简版的修订。教育科学研究，(10)，42–46。",
        "notes": "重测信度0.55；不能据此推断适于精确个体纵向变化。"
      }
    ],
    "referenceApplicability": []
  },
  "localization": {
    "schemaVersion": 1,
    "sourceLocale": "en",
    "targetLocale": "zh-CN",
    "localizationVersion": "1.0.0",
    "translationSource": "祁莉等2019的原CTAS30题翻译及回译后筛选12题；未取得可部署授权的准确中文题文本。",
    "adaptationMethod": "BACK_TRANSLATION_VERIFIED",
    "expertReviewStatus": "PENDING",
    "cognitiveDebriefStatus": "NOT_ESTABLISHED",
    "localEvidenceRefs": [
      "ctas12-qi-2019-structure",
      "ctas12-qi-2019-retest"
    ],
    "reviewStatus": "PENDING",
    "notes": "2019研究报告两名英语教师两轮回译，不等于本次项目的专家批准或数字版许可。"
  },
  "candidatePreview": {
    "status": "CATALOG_ONLY",
    "source": {
      "title": "儿童考试焦虑量表简版的修订",
      "citation": "祁莉、陈祉妍、王雅芯、张华（2019）。教育科学研究，(10)，42–46。",
      "url": "https://ir.psych.ac.cn/bitstream/311026/32536/1/%E5%84%BF%E7%AB%A5%E8%80%83%E8%AF%95%E7%84%A6%E8%99%91%E9%87%8F%E8%A1%A8%E7%AE%80%E7%89%88%E7%9A%84%E4%BF%AE%E8%AE%A2.pdf",
      "publicationYear": 2019
    },
    "reportPlan": {
      "dimensionLabels": [
        "担忧思维",
        "生理反应",
        "任务外行为"
      ],
      "limitations": [
        "目前仅冻结题数、来源映射和作答端点；原文复制与数字化发布授权未核实。",
        "计分汇总、反向规则与缺失处理尚未按版权允许的原题本/计分说明完整冻结，禁止启动自动评分。",
        "未建立适用中国小学的正式分数阈值、百分位与诊断等级；参数建议referencePolicy=none。",
        "重测信度0.55，不能将个体微小变化解释为可靠改善或恶化。"
      ],
      "disclaimer": "仅研究性描述考试情境中的心理感受，不诊断心理障碍，不用于学生排名或选拔。"
    },
    "blockers": [
      "待补经许可的精确中文12题、完整作答选项及缺失计分规则；当前仅有目录来源，不能启动施测。",
      "RIGHTS_FOR_DIGITAL_REPUBLICATION_UNKNOWN",
      "EXACT_CHINESE_ITEMS_NOT_LICENSED_FOR_PUBLIC_SOURCE",
      "SCORING_MISSING_RULE_NOT_VERIFIED",
      "EXECUTABLE_NOT_REGISTERED"
    ]
  }
} satisfies ScaleInstrumentSourceV1
