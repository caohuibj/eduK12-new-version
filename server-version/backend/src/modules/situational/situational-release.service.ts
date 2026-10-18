import { Prisma } from '@prisma/client'
import { lockSjtGrantScope, assertSjtCourseGrants, type SjtCourseGrantScope, type SjtCourseGrantReceipt } from './authoring/grants'
import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { freezeSituationalRuntimeAtAttemptStart } from '../assessment-runtime/situational-runtime-snapshot'
import { listSituationPackages, selectPublishedSituationPackage, validateSituationPackage, type SituationPackage } from './situation-package.registry'
import { resolveSituationalScientificMaturity, resolveSituationalScientificContext } from './scientific-maturity'

type Db = Prisma.TransactionClient
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
export async function inspectSituationalReleases(identities: SituationalReleaseIdentity[], db: Db = prisma, lock = false, scope?: SjtCourseGrantScope | null) {
  const unique = [...new Map(identities.map(identity => [situationalReleaseKey(identity), identity])).values()]
  const builtins = listSituationPackages()
  const uploaded = unique.filter(identity => !builtins.some(pkg => pkg.key === identity.instrumentKey))
  if (lock && uploaded.length && scope) await lockSjtGrantScope(db, scope)
  if (lock && uploaded.length) {
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "sjt_author_releases" WHERE ${Prisma.join(uploaded.map(identity => Prisma.sql`("instrument_key" = ${identity.instrumentKey} AND "instrument_version" = ${identity.instrumentVersion})`), ' OR ')} ORDER BY "id" FOR SHARE`)
  }
  const releases = uploaded.length ? await db.sjtAuthorRelease.findMany({ where: { OR: uploaded }, select: { id: true, instrumentKey: true, instrumentVersion: true, status: true, definitionHash: true, contentDigest: true, authorizationPolicy: true, package: true } }) : []
  // Authorization is checked once for the operation's exact batch, never from client hints.
  let receipts = new Map<string, SjtCourseGrantReceipt | null>()
  let authorizationError: unknown
  try { receipts = await assertSjtCourseGrants(db, releases, scope, 'DISTRIBUTE', { lock, releaseLocked: lock }) }
  catch (error) { authorizationError = error }
  const rows = new Map(releases.map(row => [situationalReleaseKey(row), row]))
  const resolved = new Map<string, ResolvedSituationalRelease>()
  const errors = new Map<string, unknown>()
  for (const identity of unique) {
    const key = situationalReleaseKey(identity)
    try {
      const row = rows.get(key)
      if (row?.authorizationPolicy && authorizationError) throw authorizationError
      if (row && (!row.package || typeof row.package !== 'object' || Array.isArray(row.package))) throw corrupt()
      const pkg = builtins.some(candidate => candidate.key === identity.instrumentKey)
        ? selectPublishedSituationPackage(builtins, identity.instrumentKey, identity.instrumentVersion)
        : row?.status === 'PUBLISHED' ? selectPublishedSituationPackage([row.package as unknown as SituationPackage], identity.instrumentKey, identity.instrumentVersion) : undefined
      if (!pkg) throw unavailable()
      // Freeze below performs online source/display integrity exactly once in this
      // operation. Definition/golden checks remain here; stored snapshot parsing
      // always performs its own complete verification on future requests.
      const validation = validateSituationPackage(pkg.online ? { ...pkg, online: undefined } : pkg)
      if (!validation.valid || pkg.key !== identity.instrumentKey || pkg.instrumentVersion !== identity.instrumentVersion || (row && validation.definitionHash !== row.definitionHash)) throw corrupt()
      const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: pkg.key, instrumentVersion: pkg.instrumentVersion, definition: pkg.definition, scientificContext: resolveSituationalScientificContext(pkg), ...(pkg.online ? { online: pkg.online } : {}), ...(row && receipts.get(row.id) ? { authorizationReceipt: receipts.get(row.id)! } : {}) })
      resolved.set(key, { situationPackage: pkg, definitionHash: validation.definitionHash, runtime: snapshot.compiledRuntime, snapshot })
    } catch (error) { errors.set(key, error) }
  }
  return { releases: resolved, errors }
}

export async function resolveSituationalReleases(identities: SituationalReleaseIdentity[], db: Db = prisma, lock = false, scope?: SjtCourseGrantScope | null) {
  const outcome = await inspectSituationalReleases(identities, db, lock, scope)
  if (outcome.errors.size) throw outcome.errors.values().next().value
  return outcome.releases
}

/** Only version headers are loaded when the standalone API omits a version. */
export async function resolveSituationalRelease(identity: { instrumentKey: string; instrumentVersion?: string }, db: Db = prisma, lock = false, scope?: SjtCourseGrantScope | null) {
  let version = identity.instrumentVersion
  if (!version) {
    const builtins = listSituationPackages().filter(pkg => pkg.key === identity.instrumentKey)
    if (builtins.length) version = selectPublishedSituationPackage(builtins, identity.instrumentKey)?.instrumentVersion
    else {
      const rows = await db.sjtAuthorRelease.findMany({ where: { instrumentKey: identity.instrumentKey, status: 'PUBLISHED', ...(scope ? {} : { authorizationPolicy: null }) }, select: { instrumentVersion: true } })
      const { compareSituationalInstrumentVersions } = await import('./situation-package.registry')
      version = rows.sort((a, b) => compareSituationalInstrumentVersions(b.instrumentVersion, a.instrumentVersion))[0]?.instrumentVersion
    }
  }
  if (!version) throw unavailable()
  const exact = { instrumentKey: identity.instrumentKey, instrumentVersion: version }
  return (await resolveSituationalReleases([exact], db, lock, scope)).get(situationalReleaseKey(exact))!
}

/** Resource picker projection deliberately excludes definitions, answer keys and
 * templates. Full integrity validation belongs to exact authoring/admission. */
export async function listSituationalResourceSummaries(teacherId?: string) {
  const builtins = listSituationPackages()
  const rows = await prisma.$queryRaw<Array<{ instrumentKey: string; instrumentVersion: string; definitionHash: string; name: string | null; respondentType: string | null; packageKey: string | null; packageVersion: string | null; packageStatus: string | null }>>`
    SELECT "instrument_key" AS "instrumentKey", "instrument_version" AS "instrumentVersion", "definition_hash" AS "definitionHash",
      "package" #>> '{definition,source,title}' AS "name", "package" #>> '{definition,respondentType}' AS "respondentType",
      "package" ->> 'key' AS "packageKey", "package" ->> 'instrumentVersion' AS "packageVersion", "package" ->> 'releaseStatus' AS "packageStatus"
    FROM "sjt_author_releases" r WHERE "status" = 'PUBLISHED'
      AND (r."authorization_policy" IS NULL OR EXISTS (
        SELECT 1 FROM "sjt_release_grants" g JOIN "courses" c ON c."id" = g."course_id"
        WHERE g."release_id" = r."id" AND g."grantee_teacher_id" = ${teacherId ?? null}
          AND g."instrument_key" = r."instrument_key" AND g."instrument_version" = r."instrument_version"
          AND g."definition_hash" = r."definition_hash" AND g."content_digest" = r."content_digest"
          AND g."permission" = 'DISTRIBUTE' AND g."purpose" = 'TRAINING_COURSE' AND g."status" = 'ACTIVE'
          AND g."valid_from" <= CURRENT_TIMESTAMP AND g."expires_at" > CURRENT_TIMESTAMP
          AND c."creator_id" = g."grantee_teacher_id" AND c."course_type" = 'TRAINING_COURSE' AND NOT c."is_library"
      )) ORDER BY "instrument_key", "instrument_version" LIMIT 500
  `
  for (const row of rows) {
    if (builtins.some(pkg => pkg.key === row.instrumentKey) || row.packageKey !== row.instrumentKey || row.packageVersion !== row.instrumentVersion || row.packageStatus !== 'PUBLISHED' || !row.name || !row.respondentType || !/^[a-f0-9]{64}$/.test(row.definitionHash)) throw corrupt()
  }
  return [...builtins.filter(pkg => pkg.releaseStatus === 'PUBLISHED').map(pkg => ({ instrumentKey: pkg.key, instrumentVersion: pkg.instrumentVersion, name: pkg.definition.source.title || pkg.key, respondentType: pkg.definition.respondentType })), ...rows]
    .filter(row => row.respondentType !== 'teacher_self_report')
    .map(row => ({ id: row.instrumentKey + '/' + row.instrumentVersion, name: row.name, instrumentKey: row.instrumentKey, instrumentVersion: row.instrumentVersion }))
}

export type SituationalReleaseMetadata = { status: string; scienceMaturity: ReturnType<typeof resolveSituationalScientificMaturity> }
/** Management metadata is not admission: a retired exact release remains
 * inspectable, while no template or scoring key is loaded for a detail/list. */
export async function loadSituationalReleaseMetadata(identities: SituationalReleaseIdentity[], db: Db = prisma) {
  const unique = [...new Map(identities.map(identity => [situationalReleaseKey(identity), identity])).values()]
  const builtins = listSituationPackages()
  const uploaded = unique.filter(identity => !builtins.some(pkg => pkg.key === identity.instrumentKey))
  const rows = uploaded.length ? await db.$queryRaw<Array<SituationalReleaseIdentity & { status: string; definitionHash: string; packageKey: string | null; packageVersion: string | null; packageStatus: string | null; modelKey: string | null; scoringVersion: string | null; responseProtocol: string | null; compilerVersion: string | null }>>(Prisma.sql`
    SELECT "instrument_key" AS "instrumentKey", "instrument_version" AS "instrumentVersion", "status", "definition_hash" AS "definitionHash",
      "package" ->> 'key' AS "packageKey", "package" ->> 'instrumentVersion' AS "packageVersion", "package" ->> 'releaseStatus' AS "packageStatus",
      "package" #>> '{definition,scoring,model,modelKey}' AS "modelKey", "package" #>> '{definition,scoring,scoringVersion}' AS "scoringVersion",
      "package" #>> '{online,responseProtocol}' AS "responseProtocol", "package" #>> '{online,compilerVersion}' AS "compilerVersion"
    FROM "sjt_author_releases" WHERE ${Prisma.join(uploaded.map(identity => Prisma.sql`("instrument_key" = ${identity.instrumentKey} AND "instrument_version" = ${identity.instrumentVersion})`), ' OR ')}
  `) : []
  const byKey = new Map(rows.map(row => [situationalReleaseKey(row), row]))
  const metadata = new Map<string, SituationalReleaseMetadata>()
  for (const identity of unique) {
    const key = situationalReleaseKey(identity)
    const builtin = builtins.find(pkg => pkg.key === identity.instrumentKey && pkg.instrumentVersion === identity.instrumentVersion)
    if (builtin) metadata.set(key, { status: builtin.releaseStatus, scienceMaturity: resolveSituationalScientificMaturity(identity.instrumentKey, identity.instrumentVersion) })
    else {
      const row = byKey.get(key)
      if (!row) throw unavailable()
      if (!['PUBLISHED', 'RETIRED'].includes(row.status) || row.packageKey !== identity.instrumentKey || row.packageVersion !== identity.instrumentVersion || row.packageStatus !== 'PUBLISHED' || !(row.responseProtocol === 'sjt-online-response-v1' && ['sjt-online-fixed-v1', 'sjt-online-static-image-v1'].includes(row.compilerVersion ?? '')
        ? (row.modelKey === 'AUTHOR_KEY_SUM' && row.scoringVersion === 'sjt-online-v1-author-sum-1') || (row.modelKey === 'EXPERT_KEY' && row.scoringVersion === 'sjt-online-v1-expert-mean-1')
        : !row.responseProtocol && !row.compilerVersion && row.modelKey === 'AUTHOR_KEY_SUM' && row.scoringVersion === 'author-key-sum-v1') || !/^[a-f0-9]{64}$/.test(row.definitionHash)) throw corrupt()
      metadata.set(key, { status: row.status, scienceMaturity: 'PILOT' })
    }
  }
  return metadata
}
