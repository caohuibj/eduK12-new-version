import {createSurveyTaskDraftRegistry} from './survey-task-draft-registry'
const registry=createSurveyTaskDraftRegistry('situational')
export const rememberSurveySituationalSession=registry.remember
export const clearSurveySituationalSessions=registry.clear
