import { describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({query:vi.fn(),load:vi.fn(),canonical:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:mocks.query}}))
vi.mock('../../modules/assessment-runtime/public-templates',()=>({publicTemplates:{loadMany:mocks.load}}))
vi.mock('../../modules/assessment-runtime/compact-assessment-storage',()=>({loadStoredCanonicalUnitResults:mocks.canonical,resolveStoredScaleResult:vi.fn(),preloadStoredScaleResults:vi.fn()}))
import { restoreCompactQuestionnaireReport } from '../../modules/reporting/compact-questionnaire-report'
import { buildQuestionnaireCollectionReportFromUnifiedInput } from '../../modules/reporting/questionnaire-collection-report'

describe('compact questionnaire matched feedback reconstruction',()=>{
  it('passes frozen matched feedback and verified source id from canonical envelope, not a current definition',async()=>{
    const matches=[{scoreKey:'total',rangeKey:'upper',text:'冻结文字'}]
    mocks.load.mockResolvedValue([{variant:'QUESTIONNAIRE_UNIFIED',version:1,questionnaireName:'Q',scales:[{itemId:'slot',scaleId:'s',scaleCode:'S',scaleName:'S'}]}])
    mocks.query.mockResolvedValue([{sourceAttemptId:'actual-assessment',encrypted:'stored-envelope'}])
    mocks.canonical.mockResolvedValue([{resultHash:'a'.repeat(64),completedAt:'2026-10-21T00:00:00.000Z',core:{instrumentKey:'S',instrumentVersion:'1',compiledRuntimeHash:'b'.repeat(64),quality:{status:'interpretable',flags:[]},metrics:[{key:'total',value:4,quality:'calculated'}],references:[]},bundleBridge:{rawScoreFeedback:matches,reportAudience:'student'}}])
    const report=await restoreCompactQuestionnaireReport({kind:'QUESTIONNAIRE_REPORT_FACTS',version:1,assessmentId:'parent',attemptEpoch:1,aggregateInputHash:'c'.repeat(64),layout:'layout',units:[{sourceAttemptId:'actual-assessment',resultHash:'a'.repeat(64)}],backgroundValues:[]},{id:'parent',attemptEpoch:1,aggregateInputHash:'c'.repeat(64)},buildQuestionnaireCollectionReportFromUnifiedInput)
    expect(report.scaleReports[0]).toMatchObject({assessmentId:'actual-assessment',rawScoreFeedback:matches,method:{reportAudience:'student'},scores:[{key:'total',value:4}]})
    expect(mocks.canonical).toHaveBeenCalledWith(['stored-envelope'])
  })
})
