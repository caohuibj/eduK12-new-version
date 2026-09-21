import { PrismaClient } from '@prisma/client'
import { listScaleInstrumentSources } from '../../src/modules/scale/onboarding/instrument-registry'
import { materializeScaleInstrumentContent } from '../../src/modules/scale/onboarding/materialize'
import { migrateLegacyAdexiV1Row } from './scale-legacy-migrations'

/**
 * Seed every executable source through the same generic content materializer.
 * New rows remain DRAFT/HIDDEN; deployment activation and publication are separate.
 */
export async function seedScalePackages(prisma: PrismaClient, adminId: string): Promise<void> {
  await migrateLegacyAdexiV1Row(prisma)
  for (const source of listScaleInstrumentSources().filter(candidate => candidate.executable)) {
    const result = await materializeScaleInstrumentContent(prisma, {
      instrumentKey: source.identity.instrumentKey,
      instrumentVersion: source.identity.instrumentVersion,
      actorUserId: adminId,
    })
    console.log(`Scale source ${source.identity.instrumentKey}@${source.identity.instrumentVersion}: ${result.created ? 'created DRAFT/HIDDEN' : 'verified'}`)
  }
}
