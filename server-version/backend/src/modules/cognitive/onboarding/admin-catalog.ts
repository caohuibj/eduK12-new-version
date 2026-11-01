import { cognitiveSeeds } from '../generated/seeds'
import { getCognitiveRegistryEntry } from '../cognitive.registry'
import type { CognitiveInstallRow } from './install'

/** Reuse the code-owned seed/registry declarations. No second approval list.
 * Missing execution metadata remains visible and is blocked by the installer. */
export function listCognitiveDraftInstallCandidates() {
  return cognitiveSeeds.filter(seed => seed.testType !== 'fake' && seed.status === 'DRAFT'
    && getCognitiveRegistryEntry(seed.testType, seed.engineVersion, seed.scoringVersion)?.recommendedForCreate !== false)
    .map(({ testType, configVersion, engineVersion, scoringVersion }) => ({ testType, configVersion, engineVersion, scoringVersion }))
}

/** Read-only issue notes for currently unregistered PR441 material. These notes
 * neither authorize nor block installation of code-registered configurations. */
export const pendingCognitiveInstallCandidates = [
  {testType: 'wordanalogy', sourcePR: 441, reasons: ['练习题与正式题共用题池，科研版用尽题量；需核定独立练习方案。']},
  {testType: 'wordmeaning', sourcePR: 441, reasons: ['练习题与正式题共用题池，科研版用尽题量；需核定独立练习方案。']},
  {testType: 'wordproblem', sourcePR: 441, reasons: ['科研版36题超过现有24题，且练习题未隔离。']},
  {testType: 'logicdeduce', sourcePR: 441, reasons: ['科研版36题超过现有24题，且练习题未隔离。']},
  {testType: 'seriescomplete', sourcePR: 441, reasons: ['科研版36题超过现有24题，且练习题未隔离。']},
  {testType: 'readingcomp', sourcePR: 441, reasons: ['现有16题不足体验18/科研36题；界面缺问题文本，说明和练习隔离仍需修订。']},
  {testType: 'proofread', sourcePR: 441, reasons: ['科研版36题超过现有24题；说明和练习隔离仍需修订。']},
  {testType: 'cogest', sourcePR: 441, reasons: ['科研版36题超过现有24题；说明和练习隔离仍需修订。']},
  {testType: 'lineangle', sourcePR: 441, reasons: ['0°与180°显示为相同无方向水平线，但按不同答案计分；需设计修订。']},
  {testType: 'sharegame', sourcePR: 441, reasons: ['超时被记为真实给出0，缺失与零值尚未区分。']},
  {testType: 'embeddedfigures', sourcePR: 441, reasons: ['目标预览保留位置线索，冻结题与生成题的干扰规则不同；需设计审阅。']},
  {testType: 'icarmatrix', sourcePR: 441, reasons: ['原分支混有v1/v2及新题库体系，尚需确定本轮精确版本与题库范围。']},
] as const

export type CognitiveInstallIdentity = Pick<CognitiveInstallRow, 'testType' | 'configVersion' | 'engineVersion' | 'scoringVersion'>
export const sameCognitiveInstallIdentity = (a: CognitiveInstallIdentity, b: CognitiveInstallIdentity): boolean =>
  a.testType === b.testType && a.configVersion === b.configVersion && a.engineVersion === b.engineVersion && a.scoringVersion === b.scoringVersion
