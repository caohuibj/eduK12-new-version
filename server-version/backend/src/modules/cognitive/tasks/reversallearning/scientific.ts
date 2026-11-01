import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "reversallearning",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "反转成本和 criterion 达成率受反馈概率、阶段长度、策略和任务理解影响。",
        "criterion 未达到时相关指标必须保持缺失，不得解释为零分或稳定人格特征。",
        "PILOT 阶段不输出人格、冲动性、风险偏好、学习能力等级或诊断结论。"
    ],
    "evidence": []
  }
]

scientificGovernance.push({
  ...scientificGovernance[0], engineVersion: '1.1.0', declaredMaturity: 'PILOT', claimScope: null,
  protocolApplicability: '项目固定一次反转变式；文献核对不是本项目信效度证据。',
  knownLimitations: [...scientificGovernance[0].knownLimitations,
    'Cools et al. 2002 DOI 10.1523/JNEUROSCI.22-11-04563.2002：原方法为正确选择上的误导负反馈，不规定错选20%正反馈；本项目保留0.8/0参数，不声称该固定概率就是原协议。',
    '新版统一负反馈和500毫秒呈现，不透露反转阶段；研究档30题无反转练习与2秒响应对齐已核方法。',
    '原研究多组且按正确选择次数安排多次反转与特定负反馈串；本项目240题固定120/120，不支持该自适应阶段表，仍非原研究复刻。'],
})
