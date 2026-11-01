import {participantPresentations as all} from './participant-presentation'
export const historicalPresentations=all.filter(p=>p.reportReading?.version!=='3.0.0')
export const reportRevision=all.find(p=>p.engineVersion==='1.1.0'&&p.reportReading?.version==='3.0.0')!
export const participantPresentations=[reportRevision]
