import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    scale: { findUnique: vi.fn() },
    assessment: { findMany: vi.fn() },
    questionnaire: { findUnique: vi.fn() },
    questionnaireAssessment: { findMany: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { encryptScaleAnswers, readScaleAnswers } from '../../modules/scale/scale-workflow.service'
import { getQuestionnaireExportData, getScaleExportData } from '../../services/exportService'
import {
  getQuestionnaireExportData as getInternalQuestionnaireExportData,
  getScaleExportData as getInternalScaleExportData,
  serializeCsv,
} from '../../services/exportService.legacy'

const definition = {
  items: [{ itemCode: 'Q1', content: '题目 1' }],
  scoring: { scores: [{ key: 'total', label: '总分' }] },
}

const provenance = {
  schemaVersion: 1 as const,
  deviceClass: 'TABLET' as const,
  osFamily: 'Android' as const,
  browserFamily: 'Chrome' as const,
  viewportWidth: 1024,
  viewportHeight: 768,
  screenWidth: 1280,
  screenHeight: 800,
  devicePixelRatio: 1.25,
  maxTouchPoints: 5,
  primaryPointer: 'COARSE' as const,
  capturedAt: '2026-09-08T00:00:00.000Z',
}

const encodedAnswers = encryptScaleAnswers([
  { itemCode: 'Q1', responseValue: 'yes', responseTimeMs: 1234 },
], provenance)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Scale response and device provenance export', () => {
  it('round trips quality raw choices and exports the author codebook without an item score', async () => {
    const qualityDefinition = { ...definition,
      responseSets: [{key:'likert',options:[{value:'yes',label:'是',score:1},{value:'=1+1',label:'否, "确认"',score:2}]}],
      items: [...definition.items,
        {itemCode:'AC',content:'点击 yes',purpose:'ATTENTION_CHECK',attentionTarget:'yes',responseSetKey:'likert'},
        {itemCode:'SD',content:'我从不撒谎',purpose:'SOCIAL_DESIRABILITY',responseSetKey:'likert'}],
    }
    const raw = [{itemCode:'Q1',responseValue:'yes'}, {itemCode:'AC',responseValue:'=1+1'}, {itemCode:'SD',responseValue:'yes'}]
    const encrypted = encryptScaleAnswers(raw)
    expect(readScaleAnswers(encrypted).answers).toEqual(raw)
    mockPrisma.scale.findUnique.mockResolvedValue({id:'scale-1',name:'测试',code:'adexi_v1',instrumentVersion:'2.0.0',definition:qualityDefinition})
    mockPrisma.assessment.findMany.mockResolvedValue([{userId:'user-1',user:null,totalTime:1000,completedAt:null,status:'COMPLETED',answers:encrypted,result:null}])
    const exported = await getInternalScaleExportData('scale-1')
    expect(exported.rows[0]).toMatchObject({Q_V_ac:'=1+1',Q_V_sd:'yes',Q_S_ac:null,Q_S_sd:null})
    const metadata = JSON.parse(exported.rows[0].Q_META_ac)
    expect(metadata).toMatchObject({itemCode:'AC',purpose:'ATTENTION_CHECK',attentionTarget:'yes',prompt:'点击 yes',scored:false,
      options:[{value:'yes',label:'是'},{value:'=1+1',label:'否, "确认"'}]})
    expect(metadata.options[0]).not.toHaveProperty('score')
    expect(serializeCsv(exported.fields, exported.rows)).toContain("\"'=1+1\"")
    mockPrisma.questionnaire.findUnique.mockResolvedValue({id:'questionnaire-1',formItems:[],questionnaireScales:[{scale:{id:'scale-1',name:'测试',code:'adexi_v1',definition:qualityDefinition}}]})
    mockPrisma.questionnaireAssessment.findMany.mockResolvedValue([{userId:null,user:null,totalTime:null,completedAt:null,formAnswers:[],scaleAssessments:[{scaleId:'scale-1',status:'COMPLETED',answers:encrypted,result:null}]}])
    const questionnaire = await getInternalQuestionnaireExportData('questionnaire-1')
    expect(questionnaire.rows[0]).toMatchObject({S1_Q_V_ac:'=1+1',S1_Q_S_ac:null,S1_Q_V_sd:'yes',S1_Q_S_sd:null})
    expect(JSON.parse(questionnaire.rows[0].S1_Q_META_ac)).toEqual(metadata)

    expect(JSON.parse(exported.rows[0].Q_META_sd)).not.toHaveProperty('attentionTarget')
    const projected = await getScaleExportData('scale-1')
    expect(projected.fields.some(field=>field.name.startsWith('Q_META_')||field.name.startsWith('Q_V_'))).toBe(false)
  })
  it('keeps provenance in the internal export dataset but removes it from the default teacher projection', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue({
      id: 'scale-1',
      name: '测试量表',
      code: 'adexi_v1',
      instrumentVersion: '2.0.0',
      definition,
    })
    mockPrisma.assessment.findMany.mockResolvedValue([{
      userId: 'user-1',
      user: null,
      totalTime: 5000,
      completedAt: new Date('2026-09-08T00:01:00.000Z'),
      status: 'COMPLETED',
      answers: encodedAnswers,
      result: null,
    }])

    const internal = await getInternalScaleExportData('scale-1')
    expect(internal.rows[0]).toMatchObject({
      DEVICE_CLASS: 'TABLET',
      DEVICE_OS_FAMILY: 'Android',
      DEVICE_BROWSER_FAMILY: 'Chrome',
      DEVICE_VIEWPORT_WIDTH: 1024,
      DEVICE_SCREEN_HEIGHT: 800,
      DEVICE_PRIMARY_POINTER: 'COARSE',
      DEVICE_CAPTURED_AT: '2026-09-08T00:00:00.000Z',
      RT_q1: 1234,
    })

    const projected = await getScaleExportData('scale-1')
    const names = projected.fields.map((field) => field.name)
    expect(names).not.toEqual(expect.arrayContaining([
      'DEVICE_CLASS',
      'DEVICE_OS_FAMILY',
      'DEVICE_BROWSER_FAMILY',
      'DEVICE_VIEWPORT_WIDTH',
      'DEVICE_SCREEN_HEIGHT',
      'DEVICE_PRIMARY_POINTER',
      'DEVICE_CAPTURED_AT',
      'RT_q1',
      'Q_V_q1',
    ]))
    expect(JSON.stringify(projected.rows[0])).not.toContain('TABLET')
    expect(JSON.stringify(projected.rows[0])).not.toContain('1234')
    expect(JSON.stringify(projected.rows[0])).not.toContain('yes')
  })

  it('keeps questionnaire provenance internally while the audience-safe export strips raw response provenance', async () => {
    mockPrisma.questionnaire.findUnique.mockResolvedValue({
      id: 'questionnaire-1',
      formItems: [],
      questionnaireScales: [{
        scale: { id: 'scale-1', name: '测试量表', code: 'adexi_v1', instrumentVersion: '2.0.0', definition },
      }],
    })
    mockPrisma.questionnaireAssessment.findMany.mockResolvedValue([{
      userId: null,
      user: null,
      totalTime: null,
      completedAt: null,
      contextSnapshotHash: null,
      formAnswers: [],
      scaleAssessments: [
        { scaleId: 'scale-1', status: 'COMPLETED', answers: encodedAnswers, result: null },
      ],
    }])

    const internal = await getInternalQuestionnaireExportData('questionnaire-1')
    expect(internal.rows[0]).toMatchObject({
      S1_DEVICE_CLASS: 'TABLET',
      S1_DEVICE_CAPTURED_AT: '2026-09-08T00:00:00.000Z',
      S1_RT_q1: 1234,
    })

    const projected = await getQuestionnaireExportData('questionnaire-1')
    expect(projected.fields.map((field) => field.name)).not.toEqual(expect.arrayContaining([
      'S1_DEVICE_CLASS',
      'S1_DEVICE_CAPTURED_AT',
      'S1_RT_q1',
      'S1_Q_V_q1',
    ]))

    mockPrisma.questionnaireAssessment.findMany.mockResolvedValueOnce([{
      userId: null,
      user: null,
      totalTime: null,
      completedAt: null,
      contextSnapshotHash: null,
      formAnswers: [],
      scaleAssessments: [{ scaleId: 'scale-1', status: 'COMPLETED', answers: encryptScaleAnswers([{ itemCode: 'Q1', responseValue: 'yes' }]), result: null }],
    }])
    const historicalInternal = await getInternalQuestionnaireExportData('questionnaire-1')
    expect(historicalInternal.rows[0].S1_DEVICE_CLASS).toBeNull()
    expect(historicalInternal.rows[0].S1_RT_q1).toBeNull()
  })
})
