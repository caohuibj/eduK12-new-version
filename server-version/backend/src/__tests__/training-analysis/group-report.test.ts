import {beforeEach, describe, expect, it, vi} from 'vitest'
vi.mock('../../config/database', () => ({prisma: {}}))
import {trainingGroupDisclosure} from '../../modules/training-analysis/group-report.service'
import {selectLatestTrainingGroupParents, trainingGroupFormDefinitions} from '../../modules/training-analysis/group-source'
import {summarizeGroupMetrics, type GroupMetricDefinition} from '../../modules/reporting/group-summary'

const numeric: GroupMetricDefinition = {key: 'score', label: '正式得分', type: 'NUMBER', measurement: {}, unit: null, range: null}
beforeEach(() => {vi.stubEnv('DATA_ENCRYPTION_KEY', 'b'.repeat(64))})
describe('Training policy over common group math', () => {
  it('keeps the existing five-person floor, hides small complements and choice cells in the public projection', () => {
    const ids = Array.from({length: 6}, (_, i) => `p${i}`)
    const rows = ids.map((parentId, i) => ({parentId, metricKey: 'score', value: i === 5 ? null : i - 2, missingReason: i === 5 ? 'UNANSWERED' : null, quality: null}))
    const result = trainingGroupDisclosure(summarizeGroupMetrics([numeric], rows, ids), ids.length)
    expect(result.completedN).toBeNull(); expect(result.metrics[0]).toMatchObject({state: 'present', validN: 5, missingN: null, mean: 0})
    const small = trainingGroupDisclosure(summarizeGroupMetrics([numeric], rows.slice(0, 4), ids.slice(0, 4)), 4)
    expect(small.metrics[0]).toMatchObject({state: 'suppressed', validN: null, mean: null, observedRange: null})
    const choice: GroupMetricDefinition = {...numeric, type: 'MULTIPLE', options: [{value: 'a', label: '阅读'}, {value: 'b', label: '讨论'}]}
    const choices = ids.map((parentId, i) => ({parentId, metricKey: 'score', value: i ? ['a'] : ['a', 'b'], missingReason: null, quality: null}))
    expect(trainingGroupDisclosure(summarizeGroupMetrics([choice], choices, ids), 6).metrics[0]).toMatchObject({validN: 6, frequencies: [], distributionSuppressed: true})
  })
  it('selects latest completed parents independently of an unfinished redo and does not link anonymous codes', () => {
    const rows = [{id: 'old', status: 'COMPLETED', completedAt: '2026-10-01'}, {id: 'latest', status: 'COMPLETED', completedAt: '2026-10-02'}, {id: 'draft', status: 'IN_PROGRESS', completedAt: null}, {id: 'anonymous1', status: 'COMPLETED', completedAt: '2026-10-02'}, {id: 'anonymous2', status: 'COMPLETED', completedAt: '2026-10-02'}]
    const identities = new Map(['old', 'latest', 'draft'].map(id => [id, {participantKey: 'user:actual'}]))
    expect(selectLatestTrainingGroupParents(rows, identities).map(row => row.id)).toEqual(['latest', 'anonymous1', 'anonymous2'])
  })
  it('expands matrix rows using frozen keys and excludes free text', () => {
    const field = {id: 'q', type: 'FORM', formSectionId: 'section', formType: 'matrix_multiple', formLabel: '活动', required: false, position: 0, formOptions: null, formPolicy: null, contextKey: null,
      formDefinition: {itemKey: 'activities', type: 'MATRIX_MULTIPLE', prompt: '活动', required: false, rows: [{rowKey: 'week1', label: '第一周'}, {rowKey: 'week2', label: '第二周'}], options: [{optionKey: 'a', label: '阅读'}, {optionKey: 'b', label: '讨论'}]}}
    expect(trainingGroupFormDefinitions(field).map(row => [row.key, row.type])).toEqual([['activities:week1', 'MULTIPLE'], ['activities:week2', 'MULTIPLE']])
    expect(trainingGroupFormDefinitions({...field, formType: 'long_text', formDefinition: {...field.formDefinition, type: 'LONG_TEXT', rows: [], options: []}})).toEqual([])
  })
})
