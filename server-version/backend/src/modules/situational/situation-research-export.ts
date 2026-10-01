import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { inactiveAccountMessage } from '../../utils/accountStatus'
import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError, prepareCanonicalSubmission } from '../../services/instrumentFinalSubmit'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { decryptFrozenSituationalRuntimeSnapshot } from '../assessment-runtime/situational-runtime-snapshot'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assertRowMatchesSnapshot } from './situational-runtime.service'
import { parseSituationalRawSubmissionPayload } from './situational-raw-submission'
import { assignedSituationalDefinition, deriveSituationalAssignment } from './situation-assignment'
import { deriveAuthoritativeSituationalTrajectory } from './situation-trajectory'
import { situationalResponseHistoryIdentities } from './situation-research-capture'
import { MISSINGNESS_REASONS } from './situation-scientific-contract'

/** Exact resource grants must be configured after research approval.
 * Legacy ADMIN/teacher/organization roles never imply access to raw evidence.
 * No wildcard instruments, public route or parent-disclosure bypass.
 */
const grantSchema = z.object({
  grantId: z.string().min(1).max(160), researcherUserId: z.string().min(1),
  attemptIds: z.array(z.string().min(1)).min(1).max(1000),
  definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().datetime({ offset: true }), approvalReference: z.string().min(1).max(2000),
  projection: z.literal('PSEUDONYMOUS_RAW_V1'),
}).strict()
export type SituationalResearchExportGrant = z.infer<typeof grantSchema>

export function authorizeSituationalResearchExport(input: { userId: string; attemptId: string; definitionHash: string; embedded: boolean; now?: Date }, configured = process.env.SITUATIONAL_RESEARCH_EXPORT_GRANTS): SituationalResearchExportGrant {
  const denied = () => new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '没有当前有效的情境研究原始数据导出授权', 403)
  // Current source-owned Bundle/public contracts do not authorize raw/trial RESEARCH.
  if (input.embedded) throw denied()
  let grants: SituationalResearchExportGrant[]
  try { grants = z.array(grantSchema).max(1000).parse(JSON.parse(configured ?? '[]')) } catch { throw denied() }
  const grant = grants.find(g => g.researcherUserId === input.userId && g.attemptIds.includes(input.attemptId) && g.definitionHash === input.definitionHash && Date.parse(g.expiresAt) > (input.now ?? new Date()).getTime())
  if (!grant) throw denied()
  return grant
}

