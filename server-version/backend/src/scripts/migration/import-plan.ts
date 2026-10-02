import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { decryptToken } from '../../services/checkinTokenCrypto'

export type ImportAction = {
  model: string
  operation: 'upsert' | 'update'
  args: { where: { id: string }; create?: Record<string, unknown>; data?: Record<string, unknown> }
  mapping?: { entity: string; legacyId: string; newId: string }
}
const models = new Map(Prisma.dmmf.datamodel.models.map(model => [model.name[0].toLowerCase() + model.name.slice(1), model]))
const enums = new Map(Prisma.dmmf.datamodel.enums.map(value => [value.name, new Set(value.values.map(entry => entry.name))]))

/** Validate the same mapped payload in dry-run and apply; never log field values. */
export function validateMappedData(modelName: string, data: Record<string, unknown>, partial = false): void {
  const model = models.get(modelName)
  if (!model) throw new Error('Unsupported import model: ' + modelName)
  const fields = new Set(model.fields.filter(field => field.kind !== 'object').map(field => field.name))
  for (const key of Object.keys(data)) if (!fields.has(key)) throw new Error('Unknown mapped field: ' + model.name + '.' + key)
  for (const field of model.fields) {
    if (field.kind === 'object') continue
    const value = data[field.name]
    if (value === undefined) {
      if (!partial && field.isRequired && !field.hasDefaultValue && !field.isUpdatedAt) throw new Error(model.name + '.' + field.name + ' is missing')
      continue
    }
    if (value === null) {
      if (field.isRequired) throw new Error(model.name + '.' + field.name + ' must not be null')
      continue
    }
    const values = field.isList ? value : [value]
    if (!Array.isArray(values)) throw new Error(model.name + '.' + field.name + ' must be an array')
    for (const item of values) {
      const valid = field.kind === 'enum' ? enums.get(field.type)?.has(String(item))
        : field.type === 'String' ? typeof item === 'string'
        : field.type === 'Boolean' ? typeof item === 'boolean'
        : field.type === 'Int' ? typeof item === 'number' && Number.isSafeInteger(item)
        : field.type === 'DateTime' ? item instanceof Date && !Number.isNaN(item.getTime())
        : field.type === 'Json' ? item !== undefined
        : true
      if (!valid) throw new Error('Invalid mapped field: ' + model.name + '.' + field.name)
    }
  }
}

export function createImportPlanner(actions: ImportAction[]): Prisma.TransactionClient {
  return new Proxy({}, {
    get: (_target, model: string) => ({
      upsert: async (args: ImportAction['args'] & { create: Record<string, unknown> }) => {
        if (model === 'legacyImportIdMap') {
          const action = actions[actions.length - 1]
          if (!action || action.mapping) throw new Error('Import mapping has no paired row')
          const row = args.create
          action.mapping = { entity: String(row.entity), legacyId: String(row.legacyId), newId: String(row.newId) }
        } else {
          validateMappedData(model, args.create)
          actions.push({ model, operation: 'upsert', args })
        }
        return args.create
      },
      update: async (args: ImportAction['args'] & { data: Record<string, unknown> }) => {
        validateMappedData(model, args.data, true)
        actions.push({ model, operation: 'update', args })
        return args.data
      },
    }),
  }) as Prisma.TransactionClient
}

function canonical(value: unknown): unknown {
  if (value === Prisma.JsonNull || value === Prisma.DbNull) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    if ('toNumber' in value && typeof value.toNumber === 'function') return value.toNumber()
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]))
  }
  return value
}
export const contentEqual = (actual: unknown, expected: unknown): boolean => JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected))
const expectedData = (action: ImportAction): Record<string, unknown> => action.args.create ?? action.args.data ?? {}
function tokenContent(value: unknown): string {
  const decoded = typeof value === 'string' ? decryptToken(value) : null
  if (!decoded) throw new Error('Invalid imported token ciphertext')
  return decoded
}
function differingFields(row: Record<string, unknown>, data: Record<string, unknown>): string[] {
  return Object.keys(data).filter(key => key === 'tokenEncrypted'
    ? tokenContent(row[key]) !== tokenContent(data[key])
    : !contentEqual(row[key], data[key]))
}
type Delegate = {
  findUnique(args: unknown): Promise<Record<string, unknown> | null>
  upsert(args: unknown): Promise<unknown>
  update(args: unknown): Promise<unknown>
}
const delegate = (client: PrismaClient | Prisma.TransactionClient, model: string): Delegate => (client as unknown as Record<string, Delegate>)[model]

export function importPlanHash(actions: ImportAction[]): string {
  const rows = actions.map(action => ({
    model: action.model, operation: action.operation, mapping: action.mapping,
    data: Object.fromEntries(Object.entries(expectedData(action)).map(([key, value]) => [key, key === 'tokenEncrypted' ? tokenContent(value) : value])),
  }))
  return createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex')
}

