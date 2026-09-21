// Compatibility import only; instrument-owned JSON is the single content source.
import content from '../instruments/sjt-responsibility-golden/1.0.0/instrument.json'
import publication from '../instruments/sjt-responsibility-golden/1.0.0/publication.json'
import type { SituationDefinitionV1 } from '../situation-definition'
import type { SituationalGoldenCase } from '../situation-scoring'
import type { SituationPackageV1 } from '../situation-package'
export const SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_DEFINITION = content.definition as SituationDefinitionV1
export const SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_GOLDEN_CASES = content.goldenCases as SituationalGoldenCase[]
export const SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE: SituationPackageV1 = {
  key: content.identity.instrumentKey, instrumentVersion: content.identity.instrumentVersion,
  definition: SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_DEFINITION, goldenCases: SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_GOLDEN_CASES,
  releaseStatus: publication.releaseStatus as SituationPackageV1['releaseStatus'], scienceMaturity: 'PILOT',
}
