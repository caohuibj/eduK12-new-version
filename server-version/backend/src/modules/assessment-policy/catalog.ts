import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { canStudentAccessScale } from '../scale/scale-access'
import { resolveScaleStartDeployment } from '../scale/deployment/service'
import { disclosureFromScaleCapabilities } from './disclosure'
import { listStudentAssignments } from '../cognitive/assignment.service'
import { listSituationalInstruments } from '../situational/situational-runtime.service'
import { createCodeBundleDefinitionProvider } from '../bundle-product/code-catalog'
import { relationalProductRegistry } from '../assessment-relational/product-registry'
import { journeyPolicyFromRelationalApplicability, normalizeBundleInitiationModes } from './journey'
import type { AssessmentJourneyPolicyV1, AssessmentResourceFamilyV1 } from './journey'

export interface AssessmentDeliveryCatalogEntry {
  title: string
  journey: AssessmentJourneyPolicyV1
  launchTarget: string
  disclosure: unknown
  applicabilityHash: string
  policyHash: string
}
export interface AssessmentDeliveryCatalogAdapter {
  family: AssessmentResourceFamilyV1
  listForRespondent(userId: string): Promise<AssessmentDeliveryCatalogEntry[]>
}

/** Adapters project owning registries/publications; this is not an editable
 * content registry. Missing source authority never becomes a default grant. */
export class AssessmentDeliveryCatalog {
  constructor(private readonly adapters: readonly AssessmentDeliveryCatalogAdapter[]) {}
  async listForRespondent(userId: string) {
    const entries = (await Promise.all(this.adapters.map(a => a.listForRespondent(userId)))).flat()
    const identities = new Set<string>()
    return entries.filter(entry => {
      const p = entry.journey
      if (!p.subjectRoles.length || !p.respondentRoles.length || !p.relationshipKinds.length || !p.perspectives.length
        || !p.initiationModes.length || !p.sourcePolicyHash || !entry.disclosure || !entry.launchTarget) return false
      const key = `${p.resource.family}:${p.resource.key}:${p.resource.version}`
      if (identities.has(key)) throw new Error(`Ambiguous delivery authority: ${key}`)
      identities.add(key)
      return true
    })
  }
}

export const scaleSelfDeliveryAdapter: AssessmentDeliveryCatalogAdapter = {
  family: 'SCALE',
  async listForRespondent(userId) {
    const scales = await prisma.scale.findMany({ where: { status: 'PUBLISHED' },
      select: { id: true, code: true, name: true, instrumentVersion: true, instrumentClass: true, status: true, visibility: true } })
    // Each published identity still gets its own current access/deployment
    // decision. Limit concurrency so a larger library does not make the inbox
    // wait for every independent database round trip in series.
    const result: AssessmentDeliveryCatalogEntry[] = []
    for (let offset = 0; offset < scales.length; offset += 4) {
      const batch = await Promise.all(scales.slice(offset, offset + 4).map(async (scale): Promise<AssessmentDeliveryCatalogEntry | null> => {
        if (!await canStudentAccessScale(scale, userId)) return null
        const deployment = await resolveScaleStartDeployment({ db: prisma, scale, requestedMode: 'STANDALONE' })
        if (deployment.kind !== 'MANAGED_V2' || !deployment.allowNewStarts) return null
        const source = deployment.runtimePolicy
        const respondent = source.disclosure.audiences.respondent
        if (!source.applicability.respondentTypes.includes('SELF') || !respondent) return null
        const journey: AssessmentJourneyPolicyV1 = {
          schemaVersion: 1, resource: { family: 'SCALE', key: scale.code, version: scale.instrumentVersion },
          subjectRoles: ['STUDENT', 'TEACHER', 'PARENT', 'COUNSELOR', 'CLIENT'],
          respondentRoles: ['STUDENT', 'TEACHER', 'PARENT', 'COUNSELOR', 'CLIENT'],
          relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'], analysisMode: 'INDIVIDUAL_ONLY',
          visibilityPolicyKey: source.disclosure.policyVersion, minimumRespondents: null,
          initiationModes: ['RESPONDENT_SELF_START'], sourcePolicyHash: source.runtimePolicyHash,
        }
        return { title: scale.name, journey, launchTarget: `/student/scales/${encodeURIComponent(scale.id)}`,
          disclosure: disclosureFromScaleCapabilities({ audience: 'respondent', capabilities: respondent, policyKey: source.disclosure.policyVersion }),
          applicabilityHash: canonicalHash(source.applicability), policyHash: canonicalHash(journey) }
      }))
      result.push(...batch.filter((entry): entry is AssessmentDeliveryCatalogEntry => entry !== null))
    }
    return result
  },
}

