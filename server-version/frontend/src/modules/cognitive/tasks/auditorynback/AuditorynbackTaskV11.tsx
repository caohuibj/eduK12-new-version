import type { CognitiveTaskProps } from '../../core/runner.types'
import { AuditorynbackTask } from './AuditorynbackTask'

/** Same UI and timing; only the versioned formal sequence changes. */
export const AuditorynbackTaskV11 = (props: CognitiveTaskProps) => <AuditorynbackTask {...props} fixedTargetCount />
