import { participantPresentations as allPresentations } from './participant-presentation'

// Integration compatibility export; registered declarations now retain old R and explicit R3.
export const participantPresentations = allPresentations.filter(p => p.reportReading?.version === '3.0.0')