const studentSelfEntry = (input: {
  family: AssessmentResourceFamilyV1; key: string; version: string; title: string; source: unknown;
  launchTarget: string; initiationModes: AssessmentJourneyPolicyV1['initiationModes']; disclosure: unknown;
}): AssessmentDeliveryCatalogEntry => {
  const journey: AssessmentJourneyPolicyV1 = {
    schemaVersion: 1, resource: { family: input.family, key: input.key, version: input.version },
    subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
    analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: `${input.family}_OWNING_PROJECTION`, minimumRespondents: null,
    initiationModes: input.initiationModes, sourcePolicyHash: canonicalHash(input.source),
  }
  return { title: input.title, journey, disclosure: input.disclosure, launchTarget: input.launchTarget,
    applicabilityHash: canonicalHash(journey), policyHash: canonicalHash({ journey, disclosure: input.disclosure }) }
}

const cognitiveDeliveryAdapter: AssessmentDeliveryCatalogAdapter = {
  family: 'COGNITIVE', async listForRespondent(userId) {
    const assignments = await listStudentAssignments(userId)
    return assignments.map(a => studentSelfEntry({ family: 'COGNITIVE', key: a.id, version: String(a.config.configVersion),
      title: a.title, source: a.config, initiationModes: ['CLASS_ASSIGN'],
      launchTarget: `/student/cognitive/assignments/${encodeURIComponent(a.id)}`,
      disclosure: { respondent: 'OWN_SESSION_REPORT', source: 'cognitive-session-owner-projection' } }))
  },
}

const situationalDeliveryAdapter: AssessmentDeliveryCatalogAdapter = {
  family: 'SITUATIONAL', async listForRespondent(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (user?.role !== 'STUDENT') return [] // Existing native SJT admission remains student-only.
    return listSituationalInstruments().map(entry => studentSelfEntry({ family: 'SITUATIONAL', key: entry.key, version: entry.version,
      title: `情境测评 · ${entry.key}`, source: { definitionHash: entry.definitionHash, report: entry.report },
      initiationModes: ['RESPONDENT_SELF_START'], launchTarget: `/student/situational/${encodeURIComponent(entry.key)}`,
      disclosure: { respondent: 'OWN_ATTEMPT_REPORT', source: entry.report } }))
  },
}

const bundleDeliveryAdapter: AssessmentDeliveryCatalogAdapter = {
  family: 'BUNDLE', async listForRespondent(userId) {
    const rows = await prisma.bundleInstance.findMany({ where: { composite: { status: 'PUBLISHED',
      course: { isLibrary: false, students: { some: { studentId: userId, status: { in: ['ACTIVE', 'APPROVED'] } } } } } },
      select: { compositeId: true, bundleKey: true, bundleVersion: true, definitionHash: true } })
    const provider = createCodeBundleDefinitionProvider()
    const entries: AssessmentDeliveryCatalogEntry[] = []
    for (const row of rows) {
      const source = provider.exact(row.bundleKey, row.bundleVersion)
      if (!source || provider.publicationBlockers(row.bundleKey, row.bundleVersion).length) continue
      entries.push(studentSelfEntry({ family: 'BUNDLE', key: row.bundleKey, version: row.bundleVersion, title: source.definition.name,
        source: source.definition, initiationModes: normalizeBundleInitiationModes(source.definition.initiationModes),
        launchTarget: `/student/composite/${encodeURIComponent(row.compositeId)}`,
        disclosure: { respondent: 'BUNDLE_STUDENT_PROJECTION', source: source.reportDefinition } }))
    }
    return [...new Map(entries.map(entry => [`${entry.journey.resource.key}:${entry.journey.resource.version}`, entry])).values()]
  },
}

const relationalDeliveryAdapter: AssessmentDeliveryCatalogAdapter = {
  family: 'FORM', async listForRespondent(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!user || !['STUDENT', 'TEACHER', 'PARENT'].includes(user.role)) return []
    return relationalProductRegistry.listReleasedForRespondent(user.role as 'STUDENT' | 'TEACHER' | 'PARENT')
      .filter(entry => entry.initiationModes?.length && entry.launchTarget)
      .map(entry => {
        const journey = journeyPolicyFromRelationalApplicability(entry.applicability, entry.initiationModes!)
        return { title: entry.title, journey, launchTarget: '/relational/tasks',
          disclosure: { sourcePolicyKey: entry.applicability.visibilityPolicyKey, analysisMode: entry.applicability.analysisMode, minimumRespondents: entry.applicability.minimumRespondents },
          applicabilityHash: relationalProductRegistry.applicabilityHash(entry), policyHash: canonicalHash(journey) }
      })
  },
}

export const assessmentDeliveryCatalog = new AssessmentDeliveryCatalog([
  scaleSelfDeliveryAdapter, cognitiveDeliveryAdapter, situationalDeliveryAdapter, bundleDeliveryAdapter, relationalDeliveryAdapter,
])
