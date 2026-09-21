import { SDQ_TEACHER_EN_T4_10_V1_PACKAGE } from '../../packages/sdq-teacher-en-t4-10-v1'
import { SDQ_TEACHER_SCORER_KEY, sdqTeacherT410Scorer } from '../../packages/sdq-teacher-impact-scorer'
import type { ScalePackageV2, VersionedScorerRegistration } from '../types'

export const EXECUTABLE_SCALE_PACKAGE: ScalePackageV2 = SDQ_TEACHER_EN_T4_10_V1_PACKAGE
export const SCALE_SCORER_PLUGINS: readonly VersionedScorerRegistration[] = [{
  key: SDQ_TEACHER_SCORER_KEY,
  version: SDQ_TEACHER_EN_T4_10_V1_PACKAGE.definition.scoring.scoringVersion,
  scorer: sdqTeacherT410Scorer,
}]
