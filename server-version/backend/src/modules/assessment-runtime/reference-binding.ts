import {
  validateReferenceSetDefinition,
  type AssessmentReferenceSetDefinition,
} from '../assessment-reference/reference'
import { canonicalHash } from './canonical'
import type { ReferenceBindingSnapshot } from './types'

type ExactReferenceRow = {
  instrumentType: 'SCALE' | 'COGNITIVE'
  instrumentKey: string
  referenceVersion: string
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED'
  definition: unknown
}

export type ExactReferenceDb = {
  assessmentReferenceSet: {
    findUnique: (args: unknown) => Promise<ExactReferenceRow | null>
  }
}

const toDefinition = (row: ExactReferenceRow): AssessmentReferenceSetDefinition => {
  const validation = validateReferenceSetDefinition({
    ...(row.definition && typeof row.definition === 'object' ? row.definition : {}),
    schemaVersion: 1,
    instrumentType: row.instrumentType === 'SCALE' ? 'scale' : 'cognitive',
    instrumentKey: row.instrumentKey,
    referenceVersion: row.referenceVersion,
    status: row.status,
  })
  if (!validation.definition || validation.issues.some((issue) => issue.severity === 'error')) {
    throw new Error(`Reference set ${row.instrumentKey}/${row.referenceVersion} is invalid`)
  }
  return validation.definition
}

export const referenceSetHash = (definition: AssessmentReferenceSetDefinition): string => canonicalHash(definition)

export const loadExactReferenceSet = async (
  db: ExactReferenceDb,
  input: { instrumentType: 'SCALE' | 'COGNITIVE'; instrumentKey: string; referenceVersion: string },
): Promise<{ definition: AssessmentReferenceSetDefinition; hash: string; status: ExactReferenceRow['status'] }> => {
  const row = await db.assessmentReferenceSet.findUnique({
    where: {
      instrumentType_instrumentKey_referenceVersion: {
        instrumentType: input.instrumentType,
        instrumentKey: input.instrumentKey,
        referenceVersion: input.referenceVersion,
      },
    },
  })
  if (!row) throw new Error(`Reference set ${input.instrumentKey}/${input.referenceVersion} was not found`)
  const definition = toDefinition(row)
  const hash = referenceSetHash(definition)
  return { definition, hash, status: row.status }
}

export const freezeExactReferenceBindings = async (
  db: ExactReferenceDb,
  input: {
    instrumentType: 'SCALE' | 'COGNITIVE'
    instrumentKey: string
    selections: Array<{
      referenceKey?: string
      referenceVersion: string
      scoreKey?: string
      referenceKind?: string
      profileKey?: string
    }>
  },
): Promise<ReferenceBindingSnapshot[]> => {
  const bindings: ReferenceBindingSnapshot[] = []
  for (const selection of input.selections) {
    if (selection.referenceKey !== undefined && selection.referenceKey !== input.instrumentKey) {
      throw new Error(`Reference selection key ${selection.referenceKey} does not match ${input.instrumentKey}`)
    }
    const loaded = await loadExactReferenceSet(db, {
      instrumentType: input.instrumentType,
      instrumentKey: input.instrumentKey,
      referenceVersion: selection.referenceVersion,
    })
    if (loaded.status !== 'ACTIVE') {
      throw new Error(`Reference set ${input.instrumentKey}/${selection.referenceVersion} is not active`)
    }
    const row = {
      referenceKey: selection.referenceKey ?? input.instrumentKey,
      referenceVersion: selection.referenceVersion,
      referenceHash: loaded.hash,
      ...(selection.scoreKey ? { scoreKey: selection.scoreKey } : {}),
      ...(selection.referenceKind ? { referenceKind: selection.referenceKind } : {}),
      ...(selection.profileKey ? { profileKey: selection.profileKey } : {}),
    }
    bindings.push(row)
  }
  return bindings
}

export const loadFrozenReferenceSets = async (
  db: ExactReferenceDb,
  input: {
    instrumentType: 'SCALE' | 'COGNITIVE'
    instrumentKey: string
    bindings: ReferenceBindingSnapshot[]
  },
): Promise<AssessmentReferenceSetDefinition[]> => {
  const definitions: AssessmentReferenceSetDefinition[] = []
  for (const binding of input.bindings) {
    if (binding.referenceKey !== input.instrumentKey) {
      throw new Error(`Frozen reference key ${binding.referenceKey} does not match ${input.instrumentKey}`)
    }
    const loaded = await loadExactReferenceSet(db, {
      instrumentType: input.instrumentType,
      instrumentKey: input.instrumentKey,
      referenceVersion: binding.referenceVersion,
    })
    if (loaded.hash !== binding.referenceHash) throw new Error(`Reference set ${input.instrumentKey}/${binding.referenceVersion} hash mismatch`)
    definitions.push(loaded.definition)
  }
  return definitions
}