export function buildSituationalResearchArtifact(input: {
  attemptId: string; attemptEpoch: number; submissionPayloadHash: string;
  snapshot: ReturnType<typeof decryptFrozenSituationalRuntimeSnapshot>;
  raw: ReturnType<typeof parseSituationalRawSubmissionPayload>; grant: SituationalResearchExportGrant;
  pseudonymKey: string;
}) {
  if (!/^[a-f0-9]{64}$/i.test(input.pseudonymKey)) throw new Error('Research pseudonym key unavailable')
  const { snapshot, raw } = input
  if (raw.attemptEpoch !== input.attemptEpoch) throw new Error('Research raw epoch mismatch')
  const hash = prepareCanonicalSubmission({ responses: raw.responses, ...(raw.researchCapture ? { researchCapture: raw.researchCapture } : {}) }).hash
  if (hash !== input.submissionPayloadHash) throw new Error('Research raw submission digest mismatch')
  const assignment = deriveSituationalAssignment(snapshot.definition, input.attemptId, snapshot.definitionHash)
  const definition = assignedSituationalDefinition(snapshot.definition, assignment)
  const trajectory = deriveAuthoritativeSituationalTrajectory(definition, raw.responses)
  const reached = new Set(trajectory.sceneKeys), answered = new Map(raw.responses.map(r => [`${r.sceneKey}:${r.channelKey}`, r]))
  const rawResponses = raw.responses.map(r => ({ sceneKey: r.sceneKey, channelKey: r.channelKey, responseValue: r.responseValue, ...(r.responseTimeMs === undefined ? {} : { responseTimeMs: r.responseTimeMs }), ...(r.historyIdentity ? { historyIdentity: r.historyIdentity } : {}), ...(r.responseRevision ? { responseRevision: r.responseRevision } : {}) }))
  const histories = situationalResponseHistoryIdentities(definition, raw.responses)
  const opportunities = snapshot.definition.scenes.flatMap(scene => scene.channels.map(channel => {
    const node = snapshot.definition.schemaVersion === 2 ? snapshot.definition.flow.nodes.find(n => n.nodeType === 'SCENE' && n.sceneKey === scene.sceneKey) : undefined
    const pair = `${scene.sceneKey}:${channel.channelKey}`, value = answered.get(pair)
    const planned = node && assignment.selections.some(s => s.nodeKey === node.nodeKey && s.omittedChannelKeys.includes(channel.channelKey))
    const events = raw.researchCapture?.events.filter(e => e.nodeKey === node?.nodeKey && e.channelKey === channel.channelKey && (e.type === 'RESPONSE_FIRST_COMMITTED' || e.type === 'RESPONSE_CHANGED')) ?? []
    const firstCurrent = events.find(e => e.historyIdentity === histories.get(scene.sceneKey))
    const invalidated = raw.researchCapture?.events.filter(e => e.nodeKey === node?.nodeKey && e.channelKey === channel.channelKey && e.type === 'RESPONSE_INVALIDATED') ?? []
    const historicalOnly = events.length > 0 && !firstCurrent
    return { sceneKey: scene.sceneKey, nodeKey: node?.nodeKey ?? null, channelKey: channel.channelKey,
      finalResponse: value?.responseValue ?? null, firstEverResponse: events[0]?.responseValue ?? null, firstResponse: firstCurrent?.responseValue ?? null,
      firstResponseStatus: raw.researchCapture ? firstCurrent ? 'RECORDED' : 'NOT_ANSWERED' : 'LEGACY_NOT_CAPTURED',
      missingness: value ? null : !reached.has(scene.sceneKey) ? 'STRUCTURAL_NOT_REACHED' : planned ? 'PLANNED_NOT_ADMINISTERED' : raw.researchCapture?.unansweredReasons?.find(r => r.nodeKey === node?.nodeKey && r.channelKey === channel.channelKey)?.reason ?? (historicalOnly || invalidated.length ? 'INVALIDATED_BY_HISTORY_CHANGE' : 'PARTICIPANT_SKIPPED'),
      invalidatedHistoricalResponses: invalidated.length,
      eligibility: reached.has(scene.sceneKey) && !planned,
    }
  }))
  return {
    artifactVersion: 'situational-research-export-v1',
    attemptIdentity: createHmac('sha256', Buffer.from(input.pseudonymKey, 'hex')).update(`situational-research:${input.attemptId}`).digest('hex'),
    instrument: { key: snapshot.instrumentKey, version: snapshot.instrumentVersion, definitionHash: snapshot.definitionHash, compiledRuntimeHash: snapshot.compiledRuntimeHash, snapshotHash: snapshot.snapshotHash, scoringVersion: snapshot.scoringVersion, scorerKey: snapshot.scorerKey, model: snapshot.definition.scoring.model ?? { modelKey: 'PROVISIONAL_SCALAR', modelVersion: '1' }, modelHash: canonicalHash(snapshot.definition.scoring.model ?? { modelKey: 'PROVISIONAL_SCALAR', modelVersion: '1', scoringVersion: snapshot.scoringVersion, choiceScores: snapshot.definition.scoring.choiceScores }) },
    scientificContext: snapshot.scientificContext ?? null,
    assignment, trajectory, rawResponses, opportunities, events: raw.researchCapture?.events ?? [],
    optionSemantics: snapshot.definition.scenes.flatMap(s => s.channels.flatMap(c => c.responseType === 'SINGLE_CHOICE' ? c.options.filter(o => o.evidence).map(o => ({ sceneKey: s.sceneKey, channelKey: c.channelKey, optionKey: o.optionKey, evidence: o.evidence })) : [])),
    missingnessTaxonomy: MISSINGNESS_REASONS,
    limitations: ['Client-reported exposure history is consistency-validated, not independently observed.', 'Technical failure cannot be inferred from absence; abandoned attempts are excluded.', 'Historical first responses are unavailable when capture was not enabled.'],
    authorization: { grantId: input.grant.grantId, approvalReference: input.grant.approvalReference, projection: input.grant.projection, expiresAt: input.grant.expiresAt },
  }
}

export async function exportSituationalResearchAttempt(attemptId: string, userId: string) {
  const row = await prisma.situationalAttempt.findUnique({ where: { id: attemptId }, include: { rawSubmission: true } })
  if (!row) throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '研究记录不可用', 403)
  const authority = { userId, attemptId, definitionHash: row.definitionHash, embedded: Boolean(row.compositeAttemptId) }
  const grant = authorizeSituationalResearchExport(authority)
  const principal = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, isFrozen: true, expiresAt: true, role: true, teacherApproved: true } })
  if (inactiveAccountMessage(principal)) throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '研究授权账户不可用', 403)
  if (row.status !== 'COMPLETED' || !row.rawSubmission || !row.submissionPayloadHash) throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '仅支持已完成且有冻结原始提交的记录', 409)
  const snapshot = decryptFrozenSituationalRuntimeSnapshot(row.runtimeSnapshotEncrypted)
  assertRowMatchesSnapshot(row, snapshot)
  const raw = parseSituationalRawSubmissionPayload(decryptUnifiedRuntimePayload<unknown>(row.rawSubmission.payloadEncrypted))
  if (row.rawSubmission.payloadHash !== row.submissionPayloadHash) throw new Error('Research stored payload digest mismatch')
  const artifact = buildSituationalResearchArtifact({ attemptId, attemptEpoch: row.attemptEpoch, submissionPayloadHash: row.submissionPayloadHash, snapshot, raw, grant, pseudonymKey: process.env.DATA_PSEUDONYM_KEY ?? '' })
  const refreshedPrincipal = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, isFrozen: true, expiresAt: true, role: true, teacherApproved: true } })
  if (inactiveAccountMessage(refreshedPrincipal)) throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '研究授权账户已失效', 403)
  const currentGrant = authorizeSituationalResearchExport(authority)
  if (canonicalHash(grant) !== canonicalHash(currentGrant)) throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '研究授权已变化', 403)
  return artifact
}
