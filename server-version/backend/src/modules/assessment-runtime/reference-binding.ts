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
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'RETIRED'
  definition: unknown
}

type SingleExactReferenceDb = {
  assessmentReferenceSet: {
    findUnique: (args: unknown) => Promise<ExactReferenceRow | null>
  }
}

export type ExactReferenceDb = {
  assessmentReferenceSet: {
    findMany: (args: unknown) => Promise<ExactReferenceRow[]>
  }
}

export type FrozenReferenceDb = ExactReferenceDb

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

export const referenceSetHash = (definition: AssessmentReferenceSetDefinition): string => canonicalHash(definition.entries.some(entry => entry.governance) ? { ...definition, status: 'ACTIVE' } : definition)

export const loadExactReferenceSet = async (
  db: SingleExactReferenceDb,
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
  if (input.selections.length === 0) return []
  for (const selection of input.selections) {
    if (selection.referenceKey !== undefined && selection.referenceKey !== input.instrumentKey) {
      throw new Error(`Reference selection key ${selection.referenceKey} does not match ${input.instrumentKey}`)
    }
  }

  const versions = [...new Set(input.selections.map((selection) => selection.referenceVersion))]
  const rows = await db.assessmentReferenceSet.findMany({
    where: {
      instrumentType: input.instrumentType,
      instrumentKey: input.instrumentKey,
      referenceVersion: { in: versions },
    },
  })
  const rowsByVersion = new Map(rows.map((row) => [row.referenceVersion, row]))
  const loadedByVersion = new Map<string, { hash: string; status: ExactReferenceRow['status'] }>()
  for (const version of versions) {
    const row = rowsByVersion.get(version)
    if (!row) throw new Error(`Reference set ${input.instrumentKey}/${version} was not found`)
    const definition = toDefinition(row)
    loadedByVersion.set(version, { hash: referenceSetHash(definition), status: row.status })
  }

  return input.selections.map((selection) => {
    const loaded = loadedByVersion.get(selection.referenceVersion)
    if (!loaded) throw new Error(`Reference set ${input.instrumentKey}/${selection.referenceVersion} was not found`)
    if (loaded.status !== 'ACTIVE') {
      throw new Error(`Reference set ${input.instrumentKey}/${selection.referenceVersion} is not active`)
    }
    return {
      referenceKey: selection.referenceKey ?? input.instrumentKey,
      referenceVersion: selection.referenceVersion,
      referenceHash: loaded.hash,
      ...(selection.scoreKey ? { scoreKey: selection.scoreKey } : {}),
      ...(selection.referenceKind ? { referenceKind: selection.referenceKind } : {}),
      ...(selection.profileKey ? { profileKey: selection.profileKey } : {}),
    }
  })
}

export const loadFrozenReferenceSets = async (
  db: FrozenReferenceDb,
  input: {
    instrumentType: 'SCALE' | 'COGNITIVE'
    instrumentKey: string
    bindings: ReferenceBindingSnapshot[]
  },
): Promise<AssessmentReferenceSetDefinition[]> => {
  if (input.bindings.length === 0) return []
  for (const binding of input.bindings) {
    if (binding.referenceKey !== input.instrumentKey) {
      throw new Error(`Frozen reference key ${binding.referenceKey} does not match ${input.instrumentKey}`)
    }
  }
  const versions = [...new Set(input.bindings.map((binding) => binding.referenceVersion))]
  const rows = await db.assessmentReferenceSet.findMany({
    where: {
      instrumentType: input.instrumentType,
      instrumentKey: input.instrumentKey,
      referenceVersion: { in: versions },
    },
  })
  const byVersion = new Map(rows.map((row) => [row.referenceVersion, row]))
  const loadedByVersion = new Map<string, { definition: AssessmentReferenceSetDefinition; hash: string }>()
  return input.bindings.map((binding) => {
    let loaded = loadedByVersion.get(binding.referenceVersion)
    if (!loaded) {
      const row = byVersion.get(binding.referenceVersion)
      if (!row) throw new Error(`Reference set ${input.instrumentKey}/${binding.referenceVersion} was not found`)
      const definition = toDefinition(row)
      loaded = { definition: definition.entries.some(entry => entry.governance) ? { ...definition, status: 'ACTIVE' as const } : definition,
        hash: referenceSetHash(definition) }
      loadedByVersion.set(binding.referenceVersion, loaded)
    }
    if (loaded.hash !== binding.referenceHash) {
      throw new Error(`Reference set ${input.instrumentKey}/${binding.referenceVersion} hash mismatch`)
    }
    return loaded.definition
  })
}

/** One job-scoped read; no cross-user cache or lifetime beyond this task. */
export const preloadFrozenReferenceDb = async (
  db: FrozenReferenceDb,
  units: Array<{ instrumentType: 'SCALE' | 'COGNITIVE'; instrumentKey: string; bindings: ReferenceBindingSnapshot[] }>,
): Promise<FrozenReferenceDb> => {
  const queries = new Map<string, { instrumentType: 'SCALE' | 'COGNITIVE'; instrumentKey: string; referenceVersion: { in: string[] } }>()
  for (const unit of units) {
    if (!unit.bindings.length) continue
    if (unit.bindings.some(binding => binding.referenceKey !== unit.instrumentKey)) throw new Error('Frozen reference key does not match its instrument')
    const key = `${unit.instrumentType}:${unit.instrumentKey}`
    const prior = queries.get(key)
    const versions = [...new Set([...(prior?.referenceVersion.in ?? []), ...unit.bindings.map(binding => binding.referenceVersion)])]
    queries.set(key, { instrumentType: unit.instrumentType, instrumentKey: unit.instrumentKey, referenceVersion: { in: versions } })
  }
  const rows = queries.size ? await db.assessmentReferenceSet.findMany({ where: { OR: [...queries.values()] } }) : []
  return { assessmentReferenceSet: { findMany: async (args: unknown) => {
    const where = (args as { where: { instrumentType: string; instrumentKey: string; referenceVersion: { in: string[] } } }).where
    return rows.filter(row => row.instrumentType === where.instrumentType && row.instrumentKey === where.instrumentKey
      && where.referenceVersion.in.includes(row.referenceVersion))
  } } }
}
