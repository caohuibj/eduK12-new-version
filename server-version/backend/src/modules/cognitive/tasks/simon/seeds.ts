import type { CognitiveSeed } from '../../task-seed.types'
import { SIMON_CONFIG } from './schema'
export const seeds: CognitiveSeed[] = [{ testType: 'simon', configVersion: '1.0.0', name: 'Simon [INTERNAL PILOT]', status: 'DRAFT', engineVersion: '1.0.0', scoringVersion: '1.0.0', config: SIMON_CONFIG }]
