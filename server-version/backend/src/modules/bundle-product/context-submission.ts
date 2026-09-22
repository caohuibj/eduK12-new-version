import { readInstance } from './service'
import { buildBundleContextFactsFromValues } from '../assessment-bundle/context'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

export function contextValues(bindings: Array<{contextKey:string;itemId:string;valueType:string}>, facts: Array<{key:string;value:unknown}>) {
  const values: Record<string,unknown> = {}
  for (const binding of bindings) {
    const raw = facts.find(fact => fact.key === binding.itemId)?.value
    values[binding.contextKey] = raw === undefined || raw === null || raw === '' ? null
      : binding.valueType === 'number' ? (typeof raw === 'string' && raw.trim() ? Number(raw) : NaN)
      : binding.valueType === 'boolean' ? (raw === 'true' ? true : raw === 'false' ? false : raw) : raw
  }
  return values
}
// Runs before committing FORM FINAL, using the immutable instance definition.
export function validateContextSubmission(instance: unknown, facts: Array<{key:string;value:unknown}>) {
  const {frozen,bindings} = readInstance(instance as Parameters<typeof readInstance>[0])
  if (!frozen.contextDefinition) return
  const relevant = bindings.context.filter(binding => facts.some(fact => fact.key === binding.itemId))
  if (!relevant.length) return
  const values = contextValues(relevant,facts)
  try {
    buildBundleContextFactsFromValues({definition:{...frozen.contextDefinition,fields:frozen.contextDefinition.fields.filter(field=>relevant.some(binding=>binding.contextKey===field.contextKey))},values})
    const population = frozen.bundleSnapshot.bundleDefinition.population
    const age = values.subject_age_years
    if (age !== undefined && (typeof age !== 'number' || age < 0 || age > 150 ||
      (population.subjectMinAgeYears !== undefined && age < population.subjectMinAgeYears) ||
      (population.subjectMaxAgeYears !== undefined && age > population.subjectMaxAgeYears))) throw new Error('age outside population')
  } catch {
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT','上下文格式不正确，或不符合本测评包的适用年龄范围',409)
  }
}