export async function verifyImportPlan(client: PrismaClient, actions: ImportAction[]): Promise<{ checked: number; mappingCount: number }> {
  let mappingCount = 0
  for (const action of actions) {
    const row = await delegate(client, action.model).findUnique({ where: action.args.where })
    if (!row) throw new Error('Reconciliation: missing row in ' + action.model)
    const different = differingFields(row, expectedData(action))
    if (different.length) throw new Error('Reconciliation: content mismatch in ' + action.model + ' fields ' + different.join(','))
    if (!action.mapping) throw new Error('Reconciliation: missing planned ID mapping')
    const map = await client.legacyImportIdMap.findUnique({ where: { entity_legacyId: { entity: action.mapping.entity, legacyId: action.mapping.legacyId } } })
    if (!map || map.newId !== action.mapping.newId) throw new Error('Reconciliation: ID mapping mismatch in ' + action.model)
    mappingCount += 1
  }
  const entities = [...new Set(actions.map(action => action.mapping!.entity))]
  const actualMappings = await client.legacyImportIdMap.count({ where: { entity: { in: entities } } })
  if (actualMappings !== mappingCount) throw new Error('Reconciliation: unexpected or duplicate ID mappings')
  return { checked: actions.length, mappingCount }
}

async function inspectOwnedUpdate(client: PrismaClient | Prisma.TransactionClient, action: ImportAction, actions: ImportAction[], row: Record<string, unknown> | null) {
  if (!row || !action.mapping) throw new Error('Import update requires an existing mapped row')
  const own = await client.legacyImportIdMap.findUnique({ where: { entity_legacyId: { entity: action.mapping.entity, legacyId: action.mapping.legacyId } } })
  if (own) {
    if (own.newId !== action.mapping.newId || differingFields(row, expectedData(action)).length) throw new Error('Existing update conflicts with legacy import in ' + action.model)
    return
  }
  const base = actions.find(value => value.operation === 'upsert' && value.model === action.model && value.args.where.id === action.args.where.id)
  if (!base?.mapping) throw new Error('Import update has no mapped predecessor')
  const owner = await client.legacyImportIdMap.findUnique({ where: { entity_legacyId: { entity: base.mapping.entity, legacyId: base.mapping.legacyId } } })
  if (!owner || owner.newId !== action.args.where.id || differingFields(row, expectedData(base)).length) throw new Error('Existing update conflicts with legacy import in ' + action.model)
  for (const [key, value] of Object.entries(expectedData(action))) {
    if (!contentEqual(row[key], value) && !contentEqual(row[key], expectedData(base)[key] ?? null)) throw new Error('Existing update conflicts with legacy import in ' + action.model)
  }
}

/** Row and ID mapping share one transaction; failed chunks roll back together. */
export async function applyImportPlan(client: PrismaClient, actions: ImportAction[], batchId: string, batchSize: number): Promise<number> {
  let completed = 0
  for (let index = 0; index < actions.length; index += batchSize) {
    await client.$transaction(async tx => {
      for (const action of actions.slice(index, index + batchSize)) {
        if (!action.mapping) throw new Error('Import row is missing its ID mapping')
        const data = expectedData(action)
        const row = await delegate(tx, action.model).findUnique({ where: action.args.where })
        if (row && action.operation === 'upsert') {
          const owned = await tx.legacyImportIdMap.findUnique({ where: { entity_legacyId: { entity: action.mapping.entity, legacyId: action.mapping.legacyId } } })
          if (!owned || owned.newId !== action.mapping.newId || differingFields(row, data).length) throw new Error('Existing row conflicts with legacy import in ' + action.model)
        }
        if (action.operation === 'update') await inspectOwnedUpdate(tx, action, actions, row)
        await delegate(tx, action.model)[action.operation](action.args)
        await tx.legacyImportIdMap.upsert({
          where: { entity_legacyId: { entity: action.mapping.entity, legacyId: action.mapping.legacyId } },
          create: { ...action.mapping, batchId },
          update: { newId: action.mapping.newId, batchId },
        })
      }
    }, { timeout: 120000, maxWait: 10000 })
    completed = Math.min(index + batchSize, actions.length)
    await client.legacyImportBatch.update({ where: { id: batchId }, data: { summary: { completed, planned: actions.length } } })
  }
  return completed
}
/** Inspect collisions in dry-run without changing business rows. */
export async function inspectImportPlan(client: PrismaClient, actions: ImportAction[]): Promise<{ inserts: number; existing: number; updates: number }> {
  let inserts = 0, existing = 0, updates = 0
  for (const action of actions) {
    if (!action.mapping) throw new Error('Import row is missing its ID mapping')
    if (action.operation === 'update') {
      const row = await delegate(client, action.model).findUnique({ where: action.args.where })
      // A not-yet-inserted predecessor is legal in the dry-run plan.
      if (row) await inspectOwnedUpdate(client, action, actions, row)
      else if (!actions.some(value => value.operation === 'upsert' && value.model === action.model && value.args.where.id === action.args.where.id)) throw new Error('Import update has no planned predecessor')
      updates += 1; continue
    }
    const data = expectedData(action)
    const model = models.get(action.model)!
    const current = await delegate(client, action.model).findUnique({ where: action.args.where })
    if (current) {
      const map = await client.legacyImportIdMap.findUnique({ where: { entity_legacyId: { entity: action.mapping.entity, legacyId: action.mapping.legacyId } } })
      if (!map || map.newId !== action.args.where.id || differingFields(current, data).length) throw new Error('Existing row conflicts with legacy import in ' + action.model)
      existing += 1
    } else {
      for (const field of model.fields.filter(field => field.isUnique && field.name !== 'id' && data[field.name] != null)) {
        const collision = await delegate(client, action.model).findUnique({ where: { [field.name]: data[field.name] } })
        if (collision) throw new Error('Unique-field collision in ' + action.model + '.' + field.name)
      }
      inserts += 1
    }
  }
  return { inserts, existing, updates }
}
