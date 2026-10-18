import { canonicalHash } from '../assessment-runtime/canonical'
import { mapCompositeSection, compositeFormSectionDefinitionHash } from '../assessment-runtime/form-section-definition'
import { typedCompositeFormQuestion, validateTypedCompositeSectionDefinition } from '../assessment-runtime/typed-form'
import { trainingFlowUnitKey, trainingFlowItemKey, type TrainingFlowUnit } from '../assessment-core/flow/training'
import { compositeBadRequest } from './composite.errors'

/** The same immutable candidate identity is used by authoring, publication and
 * runtime. A whole Form section is one unit; legacy fields may execute but do
 * not gain invented stable answer keys for branch conditions. */
export function buildTrainingFlowUnits(composite: any): TrainingFlowUnit[] {
  const items: any[] = composite.items ?? []
  const sections: any[] = composite.formSections ?? []
  const assigned = new Set<string>()
  const units: Array<TrainingFlowUnit & { position: number }> = sections.map(section => {
    const definition = mapCompositeSection({ ...section, items: section.items ?? items.filter(item => item.formSectionId === section.id) })
    if (!definition.items.length) throw compositeBadRequest('流程不能包含空表单区段')
    for (const child of definition.items) {
      const source = items.find(item => item.id === child.id)
      if (!source || source.type !== 'FORM' || source.formSectionId !== section.id || assigned.has(child.id)) {
        throw compositeBadRequest('流程表单区段与内容项归属不一致')
      }
      assigned.add(child.id)
    }
    validateTypedCompositeSectionDefinition(definition.items)
    const questions = definition.items.filter(item => item.formDefinition != null).map(typedCompositeFormQuestion)
    return { instrumentKey: trainingFlowUnitKey(section.id), kind: 'FORM', required: true,
      position: definition.position, definitionHash: compositeFormSectionDefinitionHash(definition),
      displayDefinition: { pages: [{ questions }] } }
  })
  for (const item of items) {
    if (item.type === 'FORM') {
      if (!assigned.has(item.id)) throw compositeBadRequest('流程表单字段缺少完整区段')
      continue
    }
    if (!['SCALE', 'COGNITIVE', 'SITUATIONAL'].includes(item.type)) throw compositeBadRequest('流程包含不支持的工具类型')
    if (item.required !== true) throw compositeBadRequest('跨工具流程暂不支持选填的量表、认知或情境工具')
    units.push({ instrumentKey: trainingFlowItemKey(item.id), kind: item.type === 'SITUATIONAL' ? 'SJT' : item.type,
      required: true, position: item.position,
      definitionHash: canonicalHash({ id: item.id, type: item.type, position: item.position, required: true,
        scaleId: item.scaleId ?? null, cognitiveAssignmentId: item.cognitiveAssignmentId ?? null,
        situationalInstrumentKey: item.situationalInstrumentKey ?? null, situationalInstrumentVersion: item.situationalInstrumentVersion ?? null }) })
  }
  return units.sort((a, b) => a.position - b.position || a.instrumentKey.localeCompare(b.instrumentKey)).map(({ position: _position, ...unit }) => unit)
}
