import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'embeddedfigures',
  educationalPurpose: '先记住目标轮廓，再选择包含同形同大小同方向轮廓的复杂线条图块。',
  plainAbilityHint: '在复杂背景中保持简单形状',
  interactionFamily: 'position_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes:'1.1.0为自编七选择线条背景匹配。目标边延伸进入背景，七个图块均同线数与样式；不复制GEFT/L-EFT题图。6/10/16正式题共用规则，练习独立。旧1.0.0仅保留冻结历史读取，不直接比较版本间用时或正确率。',
  knownLimitations:['自编刺激未做难度、信效度或年龄常模标定。','七选择、短时目标保持和设备操作共同影响表现；不是标准EFT原版。'],
  sourceNotes:['范式参考：de-Wit et al. (2017), Developing the Leuven Embedded Figures Test, PeerJ5:e2862, https://doi.org/10.7717/peerj.2862。仅参考嵌入/线条延伸与匹配方法，未使用其刺激或常模。'],
  rightsProvenance:'internal-generated：本项目原创程序线条；未搬用商业测验题图。',
}
