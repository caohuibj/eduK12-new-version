import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

/** Rights-safe catalog-only intake; no executable item text or scoring registered. */
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "tas37_sarason_zh_cn",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Sarason Test Anxiety Scale — Chinese 37-item Version",
      "abbreviation": "TAS-37",
      "instrumentFamily": "Sarason Test Anxiety Scale (1978)"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [
        "MOTIVATION"
      ],
      "constructDefinition": "中学生在考试前后对考试结果的担忧、情绪紧张与考试相关身心反应，37题是/否自陈。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "test_anxiety",
        "school_exam",
        "self_report",
        "adolescent_test_anxiety",
        "exam_worry",
        "yes_no"
      ]
    },
    "population": {
      "gradeRange": {
        "minGrade": 7,
        "maxGrade": 12
      },
      "populationNotes": "宋飞与张建新（2008）于北京15所中学收集2089名学生（初一至高三）；1966人达到论文80%应答分析标准。内部一致性α=0.87、五个月重测r=0.59。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 37,
      "estimatedMinutes": 8,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "考试前后的一般经验（原译本未确认限定回忆期）",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "37题是/否反应。近年中学生研究报告第3、15、26、27、29、33题反向计分；计分必须核对被授权的对应中文版逐题顺序。",
        "2008年论文的80%应答率是研究纳入标准，不等于原量表缺失值处理或按比例计分授权。",
        "未确认数字化公开再分发与原中文题本权利；仓库不保存受限题文。"
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
        "evidenceId": "tas37-song-zhang-2008",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "北京市15所中学初一至高三学生",
        "locale": "zh-CN",
        "territory": "CN",
        "sampleSize": 2089,
        "studyDesign": "分层整群抽样；TAS中学生信度和结构研究；有效研究样本1966",
        "rating": "SUFFICIENT",
        "citation": "宋飞、张建新（2008）。考试焦虑量表（TAS）在北京市中学生中的适用性。中国临床心理学杂志，16(6)，623–624、629。",
        "url": "https://ir.psych.ac.cn/bitstream/311026/3858/1/%E8%80%83%E8%AF%95%E7%84%A6%E8%99%91%E9%87%8F%E8%A1%A8_TAS_%E5%9C%A8%E5%8C%97%E4%BA%AC%E5%B8%82%E4%B8%AD%E5%AD%A6%E7%94%9F%E4%B8%AD%E7%9A%84%E9%80%82%E7%94%A8%E6%80%A7.pdf",
        "notes": "Cronbach α=0.87；原中文题本1999王才康翻译。"
      },
      {
        "evidenceId": "tas37-song-zhang-2008-retest",
        "evidenceType": "TEST_RETEST",
        "population": "北京市初中部分学生（五个月重测）",
        "locale": "zh-CN",
        "territory": "CN",
        "sampleSize": 194,
        "studyDesign": "五个月重测",
        "rating": "MIXED",
        "citation": "宋飞、张建新（2008）。考试焦虑量表（TAS）在北京市中学生中的适用性。中国临床心理学杂志，16(6)，623–624、629。",
        "notes": "重测系数0.59；仅用于提醒纵向解读限制。"
      },
      {
        "evidenceId": "tas37-secondary-scoring-2024",
        "evidenceType": "CONTENT_VALIDITY",
        "population": "中国初中生",
        "locale": "zh-CN",
        "territory": "CN",
        "studyDesign": "2024研究在材料方法中披露37题六个反向题号",
        "rating": "UNKNOWN",
        "citation": "Brief Meditation on Test Anxiety of Eighth Grade Chinese Students: Chain-Mediating Roles of Mindfulness and Self-Efficacy. School Mental Health (2024).",
        "url": "https://link.springer.com/article/10.1007/s12310-024-09652-y",
        "notes": "反向题3、15、26、27、29、33是次级研究报道，需核原版对应中文题号后方可部署。"
      }
    ],
    "referenceApplicability": []
  },
  "localization": {
    "schemaVersion": 1,
    "sourceLocale": "en",
    "targetLocale": "zh-CN",
    "localizationVersion": "1.0.0",
    "translationSource": "王才康1999年中文版，宋飞与张建新2008中学生验证；未获得权利方确认的数字化发布版本。",
    "adaptationMethod": "CULTURAL_ADAPTATION",
    "expertReviewStatus": "PENDING",
    "cognitiveDebriefStatus": "NOT_ESTABLISHED",
    "localEvidenceRefs": [
      "tas37-song-zhang-2008",
      "tas37-song-zhang-2008-retest",
      "tas37-secondary-scoring-2024"
    ],
    "reviewStatus": "PENDING",
    "notes": "不能将37题与2008文献讨论的25题短版混同，也不能凭网页流传译本代替经授权的固定原题。"
  },
  "candidatePreview": {
    "status": "CATALOG_ONLY",
    "source": {
      "title": "考试焦虑量表（TAS）在北京市中学生中的适用性",
      "citation": "宋飞、张建新（2008）。中国临床心理学杂志，16(6)，623–624、629。",
      "url": "https://ir.psych.ac.cn/bitstream/311026/3858/1/%E8%80%83%E8%AF%95%E7%84%A6%E8%99%91%E9%87%8F%E8%A1%A8_TAS_%E5%9C%A8%E5%8C%97%E4%BA%AC%E5%B8%82%E4%B8%AD%E5%AD%A6%E7%94%9F%E4%B8%AD%E7%9A%84%E9%80%82%E7%94%A8%E6%80%A7.pdf",
      "publicationYear": 2008
    },
    "reportPlan": {
      "dimensionLabels": [
        "考试焦虑总分"
      ],
      "limitations": [
        "原版37题中文本的精确文字、排序与公开数字再分发授权尚未冻结。",
        "六道反向题号有2024年后续研究佐证，但仍需与最终授权题本逐项对应；完整缺失值规则未知。",
        "2008年研究用于统计的80%完整率并非自动评分缺失规则。",
        "中学生没有可直接移用的正式诊断阈值；P建议none，不输出“严重焦虑”等诊断标签。"
      ],
      "disclaimer": "仅描述考试相关焦虑倾向；学校、家庭与研究使用不得据此作诊断、排名、升学判断。"
    },
    "blockers": [
      "待补经许可的固定中文37题本，并核反向题对应和缺失计分规则；当前仅有目录来源，不能启动施测。",
      "CHINESE_ITEM_COPYRIGHT_DIGITAL_RIGHTS_UNKNOWN",
      "AUTHORIZED_37_ITEM_FORM_NOT_FROZEN",
      "INCOMPLETE_RESPONSE_POLICY_UNKNOWN",
      "EXECUTABLE_NOT_REGISTERED"
    ]
  }
} satisfies ScaleInstrumentSourceV1
