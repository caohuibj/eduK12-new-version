import { participantPresentations as allPresentations } from './participant-presentation'

// Original copy is materialized alongside its predecessor, selected by frozen reportVersion.
export const historicalPresentations = allPresentations.filter(p => p.reportReading?.version !== '3.0.0')
export const reportRevision = allPresentations.find(p => p.reportReading?.version === '3.0.0')!
export const participantPresentations = [reportRevision]
