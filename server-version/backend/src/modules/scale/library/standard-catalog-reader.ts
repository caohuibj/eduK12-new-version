/** Shared read-only registry projection. Both catalogs use the same scientific,
 * rights, exact deployment and participant gates; this never grants permission. */
import { UserRole } from '../../../types'
import { prisma } from '../../../config/database'
import { createPrismaAuthorizationRepository } from '../../assessment-authorization'
import { canStudentAccessScale } from '../scale-access'
import { resolveScaleStartDeployment } from '../deployment/service'
import { listScaleInstrumentSources } from '../onboarding/instrument-registry'
import { buildUnifiedScaleLibraryReadModel } from './catalog-only-read-model'
import type { ScaleLibraryReadModelContext } from './scale-library-read-model'

export interface StandardCatalogActor { userId: string; role: UserRole }
const authorizationRepository = createPrismaAuthorizationRepository(prisma)

/**
 * Only executable Wave 0 packages can currently have Scale deployment rows.
 * Wave 1 P1 catalog-first entries deliberately have no deployment until their
 * exact-form package / rights / report contract is closed.
 */
const deployedScalePairs = listScaleInstrumentSources().filter(source => source.executable).map((manifest) => ({
  code: manifest.identity.instrumentKey,
  instrumentVersion: manifest.identity.instrumentVersion,
}))

type LibraryDeployment = NonNullable<ScaleLibraryReadModelContext['deployments']>[number] & {
  allowNewStarts: boolean
  startReasons: string[]
  participantCheckRequired: boolean
}

const loadDeployments = async (actor: StandardCatalogActor): Promise<LibraryDeployment[]> => {
  const rows = await prisma.scale.findMany({
    where: { OR: deployedScalePairs },
    select: {
      id: true,
      code: true,
      instrumentVersion: true,
      instrumentClass: true,
      status: true,
      visibility: true,
    },
  })
  const deployments: LibraryDeployment[] = []
  for (const row of rows) {
    if (actor.role === UserRole.STUDENT) {
      const accessible = await canStudentAccessScale({
        id: row.id,
        status: String(row.status),
        visibility: String(row.visibility),
      }, actor.userId)
      if (!accessible) continue
    }
    const start = await resolveScaleStartDeployment({
      db: prisma,
      scale: {
        id: row.id,
        code: row.code,
        instrumentVersion: row.instrumentVersion,
        instrumentClass: row.instrumentClass,
        status: String(row.status),
      },
      requestedMode: 'STANDALONE',
    })
    deployments.push({
      scaleId: row.id,
      code: row.code,
      instrumentVersion: row.instrumentVersion,
      status: String(row.status),
      visibility: String(row.visibility),
      allowNewStarts: start.allowNewStarts,
      startReasons: [...start.reasons],
      participantCheckRequired: start.kind === 'MANAGED_V2',
    })
  }
  return deployments
}

const buildLibraryModel = (context: ScaleLibraryReadModelContext) => {
  const base = buildUnifiedScaleLibraryReadModel(context)
  const deployments = (context.deployments ?? []) as LibraryDeployment[]
  const byIdentity = new Map(deployments.map((deployment) => [
    `${deployment.code}:${deployment.instrumentVersion}`,
    deployment,
  ]))
  return {
    ...base,
    entries: base.entries.map((entry) => {
      const deployment = byIdentity.get(`${entry.identity.instrumentKey}:${entry.identity.instrumentVersion}`)
      if (!deployment) return entry
      if (deployment.allowNewStarts) return deployment.participantCheckRequired ? {
        ...entry, availability: { ...entry.availability, participantEligibility: 'NOT_EVALUATED' as const,
          reasons: [...entry.availability.reasons, '个人适用资格将在开始前根据必需资料确认。'] },
      } : entry
      const { launch: _launch, ...availability } = entry.availability
      return {
        ...entry,
        availability: {
          ...availability,
          status: availability.status === 'NOT_AVAILABLE' ? 'NOT_AVAILABLE' as const : 'RESTRICTED' as const,
          reasons: [...new Set([...availability.reasons, ...deployment.startReasons])],
        },
      }
    }),
  }
}

export async function readStandardScaleLibraryForActor(
  actor: StandardCatalogActor,
  context: Pick<ScaleLibraryReadModelContext, 'locale' | 'territory' | 'respondent'> = {},
) {
  return buildLibraryModel({
    ...context,
    authorizations: await authorizationRepository.list(),
    deployments: await loadDeployments(actor),
    viewerRole: actor.role === UserRole.ADMIN ? 'ADMIN' : actor.role === UserRole.TEACHER ? 'TEACHER' : 'STUDENT',
  })
}
