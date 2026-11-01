import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'reversallearning',
    educationalPurpose: '根据反馈学会哪边更"划算"，并在规则反转后重新学习。',
    plainAbilityHint: '根据反馈调整选择',
    interactionFamily: 'button_choice',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '概率反转学习；v1 taxonomy 无对应 domain，standalone；强化学习建模留待科研。',
    knownLimitations: [
      '不作人格、风险偏好或决策能力判断。',
      '未达 criterion 时指标解释受限。',
    ],
    sourceNotes: ['Cools et al. (2002), DOI 10.1523/JNEUROSCI.22-11-04563.2002, https://pmc.ncbi.nlm.nih.gov/articles/PMC6758810/；实际核Materials and Methods。原单侧误导负反馈不等于双选项80/20；本项目固定一次反转为变式。'],
    rightsProvenance: 'internal-generated',
  }
