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

/** V2 is used only by an explicitly typed frozen Training definition. V1 stays
 * byte-compatible; historical rows are never upgraded or regenerated. */
import type { TypedFormValue } from './typed-form'
export interface FormSectionCollectionFactsV2 {
  schemaVersion: 2
  sectionKey: string
  items: Array<{ key: string; label: string; value: TypedFormValue }>
}
export type FormSectionCollectionFacts = FormSectionCollectionFactsV1 | FormSectionCollectionFactsV2 | FormSectionCollectionFactsV3
export const typedFormValueSchema = z.union([
  z.string(), z.number().finite(), z.array(z.string()),
  z.record(z.union([z.string(), z.number().finite(), z.array(z.string())])), z.null(),
])
const typedFactsSchema = z.object({
  schemaVersion: z.literal(2), sectionKey: z.string().min(1),
  items: z.array(z.object({ key: z.string().min(1), label: z.string().min(1), value: typedFormValueSchema }).strict()).max(500),
}).strict()
export const createTypedFormSectionCollectionFacts = (input: Omit<FormSectionCollectionFactsV2, 'schemaVersion'>): FormSectionCollectionFactsV2 => {
  const facts = typedFactsSchema.parse({ ...input, schemaVersion: 2 })
  if (new Set(facts.items.map(item => item.key)).size !== facts.items.length) throw new Error('Form section fact keys must be unique')
  if (canonicalJsonBytes(facts).byteLength > 512000) throw new Error('Form section facts exceed 500 KB')
  return facts
}

/** Shared reader for encrypted canonical snapshots; never consult String projections. */
export const readFormSectionCollectionFacts = (value: unknown): FormSectionCollectionFacts => {
  if(value && typeof value === "object" && (value as {schemaVersion?:unknown}).schemaVersion===3) return createPolicyFormSectionCollectionFacts(v3FactsSchema.parse(value))
  if (value && typeof value === 'object' && (value as {schemaVersion?: unknown}).schemaVersion === 2) {
    const parsed = typedFactsSchema.parse(value)
    return createTypedFormSectionCollectionFacts(parsed)
  }
  return parseFormSectionCollectionFacts(value)
}

const factState = z.enum(['ANSWERED','REFUSED','SHOWN_MISSING','NOT_SHOWN'])
const refusalSchema = z.object({_surveyRefusal:z.literal(true)}).strict()
export const trainingFormWireValueSchema = z.union([typedFormValueSchema, refusalSchema, z.record(z.union([z.string(),z.number().finite(),z.array(z.string()),refusalSchema]))])
const v3FactsSchema = z.object({schemaVersion:z.literal(3),sectionKey:z.string().min(1),items:z.array(z.object({
  key:z.string().min(1),label:z.string().min(1),value:typedFormValueSchema,state:factState,
  rowStates:z.record(factState).optional(),otherText:z.string().optional(),
}).strict()).max(500)}).strict()
export type FormSectionCollectionFactsV3 = z.infer<typeof v3FactsSchema>
export const createPolicyFormSectionCollectionFacts = (input: Omit<FormSectionCollectionFactsV3,'schemaVersion'>): FormSectionCollectionFactsV3 => {
  const facts = v3FactsSchema.parse({...input,schemaVersion:3})
  if(new Set(facts.items.map(item=>item.key)).size!==facts.items.length)throw new Error('Form section fact keys must be unique')
  if(canonicalJsonBytes(facts).byteLength>512000)throw new Error('Form section facts exceed 500 KB')
  return facts
}
