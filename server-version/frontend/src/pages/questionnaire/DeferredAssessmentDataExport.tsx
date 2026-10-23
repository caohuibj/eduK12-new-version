import { deferredAssessmentExport } from './deferredAssessmentExport'

const DeferredAssessmentDataExport = deferredAssessmentExport(() => import('./AssessmentDataExport').then(module => module.default))
export default DeferredAssessmentDataExport
