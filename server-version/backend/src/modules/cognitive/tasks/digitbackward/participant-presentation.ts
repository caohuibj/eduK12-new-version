import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "digitbackward",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "数字倒背",
    "metrics": {
      "maxSpan": {
        "label": "最大倒背广度",
        "explanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
        "singleExplanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
        "displayUnit": "位"
      },
      "totalCorrectTrials": {
        "label": "正确试次总数",
        "explanation": "正确试次数：本次正式测验中完整答对的试次数。",
        "singleExplanation": "正确试次数：本次正式测验中完整答对的试次数。"
      },
      "sequenceDistance": {
        "label": "平均序列距离",
        "explanation": "输入序列与正确倒序序列之间的平均距离，越小表示本次还原越接近目标。",
        "singleExplanation": "输入序列与正确倒序序列之间的平均距离，越小表示本次还原越接近目标。"
      },
      "medianResponseDurationMs": {
        "label": "中位作答时长",
        "explanation": "各次输入作答时长的中位数。",
        "singleExplanation": "各次输入作答时长的中位数。"
      },
      "completedLevelCount": {
        "label": "完成级数",
        "explanation": "本次完成的数字长度级数。",
        "singleExplanation": "本次完成的数字长度级数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在数字倒背中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用2–4 位数字。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在数字倒背中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用2–7 位数字。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在数字倒背中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用2–8 位数字。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "倒背要求在短时保持之外进行顺序操作，应与顺背结果分开阅读。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只反映本次数字倒背任务表现，不是完整工作记忆、Wechsler 等价值或年龄常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "记下来，再把顺序倒过来",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次，把数字倒过来复述时，你正确完成的最长一串是 {maxSpan}。",
        "metricKeys": [
          "maxSpan"
        ]
      },
      "studentMetricKeys": [
        "maxSpan",
        "totalCorrectTrials",
        "completedLevelCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCompletedLevels"
      ],
      "metricGates": {},
      "nextStep": "倒背与顺背分别解释，不能拼成智商或一般工作记忆分。",
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议",
        "maxSpan": "本次最长正确序列长度",
        "人口常模": "经过验证的同龄人比较依据",
        "常模等级": "经过验证的同龄人等级",
        "年龄等级": "年龄对应的能力等级",
        "稳定能力等级": "固定的能力水平",
        "内部配置": "这次任务设置",
        "正式档": "标准任务",
        "体验档": "简短体验",
        "标准协议": "标准任务",
        "短程协议": "简短体验"
      },
      "illustration": "sequence",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "倒序复述不仅要留下数字，还要调整它们的顺序。任务观察这次你在“保留”与“重排”两步中的实际记录。",
        "takeaway": "记住，是起点；重排，是下一步。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "听到信息后换一种顺序整理、在脑中重新排列步骤，需要保留并操作信息。日常任务还可以借助纸笔，不必把这个长度当成固定能力上限。",
        "scene": "sequence",
        "frames": [
          {
            "title": "接收信息",
            "text": "看到一组内容与它的先后。"
          },
          {
            "title": "保留与整理",
            "text": "在脑中留下线索，按要求处理。"
          },
          {
            "title": "复现与核对",
            "text": "比较本次答案与任务规则。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "maxSpan": {
            "label": "这次最长记住的序列",
            "explanation": "按任务要求正确复现的最长一串；不代表你日常记忆的固定上限。"
          },
          "totalCorrectTrials": {
            "label": "正确复现了多少次",
            "explanation": "本次按要求完整答对的次数。"
          },
          "completedLevelCount": {
            "label": "尝试过的长度",
            "explanation": "本次实际进行过的序列长度层数，不是能力等级。"
          }
        }
      },
      "professional": {
        "construct": "数字倒序广度中的短时保持与序列操作",
        "procedure": "按冻结长度规则呈现数字，要求倒序复述；最长正确序列来自实际正确试次。",
        "interpretation": "倒序广度是特定任务容量记录，需结合尝试数量、停止规则和配置上限解释，不作一般工作记忆等级。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "maxSpan": {
            "definition": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
            "readingHint": "受起始长度、升级、停止和配置上限限制；不是一般能力上限。"
          },
          "totalCorrectTrials": {
            "definition": "正确试次数：本次正式测验中完整答对的试次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "sequenceDistance": {
            "definition": "输入序列与正确倒序序列之间的平均距离，越小表示本次还原越接近目标。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianResponseDurationMs": {
            "definition": "各次输入作答时长的中位数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "completedLevelCount": {
            "definition": "本次完成的数字长度级数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          },
          {
            "key": "blockCount",
            "label": "区组数"
          },
          {
            "key": "startLength",
            "label": "起始序列长度"
          },
          {
            "key": "maxLength",
            "label": "配置长度上限"
          },
          {
            "key": "trialsPerLevel",
            "label": "每长度尝试数"
          },
          {
            "key": "nLevels",
            "label": "N-back 难度"
          },
          {
            "key": "trialCountByN",
            "label": "各 N 计划试次数"
          },
          {
            "key": "learningRounds",
            "label": "即时学习轮数"
          },
          {
            "key": "pairCount",
            "label": "配对数量"
          },
          {
            "key": "delayedEnabled",
            "label": "是否包含延迟阶段"
          }
        ]
      }
    }
  }
]
