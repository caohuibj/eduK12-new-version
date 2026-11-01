import { validateAssessmentBundleDefinition } from '../definition'
import { CHEXI_IDENTITY } from '../../scale/packages/chexi-zh-hans-v1'

/** Two reporter configurations, one instrument and scoring definition. */
export function childChexiObserverDefinition(reporter: 'PARENT' | 'TEACHER') {
  return validateAssessmentBundleDefinition({
    schemaVersion: 1,
    bundleKey: `child_chexi_${reporter.toLowerCase()}_zh_cn_v1`, bundleVersion: '0.1.0',
    status: 'DRAFT', category: 'observer',
    name: reporter === 'PARENT' ? '儿童执行功能 家长观察' : '儿童执行功能 教师观察',
    description: reporter === 'PARENT' ? '家长描述家庭及日常生活中所见的儿童行为；共用官方CHEXI题本。' : '教师描述课堂及学校活动中所见的儿童行为；共用官方CHEXI题本。',
    respondentTypes: [reporter], initiationModes: reporter === 'PARENT' ? ['TEACHER_ASSIGNMENT', 'PARENT_SELF_SERVE'] : ['TEACHER_ASSIGNMENT'],
    population: { subjectPopulation: 'youth', subjectMinAgeYears: 4, subjectMaxAgeYears: 12 },
    slots: [{ slotKey: 'chexi', unitType: 'SCALE', position: 1, required: true,
      instrumentKey: CHEXI_IDENTITY.instrumentKey, instrumentVersion: CHEXI_IDENTITY.instrumentVersion,
      respondentType: reporter, valueSelectors: ['working_memory', 'inhibition'] },
      { slotKey: 'subject_context', unitType: 'FORM', position: 0, required: true,
        instrumentKey: 'child_observer_subject_context', instrumentVersion: '1.0.0', respondentType: reporter }],
    engine: { key: 'scale-evidence-v1', version: '1.0.0' },
    contextDefinitionKey: 'child_observer_subject_context', contextDefinitionVersion: '1.0.0',
    reportDefinitionKey: 'scale-evidence-report-v1', reportDefinitionVersion: '1.0.0',
    publicationRequirements: { scientificGate: true, rightsGate: true, languageGate: true, reportGate: true, safetyGate: false, nonCommercialOnly: false },
    rightsRequirements: { required: true, instrumentKeys: [CHEXI_IDENTITY.instrumentKey] },
    safetyCapability: { safetyCapable: false, productionTriggerEnabled: false },
    limitations: [
      '量表内容与计分共享；观察者角色、情境、同意和报告访问权限不能合并。',
      '儿童本人完成认知任务，家长或教师完成本表；不把观察者的认知表现当成儿童表现。',
      '保留同一儿童的subjectUserId及各自真实respondentUserId；出生年月描述儿童本人。',
      '4至12岁是CHEXI观察表范围，不是所选认知任务各年龄均已验证的证据。',
      '只报告原量尺均分，不提供诊断、IQ、能力等级或跨方法总分。',
    ],
  })
}
