import { scientificGovernance as legacy } from './scientific.v1'
import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [...legacy, {
  schemaVersion: 1, testType: 'readingcomp', engineVersion: '1.1.0', scoringVersion: '1.1.0', declaredMaturity: 'PILOT', claimScope: null,
  protocolApplicability: '原创中文阅读理解四选一，18/30/36正式题，独立练习；只作本次任务描述。',
  knownLimitations: ['未建立常模、信效度或诊断效力。', '短程与长程不宣称测量等值；重复施测可能产生练习效应。', '阅读经验、设备输入和时限均可能影响表现；估计时长不是实测。'], evidence: [],
}]
