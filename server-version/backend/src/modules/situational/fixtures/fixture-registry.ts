import { STANDARDIZED_SITUATIONAL_E2E_PACKAGE, HISTORY_SITUATIONAL_E2E_PACKAGE, PERFORMANCE_SITUATIONAL_E2E_PACKAGES } from './standardized-e2e-fixture'
import type { SituationPackage } from '../situation-package'
import { SJT_STATIC_VISUAL_E2E_PACKAGE } from '../packages/sjt-static-visual-e2e-fixture'
import { SJT_BRANCHING_E2E_PACKAGE } from '../packages/sjt-branching-e2e-fixture'
import { SJT_VIDEO_E2E_PACKAGE } from '../packages/sjt-video-e2e-fixture'
/** Existing explicitly enabled E2E fixtures remain outside production discovery. */
export const listEnabledSituationalFixtures = (): SituationPackage[] => [
  ...(process.env.NODE_ENV === 'test' && process.env.SITUATIONAL_VNEXT_E2E_FIXTURE === 'true' ? [STANDARDIZED_SITUATIONAL_E2E_PACKAGE, HISTORY_SITUATIONAL_E2E_PACKAGE, ...PERFORMANCE_SITUATIONAL_E2E_PACKAGES] : []),
  ...(process.env.SITUATIONAL_STATIC_VISUAL_FIXTURE === 'true' ? [SJT_STATIC_VISUAL_E2E_PACKAGE] : []),
  ...(process.env.SITUATIONAL_BRANCHING_E2E_FIXTURE === 'true' ? [SJT_BRANCHING_E2E_PACKAGE] : []),
  ...(process.env.SITUATIONAL_VIDEO_E2E_FIXTURE === 'true' ? [SJT_VIDEO_E2E_PACKAGE] : []),
]
