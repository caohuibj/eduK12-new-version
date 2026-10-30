import { z } from 'zod'

const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/).max(100)
const version = z.string().regex(/^\d+\.\d+\.\d+$/)
const text = z.string().min(1).max(4000)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const PROFILE_STATES = ['MATCHED','MIXED','BOUNDARY','UNCLASSIFIED','INSUFFICIENT','INVALID','NOT_APPLICABLE'] as const
export const profileStateSchema = z.enum(PROFILE_STATES)
export const profileSchema = z.object({
  schemaVersion: z.literal(1),
  key, version, mappingVersion: version, templateVersion: version,
  algorithm: z.literal('weighted-l1-guarded-v1'), maturity: z.literal('EXPERIMENTAL'),
  sourceArchiveHash: hash,
  applicability: z.union([
    // Keep the original grade declaration byte-compatible for frozen EVC packages.
    z.object({ domain: text, gradeEvidenceKey: key, minGrade: z.number().int().min(1).max(12), maxGrade: z.number().int().min(1).max(12) }).strict(),
    z.object({ domain: text, kind: z.literal('ADULT_TEACHER'), adultEvidenceKey: key, teacherEvidenceKey: key }).strict(),
  ]),
  bindings: z.array(z.object({
    constructKey: key, evidenceKey: key, label: text, contributionGroup: key, weight: z.number().finite().positive().max(1000),
    source: z.object({
      instrumentKey: key, instrumentVersion: version, scoringVersion: version, localizationVersion: version,
      measurementHash: hash, runtimeDefinitionHash: hash.optional(), definitionSourceHash: z.string().regex(/^[a-f0-9]{40}$/),
      expectedItems: z.number().int().positive().max(1000), timeframeKey: key,
    }).strict(),
    transformation: z.object({
      version, kind: z.literal('WITHIN_INSTRUMENT_RANGE'), referenceKind: z.literal('THEORETICAL_RANGE_NOT_NORM'),
      min: z.number().finite(), max: z.number().finite(), orientation: z.enum(['DIRECT','REFLECT']),
    }).strict(),
  }).strict()).min(1).max(10),
  profiles: z.array(z.object({
    id: key, name: text, centers: z.record(key,z.number().finite().min(0).max(1)), pattern: z.record(key,z.enum(['LOW','HIGH'])),
    supportRefs: z.array(key).min(1).max(32), summary: text,
    actions: z.array(z.object({text, supportRefs:z.array(key).min(1).max(32)}).strict()).max(5),
  }).strict()).min(2).max(8),
  matching: z.object({
    lowMax:z.number().finite().min(0).max(1), highMin:z.number().finite().min(0).max(1),
    minimumMatchingScore:z.number().finite().min(0).max(100), minimumMargin:z.number().finite().min(0).max(100),
    fuzzyLowPlateauEnd:z.number().finite().min(0).max(1), fuzzyMidpoint:z.number().finite().min(0).max(1), fuzzyHighPlateauStart:z.number().finite().min(0).max(1),
    coreMissingPolicy:z.literal('ABSTAIN'), qualityPolicy:z.literal('COMPLETE_INTERPRETABLE_ONLY'),
  }).strict(),
  modifierRuleIds:z.array(key).max(6),
  states:z.object(Object.fromEntries(PROFILE_STATES.map(state=>[state,text]))),
}).strict()
export type ProfileModel = z.infer<typeof profileSchema>
/** Cross-reference checks are performed by the enclosing package parser. */
export function validateProfileModel(model: ProfileModel) {
  const unique = (values:string[]) => { if(new Set(values).size!==values.length)throw new Error('PROFILE_DUPLICATE_IDENTITY') }
  unique(model.bindings.map(b=>b.constructKey));unique(model.bindings.map(b=>b.evidenceKey));unique(model.bindings.map(b=>b.contributionGroup));unique(model.profiles.map(p=>p.id));unique(model.modifierRuleIds)
  const m=model.matching
  if(!(m.lowMax<m.highMin && m.fuzzyLowPlateauEnd<m.fuzzyMidpoint && m.fuzzyMidpoint<m.fuzzyHighPlateauStart) ||
    ('gradeEvidenceKey' in model.applicability && model.applicability.minGrade>model.applicability.maxGrade))throw new Error('PROFILE_INVALID_BOUNDARY')
  if('kind' in model.applicability && model.applicability.adultEvidenceKey===model.applicability.teacherEvidenceKey)throw new Error('PROFILE_DUPLICATE_APPLICABILITY_CONTEXT')
  const keys=model.bindings.map(b=>b.constructKey).sort().join('|'), patterns:string[]=[]
  for(const b of model.bindings)if(b.transformation.max<=b.transformation.min)throw new Error('PROFILE_INVALID_RANGE')
  for(const p of model.profiles){
    if(Object.keys(p.centers).sort().join('|')!==keys || Object.keys(p.pattern).sort().join('|')!==keys)throw new Error('PROFILE_DIMENSION_MISMATCH')
    for(const k of Object.keys(p.centers))if(p.pattern[k]==='LOW'?p.centers[k]>m.lowMax:p.centers[k]<m.highMin)throw new Error('PROFILE_CENTER_PATTERN_CONFLICT')
    patterns.push(Object.keys(p.pattern).sort().map(k=>p.pattern[k]).join('|'))
  }
  unique(patterns)
}
