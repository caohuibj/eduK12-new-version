import {
  COGNITIVE_RESPONSE_INHIBITION_V1, INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
  INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1, WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
  SDQ_PARENT_OBSERVER_ZH_CN_V1, SDQ_TEACHER_OBSERVER_ZH_CN_V1,
  TEXI_PARENT_OBSERVER_ZH_CN_V1, TEXI_TEACHER_OBSERVER_ZH_CN_V1,
} from '../assessment-bundle'
import { BundleDefinitionProvider, type BundleReportDefinition } from './definition-provider'

const reports: BundleReportDefinition[] = [
  { key:'cognitive-domain-report-v1', version:'1.0.0', title:'认知领域描述性结果',
    sections:{summary:'领域结果',quality:'结果质量',evidence:'单项依据',limitations:'解释范围'} },
  { key:'scale-evidence-report-v1', version:'1.0.0', title:'量表描述性结果',
    sections:{summary:'结果概述',quality:'结果质量',evidence:'单项依据',limitations:'解释范围'} },
  { key:'integrated-evidence-report-v1', version:'1.0.0', title:'跨方法描述性结果',
    sections:{summary:'互补描述',quality:'结果质量',evidence:'单项依据',limitations:'解释范围'} },
]

/** Only this composition root knows individual code-defined Bundle files.
 * B3 can replace the source loader without changing production consumers.
 * Current DRAFT statuses are deliberately preserved; catalog registration is not publication.
 */
export function createCodeBundleDefinitionProvider(): BundleDefinitionProvider {
  return new BundleDefinitionProvider([
    COGNITIVE_RESPONSE_INHIBITION_V1, INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
    WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1, SDQ_PARENT_OBSERVER_ZH_CN_V1,
    SDQ_TEACHER_OBSERVER_ZH_CN_V1, TEXI_PARENT_OBSERVER_ZH_CN_V1, TEXI_TEACHER_OBSERVER_ZH_CN_V1,
  ].map(definition => {
    const reportDefinition = reports.find(report=>report.key===definition.reportDefinitionKey && report.version===definition.reportDefinitionVersion)
    if(!reportDefinition) throw new Error('BUNDLE_REPORT_DEFINITION_MISSING')
    const contextDefinition = definition.contextDefinitionKey === null ? null :
      [INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1].find(context =>
        context.contextDefinitionKey === definition.contextDefinitionKey &&
        context.contextDefinitionVersion === definition.contextDefinitionVersion)
    if (contextDefinition === undefined) throw new Error('BUNDLE_CONTEXT_DEFINITION_MISSING')
    return {definition,contextDefinition,reportDefinition,ruleSet:null}
  }))
}
