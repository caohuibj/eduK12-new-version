// TSEC-22 native DRAFT: Chinese administered originals from the published appendix; redistribution permission recorded.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "tsec_22_zh_cn",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Teachers’ Social-Emotional Competence Scale (TSEC)",
      "abbreviation": "TSEC-22",
      "instrumentFamily": "Teachers’ Social-Emotional Competence Scale"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [],
      "constructDefinition": "教师自评的社会情感能力，含自我情绪驾驭（SEM）、专业关系建设与专业事务责任三个维度，共 22 题。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:sel",
        "domain:sel_context",
        "population:teachers",
        "response:teacher_self",
        "use:reflection",
        "use:research",
        "language_validation:chinese_original",
        "construct:sel_tsec_self_emotional_mastery",
        "construct:sel_tsec_professional_relationship_building",
        "construct:sel_tsec_professional_affairs_responsibility",
        "teacher_self_report",
        "teacher_sec",
        "self_report"
      ]
    },
    "population": {
      "populationNotes": "原研究为中国职前教师两组样本合计 1,474 人；中文为施测原版（论文附录另附发表用英文专家译文）。在职教师适用性需另行验证。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 22,
      "estimatedMinutes": 6,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "一般自我描述",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "七点计分：1 = 完全不同意，7 = 完全同意（发表附录标注两端锚点，中间点无文字）。",
        "三个维度分别计分：自我情绪驾驭 1–6 题、专业关系建设 7–14 题、专业事务责任 15–22 题；不提供总分。"
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
          "notes": "教师发展性反思，不作为考核。"
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
        "evidenceId": "guo-tsec-2026",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Chinese pre-service teachers, two samples, N = 1,474",
        "locale": "zh",
        "territory": "CN",
        "studyDesign": "Scale development and validation of the 22-item TSEC with Chinese originals and expert English translations published in the online appendix.",
        "rating": "SUFFICIENT",
        "citation": "Guo R. Development and validation of the teachers’ social-emotional competence scale (TSEC scale). Current Psychology. 2026;45:779.",
        "doi": "10.1007/s12144-026-09348-3",
        "url": "https://link.springer.com/article/10.1007/s12144-026-09348-3",
        "notes": "正文为订阅内容；附录量表在文章页面公开可见。论文 2026-03-31 发表。论文附录第二、三维度缩写均印作 PRB，本记录按维度全称登记，不擅自改写。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "tsec-22-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "tsec-22-v1",
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
    "text": "请仔细阅读以下每一条陈述，回想自己在社会情感能力各方面的表现，然后用七点量表（1 = 完全不同意，7 = 完全同意）表明每条陈述在多大程度上符合你的学习经历。",
    "language": "zh-CN",
    "version": "1.0.0",
    "source": "依据论文附录发表的英文指导语（Please carefully read each statement below… 1 = completely disagree, 7 = completely agree）整理的中文工作译文；原施测版指导语以论文及作者材料为准。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "zh-CN",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Development and validation of the teachers’ social-emotional competence scale (TSEC scale)",
        "citation": "Guo R. Current Psychology. 2026;45:779, Appendix.",
        "url": "https://link.springer.com/article/10.1007/s12144-026-09348-3",
        "publicationYear": 2026
      },
      "license": {
        "status": "authorized",
        "redistribution": "allowed",
        "note": "库负责人于 2026-10-28 确认获得作者/出版社的再分发许可；许可凭证与具体范围由库负责人归档，商业部署范围以归档许可为准。题文取自论文公开附录（中文施测原版，另附发表用英文译文）。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "tsec_agreement_1_7",
          "options": [
            {
              "value": "1",
              "label": "完全不同意",
              "score": 1
            },
            {
              "value": "2",
              "label": "2",
              "score": 2
            },
            {
              "value": "3",
              "label": "3",
              "score": 3
            },
            {
              "value": "4",
              "label": "4",
              "score": 4
            },
            {
              "value": "5",
              "label": "5",
              "score": 5
            },
            {
              "value": "6",
              "label": "6",
              "score": 6
            },
            {
              "value": "7",
              "label": "完全同意",
              "score": 7
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "TSEC-01",
          "content": "我能接纳自己的不完美。",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-02",
          "content": "我能给自己加油打气, 激励自己。",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-03",
          "content": "我能通过提升自己的专业能力, 获取积极情感。",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-04",
          "content": "我能坚守内心的目标和价值观, 不为外界所干扰。",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-05",
          "content": "当我出现消极情绪时, 我会尝试解决导致自己不开心的这件事。",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-06",
          "content": "当我出现消极情绪时, 我会尝试换一个角度看这件事情。",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-07",
          "content": "我能通过适宜的方式让身边的老师或孩子感知到我对他们的积极情感。",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-08",
          "content": "我对身边的老师或孩子很友善, 让他们感到亲和、舒服。",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-09",
          "content": "当身边的老师或孩子心情不好时, 我能很好地安慰他们, 帮助他们化解消极情绪情感。",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-10",
          "content": "当身边的老师或孩子遇到困难时, 我能提供建设性的意见。",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-11",
          "content": "当身边的老师或孩子需要时, 我能为他们提供及时的帮助。",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-12",
          "content": "与身边的老师或孩子交流时, 我能根据不同的人采取适合的沟通方式。",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-13",
          "content": "我通常会主动向身边的老师或孩子发起对话和交流。",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-14",
          "content": "与身边的老师或孩子交流时, 我能表达自己真实的想法和感受。",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-15",
          "content": "无论何时, 我都很上进, 努力做好每件事。",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-16",
          "content": "只要是答应别人的事情, 我都能信守承诺、说到做到。",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-17",
          "content": "我会主动帮助我的同事分担工作任务。",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-18",
          "content": "我能耐心为孩子付出我的时间、精力等。",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-19",
          "content": "我能发现每一个孩子的闪光点, 欣赏认可每一个孩子。",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-20",
          "content": "在教学过程中, 我能以自己的真情实感去感染或调动孩子的情感。",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-21",
          "content": "我能坚守教师的职业准则和道德要求。",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSEC-22",
          "content": "我能努力培养一个具有健康人格、良好品质、较强的情感能力和人际交往能力的孩子。",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "tsec_agreement_1_7",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "TSEC-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSEC-22",
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
            "key": "self_emotional_mastery",
            "type": "dimension",
            "label": "自我情绪驾驭（SEM）",
            "description": "该维度题目回答的平均分（1–7）；越高表示自评越认同该维度描述。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "TSEC-01",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-02",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-03",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-04",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-05",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-06",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "professional_relationship_building",
            "type": "dimension",
            "label": "专业关系建设",
            "description": "该维度题目回答的平均分（1–7）；越高表示自评越认同该维度描述。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "TSEC-07",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-08",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-09",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-10",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-11",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-12",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-13",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-14",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "professional_affairs_responsibility",
            "type": "dimension",
            "label": "专业事务责任",
            "description": "该维度题目回答的平均分（1–7）；越高表示自评越认同该维度描述。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "TSEC-15",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-16",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-17",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-18",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-19",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-20",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-21",
                  "weight": 1
                },
                {
                  "itemCode": "TSEC-22",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "self_emotional_mastery",
          "professional_relationship_building",
          "professional_affairs_responsibility"
        ],
        "scoreOrder": [
          "self_emotional_mastery",
          "professional_relationship_building",
          "professional_affairs_responsibility"
        ],
        "interpretations": [
          {
            "scoreKey": "self_emotional_mastery",
            "headline": "照顾好自己的情绪",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目关于接纳自己、给自己打气、在消极情绪出现时调节和转化它。分数是这 6 题回答的平均（1–7）；越高表示你越认同这些描述。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "本周试一件小事：情绪低落时，换一个角度把这件事写下来，看看有什么不同。"
              }
            ]
          },
          {
            "scoreKey": "professional_relationship_building",
            "headline": "建设身边的专业关系",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目关于向同事和孩子传递积极情感、安慰与支持他们、用合适的方式沟通并表达真实感受。分数越高表示你越认同这些描述。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "选一位最近互动较少的同事或孩子，主动开启一次轻松的交流。"
              }
            ]
          },
          {
            "scoreKey": "professional_affairs_responsibility",
            "headline": "扛得起专业责任",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题目关于上进与守信、分担任务、耐心投入孩子、发现每个孩子的优点，并坚守职业准则。分数越高表示你越认同这些描述。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回想最近一件你信守承诺的小事：它给周围带来了什么变化？"
              }
            ]
          }
        ],
        "limitations": [
          "这是教师自评，反映一次作答，不等于实际课堂行为或他人眼中的表现。",
          "原研究样本为职前教师；在职教师使用时解释须谨慎，待独立验证。",
          "三个维度分别解读，不合并为教师能力总分，也不用于教师考核或排名。",
          "论文正文为订阅内容；各维均值计分依据附录因子结构，正文计分细节待与全文核对，如不一致以论文为准。"
        ],
        "disclaimer": "这份报告用于教师发展性反思，不用于评价、排名或考核教师。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "minimum-keyed",
        "answers": [
          {
            "itemCode": "TSEC-01",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-02",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-03",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-04",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-05",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-06",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-07",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-08",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-09",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-10",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-11",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-12",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-13",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-14",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-15",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-16",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-17",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-18",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-19",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-20",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-21",
            "responseValue": "1"
          },
          {
            "itemCode": "TSEC-22",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_emotional_mastery": 1,
            "professional_relationship_building": 1,
            "professional_affairs_responsibility": 1
          },
          "totalScoreKeys": [
            "self_emotional_mastery",
            "professional_relationship_building",
            "professional_affairs_responsibility"
          ]
        }
      },
      {
        "name": "maximum-keyed",
        "answers": [
          {
            "itemCode": "TSEC-01",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-02",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-03",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-04",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-05",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-06",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-07",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-08",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-09",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-10",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-11",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-12",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-13",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-14",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-15",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-16",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-17",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-18",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-19",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-20",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-21",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-22",
            "responseValue": "7"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_emotional_mastery": 7,
            "professional_relationship_building": 7,
            "professional_affairs_responsibility": 7
          },
          "totalScoreKeys": [
            "self_emotional_mastery",
            "professional_relationship_building",
            "professional_affairs_responsibility"
          ]
        }
      },
      {
        "name": "sample-mixed",
        "answers": [
          {
            "itemCode": "TSEC-01",
            "responseValue": "4"
          },
          {
            "itemCode": "TSEC-02",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-03",
            "responseValue": "4"
          },
          {
            "itemCode": "TSEC-04",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-05",
            "responseValue": "4"
          },
          {
            "itemCode": "TSEC-06",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-07",
            "responseValue": "4"
          },
          {
            "itemCode": "TSEC-08",
            "responseValue": "4"
          },
          {
            "itemCode": "TSEC-09",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-10",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-11",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-12",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-13",
            "responseValue": "6"
          },
          {
            "itemCode": "TSEC-14",
            "responseValue": "6"
          },
          {
            "itemCode": "TSEC-15",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-16",
            "responseValue": "6"
          },
          {
            "itemCode": "TSEC-17",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-18",
            "responseValue": "6"
          },
          {
            "itemCode": "TSEC-19",
            "responseValue": "6"
          },
          {
            "itemCode": "TSEC-20",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-21",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-22",
            "responseValue": "7"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_emotional_mastery": 4.5,
            "professional_relationship_building": 5,
            "professional_affairs_responsibility": 5.875
          },
          "totalScoreKeys": [
            "self_emotional_mastery",
            "professional_relationship_building",
            "professional_affairs_responsibility"
          ]
        }
      },
      {
        "name": "missing-subscale-item",
        "answers": [
          {
            "itemCode": "TSEC-01",
            "responseValue": "4"
          },
          {
            "itemCode": "TSEC-02",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-03",
            "responseValue": "4"
          },
          {
            "itemCode": "TSEC-04",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-05",
            "responseValue": "4"
          },
          {
            "itemCode": "TSEC-06",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-07",
            "responseValue": "4"
          },
          {
            "itemCode": "TSEC-08",
            "responseValue": "4"
          },
          {
            "itemCode": "TSEC-09",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-11",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-12",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-13",
            "responseValue": "6"
          },
          {
            "itemCode": "TSEC-14",
            "responseValue": "6"
          },
          {
            "itemCode": "TSEC-15",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-16",
            "responseValue": "6"
          },
          {
            "itemCode": "TSEC-17",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-18",
            "responseValue": "6"
          },
          {
            "itemCode": "TSEC-19",
            "responseValue": "6"
          },
          {
            "itemCode": "TSEC-20",
            "responseValue": "5"
          },
          {
            "itemCode": "TSEC-21",
            "responseValue": "7"
          },
          {
            "itemCode": "TSEC-22",
            "responseValue": "7"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "self_emotional_mastery": 4.5,
            "professional_relationship_building": null,
            "professional_affairs_responsibility": 5.875
          },
          "totalScoreKeys": [
            "self_emotional_mastery",
            "professional_relationship_building",
            "professional_affairs_responsibility"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
