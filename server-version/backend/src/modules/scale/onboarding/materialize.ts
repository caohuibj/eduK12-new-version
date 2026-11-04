import { resolveScaleAdmissionInstruction } from './instruction-admission'
import { allowsScaleAxisRevision, freezeScaleAxisSnapshot } from './axis-snapshots'
import { Prisma, type PrismaClient } from '@prisma/client'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { hashScaleDefinition } from '../scale-definition'
import { SCALE_INSTRUMENT_REGISTRY, type ScaleInstrumentRegistry } from './instrument-registry'

type Db = PrismaClient | Prisma.TransactionClient

const counts = (definition: { items: unknown[]; scoring: { scores: Array<{ type: string }> } }) => ({
  itemCount: definition.items.length,
  dimensionCount: definition.scoring.scores.filter(score => score.type === 'dimension').length,
})

/**
 * Materialize source-owned executable content without activating deployment.
 * Existing lifecycle/visibility/creator fields are never reset.
 */
export const materializeScaleInstrumentContent = async (db: Db, input: {
  instrumentKey: string
  instrumentVersion: string
  actorUserId: string
}, registry: Pick<ScaleInstrumentRegistry, 'getSource' | 'getValidation'> = SCALE_INSTRUMENT_REGISTRY) => {
  const source = registry.getSource(input.instrumentKey, input.instrumentVersion)
  if (!source?.executable) throw new Error('Scale instrument source is not executable')
  const errors = registry.getValidation(input.instrumentKey, input.instrumentVersion)!.issues.filter(issue => issue.severity === 'error')
  if (errors.length) throw new Error(`Scale materialization blocked: ${errors.map(issue => `${issue.path}:${issue.message}`).join('; ')}`)
  const executable = source.executable
  const definitionHash = hashScaleDefinition(executable.definition)
  const definitionCounts = counts(executable.definition)
  let scale = await db.scale.findUnique({ where: { code: input.instrumentKey } })
  const instruction = resolveScaleAdmissionInstruction(source, scale)
  let created = false
  if (!scale) {
    scale = await db.scale.create({
      data: {
        code: input.instrumentKey,
        name: source.catalog.identity.canonicalName,
        description: source.catalog.construct.constructDefinition,
        status: 'DRAFT',
        visibility: 'HIDDEN',
        instrumentClass: 'STANDARD',
        instrumentVersion: input.instrumentVersion,
        definition: executable.definition as unknown as Prisma.InputJsonValue,
        definitionHash,
        itemCount: definitionCounts.itemCount,
        dimensionCount: definitionCounts.dimensionCount,
        estimatedTime: source.catalog.administration.estimatedMinutes,
        // STANDARD rows are platform-owned content: the source instruction is
        // the authoritative wording and is materialized with the definition.
        instruction: instruction.binding?.text ?? null,
        creatorId: input.actorUserId,
        tags: [source.catalog.construct.primaryDomain],
      },
    })
    created = true
  } else {
    if (scale.instrumentClass !== 'STANDARD') throw new Error('SCALE_CODE_OWNED_BY_CUSTOM_INSTRUMENT')
    if (scale.instrumentVersion !== input.instrumentVersion) throw new Error('DEPLOYMENT_VERSION_CONFLICT')
    if (scale.definition && canonicalHash(scale.definition) !== canonicalHash(executable.definition) && !allowsScaleAxisRevision(scale.definition,executable.definition)) throw new Error('SCALE_DEFINITION_CONFLICT')
    if (scale.definitionHash && scale.definitionHash !== definitionHash) throw new Error('SCALE_DEFINITION_CONFLICT')
    const revision=scale.definition && canonicalHash(scale.definition)!==canonicalHash(executable.definition)
    const instructionRevision=!!source.instruction && (scale.instruction ?? null) !== source.instruction.text
    if ((revision || instructionRevision) && await scaleReferencedByPublishedContent(db, scale.id)) throw new Error('SCALE_DEFINITION_REFERENCED')
    if (!scale.definitionHash || !scale.definition || revision) {
      scale = await db.scale.update({
        where: { id: scale.id },
        data: {
          ...(revision ? {status:'DRAFT' as const} : {}),
          definition: executable.definition as unknown as Prisma.InputJsonValue,
          definitionHash,
          itemCount: definitionCounts.itemCount,
          dimensionCount: definitionCounts.dimensionCount,
          estimatedTime: source.catalog.administration.estimatedMinutes,
          ...(source.instruction ? { instruction: source.instruction.text } : {}),
        },
      })
    } else if (source.instruction && (scale.instruction ?? null) !== source.instruction.text) {
      // Independent presentation revision: retain scoring definition and lifecycle.
      scale=await db.scale.update({where:{id:scale.id},data:{instruction:source.instruction.text}})
    }
  }

  await freezeScaleAxisSnapshot(db,scale.id,source)
  const referenceCreates: string[] = []
  const referenceUnchanged: string[] = []
  for (const reference of executable.references) {
    const existing = await db.assessmentReferenceSet.findUnique({
      where: { instrumentType_instrumentKey_referenceVersion: {
        instrumentType: 'SCALE',
        instrumentKey: input.instrumentKey,
        referenceVersion: reference.referenceVersion,
      } },
    })
    if (!existing) {
      await db.assessmentReferenceSet.create({
        data: {
          instrumentType: 'SCALE',
          instrumentKey: input.instrumentKey,
          referenceVersion: reference.referenceVersion,
          status: reference.status,
          definition: reference as unknown as Prisma.InputJsonValue,
        },
      })
      referenceCreates.push(reference.referenceVersion)
      continue
    }
    if (canonicalHash(existing.definition) !== canonicalHash(reference)) {
      throw new Error(existing.status === 'ACTIVE'
        ? `ACTIVE_REFERENCE_IMMUTABLE:${reference.referenceVersion}`
        : `REFERENCE_VERSION_CONFLICT:${reference.referenceVersion}`)
    }
    referenceUnchanged.push(reference.referenceVersion)
  }
  return { scale, created, definitionHash, referenceCreates, referenceUnchanged, instruction }
}

/** True when a published Training snapshot freezes this scale; such rows are immutable (DB trigger scale_published_reference_immutable). */
export async function scaleReferencedByPublishedContent(db: { $queryRaw: Prisma.TransactionClient['$queryRaw'] }, scaleId: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ one: number }>>(Prisma.sql`SELECT 1 AS one FROM composite_assessment_items i
    JOIN composite_assessments c ON c.id=i.composite_assessment_id
    WHERE i.scale_id=${scaleId} AND c.training_content_snapshot IS NOT NULL LIMIT 1`)
  return rows.length > 0
}
