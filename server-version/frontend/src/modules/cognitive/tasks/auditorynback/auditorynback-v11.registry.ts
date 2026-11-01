import { deferredCognitiveRunner } from '../../core/deferred-runner'
import { auditorynbackRegistryEntry } from './auditorynback.registry'
const Runner = deferredCognitiveRunner(() => import('./AuditorynbackTaskV11').then(module => module.AuditorynbackTaskV11))
export const auditorynbackV11RegistryEntry = {
  ...auditorynbackRegistryEntry,
  engineVersion: '1.1.0',
  scoringVersion: '1.1.0',
  RunnerComponent: Runner,
  prepareRunner: Runner.prepare,
}
