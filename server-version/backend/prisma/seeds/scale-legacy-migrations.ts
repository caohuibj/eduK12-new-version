import { Prisma, type PrismaClient } from '@prisma/client'
import { getScaleInstrumentSource } from '../../src/modules/scale/onboarding/instrument-registry'
import { hashScaleDefinition } from '../../src/modules/scale/scale-definition'

/** Historical one-off compatibility migration; normal source materialization contains no ADEXI branch. */
export const migrateLegacyAdexiV1Row = async (prisma: PrismaClient): Promise<void> => {
  const existing = await prisma.scale.findUnique({ where: { code: 'adexi_v1' } })
  if (!existing || existing.instrumentVersion !== '1.0.0' || existing.definition !== null) return
  const source = getScaleInstrumentSource('adexi_v1', '2.0.0')
  if (!source?.executable) throw new Error('ADEXI v2 source missing during legacy migration')
  const definition = source.executable.definition
  await prisma.scale.update({
    where: { id: existing.id },
    data: {
      name: source.catalog.identity.canonicalName,
      description: source.catalog.construct.constructDefinition,
      status: 'DRAFT',
      visibility: 'HIDDEN',
      instrumentClass: 'STANDARD',
      instrumentVersion: '2.0.0',
      definition: definition as unknown as Prisma.InputJsonValue,
      definitionHash: hashScaleDefinition(definition),
      itemCount: definition.items.length,
      dimensionCount: definition.scoring.scores.filter(score => score.type === 'dimension').length,
      estimatedTime: source.catalog.administration.estimatedMinutes,
    },
  })
  console.log('ADEXI legacy 1.0.0 row migrated in place to source-owned 2.0.0 content')
}
