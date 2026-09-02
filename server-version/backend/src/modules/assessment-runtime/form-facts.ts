import { canonicalJsonBytes } from './canonical'
import { z } from 'zod'

export interface FormSectionCollectionFactV1 {
  key: string
  label: string
  value: string | string[] | null
}

export interface FormSectionCollectionFactsV1 {
  schemaVersion: 1
  sectionKey: string
  items: FormSectionCollectionFactV1[]
}

const formSectionCollectionFactSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.string(), z.array(z.string()), z.null()]),
}).strict()

const formSectionCollectionFactsSchema = z.object({
  schemaVersion: z.literal(1),
  sectionKey: z.string().min(1),
  items: z.array(formSectionCollectionFactSchema),
}).strict()

export const createFormSectionCollectionFacts = (input: {
  sectionKey: string
  items: FormSectionCollectionFactV1[]
}): FormSectionCollectionFactsV1 => {
  const facts = formSectionCollectionFactsSchema.parse({
    schemaVersion: 1,
    sectionKey: input.sectionKey,
    items: input.items.map((item) => ({
      key: item.key,
      label: item.label,
      value: item.value === null
        ? null
        : Array.isArray(item.value)
          ? [...item.value]
          : item.value,
    })),
  }) as FormSectionCollectionFactsV1
  const keys = facts.items.map((item) => item.key)
  if (new Set(keys).size !== keys.length) throw new Error('Form section fact keys must be unique')
  canonicalJsonBytes(facts)
  return facts
}

export const parseFormSectionCollectionFacts = (value: unknown): FormSectionCollectionFactsV1 => {
  let facts: FormSectionCollectionFactsV1
  try {
    facts = formSectionCollectionFactsSchema.parse(value) as FormSectionCollectionFactsV1
  } catch (error) {
    throw new Error(`Malformed form section facts: ${error instanceof Error ? error.message : 'invalid structure'}`)
  }
  const keys = facts.items.map((item) => item.key)
  if (new Set(keys).size !== keys.length) throw new Error('Form section fact keys must be unique')
  canonicalJsonBytes(facts)
  return facts
}
