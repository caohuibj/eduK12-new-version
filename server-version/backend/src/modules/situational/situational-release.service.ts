import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { freezeSituationalRuntimeAtAttemptStart } from '../assessment-runtime/situational-runtime-snapshot'
import { listSituationPackages, selectPublishedSituationPackage, validateSituationPackage, type SituationPackage } from './situation-package.registry'
import { resolveSituationalScientificContext } from './scientific-maturity'

type Db = Pick<Prisma.TransactionClient, 'sjtAuthorRelease' | '$queryRaw'>
export type SituationalReleaseIdentity = { instrumentKey: string; instrumentVersion: string }
export const situationalReleaseKey = (identity: SituationalReleaseIdentity) => JSON.stringify([identity.instrumentKey, identity.instrumentVersion])
const unavailable = () => new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '情境化测评题包不存在或已停用', 404)
const corrupt = () => new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '情境化题包发布记录校验失败', 409)
export type ResolvedSituationalRelease = {
  situationPackage: SituationPackage
  definitionHash: string
  runtime: ReturnType<typeof freezeSituationalRuntimeAtAttemptStart>['compiledRuntime']
  snapshot: ReturnType<typeof freezeSituationalRuntimeAtAttemptStart>
}

/** Operation-local, exact-version resolution. Admission callers pass their parent
 * transaction and lock=true: retirement and the complete parent/child write then
 * serialize on the same release rows. Never used for an existing frozen attempt. */
export async function resolveSituationalReleases(identities: SituationalReleaseIdentity[], db: Db = prisma, lock = false) {
  const unique = [...new Map(identities.map(identity => [situationalReleaseKey(identity), identity])).values()]
  const builtins = listSituationPackages()
  const uploaded = unique.filter(identity => !builtins.some(pkg => pkg.key === identity.instrumentKey))
  if (lock && uploaded.length) {
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "sjt_author_releases" WHERE ${Prisma.join(uploaded.map(identity => Prisma.sql`("instrument_key" = ${identity.instrumentKey} AND "instrument_version" = ${identity.instrumentVersion})`), ' OR ')} ORDER BY "id" FOR SHARE`)
  }
  const releases = uploaded.length ? await db.sjtAuthorRelease.findMany({ where: { OR: uploaded }, select: { instrumentKey: true, instrumentVersion: true, status: true, definitionHash: true, package: true } }) : []
  const rows = new Map(releases.map(row => [situationalReleaseKey(row), row]))
  const resolved = new Map<string, ResolvedSituationalRelease>()
  for (const identity of unique) {
    const key = situationalReleaseKey(identity)
    const row = rows.get(key)
    const pkg = builtins.some(candidate => candidate.key === identity.instrumentKey)
      ? selectPublishedSituationPackage(builtins, identity.instrumentKey, identity.instrumentVersion)
      : row?.status === 'PUBLISHED' ? selectPublishedSituationPackage([row.package as unknown as SituationPackage], identity.instrumentKey, identity.instrumentVersion) : undefined
    if (!pkg) throw unavailable()
    const validation = validateSituationPackage(pkg)
    if (!validation.valid || pkg.key !== identity.instrumentKey || pkg.instrumentVersion !== identity.instrumentVersion || (row && validation.definitionHash !== row.definitionHash)) throw corrupt()
    const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: pkg.key, instrumentVersion: pkg.instrumentVersion, definition: pkg.definition, scientificContext: resolveSituationalScientificContext(pkg) })
    resolved.set(key, { situationPackage: pkg, definitionHash: validation.definitionHash, runtime: snapshot.compiledRuntime, snapshot })
  }
  return resolved
}

/** Only version headers are loaded when the standalone API omits a version. */
export async function resolveSituationalRelease(identity: { instrumentKey: string; instrumentVersion?: string }, db: Db = prisma, lock = false) {
  let version = identity.instrumentVersion
  if (!version) {
    const builtins = listSituationPackages().filter(pkg => pkg.key === identity.instrumentKey)
    if (builtins.length) version = selectPublishedSituationPackage(builtins, identity.instrumentKey)?.instrumentVersion
    else {
      const rows = await db.sjtAuthorRelease.findMany({ where: { instrumentKey: identity.instrumentKey, status: 'PUBLISHED' }, select: { instrumentVersion: true } })
      const { compareSituationalInstrumentVersions } = await import('./situation-package.registry')
      version = rows.sort((a, b) => compareSituationalInstrumentVersions(b.instrumentVersion, a.instrumentVersion))[0]?.instrumentVersion
    }
  }
  if (!version) throw unavailable()
  const exact = { instrumentKey: identity.instrumentKey, instrumentVersion: version }
  return (await resolveSituationalReleases([exact], db, lock)).get(situationalReleaseKey(exact))!
}

/** Resource picker projection deliberately excludes definitions, answer keys and
 * templates. Full integrity validation belongs to exact authoring/admission. */
export async function listSituationalResourceSummaries() {
  const builtins = listSituationPackages()
  const rows = await prisma.$queryRaw<Array<{ instrumentKey: string; instrumentVersion: string; definitionHash: string; name: string | null; respondentType: string | null; packageKey: string | null; packageVersion: string | null; packageStatus: string | null }>>`
    SELECT "instrument_key" AS "instrumentKey", "instrument_version" AS "instrumentVersion", "definition_hash" AS "definitionHash",
      "package" #>> '{definition,source,title}' AS "name", "package" #>> '{definition,respondentType}' AS "respondentType",
      "package" ->> 'key' AS "packageKey", "package" ->> 'instrumentVersion' AS "packageVersion", "package" ->> 'releaseStatus' AS "packageStatus"
    FROM "sjt_author_releases" WHERE "status" = 'PUBLISHED' ORDER BY "instrument_key", "instrument_version"
  `
  for (const row of rows) {
    if (builtins.some(pkg => pkg.key === row.instrumentKey) || row.packageKey !== row.instrumentKey || row.packageVersion !== row.instrumentVersion || row.packageStatus !== 'PUBLISHED' || !row.name || !row.respondentType || !/^[a-f0-9]{64}$/.test(row.definitionHash)) throw corrupt()
  }
  return [...builtins.filter(pkg => pkg.releaseStatus === 'PUBLISHED').map(pkg => ({ instrumentKey: pkg.key, instrumentVersion: pkg.instrumentVersion, name: pkg.definition.source.title || pkg.key, respondentType: pkg.definition.respondentType })), ...rows]
    .filter(row => row.respondentType !== 'teacher_self_report')
    .map(row => ({ id: row.instrumentKey + '/' + row.instrumentVersion, name: row.name, instrumentKey: row.instrumentKey, instrumentVersion: row.instrumentVersion }))
}
