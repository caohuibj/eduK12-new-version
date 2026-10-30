/** Pure JSON authoring contract. Parsing does not authorize installation or publication. */
import { z } from 'zod'
import { profileSchema, validateProfileModel, profileStateSchema } from '../profile/contract'
import { parseBundleContextDefinition } from '../context'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { assessmentBundleDefinitionSchema, BUNDLE_KEY, EXACT_VERSION, SLOT_KEY } from '../schema'

export const PACKAGE_LIMITS = { bytes: 1024 * 1024, depth: 24, conditionDepth: 8, conditions: 256, rules: 64, evidence: 128, blocks: 128 } as const
const key = z.string().regex(SLOT_KEY).max(100)
const version = z.string().regex(EXACT_VERSION)
const text = z.string().min(1).max(4000)
const scalar = z.union([z.number().finite(), z.string().max(1000), z.boolean()])
const audiences = z.array(z.enum(['student', 'parent', 'teacher', 'admin'])).min(1).max(4)
export type Condition =
  | { op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'; evidenceKey: string; value: number | string | boolean }
  | { op: 'present' | 'missing' | 'invalid' | 'not_applicable'; evidenceKey: string }
  | { op: 'all' | 'any'; conditions: Condition[] }
  | { op: 'not'; condition: Condition }
const condition: z.ZodType<Condition> = z.lazy(() => z.union([
  z.object({ op: z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte']), evidenceKey: key, value: scalar }).strict(),
  z.object({ op: z.enum(['present', 'missing', 'invalid', 'not_applicable']), evidenceKey: key }).strict(),
  z.object({ op: z.enum(['all', 'any']), conditions: z.array(condition).min(1).max(32) }).strict(),
  z.object({ op: z.literal('not'), condition }).strict(),
]))
const declaration = z.object({ ...assessmentBundleDefinitionSchema.shape,
  bundleKey: z.string().regex(BUNDLE_KEY).max(100),
  slots: assessmentBundleDefinitionSchema.shape.slots.max(64),
  status: z.literal('DRAFT'),
  engine: z.object({ key: z.literal('declarative-evidence-v1'), version: z.literal('1.0.0') }).strict(),
  respondentTypes: z.tuple([z.literal('SELF')]),
  safetyCapability: z.object({ safetyCapable: z.literal(false), productionTriggerEnabled: z.literal(false) }).strict(),
}).strict()
const packageV1Schema = z.object({
  schemaVersion: z.literal(1),
  manifest: z.object({
    definition: declaration,
    files: z.object({ evidence: z.literal('evidence-map.json'), rules: z.literal('rules.json'), report: z.literal('report.json'), scientific: z.literal('scientific.json'), publication: z.literal('publication.json'), context: z.literal('context.json').optional() }).strict(),
    cognitiveDependencies: z.array(z.object({ slotKey: key, configVersion: version, engineVersion: version, scoringVersion: version, profile: z.enum(['standard', 'experience', 'research']) }).strict()).max(64),
  }).strict(),
  evidence: z.array(z.object({
    evidenceKey: key, slotKey: key, selector: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.]*$/).max(100),
    valueType: z.enum(['number', 'string', 'boolean']), unit: z.string().min(1).max(100),
    construct: key, role: z.enum(['PRIMARY', 'SUPPORTING', 'CONTEXT']),
    direction: z.enum(['higher', 'lower', 'neutral']), qualityPolicy: z.enum(['interpretable_only', 'allow_limited']),
  }).strict()).min(1).max(PACKAGE_LIMITS.evidence),
  rules: z.object({
    version, applicability: condition.optional(),
    items: z.array(z.object({
      ruleId: key, when: condition,
      kind: z.enum(['independent_summary', 'cross_source_condition', 'limitation', 'joint_conclusion']),
      text, evidenceKeys: z.array(key).min(1).max(PACKAGE_LIMITS.evidence), supportRefs: z.array(key).max(32),
    }).strict()).max(PACKAGE_LIMITS.rules),
  }).strict(),
  report: z.object({
    key, version, locale: z.enum(['zh-CN', 'en']),
    blocks: z.array(z.object({ blockId: key, kind: z.enum(['evidence', 'conclusions', 'limitations']), title: text, audience: audiences, ruleIds: z.array(key).max(PACKAGE_LIMITS.rules) }).strict()).min(1).max(PACKAGE_LIMITS.blocks),
    states: z.object({ missing: text, limited: text, unavailable: text }).strict(),
  }).strict(),
  scientific: z.object({
    maturity: z.enum(['EXPERIMENTAL', 'PILOT', 'VALIDATED']), scope: text,
    references: z.array(z.object({ id: key, citation: text, allowedClaims: z.array(z.enum(['independent_summary', 'cross_source_condition', 'joint_conclusion'])).min(1) }).strict()).max(64),
  }).strict(),
  fixtures: z.object(Object.fromEntries(['valid','missing','invalid','not-applicable'].map(name => [name, z.object({
    values: z.record(key, z.discriminatedUnion('state', [
      z.object({state:z.literal('present'),value:scalar}).strict(),
      z.object({state:z.literal('missing')}).strict(),z.object({state:z.literal('invalid')}).strict(),z.object({state:z.literal('not_applicable')}).strict(),
    ])), expectedRuleIds: z.array(key), expectedKind: z.enum(['COMPUTED','UNAVAILABLE']),
  }).strict()]))).strict(),
  publication: z.object({ requestedStatus: z.enum(['DRAFT', 'PUBLISHED', 'HOLD', 'RETIRED']) }).strict(),
  context: z.unknown().optional(),
}).strict()
const packageV2Schema = packageV1Schema.extend({
  schemaVersion:z.literal(2),
  report:packageV1Schema.shape.report.extend({
    // This declaration is covered by the existing content-hash-bound rights/report review.
    // It never grants access to educational materials owned by a source instrument.
    profileActionContent:z.literal('BUNDLE_OWNED').optional(),
    // Optional frozen template text: historical packages keep their original output.
    profileStateExplanations:z.object({
      INSUFFICIENT:text, INVALID:text, NOT_APPLICABLE:text,
      UNCLASSIFIED:text, MIXED:text, BOUNDARY:text,
    }).strict().optional(),
  }),
  manifest:packageV1Schema.shape.manifest.extend({
    packageSchemaVersion:z.literal(2),
    definition:declaration.extend({engine:z.object({key:z.literal('declarative-evidence-v1'),version:z.literal('1.1.0')}).strict()}),
    files:packageV1Schema.shape.manifest.shape.files.extend({profile:z.literal('profile.json')}),
  }),
  profile:profileSchema,
  fixtures:z.record(z.string(),z.object({
    values:z.record(key,z.discriminatedUnion('state',[
      z.object({state:z.literal('present'),value:scalar}).strict(),z.object({state:z.literal('missing')}).strict(),
      z.object({state:z.literal('invalid')}).strict(),z.object({state:z.literal('not_applicable')}).strict(),
    ])),expectedRuleIds:z.array(key),expectedKind:z.enum(['COMPUTED','UNAVAILABLE']),
    expectedProfile:z.object({state:profileStateSchema,profileId:z.string().nullable()}).strict(),
  }).strict()).refine(value=>Object.keys(value).sort().join('|')===['valid','missing','invalid','not-applicable'].sort().join('|'),'exactly four package fixtures required'),
}).strict()
export const packageSchema=z.discriminatedUnion('schemaVersion',[packageV1Schema,packageV2Schema])
export type DeclarativePackage = z.infer<typeof packageSchema>

/** Iterative preflight bounds hostile nesting before recursive schema evaluation. */
function assertJsonBudget(raw: unknown) {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: raw, depth: 0 }]
  let nodes = 0
  while (stack.length) {
    const { value, depth } = stack.pop()!
    if (++nodes > 20000 || depth > PACKAGE_LIMITS.depth) throw new Error('PACKAGE_JSON_BUDGET_EXCEEDED')
    if (value && typeof value === 'object') {
      if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('PACKAGE_JSON_ONLY')
      for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
        if (['__proto__', 'constructor', 'prototype'].includes(name) || !('value' in descriptor)) throw new Error('PACKAGE_JSON_ONLY')
        stack.push({ value: descriptor.value, depth: depth + 1 })
      }
    } else if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new Error('PACKAGE_JSON_ONLY')
    else if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('PACKAGE_JSON_ONLY')
  }
  if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > PACKAGE_LIMITS.bytes) throw new Error('PACKAGE_SIZE_EXCEEDED')
}
// Immutable static configuration only; never cache participant facts or permissions.
const profilePackageCache=new Map<string,DeclarativePackage>()
function freezeContent<T>(value:T):T{
  if(value && typeof value==='object' && !Object.isFrozen(value)){
    for(const child of Object.values(value))freezeContent(child)
    Object.freeze(value)
  }
  return value
}
export function parseDeclarativePackage(raw: unknown): DeclarativePackage {
  assertJsonBudget(raw)
  const cacheKey=(raw as {schemaVersion?:unknown})?.schemaVersion===2?canonicalHash(raw):null
  const cached=cacheKey?profilePackageCache.get(cacheKey):null
  if(cached)return cached
  const value = packageSchema.parse(raw)
  const fail = (path: string, message: string): never => { throw new Error(`${path}: ${message}`) }
  const unique = (items: string[], path: string) => { if (new Set(items).size !== items.length) fail(path, 'duplicate identity') }
  const definition = value.manifest.definition
  unique(definition.slots.map(s => s.slotKey), 'manifest.definition.slots')
  unique(definition.slots.map(s => String(s.position)), 'manifest.definition.slots.position')
  unique(value.evidence.map(e => e.evidenceKey), 'evidence')
  unique(value.rules.items.map(r => r.ruleId), 'rules.items')
  unique(value.report.blocks.map(b => b.blockId), 'report.blocks')
  unique(value.scientific.references.map(r => r.id), 'scientific.references')
  unique(value.manifest.cognitiveDependencies.map(d => d.slotKey), 'manifest.cognitiveDependencies')
  const slots = new Map(definition.slots.map(s => [s.slotKey, s]))
  const evidence = new Map(value.evidence.map(e => [e.evidenceKey, e]))
  const references = new Map(value.scientific.references.map(r => [r.id, r]))
  for (const e of value.evidence) {
    const slot = slots.get(e.slotKey)
    if (!slot) fail(`evidence.${e.evidenceKey}.slotKey`, 'unknown slot')
    if (slot!.unitType !== 'FORM' && !slot!.valueSelectors?.includes(e.selector)) fail(`evidence.${e.evidenceKey}.selector`, 'selector not declared in slot')
    if (e.valueType !== 'number' && e.direction !== 'neutral') fail(`evidence.${e.evidenceKey}.direction`, 'ordered direction requires number')
  }
  for (const slot of definition.slots.filter(s => s.unitType === 'COGNITIVE')) {
    const dependency = value.manifest.cognitiveDependencies.find(d => d.slotKey === slot.slotKey)
    if (!dependency || dependency.configVersion !== slot.instrumentVersion) fail(`manifest.cognitiveDependencies.${slot.slotKey}`, 'exact config required')
  }
  for (const dependency of value.manifest.cognitiveDependencies) {
    if (slots.get(dependency.slotKey)?.unitType !== 'COGNITIVE') fail('manifest.cognitiveDependencies', 'unknown cognitive slot')
  }
  let count = 0
  const visit = (c: Condition, path: string, depth = 0): string[] => {
    if (++count > PACKAGE_LIMITS.conditions || depth > PACKAGE_LIMITS.conditionDepth) return fail(path, 'condition budget exceeded')
    if (c.op === 'all' || c.op === 'any') return c.conditions.flatMap((child, i) => visit(child, `${path}.${i}`, depth + 1))
    if (c.op === 'not') return visit(c.condition, `${path}.not`, depth + 1)
    const leaf = c as Extract<Condition, { evidenceKey: string }>
    const source = evidence.get(leaf.evidenceKey)
    if (!source) fail(path, 'unknown evidence')
    if ('value' in leaf) {
      if (typeof leaf.value !== source!.valueType) fail(path, 'comparison value type mismatch')
      if (!['eq', 'ne'].includes(leaf.op) && source!.valueType !== 'number') fail(path, 'ordered comparison requires number')
    }
    return [leaf.evidenceKey]
  }
  if (value.rules.applicability) visit(value.rules.applicability, 'rules.applicability')
  for (const rule of value.rules.items) {
    const used = visit(rule.when, `rules.${rule.ruleId}.when`)
    unique(rule.evidenceKeys, `rules.${rule.ruleId}.evidenceKeys`)
    if (rule.evidenceKeys.some(k => !evidence.has(k)) || used.some(k => !rule.evidenceKeys.includes(k))) fail(`rules.${rule.ruleId}`, 'incomplete evidence provenance')
    if (rule.supportRefs.some(k => !references.has(k))) fail(`rules.${rule.ruleId}.supportRefs`, 'unknown support reference')
    if (['cross_source_condition','joint_conclusion'].includes(rule.kind) && new Set(rule.evidenceKeys.map(k=>evidence.get(k)?.slotKey)).size < 2) fail(`rules.${rule.ruleId}`, 'cross-source claims require at least two sources')
    if (rule.kind === 'joint_conclusion' && !rule.supportRefs.some(k => references.get(k)?.allowedClaims.includes('joint_conclusion'))) fail(`rules.${rule.ruleId}`, 'joint conclusion requires declared supporting evidence; publication review still required')
  }
  const rules = new Set(value.rules.items.map(r => r.ruleId))
  for (const block of value.report.blocks) {
    unique(block.ruleIds, `report.blocks.${block.blockId}.ruleIds`)
    if (block.ruleIds.some(id => !rules.has(id))) fail(`report.blocks.${block.blockId}`, 'unknown rule')
  }
  for (const rule of value.rules.items) if (!value.report.blocks.some(b => b.ruleIds.includes(rule.ruleId))) fail('report.blocks', `missing rule ${rule.ruleId}`)
  if (value.report.key !== definition.reportDefinitionKey || value.report.version !== definition.reportDefinitionVersion) fail('report', 'identity mismatch')
  if(value.schemaVersion===2 && Boolean(value.manifest.files.profile)!==Boolean(value.profile))fail('profile','file declaration mismatch')
  if (Boolean(value.manifest.files.context) !== (value.context !== undefined)) fail('context', 'file declaration mismatch')
  if (value.context !== undefined) {
    const context = parseBundleContextDefinition(value.context)
    if (context.contextDefinitionKey !== definition.contextDefinitionKey || context.contextDefinitionVersion !== definition.contextDefinitionVersion) fail('context', 'exact identity mismatch')
  } else if (definition.contextDefinitionKey !== null || definition.contextDefinitionVersion !== null) fail('context', 'required context missing')
  if(value.schemaVersion===2){
    const profile=value.profile
    validateProfileModel(profile)
    const grade=evidence.get(profile.applicability.gradeEvidenceKey)
    if(!grade || slots.get(grade.slotKey)?.unitType!=='FORM' || grade.valueType!=='number')fail('profile.applicability','declared numeric grade context required')
    const sourceMetrics:string[]=[]
    for(const b of profile.bindings){
      const e=evidence.get(b.evidenceKey),slot=e?slots.get(e.slotKey):undefined
      if(!e || !slot || slot.unitType!=='SCALE' || !slot.required || e.valueType!=='number' || e.role!=='PRIMARY' || e.qualityPolicy!=='interpretable_only')fail('profile.bindings','required interpretable primary SCALE evidence required')
      if(e!.construct!==b.constructKey || slot!.instrumentKey!==b.source.instrumentKey || slot!.instrumentVersion!==b.source.instrumentVersion)fail('profile.bindings','exact source/construct mismatch')
      sourceMetrics.push(e!.slotKey+':'+e!.selector)
    }
    unique(sourceMetrics,'profile.bindings.source')
    if(new Set(profile.bindings.map(b=>evidence.get(b.evidenceKey)!.slotKey)).size<2)fail('profile.bindings','cross-tool profile requires at least two sources')
    for(const p of profile.profiles)for(const ref of [...p.supportRefs,...p.actions.flatMap(a=>a.supportRefs)])if(!references.get(ref)?.allowedClaims.includes('cross_source_condition'))fail('profile.profiles','support reference must cover cross-source theory claim')
    for(const id of profile.modifierRuleIds){
      const rule=value.rules.items.find(r=>r.ruleId===id)
      if(!rule || !rule.evidenceKeys.some(k=>evidence.get(k)?.role==='SUPPORTING'))fail('profile.modifierRuleIds','modifier requires its own supporting evidence')
    }
    if(profile.templateVersion!==value.report.version || profile.key!==definition.bundleKey)fail('profile','exact model/template identity required')
    if(value.scientific.maturity!=='EXPERIMENTAL')fail('profile','theory model is experimental')
  }
  if(cacheKey){
    if(profilePackageCache.size>=16)profilePackageCache.delete(profilePackageCache.keys().next().value!)
    profilePackageCache.set(cacheKey,freezeContent(value))
  }
  return value
}
export function hashDeclarativePackage(raw: unknown): string {
  const value = parseDeclarativePackage(raw)
  // Lifecycle requests never change immutable execution bytes or approval identity.
  const { publication: _publication, ...content } = value
  return canonicalHash(content)
}
