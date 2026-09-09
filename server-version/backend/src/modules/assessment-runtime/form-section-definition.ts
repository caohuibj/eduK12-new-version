import { computeSubmissionPayloadHash } from '../../services/instrumentFinalSubmit'

export type QuestionnaireFormSectionItem = {
  id: string
  type: string
  label: string
  placeholder: string | null
  required: boolean
  options: unknown
  contextKey: string | null
  position: number
  sectionPosition: number | null
}

export type QuestionnaireFormSectionDefinition = {
  id: string
  title: string
  description: string | null
  position: number
  contextSection: boolean
  items: QuestionnaireFormSectionItem[]
}

export type CompositeFormSectionItem = {
  id: string
  formType: string
  formLabel: string
  placeholder: string | null
  required: boolean
  formOptions: unknown
  contextKey: string | null
  position: number
  formSectionPosition: number | null
}

export type CompositeFormSectionDefinition = {
  id: string
  title: string
  description: string | null
  position: number
  contextSection: boolean
  items: CompositeFormSectionItem[]
}

export type SectionItem = QuestionnaireFormSectionItem
export type SectionRow = QuestionnaireFormSectionDefinition
export type CompositeSectionItem = CompositeFormSectionItem
export type CompositeSection = CompositeFormSectionDefinition

export const orderedQuestionnaireFormSectionItems = (
  items: QuestionnaireFormSectionItem[],
): QuestionnaireFormSectionItem[] => [...items].sort(
  (left, right) => (left.sectionPosition ?? left.position) - (right.sectionPosition ?? right.position),
)

export const orderedCompositeFormSectionItems = (
  items: CompositeFormSectionItem[],
): CompositeFormSectionItem[] => [...items].sort(
  (left, right) => (left.formSectionPosition ?? left.position) - (right.formSectionPosition ?? right.position),
)

export const mapQuestionnaireSection = (section: any): QuestionnaireFormSectionDefinition => {
  const items = orderedQuestionnaireFormSectionItems((section.items ?? []).map((item: any) => ({
    id: item.id,
    type: item.type,
    label: item.label,
    placeholder: item.placeholder ?? null,
    required: item.required !== false,
    options: item.options,
    contextKey: item.contextKey ?? null,
    position: item.position,
    sectionPosition: item.sectionPosition ?? null,
  })))
  return {
    id: section.id,
    title: section.title,
    description: section.description ?? null,
    position: section.position,
    contextSection: Boolean(section.contextSection) || items.some((item) => Boolean(item.contextKey)),
    items,
  }
}

export const mapCompositeSection = (section: any): CompositeFormSectionDefinition => {
  const items = orderedCompositeFormSectionItems((section.items ?? []).map((item: any) => ({
    id: item.id,
    formType: item.formType,
    formLabel: item.formLabel,
    placeholder: item.formPlaceholder ?? null,
    required: item.required !== false,
    formOptions: item.formOptions,
    contextKey: item.contextKey ?? null,
    position: item.position,
    formSectionPosition: item.formSectionPosition ?? null,
  })))
  return {
    id: section.id,
    title: section.title,
    description: section.description ?? null,
    position: section.position,
    contextSection: Boolean(section.contextSection) || items.some((item) => Boolean(item.contextKey)),
    items,
  }
}

export const questionnaireFormSectionDefinitionHash = (section: QuestionnaireFormSectionDefinition): string => (
  computeSubmissionPayloadHash({
    sectionId: section.id,
    title: section.title,
    description: section.description,
    position: section.position,
    contextSection: section.contextSection,
    items: orderedQuestionnaireFormSectionItems(section.items).map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      placeholder: item.placeholder,
      required: item.required,
      options: item.options,
      contextKey: item.contextKey,
      position: item.position,
      sectionPosition: item.sectionPosition,
    })),
  })
)

export const compositeFormSectionDefinitionHash = (section: CompositeFormSectionDefinition): string => (
  computeSubmissionPayloadHash({
    sectionId: section.id,
    title: section.title,
    description: section.description,
    position: section.position,
    contextSection: section.contextSection,
    items: orderedCompositeFormSectionItems(section.items).map((item) => ({
      id: item.id,
      formType: item.formType,
      formLabel: item.formLabel,
      placeholder: item.placeholder,
      required: item.required,
      formOptions: item.formOptions,
      contextKey: item.contextKey,
      position: item.position,
      formSectionPosition: item.formSectionPosition,
    })),
  })
)