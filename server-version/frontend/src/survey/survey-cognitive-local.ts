import {createSurveyTaskDraftRegistry} from './survey-task-draft-registry'
const registry=createSurveyTaskDraftRegistry('cognitive')
export const rememberSurveyCognitiveSession=registry.remember
export const clearSurveyCognitiveSessions=registry.clear
export const clearSurveyCognitiveSession=registry.clearOne
export const readSurveyCognitiveSessionIds=registry.readIds
