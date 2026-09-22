import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "picturesequence",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "图片序列学习",
    "metrics": {
      "adjacentPairScore": {
        "label": "相邻顺序得分",
        "explanation": "最后一轮中相邻图片顺序正确的比例。",
        "singleExplanation": "最后一轮中相邻图片顺序正确的比例。"
      },
      "positionScore": {
        "label": "位置得分",
        "explanation": "最后一轮中图片处于正确位置的比例。",
        "singleExplanation": "最后一轮中图片处于正确位置的比例。"
      },
      "learningGain": {
        "label": "学习增益",
        "explanation": "最后一轮与第一轮的相邻顺序正确率之差。",
        "singleExplanation": "最后一轮与第一轮的相邻顺序正确率之差。"
      },
      "delayedRetention": {
        "label": "延迟保持变化",
        "explanation": "短延迟排序与最后一轮即时排序的相邻顺序正确率之差；未完成时不显示数值。",
        "singleExplanation": "短延迟排序与最后一轮即时排序的相邻顺序正确率之差；未完成时不显示数值。"
      },
      "adjacentPairScoreByRound": {
        "label": "各轮相邻顺序得分",
        "explanation": "按学习轮次列出相邻图片顺序正确的比例。",
        "singleExplanation": "按学习轮次列出相邻图片顺序正确的比例。"
      },
      "positionScoreByRound": {
        "label": "各轮位置得分",
        "explanation": "按学习轮次列出图片处于正确位置的比例。",
        "singleExplanation": "按学习轮次列出图片处于正确位置的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在图片序列学习中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用6 张图片、2 轮即时排序。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在图片序列学习中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用12 张图片、3 轮即时排序。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在图片序列学习中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用15 张图片、3 轮学习及短延迟排序。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "延迟保持只有在科研档延迟阶段实际完成时展示；缺失不等于低分。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "使用内部自制场景刺激，只反映本次序列学习表现，不等同 NIH PSM、临床诊断或人口常模。"
  }
]
