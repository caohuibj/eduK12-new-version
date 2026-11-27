import { Prisma } from '@prisma/client'
import { validateFormDefinition, type FormQuestion } from '../assessment-core/form/definition'
import { canonicalHash } from '../assessment-runtime/canonical'
import { compositeConflict } from '../composite/composite.errors'
import type { GovernedArtifact } from '../survey/governed-tool.model'

const formTypes: Record<FormQuestion['type'], string> = {
  SINGLE: 'single_choice', MULTIPLE: 'multiple_choice', SHORT_TEXT: 'text_input',
  LONG_TEXT: 'long_text', NUMBER: 'number', LIKERT: 'likert', MATRIX: 'matrix',
  DATE: 'date', TIME: 'time', RANK_ORDER: 'rank_order', SLIDER: 'slider',
  CONSTANT_SUM: 'constant_sum', MATRIX_MULTIPLE: 'matrix_multiple',
}
const reserved = new Set(['__proto__', 'prototype', 'constructor'])

export const hasTrainingGovernedSource = (row: { creationKey?: string | null }) =>
  row.creationKey?.startsWith('training-governed:') === true

export function assertTrainingGovernedEditable(row: { creationKey?: string | null }) {
  if (hasTrainingGovernedSource(row)) throw compositeConflict('平台工具保留冻结版本，请调整投放设置，或从工具目录创建新一期')
}

// Explicit Training approval is written only after native compatibility review.
export function trainingGovernedDirectoryFilter() {
  const components = Prisma.sql`CASE WHEN jsonb_typeof(t.snapshot->'components')='array' THEN t.snapshot->'components' ELSE '[]'::jsonb END`
  return Prisma.sql`t.state='ONLINE' AND t.family IN ('FORM','COMBINATION')
    AND EXISTS (SELECT 1 FROM survey_tool_policies gp
      WHERE gp.product='TRAINING' AND gp.resource_key='governed-release:'||t.id
        AND gp.fingerprint=t.snapshot_hash AND gp.decision='APPROVED' AND NOT gp.paused)
    AND (t.family='FORM' OR (jsonb_array_length(${components}) BETWEEN 1 AND 30 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${components}) AS c(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM survey_governed_tools leaf JOIN survey_tool_policies lp
          ON lp.product='TRAINING' AND lp.resource_key='governed-release:'||leaf.id
          AND lp.fingerprint=leaf.snapshot_hash AND lp.decision='APPROVED' AND NOT lp.paused
        WHERE c.value#>>'{source,type}'='GOVERNED' AND leaf.id=c.value#>>'{source,id}'
          AND leaf.snapshot_hash=c.value#>>'{source,hash}' AND leaf.family='FORM' AND leaf.state='ONLINE'
      )
    )))`
}

/** Training renders frozen sections with its existing typed Form runner. */
export function trainingGovernedSections(artifact: GovernedArtifact) {
  const units = artifact.family === 'FORM' && artifact.components.length === 0 && artifact.unit
    ? [artifact.unit]
    : artifact.family === 'COMBINATION' && !artifact.unit && artifact.components.length
      && artifact.components.every(component => component.source.type === 'GOVERNED')
      ? artifact.components.map(component => component.unit) : []
  if (!units.length || artifact.parameters || artifact.report || artifact.packageReport || artifact.nativeBundle
    || units.some(unit => unit.ref.kind !== 'FORM' || unit.answerMapping))
    throw new Error('仅原生表单和纯表单普通组合支持 Training 投放')
  let position = 0
  let count = 0
  const sections = units.flatMap(unit => {
    const { definition, issues } = validateFormDefinition(unit.displayDefinition, { forPreview: true })
    if (!definition || issues.some(issue => issue.severity === 'error') || definition.pages.some(page => !page.questions.length))
      throw new Error('Training 要求每个表单区段都有有效题目')
    return definition.pages.map((page, pageIndex) => ({
      title: page.title,
      description: [pageIndex === 0 ? unit.instruction : null, page.description].filter(Boolean).join('\n\n') || null,
      position: position++,
      items: page.questions.map((question, index) => {
        if (question.image || question.materials?.length || question.displayIf || question.allowRefusal
          || question.otherOptionKey || question.exclusiveOptionKeys?.length
          || [...question.options.map(option => option.optionKey), ...question.rows.map(row => row.rowKey)].some(key => reserved.has(key)))
          throw new Error('Training 投放暂不支持治理表单的媒体、显隐、拒答、其他文本或互斥选项')
        const formType = formTypes[question.type]
        return {
          type: 'FORM' as const, position: position++, formSectionPosition: index, required: question.required,
          formType, formLabel: question.prompt,
          formOptions: ['single_choice', 'multiple_choice'].includes(formType)
            ? question.options.map(option => ({ value: option.optionKey, label: option.label })) : null,
          formDefinition: { ...question, itemKey: 'governed_' + ++count },
        }
      }),
    }))
  })
  if (count > 500) throw new Error('Training 问卷最多包含 500 道题目')
  return sections
}

export function inspectTrainingGovernedDefinition(artifact: GovernedArtifact): { available: boolean; reason?: string } {
  try {
    trainingGovernedSections(artifact)
    return { available: true }
  } catch (cause) {
    return { available: false, reason: cause instanceof Error ? cause.message : '内容无法映射到 Training 问卷' }
  }
}

type Section = { id?: string; title: string; description: string | null; position: number; contextSection?: boolean }
type Item = {
  type: string; position: number; formSectionPosition: number | null; required: boolean
  formType: string | null; formLabel: string | null; formOptions: unknown; formDefinition: unknown
  formSectionId?: string | null; formPlaceholder?: string | null; formPolicy?: unknown; contextKey?: string | null
}

function contentDigest(sections: Array<Section & { items: Item[] }>) {
  return canonicalHash(sections.map(section => ({
    contextSection: section.contextSection ?? false,
    title: section.title, description: section.description, position: section.position,
    items: section.items.map(item => ({
      type: item.type, required: item.required, position: item.position, formSectionPosition: item.formSectionPosition,
      formType: item.formType, formLabel: item.formLabel, formOptions: item.formOptions, formDefinition: item.formDefinition,
      formPlaceholder: item.formPlaceholder ?? null, formPolicy: item.formPolicy ?? null, contextKey: item.contextKey ?? null,
    })),
  })))
}

export function matchesTrainingGovernedContent(expected: ReturnType<typeof trainingGovernedSections>, sections: Section[], items: Item[]) {
  const bySection = new Map<string, Item[]>()
  for (const item of items) {
    if (!item.formSectionId) return false
    const section = bySection.get(item.formSectionId) ?? []
    section.push(item)
    bySection.set(item.formSectionId, section)
  }
  if (bySection.size !== sections.length || sections.some(section => !section.id || !bySection.has(section.id))) return false
  const actual = [...sections].sort((a, b) => a.position - b.position).map(section => ({
    ...section, items: bySection.get(section.id!)!.sort((a, b) => a.position - b.position),
  }))
  return contentDigest(expected) === contentDigest(actual)
}
