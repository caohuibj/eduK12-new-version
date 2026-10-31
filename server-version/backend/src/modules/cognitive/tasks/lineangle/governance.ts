import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

// Materialized declaration: existing exported values are preserved.
export const catalog: CognitiveLibraryCatalogEntry = {
  "testType": "lineangle",
  "educationalPurpose": "看目标线段的朝向，从选项里挑出方向完全一样的那一条。",
  "plainAbilityHint": "线段朝向的知觉分辨",
  "interactionFamily": "multi_option_selection",
  "rtSensitivity": "high",
  "fineMotorSensitivity": "low",
  "adminScientificNotes": "线条方向匹配范式（Judgment of Line Orientation 结构，Benton et al. 1983）；主要构念为视空间知觉；与心理旋转（imagery）不同构念。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载难度差异（angleStepDeg、optionCount、minAngleSepSteps），不得改动 scoringVersion 阈值或 presentationVersion 文案。",
  "knownLimitations": [
    "屏幕比例与线段渲染宽度影响角度感知。",
    "选项数量与角度步长由 frozen config 决定，跨 config 不可比。",
    "2.0.0是项目自开发无向线段平行匹配，不是Benton标准JLO；不采用其题本或常模。"
  ],
  "sourceNotes": [
    "Benton, Hannay & Varney (1983) Judgment of Line Orientation 结构。",
    "范式来源核对：https://www.parinc.com/products/BENTON；仅作概念区分，未复制商业刺激材料。"
  ],
  "rightsProvenance": "internal-generated"
}
